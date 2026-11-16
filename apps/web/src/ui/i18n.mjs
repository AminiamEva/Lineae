import {toTraditional} from './traditional.mjs';

let language = 'zh-CN';
export function normalizeLanguage(value) {
  const tag = String(value ?? '').toLowerCase();
  if (/^en(?:-|$)/.test(tag)) return 'en';
  if (/^zh-hant(?:-|$)/.test(tag) || /^zh-(?:tw|hk|mo)(?:-|$)/.test(tag)) return 'zh-Hant';
  return 'zh-CN';
}
export function setLanguage(value) { language = normalizeLanguage(value); return language; }
export function getLanguage() { return language; }
export function isChinese(value = language) { return normalizeLanguage(value) !== 'en'; }

function traditional(value) {
  if (typeof value === 'string') return toTraditional(value);
  if (Array.isArray(value)) return value.map(traditional);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,traditional(item)]));
  }
  return value;
}
export function localizeText(zh, en, target = language) {
  const normalized = normalizeLanguage(target);
  const text = normalized === 'en' ? en ?? zh ?? '' : zh ?? en ?? '';
  return normalized === 'zh-Hant' ? traditional(text) : text;
}
export function t(zh, en) { return localizeText(zh,en); }

function replaceLabel(element, text) {
  if (!element.querySelector?.(':scope > svg')) { element.textContent = text; return; }
  const tail = element.lastChild;
  if (tail?.nodeType === 3) tail.nodeValue = text;
  else element.append(text);
}
export function localize(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll('[data-zh]')) {
    if (element.dataset.zh === undefined) continue;
    const text = localizeText(element.dataset.zh,element.dataset.en);
    replaceLabel(element,text);
    if (element.hasAttribute?.('aria-label')) element.setAttribute('aria-label',text);
  }
  for (const element of root.querySelectorAll('[data-zh-title]')) {
    if (element.dataset.zhTitle === undefined) continue;
    const text = localizeText(element.dataset.zhTitle,element.dataset.enTitle);
    element.title = text;
    element.setAttribute?.('aria-label',text);
  }
  for (const element of root.querySelectorAll('[data-zh-placeholder]')) {
    if (element.dataset.zhPlaceholder === undefined) continue;
    const text = localizeText(element.dataset.zhPlaceholder,element.dataset.enPlaceholder);
    element.placeholder = text;
    if (Object.hasOwn(element.dataset,'placeholder')) element.dataset.placeholder = text;
  }
}
