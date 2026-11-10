let current = 'zh-CN';

export function setLanguage(value) {
  current = value === 'en' ? 'en' : 'zh-CN';
  return current;
}

export function getLanguage() {
  return current;
}

export function t(zh, en) {
  return current === 'zh-CN' ? zh : en;
}

export function localize(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll('[data-zh]')) {
    element.textContent = current === 'zh-CN' ? element.dataset.zh : element.dataset.en;
  }
}
