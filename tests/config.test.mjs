import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConfigStore, parseYaml, toYaml, mergeConfig } from '../apps/web/src/editor/config.mjs';

const defaults = readFileSync('apps/web/config.yaml', 'utf8');

test('parses the shipped YAML config', () => {
  const config = parseYaml(defaults);
  assert.equal(config.version, 2);
  assert.equal(config.interface.language, 'auto');
  assert.equal(config.interface.zoom, 100);
  assert.deepEqual(config.interface.toolbar, ['open', 'saveAs', 'download', 'language', 'assets']);
  assert.equal(config.keybindings.editor.insertDisplayMath, 'mod+f');
  assert.equal(config.keybindings.editor.toggleBox, 'mod+e b');
  assert.deepEqual(config.keybindings.math.superscript, ['mod+6','ctrl+6']);
  assert.deepEqual(config.keybindings.editor.leaveFile,['mod+alt+j','ctrl+alt+j']);
  assert.deepEqual(config.keybindings.math.leaveFile,['mod+alt+j','ctrl+alt+j']);
  assert.deepEqual(config.keybindings.editor.leaveAllEnvironments,['mod+shift+j','ctrl+shift+j']);
  assert.deepEqual(config.keybindings.math.leaveFormula,['mod+shift+j','ctrl+shift+j']);
  assert.equal(config.keybindings.editor.toggleItalic,null);
  assert.equal(config.keybindings.editor.toggleStrike,null);
  assert.equal(config.keybindings.global.shortcutPriority,null);
});

test('round-trips preferences as YAML', () => {
  const config = {
    version: 2,
    interface: { language: 'en', zoom: 120 },
    keybindings: { editor: { insertDisplayMath: ['ctrl+e c', 'ctrl+alt+c'], toggleBox: null } },
  };
  assert.deepEqual(parseYaml(toYaml(config)), config);
});

test('accepts mainland traditional Chinese as an interface language', () => {
  const store = createConfigStore(defaults);
  store.importYaml('interface:\n  language: zh-Hant\n');
  assert.equal(store.value.interface.language, 'zh-Hant');
});

test('merges preference overrides deeply', () => {
  const base = { interface: { language: 'auto', zoom: 100 }, keybindings: { math: { a: 'b' } } };
  const merged = mergeConfig(base, { interface: { language: 'en' } });
  assert.equal(merged.interface.language, 'en');
  assert.equal(merged.interface.zoom, 100);
  assert.equal(merged.keybindings.math.a, 'b');
});

test('migrates saved preferences and the old theme into one YAML file', () => {
  const values = new Map([
    ['lineae.config', 'version: 1\ninterface:\n  zoom: 130\nkeybindings:\n  math:\n    ctrl+7: moveToSuperscript\n'],
    ['lineae.theme', 'dark'],
  ]);
  const storage = {
    getItem: key => values.get(key),
    setItem: (key,value) => values.set(key,value),
    removeItem: key => values.delete(key),
  };
  const store = createConfigStore(defaults,{ storage });
  assert.equal(store.value.interface.zoom,130);
  assert.equal(store.value.interface.theme,'dark');
  assert.equal(store.value.keybindings.math.superscript,'ctrl+7');
  assert.equal(store.value.keybindings.editor.toggleBox,'mod+e b');
  assert.equal(values.has('lineae.theme'),false);
  assert.equal(parseYaml(values.get('lineae.config')).version,2);
  const bindings = store.bindings;
  store.updateInterface({zoom:140});
  assert.equal(store.bindings,bindings,'Saving a display setting keeps a pending chord on the same keymap');
  const restored = createConfigStore(defaults,{ storage }).value;
  assert.equal(restored.interface.theme,'dark');
  assert.equal(restored.interface.zoom,140);
});

test('importing a conflicting or malformed profile keeps the active profile', () => {
  const store = createConfigStore(defaults);
  store.importYaml('keybindings:\n  editor:\n    insertDisplayMath: ctrl+q c\n    toggleBox: null\n');
  assert.ok(store.bindings.scopes.get('editor').some(entry => entry.command==='insertDisplayMath' && entry.first==='ctrl+q'));
  assert.ok(!store.bindings.scopes.get('editor').some(entry => entry.command==='toggleBox'));
  const previous = store.exportYaml();
  assert.throws(() => store.importYaml('keybindings:\n  editor:\n    toggleBox: ctrl+e e\n'),/Conflicting shortcuts/);
  assert.throws(() => store.importYaml('interface:\n  zoom: [120\n'));
  assert.equal(store.exportYaml(),previous);
});

test('mode-specific toolbar defaults and YAML source preferences', () => {
 const store=createConfigStore(defaults);
 assert.equal(store.value.interface.toolbarAutoHide,false);
 assert.equal(store.value.interface.sourceToolbarAutoHide,true);
 assert.equal(store.value.editing.indentOnSave,true);
 store.importYaml('interface:\n  sourceFontSize: 21\n  sidebar:\n    includes: false\nediting:\n  indentOnSave: false\n');
 assert.equal(store.value.interface.sourceFontSize,21);
 assert.equal(store.value.interface.sidebar.files,true);
 assert.equal(store.value.interface.sidebar.includes,false);
 assert.equal(store.value.editing.indentOnSave,false);
 assert.throws(()=>store.importYaml('interface:\n  sourceToolbarAutoHide: wrong\n'));
});
