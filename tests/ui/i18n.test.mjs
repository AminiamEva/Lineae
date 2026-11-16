import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, localize, localizeText, normalizeLanguage, setLanguage, t } from '../../apps/web/src/ui/i18n.mjs';
import { toTraditional } from '../../apps/web/src/ui/traditional.mjs';

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

test('normalizes simplified, traditional, and English language tags', () => {
  assert.equal(normalizeLanguage('zh-CN'), 'zh-CN');
  assert.equal(normalizeLanguage('zh-Hans'), 'zh-CN');
  assert.equal(normalizeLanguage('zh-Hant'), 'zh-Hant');
  assert.equal(normalizeLanguage('zh-Hant-CN'), 'zh-Hant');
  assert.equal(normalizeLanguage('zh-TW'), 'zh-Hant');
  assert.equal(normalizeLanguage('zh-HK'), 'zh-Hant');
  assert.equal(normalizeLanguage('zh-MO'), 'zh-Hant');
  assert.equal(normalizeLanguage('en-GB'), 'en');
});

test('converts simplified labels character by character', () => {
  assert.equal(toTraditional('打开工程'), '打開工程');
  assert.equal(toTraditional('设置标签'), '設置標籤');
  assert.equal(toTraditional('简体中文'), '簡體中文');
  assert.equal(toTraditional('日志'), '日誌');
  assert.equal(toTraditional('LaTeX 源码'), 'LaTeX 源碼');
  // Phrase disambiguation is deliberately absent.
  assert.equal(toTraditional('复制'), '復制');
  assert.equal(toTraditional('后台'), '後臺');
});

test('selects and converts text and phrase dictionaries for each language', () => {
  assert.equal(localizeText('打开工程', 'Open project', 'zh-CN'), '打开工程');
  assert.equal(localizeText('打开工程', 'Open project', 'zh-Hant'), '打開工程');
  assert.equal(localizeText('打开工程', 'Open project', 'zh-TW'), '打開工程');
  assert.equal(localizeText('打开工程', 'Open project', 'en'), 'Open project');
  setLanguage('zh-Hant');
  assert.equal(t('打开工程', 'Open project'), '打開工程');
  assert.deepEqual(t({ Replace: '替换' }, {}), { Replace: '替換' });
  setLanguage('zh-CN');
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
  setLanguage('zh-Hant');
  localize(root);
  assert.deepEqual(elements.map(element => element.textContent), ['正文', '表格']);
  setLanguage('zh-CN');
});
