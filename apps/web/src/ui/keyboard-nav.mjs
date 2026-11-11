export function isActivationKey(key) {
  return key === 'Enter' || key === ' ';
}

export function nextIndex({
  current = 0,
  length,
  key,
  orientation = 'horizontal',
  columns = 1,
  wrap = true,
  rtl = false,
  disabled = [],
} = {}) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  const blocked = new Set(disabled);
  const enabled = index => !blocked.has(index);
  const first = () => {
    for (let index = 0; index < length; index++) if (enabled(index)) return index;
    return -1;
  };
  const last = () => {
    for (let index = length - 1; index >= 0; index--) if (enabled(index)) return index;
    return -1;
  };
  const move = (start, step) => {
    if (step === 0) return start;
    let index = start;
    for (let count = 0; count < length; count++) {
      index += step;
      if (index < 0 || index >= length) {
        if (!wrap) return -1;
        index = ((index % length) + length) % length;
      }
      if (enabled(index)) return index;
    }
    return -1;
  };

  if (key === 'Home') return first();
  if (key === 'End') return last();
  if (orientation === 'grid') {
    const gridStep = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 :
      key === 'ArrowDown' ? columns : key === 'ArrowUp' ? -columns : 0;
    if (!gridStep) return enabled(current) ? current : first();
    return move(enabled(current) ? current : first(), gridStep);
  }
  const horizontal = orientation === 'horizontal';
  const vertical = orientation === 'vertical';
  if (!horizontal && !vertical) return enabled(current) ? current : first();
  const step = horizontal
    ? key === 'ArrowRight' ? (rtl ? -1 : 1) : key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
    : key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  if (!step) return enabled(current) ? current : first();
  return move(enabled(current) ? current : first(), step);
}

export function installRovingFocus(container, {
  itemSelector = '[data-roving-item]',
  orientation = 'horizontal',
  columns = 1,
  wrap = true,
  rtl = false,
  initial = 0,
  onActivate = () => {},
} = {}) {
  if (!container?.querySelectorAll) return () => {};
  const items = () => [...container.querySelectorAll(itemSelector)].filter(element =>
    !element.hidden && !element.disabled && element.getAttribute?.('aria-disabled') !== 'true');
  let active = 0;
  const sync = index => {
    const list = items();
    if (!list.length) { active = -1; return -1; }
    active = ((index % list.length) + list.length) % list.length;
    list.forEach((element, itemIndex) => { element.tabIndex = itemIndex === active ? 0 : -1; });
    return active;
  };
  const navigationKeys = orientation === 'grid'
    ? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    : orientation === 'vertical'
      ? ['ArrowUp', 'ArrowDown', 'Home', 'End']
      : ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  const onKey = event => {
    const list = items();
    if (!list.length) return;
    const current = list.indexOf(event.target);
    if (current < 0) return;
    if (navigationKeys.includes(event.key)) {
      const index = nextIndex({ current, length: list.length, key: event.key, orientation, columns, wrap, rtl });
      if (index < 0) return;
      event.preventDefault?.();
      sync(index);
      list[index].focus?.();
      return;
    }
    if (isActivationKey(event.key)) {
      event.preventDefault?.();
      onActivate(list[current], current);
    }
  };
  const onFocusIn = event => {
    const list = items();
    const index = list.indexOf(event.target);
    if (index >= 0) sync(index);
  };
  container.addEventListener?.('keydown', onKey);
  container.addEventListener?.('focusin', onFocusIn);
  sync(initial);
  return () => {
    container.removeEventListener?.('keydown', onKey);
    container.removeEventListener?.('focusin', onFocusIn);
  };
}
