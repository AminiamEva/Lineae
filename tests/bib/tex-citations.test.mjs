import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCitationRenames,
  checkTexCitations,
  parseBib,
  scanTexCitations,
} from '../../apps/web/bib/index.mjs';

test('finds plain, optional-argument and plural citation commands', () => {
  const tex = [
    'A \\cite{alpha} and \\citep[p.~2]{beta,gamma}.',
    'A \\citet{delta} and \\citeauthor*{epsilon}.',
    '\\cites{one}{two} \\parencites[see][p.~3]{three,four}{five}',
    '\\textcite{six} \\autocite{seven} \\footcite[1]{eight}',
  ].join('\n');
  const scan = scanTexCitations(tex);
  const pairs = scan.citations.map(citation => [citation.command, citation.keys.map(key => key.key)]);
  assert.deepEqual(pairs, [
    ['cite', ['alpha']],
    ['citep', ['beta', 'gamma']],
    ['citet', ['delta']],
    ['citeauthor*', ['epsilon']],
    ['cites', ['one', 'two']],
    ['parencites', ['three', 'four', 'five']],
    ['textcite', ['six']],
    ['autocite', ['seven']],
    ['footcite', ['eight']],
  ]);
});

test('citation key offsets point at the exact token', () => {
  const tex = 'x \\cite[p.~1]{ alpha , beta } y';
  const scan = scanTexCitations(tex);
  const keys = scan.citations[0].keys;
  assert.deepEqual(keys.map(key => key.key), ['alpha', 'beta']);
  assert.equal(tex.slice(keys[0].start, keys[0].end), 'alpha');
  assert.equal(tex.slice(keys[1].start, keys[1].end), 'beta');
});

test('comments are ignored, escaped percent is not', () => {
  const tex = [
    '% \\cite{ghost}',
    'Real \\cite{real} % trailing \\cite{trailing}',
    'Escaped \\% \\cite{after-escaped-percent}',
    'Linebreak \\\\% \\cite{after-linebreak}',
  ].join('\n');
  const keys = scanTexCitations(tex).citations.flatMap(citation => citation.keys.map(key => key.key));
  assert.deepEqual(keys, ['real', 'after-escaped-percent']);
});

test('\\nocite{*} is reported separately', () => {
  const scan = scanTexCitations('All: \\nocite{*}.');
  assert.equal(scan.nociteAll, true);
  assert.deepEqual(scan.citations[0].keys.map(key => key.key), ['*']);
});

test('\\citestyle is not mistaken for a citation', () => {
  const scan = scanTexCitations('\\citestyle{numeric} \\cite{real}');
  assert.deepEqual(scan.citations.map(citation => citation.command), ['cite']);
});

test('finds bibliography resources and styles', () => {
  const tex = [
    '\\bibliographystyle{plain}',
    '\\bibliography{refs, more-refs}',
    '\\addbibresource[location=local]{refs.bib}',
    '\\addglobalbib{global.bib}',
    '\\printbibliography[heading=bibintoc]',
  ].join('\n');
  const scan = scanTexCitations(tex);
  assert.equal(scan.bibliographyStyle.style, 'plain');
  assert.deepEqual(scan.bibliography.map(item => item.path), ['refs', 'more-refs']);
  assert.deepEqual(scan.resources.map(item => [item.command, item.path]), [
    ['addbibresource', 'refs.bib'],
    ['addglobalbib', 'global.bib'],
  ]);
  assert.equal(scan.printBibliography.length, 1);
  assert.equal(scan.mode, 'mixed');
});

test('distinguishes BibTeX, biblatex/Biber, and unknown configurations', () => {
  assert.equal(scanTexCitations('\\bibliographystyle{plain}\\bibliography{refs}').mode, 'bibtex');
  assert.equal(scanTexCitations('\\addbibresource{refs.bib}\\printbibliography').mode, 'biblatex');
  assert.equal(scanTexCitations('\\usepackage{custombib}').mode, 'unknown');
});

test('resource offsets survive option values that contain braces', () => {
  const tex = '\\addbibresource[location={local}]{refs.bib}';
  const scan = scanTexCitations(tex);
  const resource = scan.resources[0];
  assert.equal(resource.path, 'refs.bib');
  assert.equal(tex.slice(resource.start, resource.end), 'refs.bib');
});

test('unclosed citation groups do not throw', () => {
  const scan = scanTexCitations('\\cite{unclosed');
  assert.equal(scan.citations.length >= 0, true);
  assert.doesNotThrow(() => scanTexCitations('\\cite['));
});

test('checkTexCitations finds missing and uncited keys', () => {
  const bib = parseBib('@misc{a}\n@misc{b}\n@misc{c}');
  const tex = '\\cite{a} \\citep{b,missing} \\nocite{*}';
  const check = checkTexCitations(tex, bib);
  assert.deepEqual(check.cited.sort(), ['a', 'b', 'missing']);
  assert.deepEqual(check.missing.map(item => item.key), ['missing']);
  assert.deepEqual(check.uncited, ['c']);
  assert.equal(check.nociteAll, true);
  assert.equal(check.citationCount, 4);
  assert.throws(() => checkTexCitations(tex, {}), error => error.code === 'BIB504');
});

test('applyCitationRenames replaces only key tokens', () => {
  const tex = 'A \\cite{old} and \\citep[p.~1]{keep,old}.% \\cite{old}\n\\nocite{old}';
  const result = applyCitationRenames(tex, { old: 'new' });
  assert.equal(result.count, 3);
  assert.equal(result.unresolved.length, 0);
  assert.ok(result.text.includes('\\cite{new}'));
  assert.ok(result.text.includes('{keep,new}'));
  assert.ok(result.text.includes('% \\cite{old}'), 'comments are untouched');
  assert.deepEqual(result.replaced.map(item => item.oldKey), ['old', 'old', 'old']);
  assert.equal(result.text.length, tex.length);
});

test('applyCitationRenames reports keys that never appear', () => {
  const result = applyCitationRenames('\\cite{present}', { present: 'p2', absent: 'a2' });
  assert.deepEqual(result.unresolved, ['absent']);
  assert.equal(result.text, '\\cite{p2}');
});

test('applyCitationRenames rejects invalid replacement keys', () => {
  assert.throws(() => applyCitationRenames('\\cite{a}', { a: '' }), error => error.code === 'BIB504');
  assert.throws(() => applyCitationRenames('\\cite{a}', { a: 42 }), error => error.code === 'BIB504');
});

test('renaming plan from the editor can be applied to .tex', () => {
  const result = applyCitationRenames('See \\cite{knuth1984}.', { knuth1984: 'knuth84' });
  assert.equal(result.text, 'See \\cite{knuth84}.');
  assert.equal(result.count, 1);
});
