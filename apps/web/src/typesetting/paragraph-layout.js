import Hypher from 'hypher';
import enUS from 'hyphenation.en-us';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {optimumParagraph} from './optimum-paragraph.mjs';

const key=new PluginKey('texParagraphLayout'),hyphenator=new Hypher(enUS);
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const closing=/^[、。，．？！：；）］｝〉》」』】…,.!?;:)]$/u,opening=/[（［｛〈《「『【(\[]$/u;
const canvas=typeof document==='undefined'?null:document.createElement('canvas');
const context=canvas?.getContext('2d');
const metricCache=new Map();
function measure(text,style){
  const font=style.font||[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');
  const id=font+'|'+style.letterSpacing+'|'+text;
  if(metricCache.has(id))return metricCache.get(id);
  context.font=font;const width=context.measureText(text).width+Math.max(0,text.length-1)*(parseFloat(style.letterSpacing)||0);
  if(metricCache.size>10000)metricCache.clear();metricCache.set(id,width);return width;
}
function optionsFrom(preamble){
  const value=(name,fallback)=>{const re=new RegExp('\\\\'+name+'\\s*(?:=\\s*)?(-?\\d+)\\b'),match=preamble.match(re);return match?Number(match[1]):fallback;};
  return {pretolerance:value('pretolerance',100),tolerance:value('tolerance',200),linePenalty:value('linepenalty',10),hyphenPenalty:value('hyphenpenalty',50),adjDemerits:value('adjdemerits',10000),doubleHyphenDemerits:value('doublehyphendemerits',10000),finalHyphenDemerits:value('finalhyphendemerits',5000)};
}
function tokensFor(editor,node,start,element){
  const runs=[],atoms=new Map();let text='';
  node.forEach((child,offset)=>{
    const from=start+1+offset;
    if(child.isText){
      const point=editor.view.domAtPos(from),dom=point.node.nodeType===3?point.node.parentElement:point.node;
      runs.push({from:text.length,to:text.length+child.text.length,style:getComputedStyle(dom.closest('.tex-word-glue')?.parentElement??dom)});text+=child.text;
    }else if(child.type.name==='hardBreak'){text+='\n';}
    else if(child.isInline){const dom=editor.view.nodeDOM(from);atoms.set(text.length,{from,size:child.nodeSize,width:dom?.getBoundingClientRect().width??0});text+='\ufffc'.repeat(child.nodeSize);}
  });
  const style=getComputedStyle(element),zoom=element.getBoundingClientRect().width/element.offsetWidth||1;
  const styleAt=offset=>runs.find(run=>offset>=run.from&&offset<run.to)?.style??style;
  const width=(value,offset)=>{
    let result=0;for(const run of runs){const from=Math.max(offset,run.from),to=Math.min(offset+value.length,run.to);if(to>from)result+=measure(value.slice(from-offset,to-offset),run.style);}return result;
  };
  const items=[];const emit=item=>items.push(item);
  const pieces=[...text.matchAll(/[A-Za-z]+|[^\S\n\u00a0]+|\n|[^]/gu)];
  for(let n=0;n<pieces.length;n++){
    const match=pieces[n],value=match[0],at=match.index,from=start+1+at,local=styleAt(at);
    if(value==='\ufffc'){
      const atom=atoms.get(at);if(atom)emit({type:'box',width:atom.width/zoom,from,to:from+atom.size});continue;
    }
    if(value==='\n'){emit({type:'glue',width:0,stretch:1e10,shrink:0,from,to:from});emit({type:'penalty',width:0,cost:-10000,from:from+1,to:from+1,forced:true});continue;}
    if(/^\s+$/u.test(value)&&value!=='\u00a0'){
      const space=measure(' ',local);emit({type:'glue',width:space,stretch:space/2,shrink:space/3,from,to:from+value.length});continue;
    }
    if(/^[A-Za-z]{5,}$/.test(value)){
      const parts=hyphenator.hyphenate(value);let position=0;
      for(let i=0;i<parts.length;i++){
        const part=parts[i];emit({type:'box',width:width(part,at+position),from:from+position,to:from+position+part.length});position+=part.length;
        if(i<parts.length-1)emit({type:'penalty',width:measure('-',styleAt(at+position)),cost:50,hyphen:true,from:from+position,to:from+position});
      }
    }else emit({type:'box',width:width(value,at),from,to:from+value.length});
    const next=pieces[n+1]?.[0];
    if(next&&value!=='\u00a0'&&next!=='\u00a0'&&!closing.test(next)&&!opening.test(value)&&(cjk.test(value)||cjk.test(next))){
      const em=parseFloat(local.fontSize);emit({type:'glue',width:0,stretch:em*.1,shrink:0,from:from+value.length,to:from+value.length,cjk:true});
    }
  }
  while(items.at(-1)?.type==='glue')items.pop();
  const end=start+node.nodeSize-1;
  emit({type:'glue',width:0,stretch:1e10,shrink:0,from:end,to:end});emit({type:'penalty',width:0,cost:-10000,from:end,to:end});
  return {items,style};
}
function widget(position,classes,width=0){
  return Decoration.widget(position,()=>{const span=document.createElement('span');span.className=classes;span.contentEditable='false';span.setAttribute('aria-hidden','true');if(width)span.style.width=width+'px';return span;},{side:-1,key:classes+position+':'+width,ignoreSelection:true});
}
export function installParagraphLayout(editor){
  let current='',lastSignature='',running=false;
  editor.registerPlugin(new Plugin({key,state:{init:()=>DecorationSet.empty,apply(tr,previous){return tr.getMeta(key)??previous.map(tr.mapping,tr.doc);}},props:{decorations:state=>key.getState(state)}}));
  function layout(preamble=current){
    current=preamble;if(running||editor.view.composing)return;
    const entries=[],options=optionsFrom(preamble);let signature=preamble;
    editor.state.doc.descendants((node,start)=>{
      if(node.type.name!=='paragraph'||!node.content.size)return;
      const element=editor.view.nodeDOM(start);if(!element?.offsetWidth||getComputedStyle(element).visibility==='hidden')return false;
      const style=getComputedStyle(element);
      if((node.attrs.align&&node.attrs.align!=='justify')||(!element.hasAttribute('data-tex-paragraph')&&!['justify','start'].includes(style.textAlign))||element.closest('[data-columns],.image-wrap-left,.image-wrap-right')||element.querySelector('.document-image'))return false;
      const {items}=tokensFor(editor,node,start,element),width=element.getBoundingClientRect().width/(element.closest('.document-page').getBoundingClientRect().width/element.closest('.document-page').offsetWidth||1)-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth),indent=parseFloat(style.textIndent)||0;
      const plan=optimumParagraph(items,line=>width-(line===0?indent:0),options);
      if(!plan)return false;
      entries.push(Decoration.node(start,start+node.nodeSize,{'data-tex-paragraph':'true',style:'white-space:nowrap;text-align:left;hyphens:none;overflow-wrap:normal;word-break:normal'}));
      for(const [lineNumber,line] of plan.lines.entries()){
        const last=lineNumber===plan.lines.length-1;
        for(let index=line.start;index<line.end;index++){
          const item=items[index];if(item.type!=='glue'||item.stretch>=1e10)continue;
          const size=Math.max(0,item.width+(last?0:line.ratio*(line.ratio<0?item.shrink:item.stretch)));
          if(item.to>item.from)entries.push(Decoration.inline(item.from,item.to,{class:'tex-word-glue',style:'display:inline-block;white-space:pre;width:'+size+'px;text-indent:0;font-size:0'}));
          else if(size)entries.push(widget(item.from,'tex-interchar-glue',size));
        }
        const end=items[line.end];
        if(!last){
          if(end.type==='glue'&&end.to>end.from)entries.push(Decoration.inline(end.from,end.to,{class:'tex-word-glue',style:'display:inline-block;width:0;font-size:0'}));
          if(end.hyphen)entries.push(widget(end.from,'tex-discretionary-hyphen'));
          // A visual break is a view decoration, never a hardBreak/source edit.
          if(!end.forced)entries.push(widget(end.to,'tex-paragraph-break'));
        }
      }
      signature+='|'+start+':'+width+':'+items.map(item=>item.width.toFixed(3)).join(',')+':'+plan.lines.map(line=>line.end+','+line.ratio.toFixed(5)).join(';');
      return false;
    });
    if(signature===lastSignature)return;lastSignature=signature;
    running=true;try{editor.view.dispatch(editor.state.tr.setMeta(key,DecorationSet.create(editor.state.doc,entries)).setMeta('addToHistory',false));}finally{running=false;}
  }
  return {layout};
}