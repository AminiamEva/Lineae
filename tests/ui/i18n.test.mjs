import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, localize, setLanguage, t } from '../../apps/web/src/ui/i18n.mjs';

test('translations follow the selected language', () => {
  setLanguage('zh-CN');
  assert.equal(getLanguage(), 'zh-CN');
  assert.equal(t('保存', 'Save'), '保存');
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('保存', 'Save'), 'Save');
  setLanguage('fr');
  assert.equal(getLanguage(), 'zh-CN');
});

test('localize updates marked elements in place', () => {
  const elements = [
    { dataset: { zh: '正文', en: 'Text' }, textContent: '' },
    { dataset: { zh: '表格', en: 'Table' }, textContent: '' },
  ];
  const root = { querySelectorAll: () => elements };
  setLanguage('en');
  localize(root);
  assert.deepEqual(elements.map(element => element.textContent), ['Text', 'Table']);
  setLanguage('zh-CN');
  localize(root);
  assert.deepEqual(elements.map(element => element.textContent), ['正文', '表格']);
});
