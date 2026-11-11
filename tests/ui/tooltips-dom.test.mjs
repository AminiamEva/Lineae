import test from 'node:test';
import assert from 'node:assert/strict';
import { installTooltips } from '../../apps/web/src/ui/tooltips.mjs';

function fakeElement(tagName = 'div', rect = {}) {
  const listeners = {};
  const attributes = {};
  const element = {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    attributes,
    listeners,
    children: [],
    textContent: '',
    hidden: false,
    id: '',
    className: '',
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name] ?? null; },
    removeAttribute(name) { delete attributes[name]; },
    addEventListener(type, handler) { (listeners[type] ??= []).push(handler); },
    removeEventListener(type, handler) {
      const list = listeners[type] ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent(event) { for (const handler of listeners[event.type] ?? []) handler(event); },
    contains() { return true; },
    closest() { return this; },
    getBoundingClientRect() {
      const left = rect.left ?? 0;
      const top = rect.top ?? 0;
      const width = rect.width ?? 0;
      const height = rect.height ?? 0;
      return { left, top, right: left + width, bottom: top + height, width, height };
    },
    remove() { this.removed = true; },
  };
  return element;
}

test('tooltip installer shows, positions, switches language and hides', () => {
  const root = fakeElement('div');
  const body = fakeElement('body');
  const defaultView = {
    innerWidth: 1000,
    innerHeight: 800,
    listeners: {},
    addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); },
    removeEventListener() {},
  };
  const doc = {
    body,
    defaultView,
    listeners: {},
    createElement: tag => fakeElement(tag, { width: 80, height: 24 }),
    addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); },
    removeEventListener() {},
  };
  const control = fakeElement('button', { left: 100, top: 100, width: 60, height: 20 });
  control.dataset.tooltipZh = '合并';
  control.dataset.tooltipEn = 'Merge';
  const tooltips = installTooltips(root, { document: doc, delay: 0 });
  assert.ok(tooltips);
  root.listeners.pointerover[0]({ target: control });
  const tip = tooltips.element;
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, '合并');
  assert.equal(control.attributes['aria-describedby'], tip.id);
  assert.equal(tip.style.left, '100px');
  assert.equal(tip.style.top, '70px');
  assert.equal(tip.dataset.placement, 'top');

  root.listeners.pointerout[0]({ target: control });
  assert.equal(tip.hidden, true);
  assert.equal(control.attributes['aria-describedby'], undefined);

  tooltips.setLanguage('en');
  root.listeners.pointerover[0]({ target: control });
  assert.equal(tip.textContent, 'Merge');
  tooltips.destroy();
  assert.equal(tip.removed, true);
});
