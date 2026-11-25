import {parseDocument} from '../../../latex/document.mjs';

const segmenter = new Intl.Segmenter('und', {granularity:'grapheme'});
const unsupported = /[\\{}$%&#_^~]/;

// Prose slice: plain paragraphs with no TeX syntax. Each non-space grapheme
// receives a LuaTeX attribute so the engine reports its own box; spaces and
// paragraph boundaries keep their original bytes.
export function projectTextDocument(source, {firstOwner=1, attribute=65000}={}) {
  const doc=parseDocument(source);
  if(!doc)return null;
  const body=doc.blocks.join('');
  if(doc.start+body+doc.end!==source)return null;
  let output='',cursor=0,next=firstOwner,bodyOffset=0;
  const paragraphs=[],owners=new Map();
  for(const block of doc.blocks){
    const blockStart=bodyOffset;
    bodyOffset+=block.length;
    if(!block.trim())continue;
    const leading=block.match(/^\s*/)[0].length;
    const trailing=block.length-block.trimEnd().length;
    const text=block.slice(leading,block.length-trailing);
    if(unsupported.test(text))return null;
    let instrumented='\\begingroup', local=0;
    const glyphs=[];
    for(const {segment} of segmenter.segment(text)){
      if(/^\s+$/u.test(segment)){instrumented+=segment;local+=segment.length;continue;}
      const tag=next++;
      instrumented+=`\\attribute${attribute}=${tag} ${segment}`;
      glyphs.push({tag,from16:local,to16:local+segment.length,char:segment});
      local+=segment.length;
    }
    instrumented+='\\endgroup';
    const from16=doc.start.length+blockStart+leading;
    const paragraph={source,from16,text,glyphs,index:paragraphs.length};
    for(const glyph of glyphs)owners.set(glyph.tag,{paragraph,glyph});
    paragraphs.push(paragraph);
    output+=source.slice(cursor,from16)+instrumented;
    cursor=from16+text.length;
  }
  if(!paragraphs.length)return null;
  return {source,projection:output+source.slice(cursor),paragraphs,owners,nextTag:next};
}

export function textTarget(projection, owner, after) {
  const entry=projection?.owners.get(owner);
  if(!entry)return null;
  const {paragraph,glyph}=entry;
  const local=after?glyph.to16:glyph.from16;
  return {
    kind:'text',paragraph,glyph,owner,after,
    local, docOffset:paragraph.from16+local,
    hit:{owner,role:'nucleus',after},
  };
}

export function textEdit(projection, {paragraph,from16,to16,insert}) {
  if(!projection||projection.source!==paragraph.source)return null;
  if(!Number.isInteger(from16)||!Number.isInteger(to16)||from16<0||to16<from16||to16>paragraph.text.length)return null;
  if(typeof insert!=='string'||unsupported.test(insert))return null;
  const next=paragraph.text.slice(0,from16)+insert+paragraph.text.slice(to16);
  const source=projection.source.slice(0,paragraph.from16)+next+projection.source.slice(paragraph.from16+paragraph.text.length);
  return {text:next, patch:{from:from16,to:to16,insert}, source, selection:from16+insert.length};
}
