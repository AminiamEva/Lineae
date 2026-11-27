import {layoutScale} from './layout-geometry.js';
import {fandolPairs} from './fandol-pairs.mjs';
import {fandolPunctuation} from './fandol-punctuation.mjs';
import {paragraphParameters,texDimension,resolveCjkOptions} from './paragraph-parameters.mjs';
import {resolveChineseProfile} from '../../latex/chinese-profile.mjs';
import {englishHyphenation} from './english-hyphenation.mjs';
import {TextSelection,Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {optimumParagraph} from './optimum-paragraph.mjs';
import {containsCjk,isCjk,isCjkPunctuation,isOpening,isClosing,parseCjkClassDeclarations} from './cjk-characters.mjs';
import {ctexCjkGlue,evaluateCjkGlue,zijuFraction} from './cjk-glue.mjs';
import {resolvePunctuationStyle,punctuationMetrics,pairKerning,punctuationBreakRules} from './cjk-punctuation.mjs';

const key=new PluginKey('texParagraphLayout');
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
const metricCache=new Map();
if(typeof document!=='undefined'){document.fonts?.addEventListener('loadingdone',()=>metricCache.clear());document.fonts?.ready.then(()=>metricCache.clear());}
function measure(text,style){
  const font=style.font||[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');
  const id=font+'|'+style.letterSpacing+'|'+text;
  if(metricCache.has(id))return metricCache.get(id);
  context.font=font;const width=context.measureText(text).width+Math.max(0,text.length-1)*(parseFloat(style.letterSpacing)||0);
  if(metricCache.size>10000)metricCache.clear();metricCache.set(id,width);return width;
}
function tokensFor(editor,node,start,element,options){
  const runs=[],atoms=new Map();let text='';
  node.forEach((child,offset)=>{
    const from=start+1+offset;
    if(child.isText){
      const point=editor.view.domAtPos(from),dom=point.node.nodeType===3?point.node.parentElement:point.node;
      runs.push({from:text.length,to:text.length+child.text.length,style:getComputedStyle(dom.closest('.tex-word-glue,.tex-cjk-punctuation')?.parentElement??dom)});text+=child.text;
    }else if(child.type.name==='hardBreak'){text+='\n';}
    else if(child.isInline){const dom=editor.view.nodeDOM(from);atoms.set(text.length,{from,kind:child.type.name,size:child.nodeSize,width:dom?.getBoundingClientRect().width??0});text+='\ufffc'.repeat(child.nodeSize);}
  });
  const style=getComputedStyle(element),zoom=layoutScale(element.closest('.document-page'));
  const styleAt=offset=>runs.find(run=>offset>=run.from&&offset<run.to)?.style??style;
  const width=(value,offset)=>{
    let result=0;for(const run of runs){const from=Math.max(offset,run.from),to=Math.min(offset+value.length,run.to);if(to>from)result+=measure(value.slice(from-offset,to-offset),run.style);}return result;
  };
  const items=[];const emit=item=>items.push(item);let spaceFactor=1000;
  const chinese=containsCjk(text),baseline=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;
  const cjkFamily=style.getPropertyValue('--tex-cjk-font-family')||'FandolSong';
  const em=parseFloat(style.fontSize)||16;
  const cjkContext={em,ccwd:em,baselineskip:baseline};
  const ziju=zijuFraction(options.ziju,cjkContext);
  const punctStyle=resolvePunctuationStyle(options.punctStyle,options.punctOverrides,options.rubberPunctSkip);
  const calibratedFont=/FandolSong/i.test(cjkFamily);
  const cjkChar=options.cjkClassify?value=>{const type=options.cjkClassify(value);return type==='CJK'||type==='HangulJamo';}:isCjk;
  const cjkCjkGlue=(localEm,localStyle)=>{
    const context={linewidth:options.linewidthPx??0,ccwd:localEm,linestretch:options.linestretch,ziju,parindent:options.parindentPx??0,baselineskip:baseline,linespread:options.linespread??1,glueTouched:options.cjkGlueTouched};
    const glue=options.ctex?ctexCjkGlue(context):null;
    return glue??evaluateCjkGlue(options.cjkGlue,{space:measure(' ',localStyle),em:localEm,ccwd:localEm,baselineskip:baseline,zijuPx:ziju*localEm});
  };
  const updateFactor=character=>{const code=/[A-Z]/.test(character)?999:/[.!?]/.test(character)?3000:character===':'?2000:character===';'?1500:character===','?1250:/[)\]\"']/.test(character)?0:1000;if(code)spaceFactor=code>1000&&spaceFactor<1000?1000:code;};
  const pieces=[...text.matchAll(/[A-Za-z]+|[^\S\n\u00a0]+|\n|[^]/gu)];
  for(let n=0;n<pieces.length;n++){
    const match=pieces[n],value=match[0],at=match.index,from=start+1+at,local=styleAt(at);
    if(value==='\ufffc'){
      const atom=atoms.get(at);if(atom)emit({type:'box',width:atom.width/zoom,from,to:from+atom.size});
      if(atom?.kind==='math'&&cjkChar(pieces[n+1]?.[0]??'')){
        const localEm=parseFloat(local.fontSize)||em;
        const glue=evaluateCjkGlue(options.cjkEcGlue,{space:measure(' ',local),em:localEm,ccwd:localEm,baselineskip:baseline,zijuPx:ziju*localEm});
        if(glue.width||glue.stretch||glue.shrink){emit({type:'penalty',width:0,cost:10000,from:from+atom.size,to:from+atom.size});emit({type:'glue',width:glue.width,stretch:glue.stretch,shrink:glue.shrink,from:from+atom.size,to:from+atom.size,cjk:true});}
      }
      continue;
    }
    if(value==='\n'){emit({type:'glue',width:0,stretch:1e10,shrink:0,from,to:from});emit({type:'penalty',width:0,cost:-10000,from:from+1,to:from+1,forced:true});continue;}
    if(/^\s+$/u.test(value)&&value!=='\u00a0'){
      const previousToken=pieces[n-1]?.[0]??'',nextToken=pieces[n+1]?.[0]??'',localEm=parseFloat(local.fontSize)||em;
      const previousCjk=cjkChar(previousToken),nextCjk=cjkChar(nextToken);
      // CJKspace=false drops CJK–CJK source spaces, leaving only the CJK glue.
      if(previousCjk&&nextCjk&&!options.cjkSpace){
        const glue=cjkCjkGlue(localEm,local);
        emit({type:'glue',width:glue.width,stretch:glue.stretch,shrink:glue.shrink,from,to:from,cjk:true});
        continue;
      }
      // xCJKecglue replaces spaces at CJK boundaries with the non-breaking ecglue.
      if(options.xCJKecGlue&&(previousCjk||nextCjk)){
        const glue=evaluateCjkGlue(options.cjkEcGlue,{space:measure(' ',local),em:localEm,ccwd:localEm,baselineskip:baseline,zijuPx:ziju*localEm});
        if(glue.width||glue.stretch||glue.shrink){emit({type:'penalty',width:0,cost:10000,from,to:from});emit({type:'glue',width:glue.width,stretch:glue.stretch,shrink:glue.shrink,from,to:from,cjk:true});continue;}
      }
      const space=measure(' ',local),em=parseFloat(local.fontSize),skip=options.spaceSkip;
      const custom=skip&&texDimension(skip.width,em)!==0,factor=options.frenchSpacing?1:spaceFactor/1000;emit({type:'glue',width:custom?texDimension(skip.width,em):space+(spaceFactor>=2000&&!options.frenchSpacing?space/3:0),stretch:(custom?texDimension(skip.stretch,em):space/2)*factor,shrink:(custom?texDimension(skip.shrink,em):space/3)/factor,from,to:from+value.length});continue;
    }
    if(chinese&&isCjkPunctuation(value)){
      const font=[local.fontStyle,local.fontWeight,local.fontSize,cjkFamily].join(' ');context.font=font;
      const metrics=context.measureText(value),localEm=parseFloat(local.fontSize),weight=Number(local.fontWeight)>=600?'bold':'regular';
      const calibrated=calibratedFont?fandolPunctuation[weight][value]:null;
      const {before,after,boxWidth}=punctuationMetrics({character:value,style:punctStyle,calibrated,metrics,em:localEm,opening:isOpening(value),closing:isClosing(value)});
      const previous=pieces[n-1]?.[0];
      const previousPunct=isCjkPunctuation(previous??'');
      const rules=punctuationBreakRules(value,{previous:previous??'',allowBreakBetweenPuncts:options.allowBreakBetweenPuncts});
      const calibratedPair=calibratedFont&&previousPunct?fandolPairs[weight][previous+value]:null;
      const kern=pairKerning(calibratedPair,punctStyle);
      if(kern){
        while(items.at(-1)?.type==='glue'&&items.at(-1).from===from)items.pop();
        emit({type:'penalty',width:0,cost:10000,from,to:from});
        emit({type:'glue',width:kern.width*localEm,stretch:kern.stretch*localEm,shrink:kern.shrink*localEm,from,to:from,cjk:true});
      }else if(n>0&&previous!=='\n'&&rules.noBreakBefore){
        emit({type:'penalty',width:0,cost:10000,from,to:from});
      }
      if(before&&!kern&&n>0&&previous!=='\n')emit({type:'glue',width:before,stretch:0,shrink:Math.min(localEm/2,before),from,to:from,cjk:true});
      emit({type:'box',width:boxWidth,from,to:from+value.length,punctuation:true,before,after,font,checkFullRight:Boolean(options.checkFullRight)});
      if(after)emit({type:'glue',width:after,stretch:0,shrink:Math.min(localEm/2,after),from:from+value.length,to:from+value.length,cjk:true});
      // 行尾禁则: an opening punctuation may not end a line.
      if(rules.noBreakAfter&&pieces[n+1]&&!/^\s*$/.test(pieces[n+1][0]))emit({type:'penalty',width:0,cost:10000,from:from+value.length,to:from+value.length});
    }else if(/^[A-Za-z]{5,}$/.test(value)){
      const exception=options.exceptions.get(value.toLowerCase());
      const parts=exception?exception.map((part,i)=>value.slice(exception.slice(0,i).join('').length,exception.slice(0,i+1).join('').length)):englishHyphenation(value,{leftMin:options.leftHyphenMin,rightMin:options.rightHyphenMin});let position=0;
      for(let i=0;i<parts.length;i++){
        const part=parts[i];emit({type:'box',width:width(value.slice(0,position+part.length),at)-width(value.slice(0,position),at),from:from+position,to:from+position+part.length});position+=part.length;
        if(i<parts.length-1&&position>=options.leftHyphenMin&&value.length-position>=options.rightHyphenMin)emit({type:'penalty',width:measure('-',styleAt(at+position)),cost:options.hyphenPenalty,hyphen:true,from:from+position,to:from+position});
      }
    }else emit({type:'box',width:width(value,at),from,to:from+value.length});
    updateFactor(value.at(-1));
    const next=pieces[n+1]?.[0];
    if(next&&!(isCjkPunctuation(value)&&isCjkPunctuation(next))&&value!=='\u00a0'&&next!=='\u00a0'&&!/\s/.test(next)&&!isClosing(next)&&!isOpening(value)&&(cjkChar(value)||cjkChar(next)||isCjkPunctuation(value)||isCjkPunctuation(next))){
      const localEm=parseFloat(local.fontSize)||em;
      const valueCjk=cjkChar(value),nextCjk=cjkChar(next);
      const nextMath=atoms.get(pieces[n+1]?.index)?.kind==='math';
      const mixed=(valueCjk&&(/^[A-Za-z0-9]/.test(next)||nextMath))||(/[A-Za-z0-9]$/.test(value)&&nextCjk);
      if(valueCjk&&nextCjk){
        const glue=cjkCjkGlue(localEm,local);
        emit({type:'glue',width:glue.width,stretch:glue.stretch,shrink:glue.shrink,from:from+value.length,to:from+value.length,cjk:true});
        // CheckSingle: discourage the break that leaves one Han character alone.
        const trailing=pieces.slice(n+2).some(match=>!/^\s+$/.test(match[0])&&match[0]!=='\n');
        if(options.checkSingle&&!trailing)emit({type:'penalty',width:0,cost:10000,from:from+value.length,to:from+value.length});
      }else if(mixed){
        const glue=evaluateCjkGlue(options.cjkEcGlue,{space:measure(' ',local),em:localEm,ccwd:localEm,baselineskip:baseline,zijuPx:ziju*localEm});
        if(glue.width||glue.stretch||glue.shrink){emit({type:'penalty',width:0,cost:10000,from:from+value.length,to:from+value.length});emit({type:'glue',width:glue.width,stretch:glue.stretch,shrink:glue.shrink,from:from+value.length,to:from+value.length,cjk:true});}
      }else{
        emit({type:'glue',width:0,stretch:baseline*.08,shrink:0,from:from+value.length,to:from+value.length,cjk:true});
      }
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
export function installParagraphLayout(editor){
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
    current=preamble;if(running||editor.view.composing)return;
    const profile=resolveChineseProfile({preamble});
    const declarations=parseCjkClassDeclarations(preamble);
    const cjkOptions=resolveCjkOptions(preamble,profile);
    if(declarations.declarations.length)cjkOptions.cjkClassify=declarations.classify;
    const entries=[],options={...paragraphParameters(preamble),...cjkOptions};let signature=preamble;
    const page=editor.view.dom.closest('.document-page');
    const intextsepText=page?getComputedStyle(page).getPropertyValue('--image-intextsep').trim():'';
    const intextsep=intextsepText?cssLengthPx(intextsepText):cssLengthPx('12pt');
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
      if(!['paragraph','heading'].includes(node.type.name)||!node.content.size)return;
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
      const isHeading=node.type.name==='heading',inTable=Boolean(element.closest('td,th'));
      if((!isHeading&&!inTable&&node.attrs.align&&node.attrs.align!=='justify')||(!isHeading&&!inTable&&!element.hasAttribute('data-tex-paragraph')&&!['justify','start'].includes(style.textAlign))||(!inTable&&element.closest('[data-columns],.image-wrap-left,.image-wrap-right'))){
        if(active.length)consume(estimate());
        return false;
      }
      const {items}=tokensFor(editor,node,start,element,{...options,linewidthPx:baseWidth,parindentPx:indent});
      const widthAt=line=>wrapLineWidthAt(line,{elementTop,lineHeight,baseWidth,wraps,zoom});
      const wrapOptions=wraps.length?{...options,tolerance:9999}:options;
      const plan=optimumParagraph(items,line=>widthAt(line)-(line===0?indent:0),{...wrapOptions,emergencyStretch:options.emergency?texDimension(options.emergency,parseFloat(style.fontSize)):0});
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
      if(plan.lines.length===1&&!containsCjk(node.textContent)){
        if(active.length)consume(1);
        return false;
      }
      entries.push(Decoration.node(start,start+node.nodeSize,{'data-tex-paragraph':'true'}));
      for(const [lineNumber,line] of plan.lines.entries()){
        const last=lineNumber===plan.lines.length-1;
        for(let index=line.start;index<line.end;index++){
          const item=items[index];
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
      signature+='|'+start+':'+baseWidth+':'+wraps.map(w=>w.remaining+','+w.width.toFixed(1)+','+w.columnsep.toFixed(1)+','+w.overhang.toFixed(1)+','+w.side+','+w.marginTop.toFixed(2)+','+w.marginBottom.toFixed(2)).join(';')+':'+items.map(item=>item.width.toFixed(3)).join(',')+':'+plan.lines.map(line=>line.end+','+line.ratio.toFixed(5)).join(';');
      if(active.length)consume(plan.lines.length);
      return false;
    });
    if(signature===lastSignature)return;lastSignature=signature;
    running=true;try{editor.view.dispatch(editor.state.tr.setMeta(key,DecorationSet.create(editor.state.doc,entries)).setMeta('addToHistory',false));}finally{running=false;}
  }
  return {layout, invalidate(){lastSignature='';}};
}