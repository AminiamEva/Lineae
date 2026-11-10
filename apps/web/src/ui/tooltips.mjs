let tooltipCounter = 0;

export function normalizeTooltip(value) {
  if (typeof value === 'string') return { zh: value.trim(), en: value.trim() };
  if (value && typeof value === 'object') {
    return {
      zh: String(value.zh ?? '').trim(),
      en: String(value.en ?? '').trim(),
    };
  }
  return { zh: '', en: '' };
}

export function tooltipText(value, language = 'zh-CN') {
  const tooltip = normalizeTooltip(value);
  return language === 'zh-CN' ? (tooltip.zh || tooltip.en) : (tooltip.en || tooltip.zh);
}

export function parseTooltipDataset(dataset = {}) {
  return normalizeTooltip({
    zh: dataset.tooltipZh ?? dataset.tooltip ?? '',
    en: dataset.tooltipEn ?? dataset.tooltip ?? '',
  });
}

export function clampTooltipPosition({ left = 0, top = 0, width = 0, height = 0 }, { width: viewportWidth = 0, height: viewportHeight = 0 }, margin = 8, gap = 6) {
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const clampedLeft = Math.min(Math.max(margin, left), maxLeft);
  const above = top - gap - height;
  const below = top + gap;
  const placement = above >= margin ? 'top' : 'bottom';
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  const clampedTop = Math.min(Math.max(margin, placement === 'top' ? above : below), maxTop);
  return { left: clampedLeft, top: clampedTop, placement };
}

export function installTooltips(root, {
  document: doc = globalThis.document,
  language = 'zh-CN',
  selector = '[data-tooltip-zh],[data-tooltip]',
} = {}) {
  if (!root?.addEventListener || !doc?.createElement) return null;
  const id = 'lineae-tooltip-' + (++tooltipCounter);
  const tip = doc.createElement('div');
  tip.className = 'lineae-tooltip';
  tip.id = id;
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  tip.style.position = 'fixed';
  tip.style.pointerEvents = 'none';
  tip.style.zIndex = '80';
  tip.style.maxWidth = 'min(320px, 60vw)';
  tip.style.background = 'Canvas';
  tip.style.color = 'CanvasText';
  tip.style.border = '1px solid GrayText';
  tip.style.borderRadius = '6px';
  tip.style.padding = '4px 8px';
  tip.style.font = '12px/1.4 system-ui, sans-serif';
  tip.style.boxShadow = '0 2px 10px rgb(0 0 0 / 20%)';
  (doc.body ?? root).append(tip);
  let lang = language === 'en' ? 'en' : 'zh-CN';
  let active = null;

  const hide = () => {
    if (active) active.removeAttribute?.('aria-describedby');
    active = null;
    tip.hidden = true;
  };
  const show = control => {
    if (!control?.getBoundingClientRect) return;
    const text = tooltipText(parseTooltipDataset(control.dataset), lang);
    if (!text) { hide(); return; }
    if (active && active !== control) active.removeAttribute?.('aria-describedby');
    active = control;
    control.setAttribute?.('aria-describedby', id);
    tip.textContent = text;
    tip.hidden = false;
    const rect = control.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect?.() ?? { width: 0, height: 0 };
    const viewport = {
      width: doc.defaultView?.innerWidth ?? globalThis.innerWidth ?? 1024,
      height: doc.defaultView?.innerHeight ?? globalThis.innerHeight ?? 768,
    };
    const position = clampTooltipPosition(
      { left: rect.left, top: rect.bottom, width: tipRect.width, height: tipRect.height },
      viewport,
    );
    tip.style.left = position.left + 'px';
    tip.style.top = position.top + 'px';
    tip.dataset.placement = position.placement;
  };
  const onPointerOver = event => {
    const control = event.target.closest?.(selector);
    if (control && root.contains?.(control)) show(control);
  };
  const onPointerOut = event => {
    const control = event.target.closest?.(selector);
    if (!control) return;
    if (event.relatedTarget && control.contains?.(event.relatedTarget)) return;
    hide();
  };
  const onFocusIn = event => {
    const control = event.target.closest?.(selector);
    if (control && root.contains?.(control)) show(control);
  };
  const onFocusOut = () => hide();
  const onKey = event => { if (event.key === 'Escape') hide(); };
  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  doc.addEventListener('keydown', onKey, true);
  doc.defaultView?.addEventListener?.('scroll', hide, true);
  doc.defaultView?.addEventListener?.('resize', hide);
  return {
    element: tip,
    hide,
    setLanguage(next) {
      lang = next === 'en' ? 'en' : 'zh-CN';
      if (active) show(active);
    },
    destroy() {
      hide();
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('pointerout', onPointerOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      doc.removeEventListener('keydown', onKey, true);
      doc.defaultView?.removeEventListener?.('scroll', hide, true);
      doc.defaultView?.removeEventListener?.('resize', hide);
      tip.remove?.();
    },
  };
}
