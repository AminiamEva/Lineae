export const FONT_DEFAULT = 16;
export const FONT_MIN = 11;
export const FONT_MAX = 32;

export function clampFont(value) {
  const number = Number(value);
  return value == null || value === '' || !Number.isFinite(number)
    ? FONT_DEFAULT : Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(number)));
}

// Accumulate small trackpad deltas; cap large wheel ticks at one pixel and
// rate-limit bursts. No timers or trailing work after the pointer leaves.
export function wheelFontStep() {
  let accumulated = 0, lastTime = -Infinity, changedAt = -Infinity;
  return (event, now = performance.now()) => {
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
    if (!Number.isFinite(delta) || !delta) return 0;
    if (now - lastTime > 180 || Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
    lastTime = now;
    accumulated += delta;
    if (Math.abs(accumulated) < 40 || now - changedAt < 60) return 0;
    const step = -Math.sign(accumulated);
    accumulated = 0;
    changedAt = now;
    return step;
  };
}

export function installFontWheel(container, change, signal) {
  const step = wheelFontStep();
  container.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    const amount = step(event);
    if (amount) change(amount);
  }, {passive: false, signal});
}
