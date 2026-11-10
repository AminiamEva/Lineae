export const MOTION = Object.freeze({
  fast: 120,
  base: 180,
  slow: 260,
  easing: 'cubic-bezier(.2,.7,.2,1)',
});

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function motionDuration(distance, { speed = 0.6, min = 80, max = MOTION.slow } = {}) {
  const safeSpeed = Math.max(Number(speed) || 0.01, 0.01);
  return clamp(Math.round(Math.abs(Number(distance) || 0) / safeSpeed), min, max);
}

export function shouldAnimate({ prefersReducedMotion = false } = {}) {
  return !prefersReducedMotion;
}

export function animate(element, keyframes, {
  duration = MOTION.base,
  easing = MOTION.easing,
  prefersReducedMotion = false,
  fill = 'both',
  ...options
} = {}) {
  if (!element || typeof element.animate !== 'function') return null;
  return element.animate(keyframes, {
    duration: shouldAnimate({ prefersReducedMotion }) ? duration : 0,
    easing,
    fill,
    ...options,
  });
}

export function fadeIn(element, options = {}) {
  return animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, ...options });
}

export function fadeOut(element, options = {}) {
  return animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, ...options });
}

export function slideIn(element, { offset = 8, ...options } = {}) {
  return animate(element, [
    { opacity: 0, transform: `translateY(${offset}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: MOTION.base, ...options });
}

export function popIn(element, options = {}) {
  return animate(element, [
    { opacity: 0, transform: 'scale(.96)' },
    { opacity: 1, transform: 'scale(1)' },
  ], { duration: MOTION.fast, ...options });
}
