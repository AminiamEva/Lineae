import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TITLE_STYLES,
  TITLE_STYLE_IDS,
  applyTitleStyle,
  createTitleStyleControl,
  nextTitleStyleId,
  resolveTitleStyle,
  titleStyleControlModel,
  titleStyleOptions,
  validateTitleStyles,
} from '../../apps/web/src/ui/title-styles.mjs';

function fakeDocument() {
  const make = tagName => ({
    tagName: tagName.toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    listeners: {},
    textContent: '',
    hidden: false,
    tabIndex: -1,
    className: '',
    type: '',
    disabled: false,
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
    dispatchEvent(event) { for (const handler of this.listeners[event.type] ?? []) handler(event); },
    remove() {},
    focus() { this.focused = true; },
  });
  return { createElement: tag => make(tag), body: make('body') };
}

test('title style catalog is complete, unique and bilingual', () => {
  assert.equal(TITLE_STYLES.length, 8);
  assert.equal(new Set(TITLE_STYLE_IDS).size, TITLE_STYLE_IDS.length);
  assert.equal(titleStyleOptions('zh-CN')[0].label, '文档标题');
  assert.equal(titleStyleOptions('en')[0].label, 'Document title');
  assert.equal(resolveTitleStyle('body').style.fontSize, '1em');
  assert.equal(resolveTitleStyle('missing'), null);
  assert.deepEqual(validateTitleStyles(), []);
});

test('title styles can be applied and cycled', () => {
  const element = { style: {}, dataset: {} };
  assert.equal(applyTitleStyle(element, 'heading-1'), true);
  assert.equal(element.style.fontSize, '1.6em');
  assert.equal(element.dataset.titleStyle, 'heading-1');
  assert.equal(applyTitleStyle(element, 'missing'), false);
  assert.equal(nextTitleStyleId('caption', 1), 'document-title');
  assert.equal(nextTitleStyleId('document-title', -1), 'caption');
  assert.equal(nextTitleStyleId('missing', 1), 'document-title');
});

test('title style validation reports duplicates and missing copy', () => {
  const errors = validateTitleStyles([
    { ...TITLE_STYLES[0] },
    { ...TITLE_STYLES[0], zh: '', en: '' },
    { ...TITLE_STYLES[1], tag: 'div' },
  ]);
  assert.ok(errors.some(error => error.includes('duplicate id')));
  assert.ok(errors.some(error => error.includes('missing zh')));
  assert.ok(errors.some(error => error.includes('missing en')));
  assert.ok(errors.some(error => error.includes('invalid tag')));
});

test('title style control keeps value, language and keyboard selection', () => {
  const changes = [];
  const control = createTitleStyleControl({
    document: fakeDocument(),
    language: 'zh-CN',
    value: 'body',
    onChange: id => changes.push(id),
  });
  assert.ok(control);
  assert.equal(control.getValue(), 'body');
  assert.ok(control.element.children[0].textContent.includes('正文'));
  assert.equal(control.setValue('heading-1'), true);
  assert.equal(control.getValue(), 'heading-1');
  assert.equal(control.handleKey('ArrowDown'), true);
  assert.equal(control.isOpen(), true);
  assert.equal(control.handleKey('ArrowDown'), true);
  assert.equal(control.handleKey('Enter'), true);
  assert.equal(control.getValue(), 'heading-2');
  assert.deepEqual(changes, ['heading-2']);
  control.setLanguage('en');
  assert.ok(control.element.children[0].textContent.includes('Heading 2'));
  const trigger = control.element.children[0];
  trigger.dispatchEvent({ type: 'click' });
  assert.equal(control.isOpen(), true);
  trigger.dispatchEvent({ type: 'click' });
  assert.equal(control.isOpen(), false);
  const model = control.getModel();
  assert.equal(model.value, 'heading-2');
  assert.equal(model.options.length, 8);
  assert.equal(model.options.find(option => option.id === 'heading-2').selected, true);
});

test('title style control model exposes labels and tab order', () => {
  const model = titleStyleControlModel({ value: 'document-title', language: 'en', open: true, activeId: 'subtitle' });
  assert.equal(model.value, 'document-title');
  assert.equal(model.label, 'Document title');
  assert.equal(model.options.find(option => option.id === 'subtitle').active, true);
  assert.equal(model.options.find(option => option.id === 'subtitle').tabIndex, 0);
  assert.equal(model.options.find(option => option.id === 'document-title').tabIndex, -1);
});
