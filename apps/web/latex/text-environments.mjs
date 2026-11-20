import {sourceStructure} from './source-structure.mjs';
import {group,trivia,environmentEnd} from './tblr.mjs';

export function textEnvironmentAt(source,start=0) {
  const open=/^\\begin\{(abstract|center)\}/.exec(source.slice(start));
  if(!open)return null;
  const close=environmentEnd(source,start,open[1]);
  return close?{name:open[1],bodyStart:start+open[0].length,bodyEnd:close.start,end:close.end}:null;
}

// These declarations are retained in the source, not approximated as CSS.
// Only leading declarations are separated from a paragraph. A declaration in
// the middle of unsupported text keeps that entire fragment Raw.
function contentStart(source,start,end) {
  let cursor=trivia(source,start);
  while(cursor<end) {
    const command=/^\\(zihao\*?|setlength|addtolength|fontsize|selectfont|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)(?![A-Za-z])/.exec(source.slice(cursor));
    if(!command)break;
    let next=trivia(source,cursor+command[0].length);
    const count=/^(setlength|addtolength|fontsize)$/.test(command[1])?2:command[1].startsWith('zihao')?1:0;
    let valid=true;
    for(let i=0;i<count;i++){const arg=group(source,next);if(!arg||arg.end>end){valid=false;break;}next=trivia(source,arg.end);}
    if(!valid)break;
    cursor=next;
  }
  return Math.min(cursor,end);
}

export function importTextEnvironment(source,importChildren) {
  const start=source.length-source.trimStart().length,env=textEnvironmentAt(source,start);
  if(!env || source.slice(env.end).trim() || [...sourceStructure(source)].some(t=>t.kind==='invalid'))return null;
  const content=[],parts=[];
  const append=(from,to,layout=true)=>{
    if(layout)from=contentStart(source,from,to);
    if(!source.slice(from,to).trim())return;
    const nodes=importChildren(source.slice(from,to));
    if(!nodes.length)return;
    // Snapshot values, never aliases into the editable AST. A nested container
    // already owns its source; storing its full snapshot again grows exponentially.
    const original=nodes.map(n=>n.attrs?.environmentSource?{type:'raw',attrs:{source:n.attrs.environmentSource.source}}:structuredClone(n));
    parts.push({from,to,index:content.length,count:nodes.length,nodes:original,protected:nodes.some(n=>n.type==='raw')});content.push(...nodes);
  };
  const body=source.slice(env.bodyStart,env.bodyEnd);
  let cursor=env.bodyStart;
  for(const token of sourceStructure(body)) {
    const from=env.bodyStart+token.index,to=env.bodyStart+token.end;
    if(!token.topLevel || from<cursor)continue;
    if(token.kind==='blank' || token.value==='\\par') {
      append(cursor,from);cursor=to;
    } else if(token.kind==='displayMath') {
      append(cursor,from);append(from,to,false);cursor=to;
    } else if(token.kind==='begin') {
      const name=/^\\begin\{([^{}]+)\}$/.exec(token.value)?.[1];
      const close=name?environmentEnd(source,from,name):null;
      // Literal environments have no emitted close token; conservatively keep
      // that remainder as one opaque child instead of guessing its boundary.
      if(!close || close.end>env.bodyEnd)break;
      append(cursor,from);append(from,close.end,false);cursor=close.end;
    }
  }
  append(cursor,env.bodyEnd);
  if(!content.length)content.push({type:'paragraph'});
  return {type:'blockquote',attrs:{latexEnvironment:env.name,environmentSource:{source,name:env.name,parts,count:content.length}},content};
}

export function serializeTextEnvironment(node,serialize) {
  const saved=node.attrs?.environmentSource;
  if(!saved || node.type!=='blockquote' || node.attrs.latexEnvironment!==saved.name || node.content?.length!==saved.count)return null;
  if(!saved.parts.length)return node.content.every(n=>n.type==='paragraph'&&!n.content?.length)?saved.source:null;
  const edits=[];
  for(const part of saved.parts) {
    const current=node.content.slice(part.index,part.index+part.count);
    const before=part.nodes.map(serialize).join('').trim(),after=current.map(serialize).join('').trim();
    if(before===after)continue;
    if(part.protected || current.some(n=>n.type==='raw'))return null;
    const raw=saved.source.slice(part.from,part.to);
    // A noncanonical spelling is still displayed and exported losslessly, but
    // must be edited in Source mode until a safe mapping is available.
    if(raw.trim()!==before)return null;
    const leading=raw.match(/^\s*/)[0],trailing=raw.slice(leading.length).match(/\s*$/)[0];
    edits.push({from:part.from,to:part.to,value:leading+after+trailing});
  }
  return edits.reverse().reduce((s,e)=>s.slice(0,e.from)+e.value+s.slice(e.to),saved.source);
}
