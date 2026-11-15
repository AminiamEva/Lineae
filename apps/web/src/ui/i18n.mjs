import { toTraditional } from './traditional.mjs';

const supported = new Set(['zh-CN', 'zh-Hant', 'en']);
let current = 'zh-CN';

export function normalizeLanguage(value) {
  const tag = String(value ?? '').toLowerCase();
  if (tag === 'en' || tag.startsWith('en-')) return 'en';
  if (tag === 'zh-hant' || tag.startsWith('zh-hant-') || /^zh-(tw|hk|mo)(?:-|$)/.test(tag)) return 'zh-Hant';
  return 'zh-CN';
}

export function setLanguage(value) {
  current = supported.has(value) ? value : normalizeLanguage(value);
  return current;
}

export function getLanguage() {
  return current;
}

export function isChinese(language = current) {
  return normalizeLanguage(language) !== 'en';
}

function convert(value) {
  if (typeof value === 'string') return toTraditional(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]));
  }
  return value;
}

export function localizeText(zh, en, language = current) {
  const target = normalizeLanguage(language);
  if (target === 'en') return en ?? zh ?? '';
  return target === 'zh-Hant' ? convert(zh ?? en ?? '') : zh ?? en ?? '';
}

export function t(zh, en) {
  return localizeText(zh, en);
}

function textNodeFor(element, text) {
  const last = element.lastChild;
  if (last?.nodeType === 3) last.nodeValue = text;
  else element.append(text);
}

export function localize(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll('[data-zh]')) {
    const text = localizeText(element.dataset.zh, element.dataset.en);
    // Icon buttons keep their leading SVG and only replace the label text.
    if (element.querySelector?.(':scope > svg')) textNodeFor(element, text);
    else element.textContent = text;
    // Toolbar buttons take their accessible name from the same label.
    if (element.hasAttribute?.('aria-label')) element.setAttribute('aria-label', text);
  }
  for (const element of root.querySelectorAll('[data-zh-title]')) {
    const title = localizeText(element.dataset.zhTitle, element.dataset.enTitle);
    element.title = title;
    element.setAttribute?.('aria-label', title);
  }
  for (const element of root.querySelectorAll('[data-zh-placeholder]')) {
    const placeholder = localizeText(element.dataset.zhPlaceholder, element.dataset.enPlaceholder);
    element.placeholder = placeholder;
    if (Object.hasOwn(element.dataset, 'placeholder')) element.dataset.placeholder = placeholder;
  }
}
