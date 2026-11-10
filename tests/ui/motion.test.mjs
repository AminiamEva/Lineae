import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION,
  animate,
  fadeIn,
  fadeOut,
  motionDuration,
  popIn,
  shouldAnimate,
  slideIn,
} from '../../apps/web/src/ui/motion.mjs';

function recorder() {
  const calls = [];
  const element = {
    animate(keyframes, options) {
      calls.push({ keyframes, options });
      return { cancel() {} };
    },
  };
  return { element, calls };
}

test('motion duration is clamped and speed-safe', () => {
  assert.equal(motionDuration(0), 80);
  assert.equal(motionDuration(1000), MOTION.slow);
  assert.equal(motionDuration(120, { speed: 1, min: 0, max: 500 }), 120);
  assert.equal(motionDuration(100, { speed: 0 }), MOTION.slow);
  assert.equal(shouldAnimate({ prefersReducedMotion: false }), true);
  assert.equal(shouldAnimate({ prefersReducedMotion: true }), false);
});

test('animate honors reduced motion and missing Web Animations', () => {
  const { element, calls } = recorder();
  animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  assert.equal(calls[0].options.duration, 200);
  animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, prefersReducedMotion: true });
  assert.equal(calls[1].options.duration, 0);
  assert.equal(animate(null, []), null);
  assert.equal(animate({}, []), null);
});

test('motion helpers use the expected keyframes', () => {
  const { element, calls } = recorder();
  fadeIn(element);
  fadeOut(element);
  slideIn(element, { offset: 12 });
  popIn(element);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].keyframes, [{ opacity: 0 }, { opacity: 1 }]);
  assert.deepEqual(calls[1].keyframes, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(calls[2].keyframes[1].transform, 'translateY(0)');
  assert.equal(calls[3].keyframes[0].transform, 'scale(.96)');
});
