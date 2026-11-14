import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../apps/desktop/src-tauri/src/bridge.js',import.meta.url),'utf8');
function bridge(invoke){const window={__TAURI_INTERNALS__:{invoke}};const Anchor=function(){};Anchor.prototype.click=()=>{};vm.runInNewContext(source,{window,HTMLAnchorElement:Anchor,DOMException,Uint8Array,console});return window.lineaeProject;}
test('native picker cancellation and failure propagate without fabricating a project',async()=>{
 await assert.rejects(bridge(async()=>null).open(),{name:'AbortError'});
 await assert.rejects(bridge(async()=>{throw new Error('dialog failed');}).open(),/dialog failed/);
});
test('native string rejections become visible Error messages for explorer feedback',async()=>{
 const api=bridge(async command=>{if(command==='open_project')return 'C:\\project';throw 'Access denied (os error 5)';});
 const adapter=await api.open();await assert.rejects(adapter.write('main.tex',new Uint8Array()),/Access denied/);
});
test('native bridge retains Chinese/space root and routes binary moves through scoped IPC',async()=>{
 const calls=[];
 const api=bridge(async(command,args)=>{calls.push({command,args});return command==='open_project'?'C:\\中文 项目':{entries:[],bytes:[0,255,13,10]};});
 const adapter=await api.open();assert.equal(adapter.root,'C:\\中文 项目');
 assert.deepEqual(Array.from(await adapter.read('image.png')),[0,255,13,10]);
 await adapter.write('main.tex',new Uint8Array([1,2]),new Uint8Array([3,4]));
 assert.deepEqual(Array.from(calls.at(-1).args.expected),[3,4]);
 await adapter.move('章节/a.tex','章节/b.tex');
 assert.equal(calls.at(-1).args.root,adapter.root);assert.equal(calls.at(-1).args.target,'章节/b.tex');
});
