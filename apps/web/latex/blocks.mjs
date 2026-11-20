import {importedCellAttributes} from './table-spans.mjs';
import { parseInline, textCommands } from './inline.mjs';
import { parseTable } from './tables.mjs';
import { parseImageBlock } from './images.mjs';
import { theoremParts } from './theorem.mjs';
import { listStyleForLabel } from './list-numbering.mjs';
import {sourceStructure} from './source-structure.mjs';
import {parseDocument} from './document.mjs';
import {headingAt} from './headings.mjs';
import {parseTableFloat} from './table-floats.mjs';
import {importTblr,environmentEnd,trivia} from './tblr.mjs';
import {importTabularx} from './tabularx.mjs';
import {importTextEnvironment} from './text-environments.mjs';

const rawNode = source => ({type:'raw', attrs:{source}});

export function setHeadingBase() {}

function inlineContent(text, groups=false) {
  const parsed = parseInline(text,0,{groups});
  if (!parsed) return null;
  function convert(parts, marks = []) {
    return parts.flatMap(part => {
      if (typeof part === 'string') return part ? [{ type: 'text', text: part, marks }] : [];
      if (part.textCommand) return [{ type: 'text', text: textCommands[part.textCommand], marks: [...marks, { type: 'textCommand', attrs: { name: part.textCommand } }] }];
      if (part.math !== undefined) return [{ type: 'math', attrs: { latex: part.math, display: false, delimiter: part.delimiters[0] } }];
      if (part.ref !== undefined) return [{ type: 'ref', attrs: { key: part.ref, ...part.referenceAttrs, ...(part.equation && {equation:true}) } }];
      if (part.cite !== undefined) return [{ type: 'cite', attrs: { key: part.cite, ...part.referenceAttrs } }];
      if (part.footnote !== undefined) return [{ type: 'footnote', attrs: { text: part.footnote } }];
      if (part.label !== undefined) return [{ type: 'label', attrs: { key: part.label, ...part.referenceAttrs } }];
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

function heading(name, star, short, title, label, labelSource) {
  const content = inlineContent(title);
  if (!content) return null;
  return {
    type: 'heading',
    attrs: {
      level: headingLevels.indexOf(name) + 1,
      numbered: !star,
      ...(short !== undefined ? { shortTitle: short } : {}),
      ...(label ? { label } : {}),
      ...(labelSource ? { labelSource } : {}),
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
    if (start === null && body.slice(0,match.index).trim()) return null;
    if (start !== null) items.push(body.slice(start, match.index));
    start = match.index + token.length;
  }
  if (start === null) return null;
  items.push(body.slice(start));
  return items;
}

function paragraphs(text) {
  const parts = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  const content = parts.map(part=>inlineContent(part));
  return content.every(Boolean) ? content.map(value => ({type:'paragraph',content:value})) : null;
}

function itemParts(content) {
  const parts = [];
  let cursor = 0;
  const pattern = /\\begin\{(itemize|enumerate|description)\}/g;
  let match;
  while ((match = pattern.exec(content))) {
    const before = content.slice(cursor, match.index).trim();
    if (before) {
      const nodes = paragraphs(before);
      if (!nodes) return null;
      parts.push(...nodes);
    }
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
  if (after) {
    const nodes = paragraphs(after);
    if (!nodes) return null;
    parts.push(...nodes);
  }
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
      const style=listStyleForLabel(option);
      if (style) attrs.labelStyle=style;
    } else if (env === 'itemize') attrs.marker = { '\\ensuremath{\\circ}':'◦', '\\rule{.45em}{.45em}':'▪' }[option] ?? option;
  }
  const start = open[2]?.match(/(?:^|,)\s*start\s*=\s*([1-9]\d*)\s*(?:,|$)/)?.[1];
  if (env === 'enumerate' && start) attrs.start = Number(start);
  if (env === 'description') return { type: 'descriptionList', content };
  return { type: env === 'itemize' ? 'bulletList' : 'orderedList', attrs, content };
}

export function importBlock(block, options={}) {
  if((options.environmentDepth??0)>32)return rawNode(block);
  const textEnvironment=importTextEnvironment(block,source=>importBlocks(source,{groups:true,environmentDepth:(options.environmentDepth??0)+1}));
  if(textEnvironment)return textEnvironment;
  const alignment=/^\{\\(raggedright|raggedleft|centering)\s+([\s\S]*?)\\par\}$/.exec(block.trim());
  if (alignment) {
    const paragraph=importBlock(alignment[2]);
    if (paragraph?.type==='paragraph') {
      return {...paragraph,attrs:{...paragraph.attrs,align:{raggedright:'left',raggedleft:'right',centering:'center'}[alignment[1]]}};
    }
  }
  const text = block.trim();
  if (!text) return null;
  const image = parseImageBlock(block);
  if (image) return image;
  const title = headingAt(text);
  if (title && title.end===text.length) return heading(title.name,title.star,title.short,title.title,title.label,title.labelSource) ?? rawNode(block);
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
    const content = paragraphs(quote[1]);
    if (!content) return rawNode(block);
    return { type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] };
  }
  const list = parseListBlock(text);
  if (list) return list;
  const tblr=importTblr(block,inlineContent);
  if(tblr)return tblr;
  const tabularx=importTabularx(block,inlineContent);
  if(tabularx)return tabularx;
  const tableFloat = parseTableFloat(text);
  if (tableFloat) {
    const inner = tableFloat.body;
    const start = inner.indexOf('\\begin{tabular}');
    const end = inner.lastIndexOf('\\end{tabular}');
    const tabular = start >= 0 && end > start ? parseTable(inner.slice(start, end + '\\end{tabular}'.length)) : null;
    if (tabular) {
      const outside = inner.slice(0,start) + inner.slice(end + '\\end{tabular}'.length);
      if (outside.replace(/\\centering\b|\\(?:caption|label)\{[^{}]*\}/g,'').trim()) return rawNode(block);
      if (tabular.rows.some(row => row.cells.some(cell => !inlineContent(cell.trim())))) return rawNode(block);
      const booktabs = tabular.rows.some(row => row.rules.some(rule => /toprule|midrule|bottomrule/.test(rule))) ||
        tabular.trailing.some(rule => /toprule|midrule|bottomrule/.test(rule));
      return {
        type: 'table',
        attrs: {
          columns: tabular.columns, booktabs,
          caption: tableFloat.caption,
          label: tableFloat.label,
          placement: tableFloat.placement,
          centered: tableFloat.centered,
        },
        content: tabular.rows.map(row => ({
          type: 'tableRow',
          content: row.cells.map((cell, index) => ({
            type: 'tableCell',
            attrs: importedCellAttributes(row,index,tabular.specs),
            content: [{ type: 'paragraph', content: cell.trim() ? (inlineContent(cell) ?? [{ type: 'text', text: cell.trim() }]) : [] }],
          })),
        })),
      };
    }
  }
  const table = parseTable(text);
  if (table) {
    if (table.rows.some(row => row.cells.some(cell => !inlineContent(cell.trim())))) return rawNode(block);
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
          attrs: importedCellAttributes(row,index,table.specs),
          content: [{ type: 'paragraph', content: cell.trim() ? (inlineContent(cell) ?? [{ type: 'text', text: cell.trim() }]) : [] }],
        })),
      })),
    };
  }
  const indentation = /^\\(noindent|indent)(?![A-Za-z])[ \t]*/.exec(text);
  const content = inlineContent(indentation ? text.slice(indentation[0].length) : text,options.groups);
  if (content) return { type: 'paragraph', ...(indentation && { attrs: { indent: indentation[1] === 'indent', ...(indentation[1]==='indent'&&{explicitIndent:true}) } }), content };
  return rawNode(block);
}

function splitParagraphs(block) {
  const parts = [];
  let start = 0;
  for (const token of sourceStructure(block)) {
    if (token.value === '\\par' && token.topLevel) {
      parts.push(block.slice(start, token.index));
      start = token.end;
    }
  }
  parts.push(block.slice(start));
  return parts;
}

function importSegment(block,options) {
  const nodes = [];
  let cursor = 0;
  for (const token of sourceStructure(block)) {
    if (!token.topLevel || token.index<cursor) continue;
    // Split outer source-backed environments without losing their separators.
    // The scanner
    // keeps nested environments, macro arguments and literal content opaque.
    const floating=token.kind==='begin' && /^\\begin\{(figure\*?|table\*?|tblr|tabularx|abstract|center)\}$/.exec(token.value);
    const closing=floating && environmentEnd(block,token.index,floating[1]);
    if(closing) {
      const prefix=block.slice(cursor,token.index);
      const start=prefix.trim()?token.index:cursor;
      if(prefix.trim()) {
        const before=trivia(prefix)===prefix.length?rawNode(prefix):importBlock(prefix,options);
        if(before)nodes.push(before);
      }
      // Whitespace remains owned by the original environment source. Comments
      // between environments stay opaque rather than being discarded as text.
      const end=closing.end+(block.slice(closing.end).match(/^\s*/)?.[0].length??0);
      nodes.push(importBlock(block.slice(start,end),options));
      cursor=trivia(block,end);
      if(cursor>end)nodes.push(rawNode(block.slice(end,cursor)));
      continue;
    }
    if (token.kind==='displayMath') {
      const before=importBlock(block.slice(cursor,token.index),options);
      if(before)nodes.push(before);
      nodes.push({type:'mathBlock',attrs:{latex:token.latex,display:true,delimiter:token.delimiter}});
      cursor=token.end;
      continue;
    }
    if (token.kind!=='command') continue;
    const toc=token.value==='\\tableofcontents';
    const title=toc ? null : headingAt(block,token.index);
    if (!toc && !title) continue;
    const before = importBlock(block.slice(cursor, token.index),options);
    if (before) nodes.push(before);
    if (toc) nodes.push({ type: 'tableOfContents' });
    else nodes.push(heading(title.name,title.star,title.short,title.title,title.label,title.labelSource) ?? rawNode(block.slice(token.index,title.end)));
    cursor = toc ? token.end : title.end;
  }
  const after = importBlock(block.slice(cursor),options);
  if (after) nodes.push(after);
  return nodes;
}

export function importBlocks(block, options={}) {
  if (Array.from(sourceStructure(block)).some(token => token.kind === 'invalid')) return [rawNode(block)];
  if((options.environmentDepth??0)>32)return [rawNode(block)];
  const textEnvironment=importTextEnvironment(block,source=>importBlocks(source,{groups:true,environmentDepth:(options.environmentDepth??0)+1}));
  if(textEnvironment)return [textEnvironment];
  const theorem=theoremParts(block);
  if(theorem) {
    const content=parseDocument(theorem.body,{fragment:true}).blocks.flatMap(importBlocks);
    if (content.some(node => node.type === 'raw')) return [rawNode(block)];
    return [{type:'theoremBlock',attrs:{kind:theorem.kind,title:theorem.title},content:content.length?content:[{type:'paragraph'}]}];
  }
  const ruledTable = /^\{\\setlength\{\\arrayrulewidth\}\{(\d+(?:\.\d+)?pt)\}\s*(\\begin\{tabular\}[\s\S]*\\end\{tabular\})\s*\}$/.exec(block.trim());
  if (ruledTable) {
    const node=importBlock(ruledTable[2]);
    if(node?.type==='table')return [{...node,attrs:{...node.attrs,borderWidth:ruledTable[1]}}];
  }
  const listing = /^\\begin\{lstlisting\}(?:\[language=([A-Za-z0-9+_-]+)\])?\r?\n([\s\S]*?)\r?\n\\end\{lstlisting\}$/.exec(block.trim());
  if (listing) return [{type:'codeBlock',attrs:{language:listing[1]??null},content:listing[2]?[{type:'text',text:listing[2]}]:[]}];
  return splitParagraphs(block).flatMap(part=>importSegment(part,options));
}
