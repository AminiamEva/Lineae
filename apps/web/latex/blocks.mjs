import { parseInline } from './inline.mjs';
import { parseTable } from './tables.mjs';

function inlineContent(text) {
  const parsed = parseInline(text);
  if (!parsed) return null;
  function convert(parts, marks = []) {
    return parts.flatMap(part => {
      if (typeof part === 'string') return part ? [{ type: 'text', text: part, marks }] : [];
      if (part.math !== undefined) return [{ type: 'math', attrs: { latex: part.math, display: false } }];
      if (part.ref !== undefined) return [{ type: 'ref', attrs: { key: part.ref } }];
      if (part.hardBreak) return [{ type: 'hardBreak' }];
      const type = { strong: 'bold', em: 'italic', u: 'underline' }[part.tag];
      if (type) return convert(part.children, [...marks, { type }]);
      const attrs = part.points ? { fontSize: part.points + 'pt' } :
        part.attribute === 'color' ? { color: part.value } :
        part.attribute === 'face' ? { fontFamily: part.value } : null;
      if (!attrs) throw new Error('Unsupported inline formatting');
      return convert(part.children, [...marks, { type: 'textStyle', attrs }]);
    });
  }
  try { return convert(parsed); } catch { return null; }
}

const headingLevels = ['section', 'subsection', 'subsubsection'];

function heading(name, star, short, title, label) {
  const content = inlineContent(title) ?? (title ? [{ type: 'text', text: title }] : []);
  return {
    type: 'heading',
    attrs: {
      level: headingLevels.indexOf(name) + 1,
      numbered: !star,
      ...(short !== undefined ? { shortTitle: short } : {}),
      ...(label ? { label } : {}),
    },
    content,
  };
}

export function importBlock(block) {
  const text = block.trim();
  if (!text) return null;
  const headingMatch = text.match(/^\\(section|subsection|subsubsection)(\*?)(?:\[([^\]]*)\])?\{([^{}]*)\}(?:[ \t]*\\label\{([^{}]*)\})?$/);
  if (headingMatch) return heading(headingMatch[1], headingMatch[2], headingMatch[3], headingMatch[4], headingMatch[5]);
  if (text === '\\tableofcontents') return { type: 'tableOfContents' };
  const math = text.match(/^\\\[([\s\S]*?)\\\]$/) ?? text.match(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/);
  if (math) return { type: 'mathBlock', attrs: { latex: math[1], display: true } };
  const list = text.match(/^\\begin\{(itemize|enumerate)\}\n([\s\S]*?)\n\\end\{\1\}$/);
  if (list) {
    const items = list[2].split(/\n(?=\\item)/).map(item => inlineContent(item.replace(/^\\item\s?/, '')));
    if (items.every(Boolean)) return { type: list[1] === 'itemize' ? 'bulletList' : 'orderedList', content: items.map(content => ({ type: 'listItem', content: [{ type: 'paragraph', content }] })) };
  }
  const table = parseTable(text);
  if (table && !table.trailing.length && table.rows.every(row => !row.rules.length)) {
    return { type: 'table', content: table.rows.map(row => ({ type: 'tableRow', content: row.cells.map(cell => ({ type: 'tableCell', content: [{ type: 'paragraph', content: cell.trim() ? [{ type: 'text', text: cell.trim() }] : [] }] })) })) };
  }
  const content = inlineContent(text);
  if (content) return { type: 'paragraph', content };
  return { type: 'raw', attrs: { source: block } };
}

const structural = /\\(tableofcontents)\b|\\(section|subsection|subsubsection)(\*?)(?:\[([^\]]*)\])?\{([^{}]*)\}(?:[ \t]*\\label\{([^{}]*)\})?/g;

export function importBlocks(block) {
  const nodes = [];
  let cursor = 0;
  structural.lastIndex = 0;
  let match;
  while ((match = structural.exec(block))) {
    const before = importBlock(block.slice(cursor, match.index));
    if (before) nodes.push(before);
    if (match[1] === 'tableofcontents') nodes.push({ type: 'tableOfContents' });
    else nodes.push(heading(match[2], match[3], match[4], match[5], match[6]));
    cursor = match.index + match[0].length;
  }
  const after = importBlock(block.slice(cursor));
  if (after) nodes.push(after);
  return nodes;
}
