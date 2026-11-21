import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeStylePresets, activeStyleKey, documentClassFromSource, isChapteredDocument } from '../apps/web/src/ui/style-presets.mjs';

test('article style cards stop at subsubsection', () => {
  const presets = homeStylePresets('article');
  assert.deepEqual(presets.map(p => p.key), ['normal', 'section', 'subsection', 'subsubsection']);
  assert.deepEqual(presets.map(p => p.level), [0, 1, 2, 3]);
  assert.ok(presets.slice(1).every(p => p.command === p.key));
});

test('book and report style cards include part and chapter', () => {
  for (const name of ['book', 'report']) {
    const presets = homeStylePresets(name);
    assert.deepEqual(presets.map(p => p.key), ['normal', 'part', 'chapter', 'section', 'subsection']);
    assert.equal(presets.find(p => p.key === 'part').command, 'part');
    assert.equal(presets.find(p => p.key === 'chapter').command, 'chapter');
    assert.equal(presets.find(p => p.key === 'part').level, 1);
    assert.equal(presets.find(p => p.key === 'chapter').level, 1);
  }
  assert.deepEqual(homeStylePresets('ctexbook').map(p => p.key), ['normal', 'part', 'chapter', 'section', 'subsection']);
});

test('document class detection normalizes ctex variants', () => {
  assert.equal(documentClassFromSource('\\documentclass[12pt]{book}'), 'book');
  assert.equal(documentClassFromSource('\\documentclass{ctexbook}'), 'book');
  assert.equal(documentClassFromSource('\\documentclass{ctexrep}'), 'report');
  assert.equal(documentClassFromSource(''), 'article');
  assert.equal(isChapteredDocument('book'), true);
  assert.equal(isChapteredDocument('article'), false);
});

test('active style disambiguates part from chapter', () => {
  const chaptered = homeStylePresets('book');
  assert.equal(activeStyleKey({ level: 0 }, chaptered), 'normal');
  assert.equal(activeStyleKey({ level: 1, command: 'part' }, chaptered), 'part');
  assert.equal(activeStyleKey({ level: 1, command: 'chapter' }, chaptered), 'chapter');
  assert.equal(activeStyleKey({ level: 1, command: null }, chaptered), 'chapter');
  assert.equal(activeStyleKey({ level: 2, command: 'section' }, chaptered), 'section');
  assert.equal(activeStyleKey({ level: 3, command: null }, chaptered), 'subsection');

  const article = homeStylePresets('article');
  assert.equal(activeStyleKey({ level: 1, command: null }, article), 'section');
  assert.equal(activeStyleKey({ level: 2, command: 'subsection' }, article), 'subsection');
});
