const aliases = new Map([
  ['{', '\\{'], ['}', '\\}'], ['|', '\\vert'], ['||', '\\Vert'],
  ['⟨', '\\langle'], ['⟩', '\\rangle'], ['⌊', '\\lfloor'], ['⌋', '\\rfloor'],
  ['⌈', '\\lceil'], ['⌉', '\\rceil'],
]);
const allowed = new Set(['(', ')', '[', ']', '.', ...aliases.values(),
  '\\lbrace', '\\rbrace', '\\lvert', '\\rvert', '\\lVert', '\\rVert']);

export function parseDelimiterPair(input) {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length !== 2) return null;
  const pair = tokens.map(token => aliases.get(token) ?? token);
  return pair.every(token => allowed.has(token)) ? pair : null;
}

export function wrapMathWithDelimiters([left, right], content) {
  return `\\left${left} ${content || '\\placeholder{}'} \\right${right}`;
}
