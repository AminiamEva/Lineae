// Fn is not reported to the webview, so the macOS tiling shortcuts arrive as
// Control+letter and Control+arrow key events.
const actions = new Map([
  ['KeyF', 'fill'],
  ['KeyC', 'center'],
  ['KeyR', 'restore'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'top'],
  ['ArrowDown', 'bottom'],
]);

export function macWindowAction(event) {
  if (!event || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return null;
  return actions.get(event.code) ?? null;
}

export function installMacWindowShortcuts(target, {isMac = false, run = () => {}} = {}) {
  if (!isMac || typeof target?.addEventListener !== 'function') return () => {};
  const onKeyDown = event => {
    const action = macWindowAction(event);
    if (!action) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
    run(action, event);
  };
  target.addEventListener('keydown', onKeyDown, {capture: true});
  return () => target.removeEventListener?.('keydown', onKeyDown, {capture: true});
}