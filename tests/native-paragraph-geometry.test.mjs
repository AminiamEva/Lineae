import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {richSourceMap,bindRichSpans} from '../apps/web/src/typesetting/rtex/rich-source-map.mjs';
import {paragraphFrame} from '../apps/web/src/typesetting/rtex/paragraph-geometry.mjs';
import {sourceProjection,standaloneParagraphDraft} from '../apps/web/src/editor/source-sync.js';

const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*'},text:{}}});
const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text):null);
const file='main.tex';
function fixture(){
  const values=['rj','','','rj','中文𝔸','22'];
  const nodes=values.map(p),elements=nodes.map(()=>({nodeType:1})),doc=schema.nodes.doc.create(null,nodes);
  const dom=new Map();doc.forEach((_,pos,i)=>dom.set(pos,elements[i]));
  const source='% 中文\r\n\\begin{document}\r\n'+values.map(v=>v+'\n\n').join('')+'\\end{document}\r\n';
  return {view:{state:{doc},nodeDOM:pos=>dom.get(pos)},elements,doc,source};
}
test('canonical source byte ranges preserve equal text, blanks, CRLF and non-BMP characters',()=>{
  const {view,elements,source}=fixture();
  const map=richSourceMap(view,{path:file,source});
  const entries=map.get(file),bytes=Buffer.from(source);
  assert.deepEqual(entries.map(e=>e.element),[0,3,4,5].map(i=>elements[i]));
  assert.deepEqual(entries.map(e=>bytes.subarray(e.start,e.end).toString()),['rj','rj','中文𝔸','22']);
  const spans=entries.map((e,i)=>({kind:'Body',id:i+4,range:{start:e.start,end:e.end+1}}));
  assert.equal(bindRichSpans(map,{[file]:spans}).get(5).element,elements[3]);
  assert.equal(bindRichSpans(map,{[file]:[{kind:'Body',id:9,range:{start:0,end:bytes.length}}]}).get(9),null);
  assert.equal(bindRichSpans(map,{}).size,0);
});
test('imported spelling is checked against its immutable document snapshot',()=>{
  const nodes=[p('rj'),p('rj')],doc=schema.nodes.doc.create(null,nodes);
  const raw='\\begin{document}\r\n\\noindent rj\r\n\r\nrj\r\n\\end{document}\r\n';
  const projection=sourceProjection(raw,doc.toJSON());
  const view={state:{doc},nodeDOM:pos=>({nodeType:1,pos})};
  const entries=richSourceMap(view,{path:file,source:raw,projection}).get(file);
  assert.deepEqual(entries.map(e=>Buffer.from(raw).subarray(e.start,e.end).toString()),['\\noindent rj','rj']);
  view.state.doc=schema.nodes.doc.create(null,[p('changed'),nodes[1]]);
  assert.equal(richSourceMap(view,{path:file,source:raw,projection}).get(file).length,1);
});
test('ambiguous native rows are never assigned; an exact warm replacement uses its translated glyph positions',()=>{
  const entry={element:{},text:'x'},owners=new Map([[12,entry]]);
  const line={x:200,y:500,h:60,d:10,items:[['g',1,120,0,220,500,20,0]]};
  const fragment={page:1,first_line:1,last_line:1,xs:[200],baselines:[500]};
  const layout={placements:[{par_id:12,fragments:[fragment]}]};
  const dl={lines:[line],page_width:1000,page_height:2000},pages=new Map([[1,{dl}]]);
  const fresh={...line,x:0,y:100,items:[['g',1,120,0,12,100,30,0]]};
  const warm={update:{par_id:12,fragments:[fragment]},pages:new Map([[1,new Map([[0,{line:fresh,dx:200,dy:400}]])]])};
  const geometry=paragraphFrame(layout,pages,owners,warm).byElement.get(entry.element);
  assert.equal(geometry.stops.get(1).x,.242);assert.equal(geometry.stops.get(1).y,.25);
  const ambiguous=new Map([[1,{dl:{...dl,lines:[line,{...line}]}}]]);
  assert.equal(paragraphFrame(layout,ambiguous,owners).byElement.size,0);
});

test('typing into an interior blank inserts bytes without replacing either adjacent paragraph',()=>{
  const content=words=>schema.nodes.doc.create(null,words.map(p)).toJSON();
  const source='% 保留\r\n\\begin{document}\r\nleft\r\n\r\nright\r\n\\end{document}\r\n';
  const saved=content(['left','right']),before=content(['left','','','','right']);
  const after=content(['left','','','r','right']);
  const filled=standaloneParagraphDraft(source,sourceProjection(source,saved),JSON.stringify(saved),before,after,3);
  assert.equal(filled.draft,source.replace('right','r\r\n\r\nright'));
  assert.ok(filled.changes.every(c=>c.from===c.to));
  const typed=content(['left','','','rj','right']);
  const next=standaloneParagraphDraft(filled.draft,filled.projection,JSON.stringify(after),after,typed,3);
  assert.equal(next.draft,source.replace('right','rj\r\n\r\nright'));
  const earlier=content(['left','中','','rj','right']);
  const inserted=standaloneParagraphDraft(next.draft,next.projection,JSON.stringify(typed),typed,earlier,1);
  assert.equal(inserted.draft,source.replace('right','中\r\n\r\nrj\r\n\r\nright'));
});