export const TITLE_STYLES = Object.freeze([
  {
    id: 'document-title', zh: '文档标题', en: 'Document title', tag: 'h1',
    style: { fontSize: '2.2em', fontWeight: '700', lineHeight: '1.2', margin: '0 0 .35em', letterSpacing: '-.01em' },
  },
  {
    id: 'subtitle', zh: '副标题', en: 'Subtitle', tag: 'p',
    style: { fontSize: '1.25em', fontWeight: '400', lineHeight: '1.35', margin: '0 0 .6em' },
  },
  {
    id: 'author', zh: '作者', en: 'Author', tag: 'p',
    style: { fontSize: '1em', fontWeight: '400', lineHeight: '1.5', margin: '0 0 1em' },
  },
  {
    id: 'heading-1', zh: '一级标题', en: 'Heading 1', tag: 'h2',
    style: { fontSize: '1.6em', fontWeight: '700', lineHeight: '1.25', margin: '1em 0 .4em' },
  },
  {
    id: 'heading-2', zh: '二级标题', en: 'Heading 2', tag: 'h3',
    style: { fontSize: '1.35em', fontWeight: '600', lineHeight: '1.3', margin: '.9em 0 .35em' },
  },
  {
    id: 'heading-3', zh: '三级标题', en: 'Heading 3', tag: 'h4',
    style: { fontSize: '1.15em', fontWeight: '600', lineHeight: '1.35', margin: '.8em 0 .3em' },
  },
  {
    id: 'body', zh: '正文', en: 'Body', tag: 'p',
    style: { fontSize: '1em', fontWeight: '400', lineHeight: '1.5', margin: '0 0 .65em' },
  },
  {
    id: 'caption', zh: '图注', en: 'Caption', tag: 'p',
    style: { fontSize: '.85em', fontWeight: '400', lineHeight: '1.4', margin: '.3em 0 .8em' },
  },
]);

export const TITLE_STYLE_IDS = Object.freeze(TITLE_STYLES.map(style => style.id));

const TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'span']);
const STYLE_KEYS = new Set(['fontSize', 'fontWeight', 'lineHeight', 'margin', 'letterSpacing', 'textTransform', 'textAlign', 'color']);

export function titleStyleOptions(language = 'zh-CN') {
  const key = language === 'zh-CN' ? 'zh' : 'en';
  return TITLE_STYLES.map(style => ({ id: style.id, label: style[key] }));
}

export function resolveTitleStyle(id) {
  const style = TITLE_STYLES.find(item => item.id === id);
  return style ? { ...style, style: { ...style.style } } : null;
}

export function applyTitleStyle(element, id) {
  const style = resolveTitleStyle(id);
  if (!style || !element?.style) return false;
  Object.assign(element.style, style.style);
  if (element.dataset) element.dataset.titleStyle = style.id;
  return true;
}

export function nextTitleStyleId(id, direction = 1) {
  const index = TITLE_STYLE_IDS.indexOf(id);
  if (index < 0) return TITLE_STYLE_IDS[0];
  const step = direction < 0 ? -1 : 1;
  return TITLE_STYLE_IDS[(index + step + TITLE_STYLE_IDS.length) % TITLE_STYLE_IDS.length];
}

export function validateTitleStyles(styles = TITLE_STYLES) {
  const errors = [];
  const ids = new Set();
  for (const style of styles) {
    if (!style || typeof style !== 'object') {
      errors.push('style must be an object');
      continue;
    }
    if (!style.id || typeof style.id !== 'string') errors.push('missing id');
    else if (ids.has(style.id)) errors.push('duplicate id: ' + style.id);
    else ids.add(style.id);
    for (const key of ['zh', 'en']) {
      if (!style[key] || !String(style[key]).trim()) errors.push(`${style.id}: missing ${key}`);
    }
    if (!TAGS.has(style.tag)) errors.push(`${style.id}: invalid tag`);
    if (!style.style || typeof style.style !== 'object') {
      errors.push(`${style.id}: missing style`);
      continue;
    }
    for (const [property, value] of Object.entries(style.style)) {
      if (!STYLE_KEYS.has(property)) errors.push(`${style.id}: unsupported style ${property}`);
      if (value === '' || value === null || value === undefined) errors.push(`${style.id}: empty ${property}`);
    }
  }
  return errors;
}

export function titleStyleControlModel({ value = 'body', language = 'zh-CN', open = false, activeId = value } = {}) {
  const key = language === 'zh-CN' ? 'zh' : 'en';
  const current = resolveTitleStyle(value) ? value : TITLE_STYLE_IDS[0];
  const active = resolveTitleStyle(activeId) ? activeId : current;
  return {
    value: current,
    language,
    open: Boolean(open),
    activeId: active,
    label: resolveTitleStyle(current)[key],
    options: TITLE_STYLES.map(style => ({
      id: style.id,
      label: style[key],
      selected: style.id === current,
      active: style.id === active,
      tabIndex: style.id === active ? 0 : -1,
    })),
  };
}

export function createTitleStyleControl({ document: doc = globalThis.document, language = 'zh-CN', value = 'body', onChange = () => {} } = {}) {
  if (!doc?.createElement) return null;
  const root = doc.createElement('div');
  root.className = 'lineae-title-style';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'lineae-title-style-trigger';
  button.setAttribute('aria-haspopup', 'listbox');
  const list = doc.createElement('ul');
  list.className = 'lineae-title-style-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  root.style.position = 'relative';
  root.style.display = 'inline-block';
  button.style.font = 'inherit';
  button.style.padding = '4px 9px';
  button.style.borderRadius = '6px';
  button.style.border = '1px solid GrayText';
  button.style.background = 'Canvas';
  button.style.color = 'CanvasText';
  button.style.cursor = 'pointer';
  list.style.position = 'absolute';
  list.style.zIndex = '70';
  list.style.left = '0';
  list.style.top = 'calc(100% + 4px)';
  list.style.minWidth = '12rem';
  list.style.margin = '0';
  list.style.padding = '4px';
  list.style.listStyle = 'none';
  list.style.background = 'Canvas';
  list.style.color = 'CanvasText';
  list.style.border = '1px solid GrayText';
  list.style.borderRadius = '8px';
  list.style.boxShadow = '0 6px 24px rgb(0 0 0 / 20%)';
  let current = resolveTitleStyle(value) ? value : TITLE_STYLE_IDS[0];
  let active = current;
  let open = false;
  let lang = language;
  const labelFor = id => {
    const style = resolveTitleStyle(id);
    return style ? style[lang === 'zh-CN' ? 'zh' : 'en'] : '';
  };
  const items = TITLE_STYLES.map(style => {
    const item = doc.createElement('li');
    item.setAttribute('role', 'option');
    item.style.padding = '6px 8px';
    item.style.borderRadius = '5px';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => select(style.id));
    list.append(item);
    return { id: style.id, element: item };
  });
  root.append(button, list);

  function render() {
    button.textContent = labelFor(current) + ' ▾';
    button.setAttribute('aria-label', lang === 'zh-CN' ? '标题样式：' + labelFor(current) : 'Title style: ' + labelFor(current));
    button.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
    list.setAttribute('aria-label', lang === 'zh-CN' ? '标题样式' : 'Title style');
    for (const item of items) {
      const selected = item.id === current;
      item.element.textContent = labelFor(item.id);
      item.element.setAttribute('aria-selected', String(selected));
      item.element.tabIndex = item.id === active ? 0 : -1;
      item.element.style.background = selected ? 'Highlight' : 'transparent';
      item.element.style.color = selected ? 'HighlightText' : 'inherit';
    }
  }
  function commit(id, notify) {
    if (!resolveTitleStyle(id)) return false;
    current = id;
    active = id;
    open = false;
    render();
    if (notify) onChange(id);
    return true;
  }
  function select(id) {
    return commit(id, true);
  }
  function setOpen(next) {
    open = Boolean(next);
    if (open) active = current;
    render();
    return open;
  }
  function handleKey(key) {
    if (key === 'Escape') {
      if (!open) return false;
      setOpen(false);
      return true;
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        setOpen(true);
        return true;
      }
      return false;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      active = nextTitleStyleId(active, key === 'ArrowDown' ? 1 : -1);
      render();
      return true;
    }
    if (key === 'Home' || key === 'End') {
      active = key === 'Home' ? TITLE_STYLE_IDS[0] : TITLE_STYLE_IDS[TITLE_STYLE_IDS.length - 1];
      render();
      return true;
    }
    if (key === 'Enter' || key === ' ') {
      select(active);
      return true;
    }
    return false;
  }

  button.addEventListener('click', () => setOpen(!open));
  button.addEventListener('keydown', event => {
    if (handleKey(event.key)) event.preventDefault?.();
  });
  render();

  return {
    element: root,
    getValue: () => current,
    setValue: id => commit(id, false),
    setLanguage: next => { lang = next === 'en' ? 'en' : 'zh-CN'; render(); return lang; },
    setOpen,
    isOpen: () => open,
    handleKey,
    getModel: () => titleStyleControlModel({ value: current, language: lang, open, activeId: active }),
    destroy: () => root.remove?.(),
  };
}
