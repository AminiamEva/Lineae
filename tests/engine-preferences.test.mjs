import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConfigStore} from '../apps/web/src/editor/config.mjs';
import {Project} from '../apps/web/src/project/project.mjs';
import * as tikz from '../apps/web/src/ui/tikz-studio.js';
const yaml=readFileSync('apps/web/config.yaml','utf8');
const article='% 中文\r\n\\documentclass{article}\n\\input{ch}\n\\begin{document}Text\\end{document}';
test('old v2 YAML inherits Lua and can explicitly default to Xe',()=>{
 const config=createConfigStore(yaml);
 config.importYaml('version: 2\ninterface:\n  zoom: 130');
 assert.equal(config.value.typesetting.defaultEngine,'lualatex');
 config.importYaml('version: 2\ntypesetting:\n  defaultEngine: xelatex');
 assert.equal(config.value.typesetting.defaultEngine,'xelatex');
 assert.throws(()=>config.importYaml('typesetting:\n  defaultEngine: auto'));
});
function fixture(root,legacy,journal) {
 const disk=new Map([['main.tex',article],['ch.tex','Text'],['other.tex','\\usepackage{xeCJK}']]);
 const values=new Map();
 const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const key='lineae:project-state:v1:'+root;
 if(legacy)storage.setItem(key,JSON.stringify(legacy));
 const adapter={root,list:async()=>Array.from(disk.keys(),path=>({kind:'file',path})),read:async path=>new TextEncoder().encode(disk.get(path)),
 move:async(a,b)=>{disk.set(b,disk.get(a));disk.delete(a);},checkpoint:async s=>{journal=structuredClone(s);},loadState:async()=>journal};
 return {open:(local=storage)=>new Project(adapter,undefined,local).open(),get stored(){return JSON.parse(storage.getItem(key));}};
}
test('only identifiable old projects relying on the default migrate once',async()=>{
 const old=fixture('old',{main:'main.tex',files:{'main.tex':'doc-1','ch.tex':'doc-2'}});
 const emptyNative={main:null,files:{},drafts:[]};
 const local=fixture('local',{main:'main.tex',files:{'main.tex':'doc-1'},engineChoice:'xelatex'},emptyNative);
 assert.equal((await local.open()).engineChoice,'xelatex');
 const model=await old.open();assert.equal(model.engineChoice,'xelatex');
 model.setEngineChoice('auto');await model.pendingCheckpoint;
 assert.equal(old.stored.engineChoice,'auto');assert.equal((await old.open(null)).engineChoice,'auto');
 for(const legacy of [null,{main:null,files:{}},{main:'missing.tex',files:{'missing.tex':'x'}}]){
  assert.equal((await fixture('fresh',legacy).open()).engineChoice,'auto');
 }
});
test('root, related drafts, rename and checkpoint retain the project choice',async()=>{
 const f=fixture('project');const m=await f.open();
 assert.equal(m.resolveTypesetting('lualatex').resolvedEngine,'lualatex');
 const child=m.files.get('ch.tex');m.edit(child.id,'\\usepackage{xeCJK}');m.activate(child.id);
 assert.equal(m.resolveTypesetting('lualatex').resolvedEngine,'xelatex');
 m.setEngineChoice('lualatex');const r=m.resolveTypesetting('lualatex');
 assert.deepEqual([r.requestedChoice,r.resolvedEngine,r.diagnostics[0].file],['lualatex','lualatex','ch.tex']);
 await m.move('main.tex','book.tex');await m.pendingCheckpoint;
 const reopened=await f.open(null);assert.equal(reopened.engineChoice,'lualatex');
 reopened.restoreDrafts(reopened.diskRecovery);
 assert.equal(reopened.file(reopened.mainFileId).path,'book.tex');
 assert.equal(reopened.files.get('ch.tex').draft,'\\usepackage{xeCJK}');
 assert.equal((await fixture('second').open()).engineChoice,'auto');
});
test('TikZ runtime distinguishes unicode packages, graph drawing and unsupported Xe',()=>{
 for(const name of ['fontspec','unicode-math'])assert.equal(tikz.tikzRuntime('\\usepackage{'+name+'}'),'unicode');
 assert.equal(tikz.tikzRuntime('% graphdrawing\n\\draw (0,0);'),'auto');
 assert.equal(tikz.tikzRuntime('\\usetikzlibrary{graphs,graphdrawing}'),'lualatex');
 assert.equal(tikz.tikzRuntime('\\usepackage{xeCJK}'),'unsupported-xe');
});

test('a locally Xe-dependent drawing returns a diagnostic before loading the WASM runtime',async()=>{
 const result=await tikz.renderTikz(String.raw`\documentclass{standalone}\usepackage{xeCJK}\begin{document}图\end{document}`);
 assert.equal(result.status,'unsupported');assert.match(result.diagnostics[0].message,/XeTeX/);
});

test('TikZ literals cannot request a WASM backend',()=>{
 for(const command of ['\\directlua{}','\\usetikzlibrary{graphdrawing}','\\usepackage{fontspec}','\\usepackage{xeCJK}']){
  for(const literal of ['\\verb|'+command+'|','% '+command,'\\begin{verbatim}\n'+command+'\n\\end{verbatim}'])
   assert.equal(tikz.tikzRuntime(literal),'auto',literal);
 }
});
test('a stale window writing a draft preserves the latest explicit preference',async()=>{
 const f=fixture('shared');const a=await f.open(),b=await f.open();
 a.setEngineChoice('xelatex');b.edit(b.mainFileId,article+' B');
 await Promise.all([a.pendingCheckpoint,b.pendingCheckpoint]);
 assert.equal((await f.open()).engineChoice,'xelatex');
 a.setEngineChoice('auto');b.checkpoint();await b.pendingCheckpoint;
 assert.equal((await f.open()).engineChoice,'auto');
 b.setEngineChoice('lualatex');a.checkpoint();await a.pendingCheckpoint;
 assert.equal((await f.open()).engineChoice,'lualatex');
});
