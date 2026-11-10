import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_PREFERENCES,
  createThemeController,
  normalizeTheme,
  resolveTheme,
  themeState,
} from '../../apps/web/src/ui/theme.mjs';

test('theme preferences normalize and resolve system mode', () => {
  assert.deepEqual(THEME_PREFERENCES, ['light', 'dark', 'system']);
  assert.equal(normalizeTheme('DARK'), 'dark');
  assert.equal(normalizeTheme('sepia'), 'system');
  assert.equal(normalizeTheme(undefined), 'system');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.deepEqual(themeState('system', true), { preference: 'system', resolved: 'dark', colorScheme: 'dark' });
});

test('theme controller applies, persists and toggles', () => {
  const root = { dataset: {}, style: {}, dispatchEvent() {} };
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(key, value) { this.key = key; this.value = value; },
  };
  const listeners = [];
  const media = {
    matches: true,
    addEventListener(type, listener) { listeners.push(listener); },
    removeEventListener(type, listener) { listeners.splice(listeners.indexOf(listener), 1); },
  };
  const controller = createThemeController({ root, storage, media, preference: 'system' });
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(controller.getPreference(), 'system');
  controller.set('light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(storage.value, 'light');
  controller.toggle();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(controller.getResolved(), 'dark');
  media.matches = false;
  listeners[0]();
  assert.equal(root.dataset.theme, 'dark');
  controller.set('system');
  listeners[0]();
  assert.equal(root.dataset.theme, 'light');
  controller.destroy();
  assert.equal(listeners.length, 0);
});

test('invalid stored preference falls back to system', () => {
  const root = { dataset: {}, style: {}, dispatchEvent() {} };
  const storage = { value: 'neon', getItem() { return this.value; }, setItem() {} };
  const media = { matches: false, addEventListener() {}, removeEventListener() {} };
  const controller = createThemeController({ root, storage, media });
  assert.equal(controller.getPreference(), 'system');
  assert.equal(root.dataset.theme, 'light');
});
