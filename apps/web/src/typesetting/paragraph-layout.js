import {layoutScale} from './layout-geometry.js';
import {fandolPairs} from './fandol-pairs.mjs';
import {fandolPunctuation} from './fandol-punctuation.mjs';
import {paragraphParameters,texDimension} from './paragraph-parameters.mjs';
import {englishHyphenation} from './english-hyphenation.mjs';
import {TextSelection,Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {optimumParagraph} from './optimum-paragraph.mjs';

const key=new PluginKey('texParagraphLayout');
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const closing=/^[、。，．？！：；）］｝〉》」』】”’…,.!?;:)]$/u,opening=/[（［｛〈《「『【“‘(\[]$/u;
const cjkPunctuation=/^[、。，．？！：；（）［］｛｝〈〉《》「」『』【】“”‘’]$/u;
const canvas=typeof document==='undefined'?null:document.createElement('canvas');
const context=canvas?.getContext('2d');
const metricCache=new Map();
if(typeof document!=='undefined')document.fonts?.addEventListener('loadingdone',()=>metricCache.clear());
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
  const chinese=cjk.test(text),baseline=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;
  const cjkFamily=style.getPropertyValue('--tex-cjk-font-family')||'FandolSong';
  const updateFactor=character=>{const code=/[A-Z]/.test(character)?999:/[.!?]/.test(character)?3000:character===':'?2000:character===';'?1500:character===','?1250:/[)\]\"']/.test(character)?0:1000;if(code)spaceFactor=code>1000&&spaceFactor<1000?1000:code;};
  const pieces=[...text.matchAll(/[A-Za-z]+|[^\S\n\u00a0]+|\n|[^]/gu)];
  for(let n=0;n<pieces.length;n++){
    const match=pieces[n],value=match[0],at=match.index,from=start+1+at,local=styleAt(at);
    if(value==='\ufffc'){
      const atom=atoms.get(at);if(atom)emit({type:'box',width:atom.width/zoom,from,to:from+atom.size});
      if(atom?.kind==='math'&&cjk.test(pieces[n+1]?.[0]??'')){const space=measure(' ',local);emit({type:'glue',width:space,stretch:space/2,shrink:space/3,from:from+atom.size,to:from+atom.size,cjk:true});}
      continue;
    }
    if(value==='\n'){emit({type:'glue',width:0,stretch:1e10,shrink:0,from,to:from});emit({type:'penalty',width:0,cost:-10000,from:from+1,to:from+1,forced:true});continue;}
    if(/^\s+$/u.test(value)&&value!=='\u00a0'){
      const space=measure(' ',local),em=parseFloat(local.fontSize),skip=options.spaceSkip;
      const custom=skip&&texDimension(skip.width,em)!==0,factor=options.frenchSpacing?1:spaceFactor/1000;emit({type:'glue',width:custom?texDimension(skip.width,em):space+(spaceFactor>=2000&&!options.frenchSpacing?space/3:0),stretch:(custom?texDimension(skip.stretch,em):space/2)*factor,shrink:(custom?texDimension(skip.shrink,em):space/3)/factor,from,to:from+value.length});continue;
    }
    if(chinese&&cjkPunctuation.test(value)){
      const font=[local.fontStyle,local.fontWeight,local.fontSize,cjkFamily].join(' ');context.font=font;
      const metrics=context.measureText(value),em=parseFloat(local.fontSize),bounds=fandolPunctuation[Number(local.fontWeight)>=600?'bold':'regular'][value],left=bounds?bounds.left*em:Math.max(0,-metrics.actualBoundingBoxLeft),right=bounds?bounds.right*em:Math.max(0,metrics.width-metrics.actualBoundingBoxRight);
      const before=opening.test(value)?left:0,after=closing.test(value)?right:0;
      const previous=pieces[n-1]?.[0],pair=cjkPunctuation.test(previous??'')?fandolPairs[Number(local.fontWeight)>=600?'bold':'regular'][previous+value]:null;
      if(pair){
        while(items.at(-1)?.type==='glue'&&items.at(-1).from===from)items.pop();
        emit({type:'penalty',width:0,cost:10000,from,to:from});
        emit({type:'glue',width:pair.width*em,stretch:pair.stretch*em,shrink:pair.shrink*em,from,to:from,cjk:true});
      }
      if(before&&!pair&&n>0&&previous!=='\n')emit({type:'glue',width:before,stretch:0,shrink:Math.min(em/2,before),from,to:from,cjk:true});
      emit({type:'box',width:metrics.width-before-after,from,to:from+value.length,punctuation:true,before,after,font});
      if(after)emit({type:'glue',width:after,stretch:0,shrink:Math.min(em/2,after),from:from+value.length,to:from+value.length,cjk:true});
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
    if(next&&!(cjkPunctuation.test(value)&&cjkPunctuation.test(next))&&value!=='\u00a0'&&next!=='\u00a0'&&!/\s/.test(next)&&!closing.test(next)&&!opening.test(value)&&(cjk.test(value)||cjk.test(next)||cjkPunctuation.test(value)||cjkPunctuation.test(next))){
      const mixed=(cjk.test(value)&&(/^[A-Za-z0-9]/.test(next)||atoms.get(pieces[n+1]?.index)?.kind==='math'))||(/[A-Za-z0-9]$/.test(value)&&cjk.test(next));
      const space=mixed?measure(' ',local):0;
      emit({type:'glue',width:space,stretch:mixed?space/2:baseline*.08,shrink:mixed?space/3:0,from:from+value.length,to:from+value.length,cjk:true});
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
    const entries=[],options=paragraphParameters(preamble);let signature=preamble;
    editor.state.doc.descendants((node,start)=>{
      if(node.type.name!=='paragraph'||!node.content.size)return;
      // Apply measured xeCJK glue only for its calibrated font and punctuation profile.
      if(cjk.test(node.textContent)&&(options.cjkPunctStyle!=='quanjiao'||options.cjkCustomGlue||!getComputedStyle(editor.view.dom).getPropertyValue('--tex-cjk-font-family').includes('FandolSong')))return false;
      const element=editor.view.nodeDOM(start);if(!element?.offsetWidth||getComputedStyle(element).visibility==='hidden')return false;
      const style=getComputedStyle(element);
      if((node.attrs.align&&node.attrs.align!=='justify')||(!element.hasAttribute('data-tex-paragraph')&&!['justify','start'].includes(style.textAlign))||element.closest('[data-columns],.image-wrap-left,.image-wrap-right')||element.querySelector('.document-image'))return false;
      const {items}=tokensFor(editor,node,start,element,options);
      const page=element.closest('.document-page');
      const zoom=page?layoutScale(page):1;
      const elementRect=element.getBoundingClientRect();
      const baseWidth=elementRect.width/zoom-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth);
      const indent=parseFloat(style.textIndent)||0;
      const lineHeight=(parseFloat(getComputedStyle(element).lineHeight)||parseFloat(style.fontSize)*1.2||16)*zoom;
      const wraps=[...editor.view.dom.querySelectorAll('.document-image[data-wrap="true"]')].map(image=>{
        const rect=image.getBoundingClientRect();
        return {rect,side:image.dataset.wrapSide||'r'};
      });
      // Let CSS float the text around a wrapfigure paragraph.  The TeX
      // paragraph pass emits manual line breaks and would otherwise put every
      // line at the full column width, underneath the float.  Native float
      // wrapping is the shape model the DOM already exposes.
      if (wraps.some(wrap => wrap.rect.bottom > elementRect.top + .5 && wrap.rect.top < elementRect.bottom - .5)) return false;
      const widthAt=line=>{
        const top=elementRect.top+line*lineHeight;
        const bottom=top+lineHeight;
        let available=baseWidth;
        for(const wrap of wraps){
          if(wrap.rect.bottom<=top+.5||wrap.rect.top>=bottom-.5)continue;
          const cut=(wrap.rect.width/zoom)+10;
          if(/[rRiIoO]/.test(wrap.side))available-=cut;
          else if(/[lL]/.test(wrap.side))available-=cut;
        }
        return Math.max(24,available);
      };
      const plan=optimumParagraph(items,line=>widthAt(line)-(line===0?indent:0),{...options,emergencyStretch:options.emergency?texDimension(options.emergency,parseFloat(style.fontSize)):0});
      if(!plan||(plan.lines.length===1&&!cjk.test(node.textContent)))return false;
      entries.push(Decoration.node(start,start+node.nodeSize,{'data-tex-paragraph':'true'}));
      for(const [lineNumber,line] of plan.lines.entries()){
        const last=lineNumber===plan.lines.length-1;
        for(let index=line.start;index<line.end;index++){
          const item=items[index];
          if(item.punctuation)entries.push(Decoration.inline(item.from,item.to,{class:'tex-cjk-punctuation',style:'font:'+item.font+';line-height:0;margin-left:'+(-item.before)+'px;margin-right:'+(-item.after)+'px'}));
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
      signature+='|'+start+':'+baseWidth+':'+wraps.map(w=>w.rect.top.toFixed(1)+','+w.rect.bottom.toFixed(1)+','+w.side).join(';')+':'+items.map(item=>item.width.toFixed(3)).join(',')+':'+plan.lines.map(line=>line.end+','+line.ratio.toFixed(5)).join(';');
      return false;
    });
    if(signature===lastSignature)return;lastSignature=signature;
    running=true;try{editor.view.dispatch(editor.state.tr.setMeta(key,DecorationSet.create(editor.state.doc,entries)).setMeta('addToHistory',false));}finally{running=false;}
  }
  return {layout};
}