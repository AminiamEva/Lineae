import { parseInline, textCommands } from './inline.mjs';
import { parseTable } from './tables.mjs';
import { parseImageBlock } from './images.mjs';

function inlineContent(text) {
  const parsed = parseInline(text);
  if (!parsed) return null;
  function convert(parts, marks = []) {
    return parts.flatMap(part => {
      if (typeof part === 'string') return part ? [{ type: 'text', text: part, marks }] : [];
      if (part.textCommand) return [{ type: 'text', text: textCommands[part.textCommand], marks: [...marks, { type: 'textCommand', attrs: { name: part.textCommand } }] }];
      if (part.math !== undefined) return [{ type: 'math', attrs: { latex: part.math, display: false, delimiter: part.delimiters[0] } }];
      if (part.ref !== undefined) return [{ type: 'ref', attrs: { key: part.ref, ...(part.equation && {equation:true}) } }];
      if (part.cite !== undefined) return [{ type: 'cite', attrs: { key: part.cite } }];
      if (part.footnote !== undefined) return [{ type: 'footnote', attrs: { text: part.footnote } }];
      if (part.label !== undefined) return [{ type: 'label', attrs: { key: part.label } }];
      if (part.hardBreak) return [{ type: 'hardBreak' }];
      const type = { strong: 'bold', em: 'italic', u: 'underline', strike: 'strike', code: 'code', sup: 'superscript', sub: 'subscript', textsc: 'smallcaps', fbox: 'boxed' }[part.tag];
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

function matchingListEnd(text, start, env) {
  const pattern = /\\(begin|end)\{(itemize|enumerate|description)\}/g;
  pattern.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match[1] === 'begin') depth++;
    else {
      depth--;
      if (depth === 0) return match.index;
    }
  }
  return -1;
}

function splitListItems(body) {
  const pattern = /\\item\b|\\begin\{(itemize|enumerate|description)\}|\\end\{(itemize|enumerate|description)\}/g;
  const items = [];
  let depth = 0;
  let start = null;
  let match;
  while ((match = pattern.exec(body))) {
    const token = match[0];
    if (token.startsWith('\\begin')) { depth++; continue; }
    if (token.startsWith('\\end')) { depth = Math.max(0, depth - 1); continue; }
    if (depth !== 0) continue;
    if (start !== null) items.push(body.slice(start, match.index));
    start = match.index + token.length;
  }
  if (start === null) return null;
  items.push(body.slice(start));
  return items;
}

function paragraphs(text) {
  return text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).map(part => ({
    type: 'paragraph',
    content: inlineContent(part) ?? [{ type: 'text', text: part }],
  }));
}

function itemParts(content) {
  const parts = [];
  let cursor = 0;
  const pattern = /\\begin\{(itemize|enumerate|description)\}/g;
  let match;
  while ((match = pattern.exec(content))) {
    const before = content.slice(cursor, match.index).trim();
    if (before) parts.push(...paragraphs(before));
    const end = matchingListEnd(content, match.index, match[1]);
    if (end < 0) return null;
    const close = '\\end{' + match[1] + '}';
    const nested = parseListBlock(content.slice(match.index, end + close.length));
    if (!nested) return null;
    parts.push(nested);
    cursor = end + close.length;
    pattern.lastIndex = cursor;
  }
  const after = content.slice(cursor).trim();
  if (after) parts.push(...paragraphs(after));
  return parts.length ? parts : [{ type: 'paragraph' }];
}

function parseListBlock(text) {
  const open = text.match(/^\\begin\{(itemize|enumerate|description)\}(?:\[([^\]]*)\])?/);
  if (!open) return null;
  const env = open[1];
  const close = '\\end{' + env + '}';
  const end = text.lastIndexOf(close);
  if (end < open[0].length || text.slice(end + close.length).trim()) return null;
  const items = splitListItems(text.slice(open[0].length, end));
  if (!items) return null;
  const content = [];
  for (const item of items) {
    let body = item;
    let term = '';
    if (env === 'description') {
      const match = body.match(/^\s*\[([^\]]*)\]/);
      if (match) { term = match[1]; body = body.slice(match[0].length); }
    }
    const parts = itemParts(body);
    if (!parts) return null;
    if (env === 'description') content.push({ type: 'descriptionItem', attrs: { term }, content: parts });
    else content.push({ type: 'listItem', content: parts });
  }
  if (!content.length) return null;
  const attrs = {};
  const option = open[2]?.match(/label\s*=\s*([^,]+)/)?.[1]?.trim();
  if (option) {
    if (env === 'enumerate') {
      const styles = { '\\arabic*': 'decimal', '\\alph*': 'lower-alpha', '\\Alph*': 'upper-alpha', '\\roman*': 'lower-roman', '\\Roman*': 'upper-roman', '\\chinese*': 'cjk-heavenly-stem' };
      if (styles[option]) attrs.labelStyle = styles[option];
    } else if (env === 'itemize') attrs.marker = option;
  }
  if (env === 'description') return { type: 'descriptionList', content };
  return { type: env === 'itemize' ? 'bulletList' : 'orderedList', attrs, content };
}

export function importBlock(block) {
  const text = block.trim();
  if (!text) return null;
  const image = parseImageBlock(text);
  if (image) return image;
  const headingMatch = text.match(/^\\(section|subsection|subsubsection)(\*?)(?:\[([^\]]*)\])?\{([^{}]*)\}(?:[ \t]*\\label\{([^{}]*)\})?$/);
  if (headingMatch) return heading(headingMatch[1], headingMatch[2], headingMatch[3], headingMatch[4], headingMatch[5]);
  if (text === '\\tableofcontents') return { type: 'tableOfContents' };
  if (text === '\\hrule') return { type: 'horizontalRule' };
  const math = text.match(/^\\\[([\s\S]*?)\\\]$/) ?? text.match(/^\$\$([\s\S]*?)\$\$$/) ?? text.match(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/);
  if (math) {
    const delimiter = text.startsWith('$$') ? '$$' : text.match(/^\\begin\{(equation\*?)\}/)?.[1] ?? '\\[';
    const candidate = delimiter === 'equation' ? /(?<!\\)\\label\{([^{}\s]+)\}(\s*)$/.exec(math[1]) : null;
    const sameLine = candidate ? math[1].slice(math[1].lastIndexOf('\n',candidate.index-1)+1,candidate.index) : '';
    const trailing = /(^|[^\\])(?:\\\\)*%/.test(sameLine) ? null : candidate;
    const leading = delimiter === 'equation' && !trailing ? /^(\s*)\\label\{([^{}\s]+)\}[ \t]*(?:\r?\n)?/.exec(math[1]) : null;
    const latex = trailing ? math[1].slice(0,trailing.index).trimEnd()+trailing[2]
      : leading ? leading[1]+math[1].slice(leading[0].length) : math[1];
    const label = trailing?.[1] ?? leading?.[2];
    return { type: 'mathBlock', attrs: { latex, display: true, delimiter, ...(label && {label}) } };
  }
  const environment = text.match(/^\\begin\{(align\*?|alignat\*?|flalign\*?|eqnarray\*?|gather\*?|multline\*?|displaymath|math|split|aligned|alignedat|gathered|cases|dcases|drcases|rcases|[pbBvV]?matrix|[pbBvV]?smallmatrix|array|darray|subarray)\}([\s\S]*?)\\end\{\1\}$/);
  if (environment) return { type: 'mathBlock', attrs: { latex: text, display: true } };
  const quote = text.match(/^\\begin\{quote\}([\s\S]*?)\\end\{quote\}$/);
  if (quote) {
    const paragraphs = quote[1].split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    const content = paragraphs.map(part => ({ type: 'paragraph', content: inlineContent(part) ?? [{ type: 'text', text: part }] }));
    return { type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] };
  }
  const list = parseListBlock(text);
  if (list) return list;
  const tableFloat = /^\\begin\{(table\*?)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}$/.exec(text);
  if (tableFloat) {
    const inner = tableFloat[3];
    const start = inner.indexOf('\\begin{tabular}');
    const end = inner.lastIndexOf('\\end{tabular}');
    const tabular = start >= 0 && end > start ? parseTable(inner.slice(start, end + '\\end{tabular}'.length)) : null;
    if (tabular) {
      const caption = /\\caption\{([^{}]*)\}/.exec(inner);
      const label = /\\label\{([^{}]*)\}/.exec(inner);
      const booktabs = tabular.rows.some(row => row.rules.some(rule => /toprule|midrule|bottomrule/.test(rule))) ||
        tabular.trailing.some(rule => /toprule|midrule|bottomrule/.test(rule));
      return {
        type: 'table',
        attrs: {
          columns: tabular.columns, booktabs,
          caption: caption?.[1] ?? null,
          label: label?.[1] ?? null,
          placement: tableFloat[2] || null,
          centered: /\\centering\b/.test(inner),
        },
        content: tabular.rows.map(row => ({
          type: 'tableRow',
          content: row.cells.map((cell, index) => ({
            type: 'tableCell',
            attrs: { colspan: row.spans?.[index] ?? 1, rowspan: 1, align: row.aligns?.[index] ?? tabular.specs[index]?.align ?? null },
            content: [{ type: 'paragraph', content: cell.trim() ? (inlineContent(cell) ?? [{ type: 'text', text: cell.trim() }]) : [] }],
          })),
        })),
      };
    }
  }
  const table = parseTable(text);
  if (table) {
    const booktabs = table.rows.some(row => row.rules.some(rule => /toprule|midrule|bottomrule/.test(rule))) ||
      table.trailing.some(rule => /toprule|midrule|bottomrule/.test(rule));
    const ends = table.rows[0].rules.includes('\\hline') && table.trailing.includes('\\hline');
    const all = ends && table.rows.every(row=>row.rules.includes('\\hline'));
    const vertical = table.columns.startsWith('|') && table.columns.endsWith('|');
    const borderMode = all && vertical ? 'grid' : all ? 'horizontal' : ends && vertical ? 'outer' : null;
    return {
      type: 'table',
      attrs: { columns: table.columns, booktabs, borderMode },
      content: table.rows.map(row => ({
        type: 'tableRow',
        content: row.cells.map((cell, index) => ({
          type: 'tableCell',
          attrs: { colspan: row.spans?.[index] ?? 1, rowspan: 1, align: row.aligns?.[index] ?? table.specs[index]?.align ?? null },
          content: [{ type: 'paragraph', content: cell.trim() ? (inlineContent(cell) ?? [{ type: 'text', text: cell.trim() }]) : [] }],
        })),
      })),
    };
  }
  const indentation = /^\\(noindent|indent)(?![A-Za-z])[ \t]*/.exec(text);
  const content = inlineContent(indentation ? text.slice(indentation[0].length) : text);
  if (content) return { type: 'paragraph', ...(indentation && { attrs: { indent: indentation[1] === 'indent' } }), content };
  return { type: 'raw', attrs: { source: block } };
}

const structural = /\\(tableofcontents)\b|\\(section|subsection|subsubsection)(\*?)(?:\[([^\]]*)\])?\{([^{}]*)\}(?:[ \t]*\\label\{([^{}]*)\})?/g;

function splitParagraphs(block) {
  const parts = [];
  let start = 0;
  let depth = 0;
  const tokens = /\\(begin|end)\{[^{}]+\}|\\par\b/g;
  let match;
  while ((match = tokens.exec(block))) {
    if (match[1] === 'begin') depth++;
    else if (match[1] === 'end') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      parts.push(block.slice(start, match.index));
      start = match.index + match[0].length;
    }
  }
  parts.push(block.slice(start));
  return parts;
}

function importSegment(block) {
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

export function importBlocks(block) {
  const ruledTable = /^\{\\setlength\{\\arrayrulewidth\}\{(\d+(?:\.\d+)?pt)\}\s*(\\begin\{tabular\}[\s\S]*\\end\{tabular\})\s*\}$/.exec(block.trim());
  if (ruledTable) {
    const node=importBlock(ruledTable[2]);
    if(node?.type==='table')return [{...node,attrs:{...node.attrs,borderWidth:ruledTable[1]}}];
  }
  const listing = /^\\begin\{lstlisting\}(?:\[language=([A-Za-z0-9+_-]+)\])?\r?\n([\s\S]*?)\r?\n\\end\{lstlisting\}$/.exec(block.trim());
  if (listing) return [{type:'codeBlock',attrs:{language:listing[1]??null},content:listing[2]?[{type:'text',text:listing[2]}]:[]}];
  return splitParagraphs(block).flatMap(importSegment);
}
