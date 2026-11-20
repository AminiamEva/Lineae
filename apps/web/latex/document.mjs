const documentPattern = /^(.*?^\\begin\{document\}[ \t]*\r?\n)(.*)(^\\end\{document\}[ \t]*(?:%[^\r\n]*)?(?:\r?\n|$).*)$/ms;
export const plain = /^[^\\{}%$&#_^~\r\n]*$/;
import {sourceStructure} from './source-structure.mjs';

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
  let cursor = 0;
  for (const token of sourceStructure(body)) {
    if (token.kind === 'blank' && token.topLevel) {
      blocks.push(body.slice(cursor, token.index), token.value);
      cursor = token.end;
    }
  }
  blocks.push(body.slice(cursor));
  return { start, end, blocks, eol: start.includes('\r\n') ? '\r\n' : '\n' };
}
