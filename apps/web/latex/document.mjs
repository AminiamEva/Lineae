const documentPattern = /^(.*?^\\begin\{document\}[ \t]*\r?\n)(.*)(^\\end\{document\}[ \t]*(?:\r?\n|$).*)$/ms;
export const plain = /^[^\\{}%$&#_^~\r\n]*$/;
const literalEnvironments = new Set(['verbatim','verbatim*','lstlisting','minted']);

export function parseDocument(source, {fragment = false} = {}) {
  const match = source.match(documentPattern);
  if (!match) {
    if (!fragment) return null;
    const parsed = parseDocument('\\begin{document}\n' + source + '\n\\end{document}\n');
    if (!parsed) return null;
    let last = parsed.blocks.length - 1;
    while (last > 0 && !parsed.blocks[last]) last--;
    parsed.blocks[last] = parsed.blocks[last].slice(0,-1);
    return {...parsed, start:'', end:'', eol:source.includes('\r\n')?'\r\n':'\n'};
  }
  const [, start, body, end] = match;

  const blocks = [];
  const environments = [];
  let cursor = 0;
  const tokens = /%[^\r\n]*|\\(?:begin|end)\{[^{}\r\n]+\}|\\[\[\]]|\\[\\%]|(?:\r?\n)[ \t]*(?:\r?\n)(?:[ \t]*\r?\n)*/g;
  for (const token of body.matchAll(tokens)) {
    const value = token[0];
    const literal = environments.at(-1)?.match(/^\\begin\{([^{}]+)\}$/)?.[1];
    if (literalEnvironments.has(literal)) {
      if (value === '\\end{'+literal+'}' && /^(?:[ \t]*)(?:\r?\n|$)/.test(body.slice(token.index+value.length))) {
        const lineStart=body.lastIndexOf('\n',token.index-1)+1;
        if (/^[ \t]*$/.test(body.slice(lineStart,token.index))) environments.pop();
      }
      continue;
    }
    if (value.startsWith('\\begin{') || value === '\\[') environments.push(value);
    else if (value.startsWith('\\end{') || value === '\\]') {
      const expected = value === '\\]' ? '\\[' : value.replace('\\end', '\\begin');
      if (environments.pop() !== expected) return null;
    } else if (/^[\r\n]/.test(value) && !environments.length) {
      blocks.push(body.slice(cursor, token.index), value);
      cursor = token.index + value.length;
    }
  }
  if (environments.length) return null;
  blocks.push(body.slice(cursor));
  return { start, end, blocks, eol: start.includes('\r\n') ? '\r\n' : '\n' };
}
