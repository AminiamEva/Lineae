import {mathSpan} from './math-delimiters.mjs';
const literalEnvironments = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted']);

function skipTrivia(source, index) {
  const pattern = /(?:\s+|%[^\r\n]*(?:\r?\n|$))*/y;
  pattern.lastIndex = index;
  pattern.exec(source);
  return pattern.lastIndex;
}

function groupEnd(source, index) {
  const stack = [source[index]];
  const pattern = /%[^\r\n]*|\\[\s\S]|[{}\[\]]/g;
  pattern.lastIndex = index + 1;
  let match;
  while ((match = pattern.exec(source))) {
    const value = match[0], top = stack.at(-1);
    if (value === '{' || (value === '[' && top === '[')) stack.push(value);
    else if ((value === '}' && top === '{') || (value === ']' && top === '[')) {
      stack.pop();
      if (!stack.length) return pattern.lastIndex;
    }
  }
  return -1;
}

function definitionEnd(source, index) {
  let cursor = skipTrivia(source, index + (source[index] === '*' ? 1 : 0));
  if (source[cursor] === '{') cursor = groupEnd(source,cursor);
  else {
    const name = /^\\(?:[A-Za-z@]+|[^\r\n])/.exec(source.slice(cursor));
    cursor = name ? cursor + name[0].length : -1;
  }
  if (cursor < 0) return -1;
  cursor = skipTrivia(source,cursor);
  for (let option=0; option<2 && source[cursor] === '['; option++) {
    cursor = groupEnd(source,cursor);
    if (cursor < 0) return -1;
    cursor = skipTrivia(source,cursor);
  }
  return source[cursor] === '{' ? groupEnd(source,cursor) : -1;
}

// Lexical boundaries only: never expand macros or interpret unknown syntax.
// A mismatched delimiter protects the remaining source instead of guessing a close.
export function* sourceStructure(source) {
  const pattern = /%[^\r\n]*|\\(begin|end)\{([^{}\r\n]+)\}|\\verb\*?(?![A-Za-z])([^\sA-Za-z*])|\\[A-Za-z]+|\\[\s\S]|\$\$|\$|[{}]|(?:\r?\n)[ \t]*(?:\r?\n)(?:[ \t]*\r?\n)*/g;
  const environments = [];
  let groups = 0, broken = false, match;
  while ((match = pattern.exec(source))) {
    const value = match[0], index = match.index;
    const literal = environments.at(-1);
    if (literalEnvironments.has(literal)) {
      // Listing contents are literal, including comments, braces and fake ends.
      const close = new RegExp('^[ \\t]*\\\\end\\{' + literal.replace('*', '\\*') + '\\}[ \\t]*(?=\\r?$)', 'gm');
      close.lastIndex = source.lastIndexOf('\n',index-1) + 1;
      const end = close.exec(source);
      if (!end) break;
      pattern.lastIndex = end.index + end[0].length;
      environments.pop();
      continue;
    }
    if (value.startsWith('%')) continue;
    if (match[3]) {
      const end = source.indexOf(match[3], pattern.lastIndex);
      const newline = source.indexOf('\n', pattern.lastIndex);
      if (end < 0 || (newline >= 0 && end > newline)) { broken = true; break; }
      pattern.lastIndex = end + 1;
      continue;
    }
    const topLevel = !broken && !groups && !environments.length;
    if (value==='$' || value==='$$' || value==='\\(' || value==='\\[') {
      const span=mathSpan(source,index,value);
      if(!span){broken=true;break;}
      pattern.lastIndex=span.end;
      yield {index,...span,value,kind:value==='$$'||value==='\\['?'displayMath':'inlineMath',topLevel};
      continue;
    }
    let kind = 'command';
    if (/^\\(?:newcommand|renewcommand|providecommand)$/.test(value)) {
      const end = definitionEnd(source,pattern.lastIndex);
      if (end < 0) { broken = true; break; }
      pattern.lastIndex = end;
      kind = 'definition';
    } else if (match[1] && !groups) {
      kind = match[1];
      if (kind === 'begin') environments.push(match[2]);
      else if (environments.at(-1) === match[2]) environments.pop();
      else broken = true;
    } else if (!groups && (value === '\\]' || value === '\\)')) {
      kind = 'end'; broken = true;
    } else if (value === '{') { kind = 'group'; groups++; }
    else if (value === '}') {
      kind = 'group';
      if (groups) groups--; else broken = true;
    } else if (/^[\r\n]/.test(value)) kind = 'blank';
    yield {index, end:pattern.lastIndex, value, kind, topLevel:topLevel && !broken};
  }
  if (broken || groups || environments.length) yield {kind:'invalid', index:source.length, end:source.length, topLevel:false};
}
