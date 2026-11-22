import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConfigStore} from '../apps/web/src/editor/config.mjs';
import {compileKeybindings,installKeybindings} from '../apps/web/src/editor/keybindings.mjs';

const defaults=readFileSync('apps/web/config.yaml','utf8');
function keyboard(target,key,code,flags={}) {
  const event=new Event('keydown',{cancelable:true});
  Object.assign(event,{key,code,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,
    getModifierState:()=>false,...flags});
  target.dispatchEvent(event);
  return event;
}

test('the approved macOS defaults resolve to Ctrl on Windows with no duplicate aliases',()=>{
  const mac=createConfigStore(defaults,{isMac:true}).bindings;
  const win=createConfigStore(defaults,{isMac:false}).bindings;
  assert.equal(mac.scopes.get('editor').find(entry=>entry.command==='insertDisplayMath').first,'meta+f');
  assert.equal(win.scopes.get('editor').find(entry=>entry.command==='insertDisplayMath').first,'ctrl+f');
  assert.equal(mac.scopes.get('math').find(entry=>entry.command==='pmatrix').first,'meta+m');
  assert.deepEqual(mac.scopes.get('math').filter(entry=>entry.command==='int').map(entry=>entry.first),['meta+i','ctrl+i']);
  assert.deepEqual(win.scopes.get('math').filter(entry=>entry.command==='int').map(entry=>entry.first),['ctrl+i']);
  assert.equal(win.scopes.get('math').find(entry=>entry.command==='pmatrix').first,'ctrl+m');
  assert.equal(win.scopes.get('math').filter(entry=>entry.command==='pmatrix').length,1);
  assert.equal(mac.scopes.get('math').filter(entry=>entry.command==='pmatrix').length,2);
  assert.ok(!win.scopes.get('editor').some(entry=>['toggleItalic','toggleStrike','toggleUnderline'].includes(entry.command)));
});

test('plain native keys, aliases, uppercase letters and null all compile',()=>{
  const bindings=compileKeybindings({math:{palette:'backslash',nextSlot:'tab',none:null},
    source:{indent:'tab',outdent:'shift+tab'},global:{settings:'cmd+comma',command:'cmd+e L'}},{isMac:true});
  assert.equal(bindings.scopes.get('math')[0].first,'\\');
  assert.equal(bindings.scopes.get('source')[1].first,'shift+tab');
  assert.equal(bindings.scopes.get('global')[0].first,'meta+,');
  assert.equal(bindings.scopes.get('global')[1].second,'shift+l');
  assert.equal(bindings.scopes.get('math').length,2);
  assert.throws(()=>compileKeybindings({source:{a:'tab',b:'tab'}}),/Conflicting shortcuts/);
  assert.throws(()=>compileKeybindings({source:{a:'ctrl+k',b:'ctrl+k m'}}),/Conflicting shortcuts/);
});

test('Mac web fallbacks follow configured shortcuts and preserve explicit remaps',()=>{
  const mac=createConfigStore(defaults,{isMac:true,macWeb:true});
  const entries=(scope,command)=>mac.bindings.scopes.get(scope).filter(entry=>entry.command===command);
  assert.ok(entries('global','splitMode').some(entry=>entry.first==='ctrl+e' && entry.second==='3'));
  assert.ok(entries('source','replace').some(entry=>entry.first==='ctrl+e' && entry.second==='h'));
  mac.importYaml('keybindings:\n  source:\n    replace: null\n    undo: ctrl+e f\n');
  assert.equal(entries('source','replace').length,0);
  assert.equal(entries('source','find').some(entry=>entry.first==='ctrl+e'),false);
  assert.ok(entries('source','undo').some(entry=>entry.first==='ctrl+e' && entry.second==='f'));
});

test('all worksheet builtin actions have YAML keys, and a rejected profile is atomic',()=>{
  const store=createConfigStore(defaults);
  const builtins=JSON.parse(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/.exec(
    readFileSync('docs/shortcut-planner.html','utf8'))[1]).builtins;
  for(const [id] of builtins) {
    const [scope,command]=id.split('.');
    assert.ok(Object.hasOwn(store.value.keybindings[scope],command),id);
    const before=store.exportYaml();
    store.importYaml(`keybindings:\n  ${scope}:\n    ${command}: null\n`);
    assert.ok(!store.bindings.scopes.get(scope).some(entry=>entry.command===command),id+' disables cleanly');
    store.importYaml(before);
  }
  const before=store.exportYaml();
  assert.throws(()=>store.importYaml('keybindings:\n  source:\n    find: tab\n'),/Conflicting shortcuts/);
  assert.equal(store.exportYaml(),before);
});

test('scope precedence, plain-character input and two-stroke chords are routed centrally',()=>{
  const target=new EventTarget(),element={};
  const bindings=compileKeybindings({global:{saveAs:'mod+shift+s'},editor:{dollar:'$'},
    math:{sum:'mod+shift+s',palette:'backslash'},source:{indent:'tab'},view:{code:'mod+e L'}},{isMac:true});
  let scopes=['math','global'];
  const calls=[];
  installKeybindings(target,{getBindings:()=>bindings,getContext:()=>({element,scopes}),
    run:entry=>{calls.push(entry.scope+'.'+entry.command);return true;}});
  assert.ok(keyboard(target,'S','KeyS',{metaKey:true,shiftKey:true}).defaultPrevented);
  assert.deepEqual(calls,['math.sum']);
  assert.ok(keyboard(target,'\\','Backslash').defaultPrevented);
  scopes=['source'];
  assert.ok(keyboard(target,'Tab','Tab').defaultPrevented);
  scopes=['editor'];
  assert.ok(keyboard(target,'$','Digit4',{shiftKey:true}).defaultPrevented);
  scopes=['view'];
  keyboard(target,'e','KeyE',{metaKey:true});
  keyboard(target,'L','KeyL',{metaKey:true,shiftKey:true});
  assert.equal(calls.at(-1),'view.code');
});

test('disabled native keys are blocked only in their editor context; native clipboard can pass through',()=>{
  const target=new EventTarget(),element={};
  const nativeBindings=compileKeybindings({source:{find:'ctrl+f'},system:{copy:'ctrl+c'}});
  let bindings=compileKeybindings({source:{find:null},system:{copy:'ctrl+c'}});
  let scopes=['source','system'];
  installKeybindings(target,{getBindings:()=>bindings,nativeBindings,getContext:()=>({element,scopes}),
    run:()=> 'native'});
  assert.ok(keyboard(target,'f','KeyF',{ctrlKey:true}).defaultPrevented);
  assert.equal(keyboard(target,'c','KeyC',{ctrlKey:true}).defaultPrevented,false);
  bindings=compileKeybindings({source:{find:null},system:{copy:null}});
  assert.ok(keyboard(target,'c','KeyC',{ctrlKey:true}).defaultPrevented);
  scopes=['global'];
  assert.equal(keyboard(target,'c','KeyC',{ctrlKey:true}).defaultPrevented,false);
});

test('physical Minus and Option-modified letters match the configured macOS shortcuts',()=>{
  const target=new EventTarget(),calls=[];
  const bindings=compileKeybindings({editor:{subscript:'mod+shift+minus',command:'alt+i'}},{isMac:true});
  installKeybindings(target,{getBindings:()=>bindings,getContext:()=>({element:target,scopes:['editor']}),
    run:entry=>calls.push(entry.command)});
  keyboard(target,'_','Minus',{metaKey:true,shiftKey:true});
  keyboard(target,'Dead','KeyI',{altKey:true});
  assert.deepEqual(calls,['subscript','command']);
});
