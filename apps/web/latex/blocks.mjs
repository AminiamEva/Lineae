import {counterDeclarationAt} from './counter-declarations.mjs';
import {importedCellAttributes} from './table-spans.mjs';
import { parseInline, textCommands } from './inline.mjs';
import { parseTable } from './tables.mjs';
import { parseImageBlock } from './images.mjs';
import { theoremParts } from './theorem.mjs';
import { listStyleForLabel, bulletMarker } from './list-numbering.mjs';

function importedTableCells(row,specs,layout) {
  return row.cells.map((cell,index) => {
    const attrs=importedCellAttributes(row,index,specs);
    const start=row.columnIndexes?.[index]??index;
    const end=start+(row.spans?.[index]??1);
    const left=layout?.boundaries?.[start];
    const right=layout?.boundaries?.[end];
    if(left&&!left.tabcolsep)attrs.paddingLeft='0pt';
    if(right&&!right.tabcolsep)attrs.paddingRight='0pt';
    if(left?.rules)attrs.ruleLeft='true';
    if(right?.rules&&end>=specs.length)attrs.ruleRight='true';
    return attrs;
  });
}

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
      const type = { strong: 'bold', em: 'italic', u: 'underline', strike: 'strike', code: 'code', sup: 'superscript', sub: 'subscript', textsc: 'smallcaps', fbox: 'boxed', circled: 'circled' }[part.tag];
      if (type) {
        const mark = type === 'underline' && part.underlineStyle
          ? { type, attrs: { style: part.underlineStyle } } : { type };
        return convert(part.children, [...marks, mark]);
      }
      const attrs = part.points ? { fontSize: part.points + 'pt' } :
        part.attribute === 'color' ? { color: part.value } :
        part.attribute === 'background' ? { backgroundColor: part.value } :
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
      level:name==='chapter'?1:headingLevels.indexOf(name)+1,
      ...(name==='chapter'?{command:'chapter'}:{}),
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
  return text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).map(part => {
    const imported=importBlock(part);
    return imported?.type==='paragraph'
      ? imported
      : {type:'paragraph',content:inlineContent(part)??[{type:'text',text:part}]};
  });
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
      const style=listStyleForLabel(option);
      if (style) attrs.labelStyle=style;
    } else if (env === 'itemize') attrs.marker = bulletMarker(option);
  }
  const start = open[2]?.match(/(?:^|,)\s*start\s*=\s*([1-9]\d*)\s*(?:,|$)/)?.[1];
  if (env === 'enumerate' && start) attrs.start = Number(start);
  if (env === 'description') return { type: 'descriptionList', content };
  return { type: env === 'itemize' ? 'bulletList' : 'orderedList', attrs, content };
}

function bracedGroup(text,start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text[index] === '{') depth++;
    else if (text[index] === '}') {
      depth--;
      if (!depth) return {inner:text.slice(start + 1,index),end:index + 1};
    }
  }
  return null;
}

function unwrapParagraphBorder(text) {
  if (!text.startsWith('{\\fbox{')) return null;
  const fbox = bracedGroup(text,6);
  if (!fbox || fbox.end !== text.length - 1) return null;
  const prefix = '\\parbox{\\linewidth}{';
  if (!fbox.inner.startsWith(prefix)) return null;
  const body = bracedGroup(fbox.inner,prefix.length - 1);
  if (!body || body.end !== fbox.inner.length) return null;
  return {inner:body.inner,attrs:{border:true}};
}

function unwrapParagraphShading(text) {
  if (!text.startsWith('{\\colorbox{')) return null;
  const color = bracedGroup(text,10);
  if (!color) return null;
  const parbox = bracedGroup(text,color.end);
  if (!parbox || parbox.end !== text.length - 1) return null;
  const prefix = '\\parbox{\\linewidth}{';
  if (!parbox.inner.startsWith(prefix)) return null;
  const body = bracedGroup(parbox.inner,prefix.length - 1);
  if (!body || body.end !== parbox.inner.length) return null;
  return {inner:body.inner,attrs:{shading:color.inner.trim()}};
}

function unwrapParagraphSpacing(text) {
  if (!text.startsWith('{\\vspace*{')) return null;
  const before = bracedGroup(text,9);
  if (!before) return null;
  const marker = '\\par\\vspace*{';
  const at = text.lastIndexOf(marker);
  if (at < before.end) return null;
  const after = bracedGroup(text,at + marker.length - 1);
  if (!after || after.end !== text.length - 1) return null;
  const normalize = value => value.trim() === '0pt' ? null : value.trim();
  return {
    inner:text.slice(before.end,at),
    attrs:{spaceBefore:normalize(before.inner),spaceAfter:normalize(after.inner)},
  };
}

function unwrapParagraphLineSpacing(text) {
  const match = /^\{\\linespread\{([0-9.]+)\}\\selectfont ([\s\S]*)\\par\}$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {inner:match[2],attrs:{lineSpacing:value}};
}

function unwrapParagraphAlignment(text) {
  const match = /^\{\\(raggedright|raggedleft|centering|justifying) ([\s\S]*)\\par\}$/.exec(text);
  if (!match) return null;
  const align = {raggedright:'left',raggedleft:'right',centering:'center',justifying:'justify'}[match[1]];
  return {inner:match[2],attrs:{align}};
}

function unwrapParagraphWrappers(block) {
  let text = block.trim();
  let attrs = {};
  for (;;) {
    const wrapper = unwrapParagraphBorder(text) ?? unwrapParagraphShading(text) ??
      unwrapParagraphSpacing(text) ?? unwrapParagraphLineSpacing(text) ?? unwrapParagraphAlignment(text);
    if (!wrapper) break;
    attrs = {...attrs,...wrapper.attrs};
    text = wrapper.inner.trim();
  }
  return {text,attrs};
}

export function importBlock(block) {
  const wrapped = unwrapParagraphWrappers(block);
  const text = wrapped.text;
  if (!text) return null;
  const image = parseImageBlock(text);
  if (image) return image;
  const headingMatch = text.match(/^\\(chapter|section|subsection|subsubsection)(\*?)(?:\[([^\]]*)\])?\{([^{}]*)\}(?:[ \t]*\\label\{([^{}]*)\})?$/);
  if (headingMatch) return heading(headingMatch[1], headingMatch[2], headingMatch[3], headingMatch[4], headingMatch[5]);
  const declaration=counterDeclarationAt(text,0);
  if(declaration?.to===text.length)return {type:'counterDirective',attrs:{latex:declaration.latex}};
  if (text === '\\appendix') return {type:'appendixStart'};
  if (text === '\\tableofcontents') return { type: 'tableOfContents' };
  if (/^\\(?:newpage|clearpage|pagebreak)(?:\[[^\]]*\])?$/.test(text)) return { type: 'pageBreak' };
  if (text === '\\hrule') return { type: 'horizontalRule' };
  const multicol = text.match(/^\\begin\{multicols\*?\}\{(\d+)\}([\s\S]*?)\\end\{multicols\*?\}$/);
  if (multicol) {
    const content = importBlocks(multicol[2].trim());
    return {type:'multiColumn',attrs:{count:Math.max(2,Math.min(4,Number(multicol[1])||2))},content:content.length?content:[{type:'paragraph'}]};
  }
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
      const ends = tabular.rows[0].rules.includes('\\hline') && tabular.trailing.includes('\\hline');
      const all = ends && tabular.rows.every(row=>row.rules.includes('\\hline'));
      const vertical = tabular.columns.startsWith('|') && tabular.columns.endsWith('|');
      const borderMode = all && vertical ? 'grid' : all ? 'horizontal' : ends && vertical ? 'outer' : null;
      return {
        type: 'table',
        attrs: {
          columns: tabular.columns, booktabs, borderMode,
          columnLayout: JSON.stringify(tabular.columnLayout?.boundaries??[]),
          columnRules: tabular.columnLayout?.boundaries?.some(boundary=>boundary.rules>0||boundary.at) || false,
          caption: caption?.[1] ?? null,
          label: label?.[1] ?? null,
          placement: tableFloat[2] || null,
          centered: /\\centering\b/.test(inner),
        },
          content: tabular.rows.map(row => ({
            type: 'tableRow',
            attrs: { rules: row.rules ?? [] },
            content: row.cells.map((cell, index) => ({
              type: 'tableCell',
              attrs: importedTableCells(row, tabular.specs, tabular.columnLayout)[index],
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
      attrs: { columns: table.columns, booktabs, borderMode,
        columnLayout: JSON.stringify(table.columnLayout?.boundaries??[]),
        columnRules: table.columnLayout?.boundaries?.some(boundary=>boundary.rules>0||boundary.at) || false },
      content: table.rows.map(row => ({
        type: 'tableRow',
        attrs: { rules: row.rules ?? [] },
        content: row.cells.map((cell, index) => ({
          type: 'tableCell',
          attrs: importedTableCells(row, table.specs, table.columnLayout)[index],
          content: [{ type: 'paragraph', content: cell.trim() ? (inlineContent(cell) ?? [{ type: 'text', text: cell.trim() }]) : [] }],
        })),
      })),
    };
  }
  const indentation = /^\\(noindent|indent)(?![A-Za-z])[ \t]*/.exec(text);
  const content = inlineContent(indentation ? text.slice(indentation[0].length) : text);
  if (content) {
    const attrs = {
      ...wrapped.attrs,
      ...(indentation && {
        indent: indentation[1] === 'indent',
        ...(indentation[1] === 'indent' && {explicitIndent:true}),
      }),
    };
    return { type: 'paragraph', ...(Object.keys(attrs).length && { attrs }), content };
  }
  return { type: 'raw', attrs: { source: block } };
}

const structural = /\\(tableofcontents|appendix)\b|\\(chapter|section|subsection|subsubsection)(\*?)(?:\[([^\]]*)\])?\{([^{}]*)\}(?:[ \t]*\\label\{([^{}]*)\})?|\\(newpage|clearpage|pagebreak)\b/g;

function splitParagraphs(block) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let groups = 0;
  const tokens = /\\(begin|end)\{[^{}]+\}|\\par\b|\\.|[{}]/g;
  let match;
  while ((match = tokens.exec(block))) {
    if (match[1] === 'begin') depth++;
    else if (match[1] === 'end') depth = Math.max(0, depth - 1);
    else if (match[0] === '{') groups++;
    else if (match[0] === '}') groups = Math.max(0, groups - 1);
    else if (match[0] === '\\par' && depth === 0 && groups === 0) {
      parts.push(block.slice(start, match.index));
      start = match.index + match[0].length;
    }
  }
  parts.push(block.slice(start));
  return parts;
}

// Structural switches in comments or macro arguments must remain source text.
function topLevelCommand(text, index) {
  let depth=0;
  for(let i=0;i<index;i++){
    if(text[i]==='%'){
      const end=text.indexOf('\n',i);
      if(end<0||end>=index)return false;
      i=end;
    }else if(text[i]==='\\'){
      if(!/[A-Za-z]/.test(text[i+1]??''))i++;
    }else if(text[i]==='{')depth++;
    else if(text[i]==='}')depth--;
  }
  return depth===0;
}
function importSegment(block) {
  const events=[...block.matchAll(structural)].filter(match=>!((match[1]==='appendix'||match[2]==='chapter')&&!topLevelCommand(block,match.index))).map(match=>({from:match.index,to:match.index+match[0].length,match}));
  for(const match of block.matchAll(/\\(?:renewcommand|newcommand|setcounter|numberwithin|counterwithin|counterwithout)\b/g)){
    if(!topLevelCommand(block,match.index))continue;
    const declaration=counterDeclarationAt(block,match.index);
    if(declaration)events.push({from:declaration.from,to:declaration.to,node:{type:'counterDirective',attrs:{latex:declaration.latex}}});
  }
  events.sort((a,b)=>a.from-b.from);const nodes=[];let cursor=0;
  for(const event of events){
    if(event.from<cursor)continue;
    const before=importBlock(block.slice(cursor,event.from));if(before)nodes.push(before);
    const match=event.match;
    if(event.node)nodes.push(event.node);
    else if(match[1]==='appendix')nodes.push({type:'appendixStart'});
    else if(match[1]==='tableofcontents')nodes.push({type:'tableOfContents'});
    else if(match[7])nodes.push({type:'pageBreak'});
    else nodes.push(heading(match[2],match[3],match[4],match[5],match[6]));
    cursor=event.to;
  }
  const after=importBlock(block.slice(cursor));if(after)nodes.push(after);return nodes;
}

export function importBlocks(block) {
  const theorem=theoremParts(block);
  if(theorem) {
    const content=theorem.body.split(/\r?\n[ \t]*\r?\n/).map(part=>importBlock(part)).filter(Boolean);
    return [{type:'theoremBlock',attrs:{kind:theorem.kind,title:theorem.title},content:content.length?content:[{type:'paragraph'}]}];
  }
  const ruledTable = /^\{\\setlength\{\\arrayrulewidth\}\{(\d+(?:\.\d+)?pt)\}\s*(\\begin\{tabular\}[\s\S]*\\end\{tabular\})\s*\}$/.exec(block.trim());
  if (ruledTable) {
    const node=importBlock(ruledTable[2]);
    if(node?.type==='table')return [{...node,attrs:{...node.attrs,borderWidth:ruledTable[1]}}];
  }
  const listing = /^\\begin\{lstlisting\}(?:\[language=([A-Za-z0-9+_-]+)\])?\r?\n([\s\S]*?)\r?\n\\end\{lstlisting\}$/.exec(block.trim());
  if (listing) return [{type:'codeBlock',attrs:{language:listing[1]??null},content:listing[2]?[{type:'text',text:listing[2]}]:[]}];
  return splitParagraphs(block).flatMap(importSegment);
}
