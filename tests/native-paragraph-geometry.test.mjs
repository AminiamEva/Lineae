import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {richSourceMap,bindRichSpans} from '../apps/web/src/typesetting/rtex/rich-source-map.mjs';
import {paragraphFrame,paragraphHit} from '../apps/web/src/typesetting/rtex/paragraph-geometry.mjs';
import {completePageDeltas} from '../apps/web/src/typesetting/rtex/page-deltas.mjs';
import {changedTextblocks} from '../apps/web/src/editor/changed-textblocks.mjs';
import {EditorState} from '@tiptap/pm/state';
import {sourceProjection,requiresSourceProjection,standaloneParagraphDraft} from '../apps/web/src/editor/source-sync.js';
import {importBlocks} from '../apps/web/src/editor/latex-codec.js';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {projectDocumentEdits} from '../apps/web/src/project/include-document.mjs';

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

test('after splitting on either side of a space the first and subsequent keys survive in the source',()=>{
  const doc=words=>schema.nodes.doc.create(null,words.map(p)).toJSON();
  const saved=doc(['alpha 世界','neighbor']);
  const source='% original\r\n\\begin{document}\r\nalpha 世界\r\n\r\nneighbor\r\n\\end{document}\r\n';
  for(const [left,right] of [['alpha',' 世界'],['alpha ','世界']]){
    const before=doc([left,right,'neighbor']);
    let current=before,bytes=source,projection=sourceProjection(source,saved),snapshot=JSON.stringify(saved);
    let typed='';
    for(const char of ['X','中','Y']){
      typed+=char;
      const after=doc([left,typed+right,'neighbor']);
      const result=standaloneParagraphDraft(bytes,projection,snapshot,current,after,1);
      assert.ok(result,'Refused '+JSON.stringify({left,right,typed}));
      assert.equal(result.draft,source.replace('alpha 世界',left+'\r\n\r\n'+typed+right));
      current=after;bytes=result.draft;projection=result.projection;snapshot=JSON.stringify(after);
    }
  }
});

test('splitting a paragraph preserves the original Unicode spelling on both sides',()=>{
  const doc=words=>schema.nodes.doc.create(null,words.map(p)).toJSON();
  for(const [left,right] of [['甲—乙',' 丙'],['alpha',' “中文” beta'],['中“文” ','A—B']]){
    const original=doc([left+right,'nearby']),split=doc([left,right,'nearby']);
    const raw='% exact bytes\r\n\\begin{document}\r\n'+left+right+'\r\n\r\nnearby\r\n\\end{document}\r\n';
    let before=split,saved=original,source=raw,projection=sourceProjection(source,original);
    for(const typed of ['X','X中']){
      const after=doc([left,typed+right,'nearby']);
      const result=standaloneParagraphDraft(source,projection,JSON.stringify(saved),before,after,1);
      assert.ok(result,JSON.stringify({left,right,typed}));
      assert.equal(result.draft,raw.replace(left+right,left+'\r\n\r\n'+typed+right));
      before=saved=after;projection=result.projection;source=result.draft;
    }
  }
});

test('splitting text across original TeX line breaks, comments and emphasis preserves source bytes',()=>{
  const wrap=body=>'\\begin{document}\r\n'+body+'\r\n\r\nneighbor\r\n\\end{document}\r\n';
  const prose=new Schema({nodes:schema.spec.nodes,marks:{italic:{}}});
  const read=body=>prose.nodeFromJSON({type:'doc',content:parseDocument(wrap(body)).blocks.flatMap(importBlocks)}).toJSON();
  for(const [body,run,cut,expected] of [
    ['alpha beta\r\n  gamma delta',0,5,'alpha\r\n\r\nX中Y beta\r\n  gamma delta'],
    ['甲乙\r\n丙丁',0,1,'甲\r\n\r\nX中Y乙\r\n丙丁'],
    ['alpha% keep this\r\nbeta gamma',0,5,'alpha% keep this\r\n\r\n\r\nX中Ybeta gamma'],
    ['alpha \\emph{two words} end',0,5,'alpha\r\n\r\nX中Y \\emph{two words} end'],
    ['alpha \\emph{two words} end',1,3,'alpha \\emph{two}\r\n\r\n\\emph{X中Y words} end'],
    ['alpha \\% beta\r\ngamma \\textsl{AB} end',1,1,'alpha \\% beta\r\ngamma \\textsl{A}\r\n\r\n\\textsl{X中YB} end'],
  ]){
    const saved=read(body),original=saved.content[0],leaf=original.content[run];
    const left={...original,content:[...original.content.slice(0,run),{...leaf,text:leaf.text.slice(0,cut)}]};
    const right={...original,content:[{...leaf,text:leaf.text.slice(cut)},...original.content.slice(run+1)]};
    let source=wrap(body),before={...saved,content:[left,right,...saved.content.slice(1)]};
    let snapshot=JSON.stringify(saved),projection=sourceProjection(source,saved);
    for(const key of ['X','中','Y']){
      const after=structuredClone(before);
      const first=after.content[1].content[0];
      const at=first.text.indexOf(leaf.text.slice(cut));
      first.text=first.text.slice(0,at)+key+first.text.slice(at);
      const result=standaloneParagraphDraft(source,projection,snapshot,before,after,1);
      assert.ok(result,'Lost '+key+' after splitting '+body);
      source=result.draft;projection=result.projection;snapshot=JSON.stringify(after);before=after;
    }
    assert.equal(source,wrap(expected));
  }
});

test('an edit next to an end-of-line comment remains visible and cannot erase the comment',()=>{
  const saved=schema.nodes.doc.create(null,[p('alpha'),p('tail')]).toJSON();
  const source='\\begin{document}\r\nalpha% keep verbatim\r\n\r\ntail\r\n\\end{document}\r\n';
  const typed=schema.nodes.doc.create(null,[p('alphaZ'),p('tail')]).toJSON();
  const result=standaloneParagraphDraft(source,sourceProjection(source,saved),JSON.stringify(saved),saved,typed,0);
  assert.equal(result?.draft,source.replace('alpha%','alphaZ%'));
  const joined=schema.nodes.doc.create(null,[p('alphaomega'),p('tail')]).toJSON();
  const separated=source.replace('verbatim','verbatim\r\nomega');
  assert.equal(standaloneParagraphDraft(separated,sourceProjection(separated,joined),
    JSON.stringify(joined),joined,typed,0)?.draft,separated.replace('omega','Z'));
  const overwritten=schema.nodes.doc.create(null,[p('aZ'),p('tail')]).toJSON();
  assert.equal(standaloneParagraphDraft(separated,sourceProjection(separated,joined),
    JSON.stringify(joined),joined,overwritten,0),null);
});

test('typing after a split in an included file updates just its original source span',()=>{
  const main='\\input{child}\n', prefix='% preserved\n', raw='alpha beta\r\n  gamma';
  const saved=schema.nodes.doc.create(null,[p('alpha beta gamma')]).toJSON();
  const split=schema.nodes.doc.create(null,[p('alpha'),p(' beta gamma')]).toJSON();
  const typed=schema.nodes.doc.create(null,[p('alpha'),p('X beta gamma')]).toJSON();
  const region={key:'child:0',id:'child',from:prefix.length};
  function apply(body,before,after){
    const composition={regions:[{...region,projection:sourceProjection(body,before,{fragment:true})}],
      sources:new Map([['main',main],['child',prefix+body]])};
    return projectDocumentEdits(composition,{content:[{type:'projectRegion',attrs:{regionKey:region.key},content:after.content}]});
  }
  const first=apply(raw,saved,split);
  assert.deepEqual([...first],[['child',prefix+'alpha\r\n\r\n beta\r\n  gamma']]);
  const second=apply(first.get('child').slice(prefix.length),split,typed);
  assert.deepEqual([...second],[['child',prefix+'alpha\r\n\r\nX beta\r\n  gamma']]);
});

test('a CJK soft wrap has two physical caret stops for the same model offset',()=>{
  const element={},entry={element,text:'文文'};
  const lines=[500,1200].map(y=>({x:300,y,h:200,d:50,items:[['g',1,0x6587,0,300,y,250,0]]}));
  const pages=new Map([[1,{dl:{lines,page_width:1000,page_height:2000}}]]);
  const fragment={page:1,first_line:1,last_line:2,xs:[300,300],baselines:[500,1200]};
  const frame=paragraphFrame({placements:[{par_id:9,fragments:[fragment]}]},pages,new Map([[9,entry]]));
  const boundary=frame.byElement.get(element).stops.get(1);
  assert.deepEqual([boundary.upstream.x,boundary.upstream.y,boundary.x,boundary.y],[.55,.25,.3,.6]);
  assert.deepEqual(paragraphHit(frame,1,.55,.25),{element,text:'文文',offset:1,upstream:true});
  assert.deepEqual(paragraphHit(frame,1,.3,.6),{element,text:'文文',offset:1,upstream:false});
});

test('a delayed full page delta becomes the next base without rolling back visible warm ink',()=>{
  const cache=completePageDeltas();
  const delta=(source_revision,pages_total,pages_changed,layout_version=1)=>({
    versions:{source_revision,layout_version},pages_total,pages_changed});
  const a={page:1,ink:'one'},b={page:2,ink:'two'},nextB={page:2,ink:'second edit'};
  assert.equal(cache.apply(delta(1,2,[a,b]),0).get(2),b);
  assert.equal(cache.apply(delta(4,2,[nextB]),5),null);
  assert.equal(cache.apply(delta(2,2,[b]),5),null);
  assert.deepEqual([...cache.apply(delta(5,2,[]),5).values()],[a,nextB]);
  assert.deepEqual([...cache.apply(delta(5,1,[],2),5).values()],[a]);
  assert.equal(cache.apply(delta(5,2,[b],1),5),null);
  cache.reset();
  assert.throws(()=>cache.apply(delta(1,2,[b]),1),/missing page/);
  assert.throws(()=>cache.apply(delta(2,2,[a]),2),/missing page/);
  assert.deepEqual([...cache.apply(delta(3,1,[a]),3).values()],[a]);
});

test('multi-step edits locate both halves of a split in final document coordinates',()=>{
  const state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[p('alpha beta'),p('neighbor')])});
  const tr=state.tr.split(6).insertText('中',8).insertText('!',1);
  const changed=[...changedTextblocks(tr)].sort((a,b)=>a[0]-b[0]);
  assert.deepEqual(changed.map(([,node])=>node.textContent),['!alpha','中 beta']);
  for(const [pos,node] of changed)assert.equal(tr.doc.nodeAt(pos),node);
});

test('a formatting transaction still invalidates the changed text when positions do not move',()=>{
  const marked=new Schema({nodes:schema.spec.nodes,marks:{strong:{}}});
  const doc=marked.node('doc',null,['before','edited words','after'].map(s=>marked.node('paragraph',null,marked.text(s))));
  const start=doc.child(0).nodeSize+2;
  const tr=EditorState.create({schema:marked,doc}).tr.addMark(start,start+5,marked.mark('strong'));
  assert.deepEqual([...changedTextblocks(tr).values()].map(node=>node.textContent),['edited words']);
});

test('edit routing follows nested source commands when neighboring immutable subtrees are reused',()=>{
  const s=new Schema({nodes:{doc:{content:'block+'},quote:{group:'block',content:'block+'},
    paragraph:{group:'block',content:'inline*'},reference:{inline:true,group:'inline',attrs:{sourceCommand:{default:null}}},
    raw:{group:'block'},text:{group:'inline'}}});
  const plain=s.node('paragraph',null,s.text('alpha')),ref=s.node('reference',{sourceCommand:'ref'});
  const quote=s.node('quote',null,s.node('paragraph',null,ref));
  const doc=nodes=>s.node('doc',null,nodes);
  const refDoc=doc([plain,quote]),bare=doc([plain,s.node('quote',null,plain)]);
  assert.equal(requiresSourceProjection(refDoc),true);
  assert.equal(requiresSourceProjection(bare),false);
  assert.equal(requiresSourceProjection(doc([plain,s.node('raw')])),true);
  assert.equal(requiresSourceProjection(EditorState.create({doc:refDoc}).tr.insertText('!',2).doc),true);
});
