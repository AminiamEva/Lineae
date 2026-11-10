import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../apps/web/bib/lexer.mjs';
import { codesOf, hasCode } from './helpers.mjs';

test('tokenizes a minimal entry with exact raw slices', () => {
  const source = '@article{key, title={A}}';
  const { tokens, diagnostics } = tokenize(source);
  assert.deepEqual(tokens.map(token => token.type), [
    'command', 'word', 'comma', 'word', 'equals', 'braced', 'close', 'eof',
  ]);
  assert.equal(tokens[0].name, 'article');
  assert.equal(tokens[0].typeRaw, 'article');
  assert.equal(tokens[0].delimiter, '{');
  assert.equal(source.slice(tokens[0].start, tokens[0].end), '@article{');
  assert.equal(tokens[1].raw, 'key');
  assert.equal(tokens[5].value, 'A');
  assert.equal(source.slice(tokens[5].start, tokens[5].end), '{A}');
  assert.equal(diagnostics.length, 0);
});

test('supports parenthesized entries', () => {
  const { tokens } = tokenize('@Misc(key, title = {x})');
  assert.equal(tokens[0].name, 'misc');
  assert.equal(tokens[0].typeRaw, 'Misc');
  assert.equal(tokens[0].delimiter, '(');
  const close = tokens.find(token => token.type === 'close');
  assert.equal(close.delimiter, ')');
});

test('a quoted value protects braces and inner quotes', () => {
  const source = '@misc{k, title = "A {nested {"} quote"} value"}';
  const { tokens, diagnostics } = tokenize(source);
  const quoted = tokens.find(token => token.type === 'quoted');
  assert.equal(quoted.closed, true);
  assert.equal(quoted.value, 'A {nested {"} quote"} value');
  assert.equal(diagnostics.length, 0);
});

test('brace counting ignores backslashes, as BibTeX does', () => {
  const source = '@misc{k, note = {a \\{ b\\}}}';
  const { tokens, diagnostics } = tokenize(source);
  const braced = tokens.find(token => token.type === 'braced');
  assert.equal(braced.value, 'a \\{ b\\}');
  assert.equal(braced.closed, true);
  assert.deepEqual(codesOf(diagnostics), []);
});

test('recognizes concatenation and macro tokens', () => {
  const { tokens } = tokenize('@misc{k, month = "Jan " # jan}');
  assert.deepEqual(tokens.map(token => token.type), [
    'command', 'word', 'comma', 'word', 'equals', 'quoted', 'hash', 'word', 'close', 'eof',
  ]);
  assert.equal(tokens[7].raw, 'jan');
});

test('@string, @preamble and @comment are tokenized separately', () => {
  const source = '@string{acm = "ACM"} @preamble{"x" # "y"} @comment{keep {nested} text}';
  const { tokens, diagnostics } = tokenize(source);
  assert.deepEqual(
    tokens
      .filter(token => token.type === 'command' && token.name !== 'comment')
      .map(token => token.name),
    ['string', 'preamble'],
  );
  const comment = tokens.find(token => token.type === 'comment');
  assert.equal(comment.raw, '@comment{keep {nested} text}');
  assert.equal(diagnostics.length, 0);
});

test('an @ inside ordinary text does not start a command', () => {
  const source = '% mail a@b.example and @ home\n@misc{k, title={x}}';
  const { tokens } = tokenize(source);
  assert.equal(tokens[0].type, 'text');
  assert.ok(tokens[0].raw.includes('a@b.example'));
  assert.equal(tokens[1].type, 'command');
  assert.equal(tokens[1].name, 'misc');
});

test('reports an unterminated braced value and an unterminated command', () => {
  const { tokens, diagnostics } = tokenize('@misc{k, title={x');
  assert.ok(hasCode(diagnostics, 'BIB102'));
  assert.ok(hasCode(diagnostics, 'BIB105'));
  const braced = tokens.find(token => token.type === 'braced');
  assert.equal(braced.closed, false);
});

test('reports an unterminated quoted value with line and column', () => {
  const source = '@misc{k,\n  title = "unclosed\n}';
  const { diagnostics } = tokenize(source);
  const diagnostic = diagnostics.find(item => item.code === 'BIB103');
  assert.ok(diagnostic);
  assert.equal(diagnostic.location.start.line, 2);
  assert.equal(diagnostic.location.start.column, 11);
  assert.equal(diagnostic.severity, 'error');
});

test("'%' inside an entry is reported and skipped to end of line", () => {
  const source = '@misc{k, title = {A}, % not a comment here\n  year = {2020}}';
  const { tokens, diagnostics } = tokenize(source);
  assert.ok(hasCode(diagnostics, 'BIB108'));
  assert.ok(tokens.some(token => token.type === 'word' && token.raw === 'year'));
});

test('keys may contain punctuation but stop at whitespace or comma', () => {
  const { tokens } = tokenize('@misc{key:with-punct_1, title={x}}');
  assert.equal(tokens[1].raw, 'key:with-punct_1');
});

test('a mismatched closing delimiter is reported and still closes the entry', () => {
  const { tokens, diagnostics } = tokenize('@misc{k, title={x})');
  assert.ok(hasCode(diagnostics, 'BIB106'));
  const close = tokens.find(token => token.type === 'close');
  assert.equal(close.delimiter, ')');
});

test('top-level comments and whitespace are single text tokens', () => {
  const source = 'header\n\n@misc{k}\n\ntrailer\n';
  const { tokens } = tokenize(source);
  assert.equal(tokens[0].type, 'text');
  assert.equal(tokens.at(-1).type, 'eof');
  assert.equal(tokens.filter(token => token.type === 'text').length, 2);
});

test('carriage returns are accepted as whitespace', () => {
  const source = '@misc{k,\r\n  title = {x},\r\n  year = 2020\r\n}';
  const { tokens, diagnostics } = tokenize(source);
  assert.equal(diagnostics.length, 0);
  assert.equal(tokens.filter(token => token.type === 'word').length, 4);
});
