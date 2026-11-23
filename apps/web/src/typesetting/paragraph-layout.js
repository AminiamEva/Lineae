import {createFontMeasurement} from './font-measurement.mjs';
import {layoutScale} from './layout-geometry.js';
import {interwordGlue, texDimension} from './paragraph-parameters.mjs';
import {TextSelection,Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {optimumParagraph} from './optimum-paragraph.mjs';

const key=new PluginKey('texParagraphLayout');
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const closing=/^[、。，．？！：；）］｝〉》」』】”’…,.!?;:)]$/u,opening=/[（［｛〈《「『【“‘(\[]$/u;
const cjkPunctuation=/^[、。，．？！：；（）［］｛｝〈〉《》「」『』【】“”‘’]$/u;
const canvas=typeof document==='undefined'?null:document.createElement('canvas');
const context=canvas?.getContext('2d');
function cssLengthPx(value){
  const match=/^\s*(\d+(?:\.\d+)?)\s*(px|pt|in|cm|mm)\s*$/.exec(String(value??''));
  if(!match)return 0;
  return Number(match[1])*{px:1,pt:4/3,in:96,cm:96/2.54,mm:96/25.4}[match[2]];
}
function wrapWidthPx(value,baseWidth){
  const relative=/^\s*(\d*(?:\.\d+)?)\s*\\(?:textwidth|linewidth|columnwidth)\s*$/.exec(String(value??''));
  if(relative)return (relative[1]?Number(relative[1]):1)*baseWidth;
  return cssLengthPx(value);
}
function elementTranslateY(element){
  const value=getComputedStyle(element).translate;
  if(!value||value==='none')return 0;
  const parts=value.match(/-?(?:\d+\.?\d*|\.\d+)(?:px)?/g)??[];
  return parts.length>1?Number.parseFloat(parts[1])||0:0;
}
function tokensFor(editor,node,start,element,options,profile,metric,lineWidth,measure){
  const runs=[],atoms=new Map();let text='';
  node.forEach((child,offset)=>{
    const from=start+1+offset;
    if(child.isText){
      const point=editor.view.domAtPos(from),dom=point.node.nodeType===3?point.node.parentElement:point.node;
      runs.push({from:text.length,to:text.length+child.text.length,style:getComputedStyle(dom.closest('.tex-word-glue,.tex-cjk-punctuation')?.parentElement??dom)});text+=child.text;
    }else if(child.type.name==='hardBreak'){text+='\n';}
    else if(child.isInline){const dom=editor.view.nodeDOM(from);atoms.set(text.length,{from,kind:child.type.name,simpleMath:child.type.name==='math'&&/^[A-Za-z0-9]$/.test(child.attrs.latex),size:child.nodeSize,width:dom?.getBoundingClientRect().width??0});text+='\ufffc'.repeat(child.nodeSize);}
  });
  const style=getComputedStyle(element),zoom=layoutScale(element.closest('.document-page'));
  const styleAt=offset=>runs.find(run=>offset>=run.from&&offset<run.to)?.style??style;
  const width=(value,offset)=>{
    let result=0;for(const run of runs){const from=Math.max(offset,run.from),to=Math.min(offset+value.length,run.to);if(to>from)result+=measure(value.slice(from-offset,to-offset),run.style);}return result;
  };
  const items=[];const emit=item=>items.push(item);let spaceFactor=1000;
  const chinese=cjk.test(text),baseline=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;
  const cjkFamily=style.getPropertyValue('--tex-cjk-font-family')||profile.cjk?.family||'serif';
  const updateFactor=character=>{const code=/[A-Z]/.test(character)?999:/[.!?]/.test(character)?3000:character===':'?2000:character===';'?1500:character===','?1250:/[)\]\"']/.test(character)?0:1000;if(code)spaceFactor=code>1000&&spaceFactor<1000?1000:code;};
  const pieces=[...text.matchAll(/[A-Za-z]+|[^\S\n\u00a0]+|\n|[^]/gu)];
  for(let n=0;n<pieces.length;n++){
    const match=pieces[n],value=match[0],at=match.index,from=start+1+at,local=styleAt(at);
    const em = parseFloat(local.fontSize);
    const symbol = piece => atoms.get(piece?.index)?.kind === 'math' ? '$x$' : piece?.[0];
    if (metric && n > 0) {
      const boundary = profile.cjk.boundary(metric, symbol(pieces[n-1]), symbol(match), em, lineWidth);
      if (boundary) {
        const {cost, ...glue} = boundary;
        if (cost) emit({type:'penalty', width:0, cost, from, to:from});
        emit({type:'glue', ...glue, from, to:from, cjk:true});
      }
    }
    if(value==='\ufffc'){
      const atom=atoms.get(at);if(atom)emit({type:'box',width:atom.width/zoom,from,to:from+atom.size,simpleMath:metric && atom.simpleMath});
      if(!metric&&atom?.kind==='math'&&cjk.test(pieces[n+1]?.[0]??'')){const space=measure(' ',local);emit({type:'glue',width:space,stretch:space/2,shrink:space/3,from:from+atom.size,to:from+atom.size,cjk:true});}
      continue;
    }
    if(value==='\n'){emit({type:'glue',width:0,stretch:1e10,shrink:0,from,to:from});emit({type:'penalty',width:0,cost:-10000,from:from+1,to:from+1,forced:true});continue;}
    if(/^\s+$/u.test(value)&&value!=='\u00a0'){
      const space=measure(' ',local),em=parseFloat(local.fontSize),skip=options.spaceSkip;
      const factor = options.frenchSpacing ? 1 : spaceFactor / 1000;
      const extra = spaceFactor >= 2000 && !options.frenchSpacing;
      emit({type:'glue', ...interwordGlue({space, em, skip, factor, extra, profile}), from, to:from+value.length});
      continue;
    }
    const jfmBox = metric && profile.cjk.box(metric, value, em);
    if (jfmBox) {
      const font = [local.fontStyle,local.fontWeight,local.fontSize,cjkFamily].join(' ');
      const before = -jfmBox.offset;
      const after = measure(value,local,font) - jfmBox.width - before;
      emit({type:'box',width:jfmBox.width,from,to:from+value.length,punctuation:true,before,after,font});
    } else if(!metric&&chinese&&cjkPunctuation.test(value)){
      const font=[local.fontStyle,local.fontWeight,local.fontSize,cjkFamily].join(' ');context.font=font;
      const metrics=context.measureText(value),em=parseFloat(local.fontSize),bounds=profile.cjk.punctuation[Number(local.fontWeight)>=600?'bold':'regular'][value],left=bounds?bounds.left*em:Math.max(0,-metrics.actualBoundingBoxLeft),right=bounds?bounds.right*em:Math.max(0,metrics.width-metrics.actualBoundingBoxRight);
      const before=opening.test(value)?left:0,after=closing.test(value)?right:0;
      const previous=pieces[n-1]?.[0],pair=cjkPunctuation.test(previous??'')?profile.cjk.pairs[Number(local.fontWeight)>=600?'bold':'regular'][previous+value]:null;
      if(pair){
        while(items.at(-1)?.type==='glue'&&items.at(-1).from===from)items.pop();
        emit({type:'penalty',width:0,cost:10000,from,to:from});
        emit({type:'glue',width:pair.width*em,stretch:pair.stretch*em,shrink:pair.shrink*em,from,to:from,cjk:true});
      }
      if(before&&!pair&&n>0&&previous!=='\n')emit({type:'glue',width:before,stretch:0,shrink:Math.min(em/2,before),from,to:from,cjk:true});
      emit({type:'box',width:measure(value,local,font)-before-after,from,to:from+value.length,punctuation:true,before,after,font});
      if(after)emit({type:'glue',width:after,stretch:0,shrink:Math.min(em/2,after),from:from+value.length,to:from+value.length,cjk:true});
    }else if(/^[A-Za-z]{5,}$/.test(value)){
      const exception=options.exceptions.get(value.toLowerCase());
      const parts=exception?exception.map((part,i)=>value.slice(exception.slice(0,i).join('').length,exception.slice(0,i+1).join('').length)):profile.englishHyphenation(value,{leftMin:options.leftHyphenMin,rightMin:options.rightHyphenMin});let position=0;
      for(let i=0;i<parts.length;i++){
        const part=parts[i];emit({type:'box',width:width(value.slice(0,position+part.length),at)-width(value.slice(0,position),at),from:from+position,to:from+position+part.length});position+=part.length;
        if(i<parts.length-1&&position>=options.leftHyphenMin&&value.length-position>=options.rightHyphenMin)emit({type:'penalty',width:measure('-',styleAt(at+position)),cost:options.hyphenPenalty,hyphen:true,from:from+position,to:from+position});
      }
    }else {
      const previous = pieces[n-1]?.[0];
      // Keep the kern across the word/punctuation token boundary (e.g. y.).
      // The browser shapes both characters in the same uninterrupted run.
      const advance = profile.engine === 'lualatex' && /^[A-Za-z]+$/.test(previous ?? '') && /^[.,:;!?]$/.test(value)
        ? width(previous + value, at-previous.length) - width(previous, at-previous.length) : width(value,at);
      emit({type:'box',width:advance,from,to:from+value.length});
    }
    updateFactor(value.at(-1));
    const next=pieces[n+1]?.[0];
    if(!metric&&next&&!(cjkPunctuation.test(value)&&cjkPunctuation.test(next))&&value!=='\u00a0'&&next!=='\u00a0'&&!/\s/.test(next)&&!closing.test(next)&&!opening.test(value)&&(cjk.test(value)||cjk.test(next)||cjkPunctuation.test(value)||cjkPunctuation.test(next))){
      const mixed=(cjk.test(value)&&(/^[A-Za-z0-9]/.test(next)||atoms.get(pieces[n+1]?.index)?.kind==='math'))||(/[A-Za-z0-9]$/.test(value)&&cjk.test(next));
      const space=mixed?measure(' ',local):0;
      emit({type:'glue',width:space,stretch:mixed?space/2:baseline*profile.cjk.lineStretch,shrink:mixed?space/3:0,from:from+value.length,to:from+value.length,cjk:true});
    }
  }
  while(items.at(-1)?.type==='glue')items.pop();
  const end=start+node.nodeSize-1;
  emit({type:'glue',width:0,stretch:1e10,shrink:0,from:end,to:end});emit({type:'penalty',width:0,cost:-10000,from:end,to:end});
  return {items,style};
}
function widget(position,classes,width=0){
  return Decoration.widget(position,()=>{const span=document.createElement('span');span.className=classes;span.contentEditable='false';span.setAttribute('aria-hidden','true');if(width){span.style.width=Math.max(0,width)+'px';if(width<0)span.style.marginLeft=width+'px';}return span;},{side:-1,key:classes+position+':'+width,ignoreSelection:true});
}
export function wrapLineWidthAt(line,{elementTop,lineHeight,baseWidth,wraps,zoom=1}){
  const top=elementTop+line*lineHeight,bottom=top+lineHeight;
  let available=baseWidth;
  for(const wrap of wraps){
    if(!(line===0&&wrap.forceLineZero)&&(wrap.rect.bottom<=top+.5||wrap.rect.top>=bottom-.5))continue;
    available-=(wrap.width ?? wrap.rect.width/zoom)+(wrap.columnsep ?? 10)-(wrap.overhang ?? 0);
  }
  return Math.max(24,available);
}
export function installParagraphLayout(editor,profile){
  const fontMetrics=createFontMeasurement(context,globalThis.document?.fonts,globalThis.document);
  const {measure}=fontMetrics;
  globalThis.document?.fonts?.addEventListener('loadingdone',fontMetrics.clear);
  editor.on('destroy',()=>{document.fonts?.removeEventListener('loadingdone',fontMetrics.clear);fontMetrics.dispose();});
  editor.view.dom.dataset.paragraphProfile=profile.engine;
  let current='',lastSignature='',running=false,preferredX=null;
  editor.view.dom.addEventListener('pointerdown',()=>{preferredX=null;});
  editor.on('transaction',({transaction})=>{if(transaction.docChanged)preferredX=null;});
  editor.registerPlugin(new Plugin({key,state:{init:()=>DecorationSet.empty,apply(tr,previous){return tr.getMeta(key)??previous.map(tr.mapping,tr.doc);}},props:{decorations:state=>key.getState(state),handleKeyDown(view,event){
    if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||event.target.closest?.('math-field')||!view.dom.querySelector('[data-tex-paragraph]')){if(!['Shift','Control','Alt','Meta'].includes(event.key))preferredX=null;return false;}
    const selection=view.state.selection;if(!selection.$head.parent.isTextblock)return false;
    const direction=event.key==='ArrowUp'?-1:1,origin=view.coordsAtPos(selection.head,1);
    preferredX??=origin.left;
    const candidates=[];
    view.state.doc.descendants((node,start)=>{
      if(!node.isTextblock)return;
      const element=view.nodeDOM(start),bounds=element?.getBoundingClientRect();if(!bounds||!bounds.height||getComputedStyle(element).visibility==='hidden')return false;
      if(direction<0&&bounds.top>=origin.bottom||direction>0&&bounds.bottom<=origin.top)return false;
      for(let offset=0;offset<=node.content.size;offset++){
        const position=start+1+offset,rect=view.coordsAtPos(position,1);
        if(direction*(rect.top-origin.top)<=Math.max(2,(origin.bottom-origin.top)*.3))continue;
        candidates.push({position,rect,distance:Math.abs(rect.left-preferredX)});
      }
      return false;
    });
    if(!candidates.length)return true;
    const nearest=direction<0?Math.max(...candidates.map(item=>item.rect.top)):Math.min(...candidates.map(item=>item.rect.top));
    const target=candidates.filter(item=>Math.abs(item.rect.top-nearest)<2).sort((a,b)=>a.distance-b.distance)[0];
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,event.shiftKey?selection.anchor:target.position,target.position)).scrollIntoView());return true;
  }}}));
  function layout(preamble=current){
    current=preamble;if(!profile||running||editor.view.composing)return;
    fontMetrics.select(profile,preamble);
    const entries=[],options=profile.paragraphParameters(preamble);let signature=preamble;
    const page=editor.view.dom.closest('.document-page');
    const intextsepText=page?getComputedStyle(page).getPropertyValue('--image-intextsep').trim():'';
    const intextsep=intextsepText?cssLengthPx(intextsepText):cssLengthPx('12pt');
    const family = getComputedStyle(editor.view.dom).getPropertyValue('--tex-cjk-font-family');
    const metric = profile.cjk.assess?.(preamble, family).metric;
    const supportsCjk = metric || profile.cjk.supports?.(options, family);
    const pending=[];
    function anchorWrap(wrap,lineHeight){
      // Keep the float's natural box.  Any line it partially overlaps is still
      // a wrapped line in TeX, so round up instead of trimming the float band.
      const marginTop=intextsep+lineHeight*.5;
      // The bottom margin is spacing only; it must not add another narrowed line.
      const marginBottom=intextsep;
      wrap.dom.style.marginBlockStart=marginTop.toFixed(2)+'px';
      wrap.dom.style.marginBlockEnd=marginBottom.toFixed(2)+'px';
      const raw=(marginTop+wrap.dom.offsetHeight+marginBottom)/lineHeight;
      const lines=Math.max(1,Math.ceil(raw-1e-6));
      wrap.remaining=lines;
      wrap.dom.dataset.wrapLines=String(lines);
      wrap.dom.dataset.wrapStart='0';
      wrap.marginTop=marginTop;wrap.marginBottom=marginBottom;
    }
    editor.state.doc.descendants((node,start)=>{
      if(node.type.name==='documentImage'&&node.attrs.wrap){
        const dom=editor.view.nodeDOM(start);
        if(dom)pending.push({dom,attrs:node.attrs,position:start,remaining:null});
        return false;
      }
      if(node.type.name!=='paragraph'||!node.content.size)return;
      const element=editor.view.nodeDOM(start);if(!element?.offsetWidth||getComputedStyle(element).visibility==='hidden')return false;
      const style=getComputedStyle(element);
      const page=element.closest('.document-page');
      const zoom=page?layoutScale(page):1;
      const elementRect=element.getBoundingClientRect();
      const elementTranslationY=elementTranslateY(element)*zoom;
      const elementTop=elementRect.top-elementTranslationY;
      const baseWidth=elementRect.width/zoom-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth);
      const indent=parseFloat(style.textIndent)||0;
      const lineHeightLayout=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2||16;
      const lineHeight=lineHeightLayout*zoom;
      const active=pending.filter(wrap=>wrap.remaining===null||wrap.remaining>0);
      for(const wrap of active){
        if(wrap.remaining===null)anchorWrap(wrap,lineHeightLayout);
      }
      // TeX narrows the first n lines after the figure, even across paragraphs.
      const wraps=active.map(wrap=>{
        const image=wrap.dom,imageStyle=getComputedStyle(image);
        const side=wrap.attrs.wrapSide||image.dataset.wrapSide||'r';
        const columnsep=parseFloat(/^[lL]$/.test(side)?imageStyle.marginInlineEnd:imageStyle.marginInlineStart)||0;
        const overhang=cssLengthPx(wrap.attrs.wrapOverhang);
        const width=wrapWidthPx(wrap.attrs.wrapWidth,baseWidth)||image.getBoundingClientRect().width/zoom;
        return {rect:{top:elementTop,bottom:elementTop+wrap.remaining*lineHeight,width},width,side,columnsep,overhang,remaining:wrap.remaining,marginTop:wrap.marginTop??0,marginBottom:wrap.marginBottom??0};
      });
      const consume=lines=>{
        for(const wrap of active)wrap.remaining=Math.max(0,wrap.remaining-lines);
        for(let index=pending.length-1;index>=0;index--)if(pending[index].remaining!==null&&pending[index].remaining<=0)pending.splice(index,1);
      };
      const estimate=()=>Math.max(1,Math.round(elementRect.height/lineHeight));
      // Apply measured xeCJK glue only for its calibrated font and punctuation profile.
      if(cjk.test(node.textContent)&&!supportsCjk){
        if(active.length)consume(estimate());
        return false;
      }
      if((node.attrs.align&&node.attrs.align!=='justify')||(!element.hasAttribute('data-tex-paragraph')&&!['justify','start'].includes(style.textAlign))||element.closest('[data-columns],.image-wrap-left,.image-wrap-right')){
        if(active.length)consume(estimate());
        return false;
      }
      const {items}=tokensFor(editor,node,start,element,options,profile,metric,baseWidth,measure);
      const widthAt=line=>wrapLineWidthAt(line,{elementTop,lineHeight,baseWidth,wraps,zoom});
      const wrapOptions=wraps.length?{...options,tolerance:9999}:options;
      const plan=optimumParagraph(items,line=>widthAt(line)-(line===0?indent:0),{...wrapOptions,texFinalPass:profile.texFinalPass,emergencyStretch:options.emergency?texDimension(options.emergency,parseFloat(style.fontSize)):0});
      if(!plan){if(active.length)consume(estimate());return false;}
      // The token stream ends with infinite glue and a forced penalty. If the
      // optimizer leaves them on a trailing line with no text, rendering a
      // break widget there makes ProseMirror append a separator/trailing <br>,
      // which appears as an empty line inside the paragraph.
      while(plan.lines.length>1){
        const last=plan.lines.at(-1);
        const content=items.slice(last.start,last.end).some(item=>item.type==='box'||(item.type==='glue'&&item.to>item.from&&item.stretch<1e10));
        if(content)break;
        plan.lines.pop();
      }
      if(plan.lines.length===1&&!cjk.test(node.textContent)){
        if(active.length)consume(1);
        return false;
      }
      entries.push(Decoration.node(start,start+node.nodeSize,{'data-tex-paragraph':'true','data-tex-engine':profile.engine}));
      for(const [lineNumber,line] of plan.lines.entries()){
        const last=lineNumber===plan.lines.length-1;
        for(let index=line.start;index<line.end;index++){
          const item=items[index];
          if(item.simpleMath)entries.push(Decoration.node(item.from,item.to,{class:'tex-simple-math'}));
          if(item.punctuation)entries.push(Decoration.inline(item.from,item.to,{class:'tex-cjk-punctuation',style:'font:'+item.font+';line-height:inherit;margin-left:'+(-item.before)+'px;margin-right:'+(-item.after)+'px'}));
          if(item.type!=='glue'||item.stretch>=1e10)continue;
          const adjusted=item.width+(last?0:line.ratio*(line.ratio<0?item.shrink:item.stretch)),size=item.cjk?adjusted:Math.max(0,adjusted);
          if(item.to>item.from)entries.push(Decoration.inline(item.from,item.to,{class:'tex-word-glue',style:'white-space:pre;word-spacing:'+(size/(item.to-item.from)-measure(' ',style))+'px;text-indent:0'}));
          else if(size)entries.push(widget(item.from,'tex-interchar-glue',size));
        }
        const end=items[line.end];
        if(!last){
          if(end.type==='glue'&&end.to>end.from)entries.push(Decoration.inline(end.from,end.to,{class:'tex-word-glue',style:'font-size:0;line-height:0'}));
          if(end.hyphen)entries.push(widget(end.from,'tex-discretionary-hyphen'));
          // A visual break is a view decoration, never a hardBreak/source edit.
          if(!end.forced)entries.push(widget(end.to,'tex-paragraph-break'));
        }
      }
      signature+='|'+start+':'+baseWidth+':'+wraps.map(w=>w.remaining+','+w.width.toFixed(1)+','+w.columnsep.toFixed(1)+','+w.overhang.toFixed(1)+','+w.side+','+w.marginTop.toFixed(2)+','+w.marginBottom.toFixed(2)).join(';')+':'+items.map(item=>item.punctuation && metric ? [item.width,item.before,item.after,item.font].join('/') : item.width.toFixed(3)).join(',')+':'+plan.lines.map(line=>line.end+','+line.ratio.toFixed(5)).join(';');
      if(active.length)consume(plan.lines.length);
      return false;
    });
    if(signature===lastSignature)return;lastSignature=signature;
    running=true;try{editor.view.dispatch(editor.state.tr.setMeta(key,DecorationSet.create(editor.state.doc,entries)).setMeta('addToHistory',false));}finally{running=false;}
  }
  return {layout, invalidate(){lastSignature='';}, setProfile(next) {
    if (profile === next) return;
    profile=next; lastSignature=''; fontMetrics.clear();
    editor.view.dom.dataset.paragraphProfile=next?.engine ?? 'unresolved';
    if (!next) editor.view.dispatch(editor.state.tr.setMeta(key,DecorationSet.empty).setMeta('addToHistory',false));
  }};
}
