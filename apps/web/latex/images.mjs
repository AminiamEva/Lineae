import {sourceStructure} from './source-structure.mjs';
import {group,trivia,clean,environmentEnd} from './tblr.mjs';

export const imageWidthPattern = /^(?:(?:\d+(?:\.\d+)?|\.\d+)?\\(?:linewidth|textwidth)|(?:\d+(?:\.\d+)?|\.\d+)(?:cm|mm|pt))$/;

// A single-image float is editable using the existing image node. Every other
// construct stays Raw: never flatten subfigures or silently drop unknown code.
function figureParts(source) {
  const opening=/^\s*\\begin\{(figure\*?)\}/.exec(source);
  if(!opening || [...sourceStructure(source)].some(t=>t.kind==='invalid'))return null;
  const closing=environmentEnd(source,source.indexOf('\\begin'),opening[1]);
  if(!closing || source.slice(closing.end).trim())return null;
  const attrs={figure:true,placement:null,centered:false,align:null,caption:null,label:null,width:null};
  const spans={},commands={};let cursor=trivia(source,opening[0].length),graphicsEnd;
  if(source[cursor]==='[') {
    const option=group(source,cursor,'[',']');if(!option)return null;
    attrs.placement=option.value;spans.placement={from:cursor+1,to:option.end-1};
    commands.placement={from:cursor,to:option.end};cursor=trivia(source,option.end);
  }
  while(cursor<closing.start) {
    const from=cursor,command=/^\\(includegraphics|caption|label|centering|raggedleft|raggedright)(?![A-Za-z])/.exec(source.slice(cursor));
    if(!command)return null;
    cursor+=command[0].length;
    const name=command[1];
    if(['centering','raggedleft','raggedright'].includes(name)) {
      if(spans.align)return null;
      attrs.align={centering:'center',raggedleft:'right',raggedright:'left'}[name];
      attrs.centered=attrs.align==='center';spans.align=commands.align={from,to:cursor};
    } else {
      const key=name==='includegraphics'?'path':name;
      if(spans[key])return null;
      if(name==='includegraphics')graphicsEnd=cursor;
      if(name==='caption' && source[cursor]==='*')cursor++;
      cursor=trivia(source,cursor);
      if(name!=='label' && source[cursor]==='[') {
        const option=group(source,cursor,'[',']');if(!option)return null;
        if(name==='includegraphics') {
          const start=trivia(source,cursor+1),keyMatch=/^width\s*=/.exec(source.slice(start,option.end-1));
          if(!keyMatch)return null;
          let valueStart=trivia(source,start+keyMatch[0].length),valueEnd=option.end-1;
          const wrapped=group(source,valueStart);
          if(wrapped && trivia(source,wrapped.end)===valueEnd){valueStart++;valueEnd=wrapped.end-1;}
          const width=clean(source.slice(valueStart,valueEnd));
          if(!imageWidthPattern.test(width))return null;
          valueStart=trivia(source,valueStart);
          if(source.slice(valueStart,valueStart+width.length)!==width)return null;
          attrs.width=width;spans.width={from:valueStart,to:valueStart+width.length};commands.width={from:cursor,to:option.end};
        }
        cursor=trivia(source,option.end);
      }
      const arg=group(source,cursor);if(!arg)return null;
      if(key==='path' && !/^[^{}\\\r\n%]+$/.test(arg.value))return null;
      attrs[key]=arg.value;spans[key]={from:cursor+1,to:arg.end-1};cursor=arg.end;
      commands[key]={from,to:cursor};
    }
    cursor=trivia(source,cursor);
  }
  if(cursor!==closing.start || !spans.path)return null;
  return {attrs,spans,commands,graphicsEnd,close:closing.start,placementEnd:opening[0].length};
}

// Patch only known arguments; comments, indentation, optional captions and EOLs
// outside those arguments remain exact. null means the rich edit is unsafe.
export function serializeSourceFigure(attrs) {
  const source=attrs.figureSource,parsed=typeof source==='string'?figureParts(source):null;
  if(!parsed || !attrs.figure)return null;
  const target={...attrs,align:attrs.align??(attrs.centered?'center':null)};
  const edits=[],eol=source.includes('\r\n')?'\r\n':'\n';
  const alignment={center:'\\centering',right:'\\raggedleft',left:'\\raggedright'};
  for(const key of ['placement','path','width','caption','label','align']) {
    const value=target[key]??null;if(value===parsed.attrs[key])continue;
    if(value!==null && typeof value!=='string')return null;
    if(key==='width' && value!==null && !imageWidthPattern.test(value))return null;
    if(key==='path' && (value===null || !/^[^{}\\\r\n%]+$/.test(value)))return null;
    if(key==='align' && value!==null && !alignment[value])return null;
    if(parsed.spans[key]) {
      edits.push({...((value===null)?parsed.commands[key]:parsed.spans[key]),value:value===null?'':key==='align'?alignment[value]:value});
    } else if(value!==null) {
      const at=key==='width'?parsed.graphicsEnd:key==='placement'?parsed.placementEnd:parsed.close;
      const insert=key==='width'?'[width='+value+']':key==='placement'?'['+value+']':
        eol+(key==='align'?alignment[value]:'\\'+key+'{'+value+'}')+eol;
      edits.push({from:at,to:at,value:insert});
    }
  }
  const result=edits.sort((a,b)=>b.from-a.from).reduce((s,e)=>s.slice(0,e.from)+e.value+s.slice(e.to),source);
  const check=figureParts(result);
  if(!check || ['placement','path','width','caption','label','align'].some(key=>check.attrs[key] !== (target[key]??null)))return null;
  return result;
}

export function parseImageBlock(source) {
  const figure=figureParts(source);
  if(figure)return {type:'documentImage',attrs:{...figure.attrs,figureSource:source}};
  const match = /^\\includegraphics(?:\[(width=[^\]]+)\])?\{([^{}\\\r\n%]+)\}$/.exec(source.trim());
  if(match?.[1] && !imageWidthPattern.test(match[1].slice(6)))return null;
  return match ? { type: 'documentImage', attrs: { path:match[2], width:match[1]?.slice(6) ?? null } } : null;
}

export function serializeImage(attrs) {
  const {path,width,figure,placement,centered,align,caption,label,figureSource}=attrs;
  if(figureSource)return serializeSourceFigure(attrs)??figureSource;
  const graphics='\\includegraphics' + (width ? '[width='+width+']' : '') + '{'+path+'}';
  if(!figure)return graphics+'\n\n';
  const alignment = align ?? (centered ? 'center' : null);
  const centering = alignment === 'center' ? '\\centering\n' : alignment === 'right' ? '\\raggedleft\n' :
    alignment === 'left' ? '\\raggedright\n' : '';
  return '\\begin{figure}'+(placement?'['+placement+']':'')+'\n'
    +centering+graphics+'\n'
    +(caption!==null&&caption!==undefined?'\\caption{'+caption+'}\n':'')
    +(label?'\\label{'+label+'}\n':'')+'\\end{figure}\n\n';
}
