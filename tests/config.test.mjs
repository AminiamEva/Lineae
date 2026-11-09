import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYaml, toYaml, mergeConfig } from '../apps/web/src/editor/config.mjs';

test('parses the shipped YAML config', () => {
  const config = parseYaml(readFileSync('apps/web/config.yaml', 'utf8'));
  assert.equal(config.version, 1);
  assert.equal(config.interface.language, 'auto');
  assert.equal(config.interface.zoom, 100);
  assert.deepEqual(config.interface.toolbar, ['open', 'download', 'language']);
  assert.equal(config.keybindings.math['ctrl+6'], 'moveToSuperscript');
});

test('round-trips preferences as YAML', () => {
  const config = { version: 1, interface: { language: 'en', zoom: 120 }, keybindings: { math: { 'ctrl+6': 'moveToSuperscript' } } };
  assert.deepEqual(parseYaml(toYaml(config)), config);
});

test('merges preference overrides deeply', () => {
  const base = { interface: { language: 'auto', zoom: 100 }, keybindings: { math: { a: 'b' } } };
  const merged = mergeConfig(base, { interface: { language: 'en' } });
  assert.equal(merged.interface.language, 'en');
  assert.equal(merged.interface.zoom, 100);
  assert.equal(merged.keybindings.math.a, 'b');
});
