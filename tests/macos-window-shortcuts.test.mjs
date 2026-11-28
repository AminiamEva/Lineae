import test from 'node:test';
import assert from 'node:assert/strict';
import {installMacWindowShortcuts,macWindowAction} from '../apps/web/src/ui/macos-window-shortcuts.mjs';

function keyboard(target,code,flags={}) {
  const event=new Event('keydown',{cancelable:true});
  Object.assign(event,{code,key:code,ctrlKey:true,altKey:false,shiftKey:false,metaKey:false,
    isComposing:false,...flags});
  target.dispatchEvent(event);
  return event;
}

test('macOS window shortcuts map Fn-Control keys and ignore other modifiers',()=>{
  const cases=[['KeyF','fill'],['KeyC','center'],['KeyR','restore'],
    ['ArrowLeft','left'],['ArrowRight','right'],['ArrowUp','top'],['ArrowDown','bottom']];
  for(const [code,action] of cases) {
    assert.equal(macWindowAction({code,ctrlKey:true}),action,code);
    for(const modifier of ['metaKey','altKey','shiftKey'])
      assert.equal(macWindowAction({code,ctrlKey:true,[modifier]:true}),null,code+' '+modifier);
  }
  assert.equal(macWindowAction({code:'KeyF'}),null);
  assert.equal(macWindowAction({code:'KeyF',ctrlKey:true,isComposing:true}),null);
  assert.equal(macWindowAction({code:'KeyX',ctrlKey:true}),null);
});

test('installed capture handler runs only on macOS and consumes matching keys',()=>{
  const target=new EventTarget(),calls=[];
  const remove=installMacWindowShortcuts(target,{isMac:true,run:action=>calls.push(action)});
  const fill=keyboard(target,'KeyF');
  assert.deepEqual(calls,['fill']);
  assert.ok(fill.defaultPrevented);
  assert.ok(keyboard(target,'ArrowLeft',{metaKey:true}).defaultPrevented===false);
  remove();
  assert.equal(keyboard(target,'KeyF').defaultPrevented,false);
  const otherCalls=[];
  const removeOther=installMacWindowShortcuts(target,{isMac:false,run:action=>otherCalls.push(action)});
  const other=keyboard(target,'KeyC');
  assert.equal(other.defaultPrevented,false);
  assert.deepEqual(otherCalls,[]);
  removeOther();
});