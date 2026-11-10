export const fontFamilies = { Georgia: '\\rmfamily', Arial: '\\sffamily', monospace: '\\ttfamily' };
export const fontSizes = { 1: '\\scriptsize', 2: '\\small', 3: '\\normalsize', 4: '\\large', 5: '\\Large', 6: '\\LARGE', 7: '\\Huge' };

const textSymbols = {
  textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', textasciigrave: '`',
  textbar: '|', textless: '<', textgreater: '>', textunderscore: '_',
  textbraceleft: '{', textbraceright: '}', textdollar: '$', textpercent: '%',
  textampersand: '&', textsection: '§', textparagraph: '¶', textbullet: '•',
  textellipsis: '…', textendash: '–', textemdash: '—',
  textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“', textquotedblright: '”',
  textregistered: '®', texttrademark: '™',
  textdegree: '°', textcelsius: '℃', textmu: 'µ', textohm: 'Ω',
  textcent: '¢', textsterling: '£', textyen: '¥', texteuro: '€',
  textdagger: '†', textdaggerdbl: '‡', textperthousand: '‰', textnumero: '№',
  textlangle: '⟨', textrangle: '⟩', guillemotleft: '«', guillemotright: '»',
};
const simpleCommands = { LaTeX: 'LaTeX', TeX: 'TeX', copyright: '©', ldots: '…', dots: '…' };
export const textCommands = Object.freeze({ ...textSymbols, ...simpleCommands });
const textCommandPattern = /^\\([A-Za-z]+)(?:\{\}|[ \t]+)?/;
const plainPattern = /^\\(textup|textmd|textnormal|mbox|hbox)\{/;
const stylePattern = /^\\(textsc|fbox)\{/;
const scriptPattern = /^\\(textsuperscript|textsubscript)\{/;
const ignoredPattern = /^\\(?:noindent|indent|smallskip|medskip|bigskip|newpage|clearpage|pagebreak|nolinebreak|hspace|vspace)(?:\{[^{}]*\})?[ \t]*/;

export function parseInline(source, depth = 0) {
  if (depth > 40) return null;
  const nodes = [];
  let cursor = 0;
  while (cursor < source.length) {
    const rest = source.slice(cursor);

    const comment = rest.match(/^%[^\r\n]*(?:\r?\n)?/);
    if (comment) { cursor += comment[0].length; continue; }

    const escaped = rest.match(/^\\([%&_#${}])/);
    if (escaped) { nodes.push(escaped[1]); cursor += escaped[0].length; continue; }

    const command = rest.match(textCommandPattern);
    if (command && Object.hasOwn(textCommands,command[1])) {
      nodes.push({textCommand:command[1]}); cursor+=command[0].length; continue;
    }

    if (rest[0] === '~') { nodes.push('\u00A0'); cursor += 1; continue; }

    const lineBreak = rest.match(/^\\\\(?:\[[^\]]*\])?[ \t]*(?:\r?\n)?/);
    if (lineBreak) { nodes.push({ hardBreak: true }); cursor += lineBreak[0].length; continue; }

    const newlineCommand = rest.match(/^\\(?:newline|linebreak)\b[ \t]*(?:\r?\n)?/);
    if (newlineCommand) { nodes.push({ hardBreak: true }); cursor += newlineCommand[0].length; continue; }

    const ignored = rest.match(ignoredPattern);
    if (ignored) { cursor += ignored[0].length; continue; }

    const newline = rest.match(/^[ \t]*\r?\n[ \t]*/);
    if (newline) { nodes.push(' '); cursor += newline[0].length; continue; }

    const text = rest.match(/^[^\\{}%$&#_^~\r\n]+/);
    const math = rest.match(/^\$([^$\r\n]+)\$/) ?? rest.match(/^\\\(([^\r\n]+?)\\\)/);
    if (text || math) {
      nodes.push(text ? text[0] : { math: math[1], delimiters: math[0].startsWith('$') ? ['$', '$'] : ['\\(', '\\)'] });
      cursor += (text ?? math)[0].length;
      continue;
    }

    const footnote = rest.match(/^\\footnote\{([^{}\r\n]*)\}/);
    if (footnote) { nodes.push({ footnote: footnote[1] }); cursor += footnote[0].length; continue; }

    const reference = rest.match(/^\\ref\{([^{}\r\n]+)\}/);
    if (reference) { nodes.push({ ref: reference[1] }); cursor += reference[0].length; continue; }

    const citation = rest.match(/^\\cite\{([^{}\r\n]+)\}/);
    if (citation) { nodes.push({ cite: citation[1] }); cursor += citation[0].length; continue; }

    const label = rest.match(/^\\label\{([^{}\r\n]+)\}/);
    if (label) { nodes.push({ label: label[1] }); cursor += label[0].length; continue; }

    const emphasis = rest.match(/^\\(textbf|textit|emph|textsl|sout|underline)\{/);
    const plain = rest.match(plainPattern);
    const style = rest.match(stylePattern);
    const script = rest.match(scriptPattern);
    const fontCommand = rest.match(/^\\(texttt|textsf|textrm)\{/);
    const color = rest.match(/^\\textcolor\[HTML\]\{([0-9a-f]{6})\}\{/i);
    const points = rest.match(/^\{\\fontsize\{(\d{1,2})\}\{\d{1,2}\}\\selectfont /);
    const group = rest.match(/^\{(\\[A-Za-z]+) /);
    const family = group && Object.keys(fontFamilies).find(key => fontFamilies[key] === group[1]);
    const size = group && Object.keys(fontSizes).find(key => fontSizes[key] === group[1]);
    if (!emphasis && !plain && !style && !script && !fontCommand && !color && !family && !size && !points) return null;
    const start = (emphasis ?? plain ?? style ?? script ?? fontCommand ?? color ?? points ?? group)[0].length;
    let balance = 1;
    let end = start;
    for (; end < rest.length && balance; end++) {
      if (rest[end] === '\\' && /[{}\\]/.test(rest[end + 1] ?? '')) {
        end++;
      } else if (rest[end] === '{') balance++;
      else if (rest[end] === '}') balance--;
    }
    if (balance) return null;
    const children = parseInline(rest.slice(start, end - 1), depth + 1);
    if (!children) return null;
    if (plain) { nodes.push(...children); cursor += end; continue; }
    if (style) {
      nodes.push({ tag: style[1], children });
      cursor += end;
      continue;
    }
    if (script) {
      nodes.push({ tag: script[1] === 'textsuperscript' ? 'sup' : 'sub', children });
      cursor += end;
      continue;
    }
    const monospace = fontCommand?.[1] === 'texttt';
    nodes.push({
      tag: emphasis ? { textbf: 'strong', textit: 'em', emph: 'em', textsl: 'em', sout: 'strike', underline: 'u' }[emphasis[1]] : monospace ? 'code' : undefined,
      points: points?.[1],
      attribute: fontCommand && !monospace ? 'face' : color ? 'color' : family ? 'face' : size ? 'size' : null,
      value: fontCommand && !monospace ? { textsf: 'Arial', textrm: 'Georgia' }[fontCommand[1]] : color ? '#' + color[1] : family || size,
      children,
    });
    cursor += end;
  }
  return nodes;
}
