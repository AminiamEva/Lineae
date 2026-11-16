// A conservative indentation pass, not a TeX formatter or macro expander.
// Changes use CodeMirror's logical LF offsets; text preserves original EOLs.
const literalEnvironments = new Set(['verbatim', 'verbatim*', 'Verbatim', 'Verbatim*', 'lstlisting', 'minted', 'alltt']);
const definitions = /^\s*\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment|def|gdef|edef|xdef|let)\b/;

export function indentLatex(source) {
  const unchanged = reason => ({text:source, changes:[], reason});
  const lines = source.split(/(\r\n|\r|\n)/);
  const stack = [], changes = [];
  let groupDepth = 0, optionalDepth = 0, literal = null, logicalOffset = 0, joined = false, startLevel = 0;
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    const initialDepth = groupDepth + optionalDepth;
    const startsJoined = joined;
    joined = false;
    let leadingEnds = 0, onlyEnds = true, comment = false;
    const wasLiteral = literal !== null;
    if (literal) {
      const closing = /^\s*\\end\{([^{}]+)\}\s*(?:%.*)?$/.exec(line);
      if (closing?.[1] === literal) {
        stack.pop(); literal = null; leadingEnds = 1;
      }
    } else {
      for (let pos = 0; pos < line.length;) {
        const char = line[pos];
        if (char === '%') { comment = true; break; }
        if (char === '\\') {
          const command = /^\\([a-zA-Z]+|.)/.exec(line.slice(pos));
          if (!command) return unchanged('incomplete command');
          const name = command[1];
          pos += command[0].length;
          if (/^(?:catcode|obeyspaces|obeylines|ExplSyntaxOn|csname|endcsname|string|noexpand|expandafter|scantokens|lstinline|mintinline|if\w*|else|fi)$/.test(name)) {
            return unchanged('dynamic TeX syntax');
          }
          if (name === 'verb') {
            if (line[pos] === '*') pos++;
            const delimiter = line[pos++];
            const end = delimiter && line.indexOf(delimiter, pos);
            if (!delimiter || end < 0) return unchanged('incomplete inline verbatim');
            pos = end + 1; onlyEnds = false; continue;
          }
          if (!groupDepth && !optionalDepth && (name === 'begin' || name === 'end')) {
            const match = /^\{([a-zA-Z@][a-zA-Z0-9@*:_-]*)\}/.exec(line.slice(pos));
            if (!match) return unchanged('dynamic environment name');
            pos += match[0].length;
            if (name === 'end') {
              if (stack.pop() !== match[1]) return unchanged('unbalanced environments');
              if (onlyEnds) leadingEnds++;
            } else {
              stack.push(match[1]); onlyEnds = false;
              if (literalEnvironments.has(match[1])) { literal = match[1]; break; }
            }
          } else { onlyEnds = false; }
          continue;
        }
        if (char === '{') groupDepth++;
        if (char === '}' && --groupDepth < 0) return unchanged('unbalanced groups');
        if (char === '[' && !groupDepth) optionalDepth++;
        if (char === ']' && !groupDepth && optionalDepth) optionalDepth--;
        if (!/\s/.test(char)) onlyEnds = false;
        pos++;
      }
      joined = comment;
    }
    // Count the level at line start, rather than after inline begin/end pairs.
    // A closing literal delimiter may be indented, but literal body bytes never are.
    const isLiteralBody = wasLiteral && literal !== null;
    const macro = definitions.test(line);
    if (macro && !groupDepth && !/}\s*(?:%.*)?$/.test(line)) return unchanged('multiline macro declaration');
    if (!isLiteralBody && !initialDepth && !startsJoined && !macro && line.trim()) {
      const prefix = /^[ \t]*/.exec(line)[0];
      // startLevel is recorded below before advancing to the next line.
      const level = Math.max(0, startLevel - leadingEnds);
      const insert = '  '.repeat(level);
      if (prefix !== insert) {
        changes.push({from:logicalOffset, to:logicalOffset + prefix.length, insert});
        lines[index] = insert + line.slice(prefix.length);
      }
    }
    logicalOffset += line.length + (index + 1 < lines.length ? 1 : 0);
    startLevel = stack.length;
  }
  if (stack.length || groupDepth || optionalDepth || literal) return unchanged('incomplete structure');
  return {text:lines.join(''), changes, reason:null};
}
