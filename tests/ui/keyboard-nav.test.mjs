import test from 'node:test';
import assert from 'node:assert/strict';
import { installRovingFocus, isActivationKey, nextIndex } from '../../apps/web/src/ui/keyboard-nav.mjs';

test('horizontal navigation wraps and respects rtl', () => {
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowRight' }), 1);
  assert.equal(nextIndex({ current: 2, length: 3, key: 'ArrowRight' }), 0);
  assert.equal(nextIndex({ current: 2, length: 3, key: 'ArrowRight', wrap: false }), -1);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowLeft' }), 2);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowRight', rtl: true }), 2);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowLeft', rtl: true }), 1);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'Home' }), 0);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'End' }), 2);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'x' }), 0);
});

test('vertical and grid navigation use the configured axis', () => {
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowDown', orientation: 'vertical' }), 1);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowUp', orientation: 'vertical' }), 2);
  assert.equal(nextIndex({ current: 0, length: 6, key: 'ArrowDown', orientation: 'grid', columns: 3 }), 3);
  assert.equal(nextIndex({ current: 3, length: 6, key: 'ArrowUp', orientation: 'grid', columns: 3 }), 0);
  assert.equal(nextIndex({ current: 3, length: 6, key: 'ArrowRight', orientation: 'grid', columns: 3 }), 4);
});

test('disabled entries are skipped and empty lists return -1', () => {
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowRight', disabled: [1] }), 2);
  assert.equal(nextIndex({ current: 2, length: 3, key: 'ArrowRight', disabled: [0] }), 1);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'ArrowRight', disabled: [0, 1, 2] }), -1);
  assert.equal(nextIndex({ current: 0, length: 3, key: 'Home', disabled: [0] }), 1);
  assert.equal(nextIndex({ current: 0, length: 0, key: 'ArrowRight' }), -1);
});

test('activation keys are explicit', () => {
  assert.equal(isActivationKey('Enter'), true);
  assert.equal(isActivationKey(' '), true);
  assert.equal(isActivationKey('ArrowRight'), false);
});

test('roving focus moves on arrow keys and activates with Enter', () => {
  const listeners = {};
  const items = [0, 1, 2].map(() => ({
    tabIndex: -1,
    disabled: false,
    getAttribute: () => null,
    focus() { this.focused = true; },
  }));
  let activated = null;
  const container = {
    querySelectorAll: () => items,
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener() {},
  };
  installRovingFocus(container, { onActivate: (element, index) => { activated = { element, index }; } });
  listeners.keydown({ key: 'ArrowRight', target: items[1], preventDefault() {} });
  assert.equal(items[2].tabIndex, 0);
  assert.equal(items[2].focused, true);
  listeners.keydown({ key: 'Enter', target: items[2], preventDefault() {} });
  assert.equal(activated.index, 2);
  assert.equal(activated.element, items[2]);
});

test('roving focus honors the initial index and ignores other controls', () => {
  const listeners = {};
  const items = [0, 1, 2].map(() => ({
    tabIndex: -1,
    disabled: false,
    getAttribute: () => null,
    focus() { this.focused = true; },
  }));
  const container = {
    querySelectorAll: () => items,
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener() {},
  };
  installRovingFocus(container, { initial: 2, onActivate: () => {} });
  assert.equal(items[2].tabIndex, 0);
  assert.equal(items[0].tabIndex, -1);
  listeners.keydown({ key: 'ArrowRight', target: { tagName: 'SELECT' }, preventDefault() {} });
  assert.equal(items[2].tabIndex, 0);
  assert.equal(items[0].focused, undefined);
});

test('roving focus initializes tab order and returns cleanup', () => {
  const items = [0, 1, 2].map(() => ({
    tabIndex: -1,
    disabled: false,
    getAttribute: () => null,
    focus() { this.focused = true; },
  }));
  const container = {
    querySelectorAll: () => items,
    addEventListener() {},
    removeEventListener() {},
  };
  const cleanup = installRovingFocus(container, { onActivate: () => {} });
  assert.equal(items[0].tabIndex, 0);
  assert.equal(items[1].tabIndex, -1);
  assert.equal(typeof cleanup, 'function');
  cleanup();
});
