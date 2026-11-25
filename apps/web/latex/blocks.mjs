import {counterDeclarationAt} from './counter-declarations.mjs';
import {importedCellAttributes} from './table-spans.mjs';
import { parseInline, textCommands } from './inline.mjs';
import { parseTable } from './tables.mjs';
import { parseImageBlock, tikzLooksCircuit } from './images.mjs';
import { theoremParts } from './theorem.mjs';
import { listStyleForLabel, bulletMarker } from './list-numbering.mjs';
import {sourceStructure} from './source-structure.mjs';
import {parseDocument} from './document.mjs';
import {headingAt} from './headings.mjs';
import {parseTableFloat} from './table-floats.mjs';
import {importTblr,environmentEnd,trivia} from './tblr.mjs';
import {importTabularx} from './tabularx.mjs';
import {importTextEnvironment} from './text-environments.mjs';
import {displayEnvironment} from './math-environments.mjs';

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

const rawNode = source => ({type:'raw', attrs:{source}});

function inlineContent(text, groups=false) {
  const parsed = parseInline(text,0,{groups});
  if (!parsed) return null;
  function convert(parts, marks = []) {
    return parts.flatMap(part => {
      if (typeof part === 'string') return part ? [{ type: 'text', text: part, marks }] : [];
      if (part.textCommand) return [{ type: 'text', text: textCommands[part.textCommand], marks: [...marks, { type: 'textCommand', attrs: { name: part.textCommand } }] }];
      if (part.lipsum !== undefined) return [{ type: 'lipsum', attrs: { range: part.lipsum } }];
      if (part.math !== undefined) return [{ type: 'math', attrs: { latex: part.math, display: false, delimiter: part.delimiters[0] } }];
      if (part.ref !== undefined) return [{ type: 'ref', attrs: { key: part.ref, ...part.referenceAttrs, ...(part.equation && {equation:true}) } }];
      if (part.cite !== undefined) return [{ type: 'cite', attrs: { key: part.cite, ...part.referenceAttrs } }];
      if (part.footnote !== undefined) return [{ type: 'footnote', attrs: { text: part.footnote } }];
      if (part.label !== undefined) return [{ type: 'label', attrs: { key: part.label, ...part.referenceAttrs } }];
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

let headingBase = null;
export function setHeadingBase(name) { headingBase = name; }
const headingLevels = () => headingBase
  ? [headingBase, 'section', 'subsection', 'subsubsection']
  : ['section', 'subsection', 'subsubsection'];

function heading(name, star, short, title, label, labelSource) {
  const content = inlineContent(title);
  if (!content) return null;
  return {
    type: 'heading',
    attrs: {
      level: name === 'part' || name === 'chapter' ? 1 : headingLevels().indexOf(name) + 1,
      // Keep the source command for heading numbering.  In book/report,
      // \section has level 2 but must still be treated as a section, not a
      // subsection, when the outline builds 1.1 / A.1 numbers.
      command: name,
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
    if (start !== null) items.push({from:start,to:match.index});
    start = match.index + token.length;
  }
  if (start === null) return null;
  items.push({from:start,to:body.length});
  return items;
}

function paragraphs(text,record) {
  const nodes=[];
  let from=0;
  function append(to){
    const raw=text.slice(from,to),part=raw.trim();
    if(!part)return;
    const imported=importBlock(part);
    const node=imported?.type==='paragraph'
      ? imported
      : {type:'paragraph',content:inlineContent(part) ?? undefined};
    record?.(node,nodes.length,from,to);
    nodes.push(node);
  }
  for(const separator of text.matchAll(/\n\s*\n/g)){
    append(separator.index);
    from=separator.index+separator[0].length;
  }
  append(text.length);
  return nodes.every(node=>node.content) ? nodes : null;
}

function itemParts(content,location) {
  const parts = [];
  let cursor = 0;
  function append(from,to) {
    const nodes=paragraphs(content.slice(from,to),location&&((node,index,start,end)=>
      location.record(node,[...location.path,parts.length+index],location.offset+from+start,location.offset+from+end)));
    if(!nodes)return false;
    parts.push(...nodes);
    return true;
  }
  const pattern = /\\begin\{(itemize|enumerate|description)\}/g;
  let match;
  while ((match = pattern.exec(content))) {
    if(!append(cursor,match.index))return null;
    const end = matchingListEnd(content, match.index, match[1]);
    if (end < 0) return null;
    const close = '\\end{' + match[1] + '}';
    const nested = parseListBlock(content.slice(match.index, end + close.length),location&&{
      ...location,offset:location.offset+match.index,path:[...location.path,parts.length],
    });
    if (!nested) return null;
    parts.push(nested);
    cursor = end + close.length;
    pattern.lastIndex = cursor;
  }
  if(!append(cursor,content.length))return null;
  return parts.length ? parts : [{ type: 'paragraph' }];
}

function parseListBlock(text,location) {
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
    let from=open[0].length+item.from;
    let body=text.slice(from,open[0].length+item.to);
    let term = '';
    if (env === 'description') {
      const match = body.match(/^\s*\[([^\]]*)\]/);
      if (match) { term = match[1]; body = body.slice(match[0].length); from+=match[0].length; }
    }
    const parts = itemParts(body,location&&{...location,offset:location.offset+from,path:[...location.path,content.length]});
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

export function listParagraphRanges(source) {
  const ranges=[];
  const list=parseListBlock(source.trim(),{offset:source.length-source.trimStart().length,path:[],
    record:(node,path,from,to)=>ranges.push({node,path,from,to})});
  return list?ranges.map(range=>({...range,container:list.type})):[];
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
  return {inner:body.inner,from:7+prefix.length,attrs:{border:true}};
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
  return {inner:body.inner,from:color.end+1+prefix.length,attrs:{shading:color.inner.trim()}};
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
    from:before.end,
    attrs:{spaceBefore:normalize(before.inner),spaceAfter:normalize(after.inner)},
  };
}

function unwrapParagraphLineSpacing(text) {
  const match = /^\{\\linespread\{([0-9.]+)\}\\selectfont ([\s\S]*)\\par\}$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {inner:match[2],from:'{\\linespread{}\\selectfont '.length+match[1].length,attrs:{lineSpacing:value}};
}

function unwrapParagraphAlignment(text) {
  const match = /^\{\\(raggedright|raggedleft|centering|justifying) ([\s\S]*)\\par\}$/.exec(text);
  if (!match) return null;
  const align = {raggedright:'left',raggedleft:'right',centering:'center',justifying:'justify'}[match[1]];
  return {inner:match[2],from:match[1].length+3,attrs:{align}};
}

export function unwrapParagraphWrappers(block) {
  let text = block.trim();
  let attrs = {};
  let from=block.length-block.trimStart().length;
  for (;;) {
    const wrapper = unwrapParagraphBorder(text) ?? unwrapParagraphShading(text) ??
      unwrapParagraphSpacing(text) ?? unwrapParagraphLineSpacing(text) ?? unwrapParagraphAlignment(text);
    if (!wrapper) break;
    attrs = {...attrs,...wrapper.attrs};
    from+=wrapper.from+wrapper.inner.length-wrapper.inner.trimStart().length;
    text = wrapper.inner.trim();
  }
  return {text,attrs,from};
}

export function importBlock(block, options={}) {
  if((options.environmentDepth??0)>32)return rawNode(block);
  const textEnvironment=importTextEnvironment(block,source=>importBlocks(source,{groups:true,environmentDepth:(options.environmentDepth??0)+1}));
  if(textEnvironment)return textEnvironment;
  const wrapped = unwrapParagraphWrappers(block);
  const text = wrapped.text;
  if (!text) return null;
  const image = parseImageBlock(block);
  if (image) return image;
  const title = headingAt(text,0,headingBase);
  if (title && title.end===text.length) return heading(title.name,title.star,title.short,title.title,title.label,title.labelSource) ?? rawNode(block);
  const declaration=counterDeclarationAt(text,0);
  if(declaration?.to===text.length)return {type:'counterDirective',attrs:{latex:declaration.latex}};
  if (text === '\\appendix') return {type:'appendixStart'};
  const matter = /^\\(frontmatter|mainmatter|backmatter)$/.exec(text);
  if (matter) return {type:'matterStart',attrs:{matter:matter[1].replace('matter','')||'main'}};
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
  const environment = text.match(/^\\begin\{(align\*?|alignat\*?|flalign\*?|xalignat\*?|xxalignat\*?|IEEEeqnarray|eqnarray\*?|gather\*?|multline\*?|multlined|displaymath|math|split|aligned|alignedat|gathered|cases|dcases|drcases|rcases|[pbBvV]?matrix|[pbBvV]?smallmatrix|array|darray|subarray|empheq)\}([\s\S]*?)\\end\{\1\}$/);
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
      const stretch = /\\renewcommand\s*\{\\arraystretch\}\s*\{([^{}]+)\}/.exec(inner) ??
        /\\setlength\s*\{\\arraystretch\}\s*\{([^{}]+)\}/.exec(inner);
      const arrayStretch = stretch ? Number.parseFloat(stretch[1]) : null;
      if (outside.replace(/\\centering\b|\\(?:caption|label)\{[^{}]*\}|\\renewcommand\s*\{\\arraystretch\}\s*\{[^{}]*\}|\\setlength\s*\{\\arraystretch\}\s*\{[^{}]*\}/g,'').replace(/[{}]/g,'').trim()) return rawNode(block);
      if (tabular.rows.some(row => row.cells.some(cell => !inlineContent(cell.trim())))) return rawNode(block);
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
          arrayStretch: Number.isFinite(arrayStretch) ? arrayStretch : null,
          caption: tableFloat.caption,
          label: tableFloat.label,
          placement: tableFloat.placement,
          centered: tableFloat.centered,
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
    if (table.rows.some(row => row.cells.some(cell => !inlineContent(cell.trim())))) return rawNode(block);
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
  const content = inlineContent(indentation ? text.slice(indentation[0].length) : text,options.groups);
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
  const tikzSource=block.trim();
  const tikzBlock=/^\\resizebox\{[^{}]*\}\{!\}\{/.test(tikzSource)?tikzSource.replace(/^\\resizebox\{[^{}]*\}\{!\}\{%?\s*/,'').replace(/%?\s*\}$/,''):tikzSource;
  if(/^\\begin\{(?:tikzpicture|circuitikz)\}[\s\S]*\\end\{(?:tikzpicture|circuitikz)\}$/.test(tikzBlock)) {
    return {type:'documentImage',attrs:{tikzSource:block.trim(),tikzEditor:tikzLooksCircuit(tikzBlock)?'circuit':'general',centered:true,align:'center'}};
  }
  return { type: 'raw', attrs: { source: block } };
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
    // The scanner keeps nested environments and literal content opaque.
    const environment=token.kind==='begin'&&(displayEnvironment(token.value)??
      /^\\begin\{(figure\*?|wrapfigure|table\*?|tabular\*?|tblr|tabularx|abstract|center)\}$/.exec(token.value)?.[1]);
    const closing=environment&&environmentEnd(block,token.index,environment);
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
    const declaration=counterDeclarationAt(block,token.index);
    if(declaration){const before=importBlock(block.slice(cursor,token.index),options);if(before)nodes.push(before);nodes.push({type:'counterDirective',attrs:{latex:declaration.latex}});cursor=declaration.to;continue;}
    if (token.kind!=='command') continue;
    const toc=token.value==='\\tableofcontents';
    const title=toc ? null : headingAt(block,token.index,headingBase);
    const structural=/^\\(?:appendix|frontmatter|mainmatter|backmatter|newpage|clearpage|pagebreak)$/.test(token.value);
    const layout=/^\\(?:pagestyle|thispagestyle)\{[^{}]*\}|^\\(?:maketitle\b|mbox\{\})/.exec(block.slice(token.index));
    if (!toc && !title && !structural && !layout) continue;
    const before = importBlock(block.slice(cursor, token.index),options);
    if (before) nodes.push(before);
    if (toc) nodes.push({ type: 'tableOfContents' });
    else if(structural)nodes.push(importBlock(token.value,options));
    else if(layout)nodes.push({type:'layoutCommand',attrs:{command:layout[0]}});
    else nodes.push(heading(title.name,title.star,title.short,title.title,title.label,title.labelSource) ?? rawNode(block.slice(token.index,title.end)));
    cursor = title?.end ?? (layout ? token.index+layout[0].length : token.end);
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
  const stretchedTable = /^\{\s*\\renewcommand\s*\{\\arraystretch\}\s*\{([^{}]+)\}\s*(\\begin\{tabular\}[\s\S]*\\end\{tabular\})\s*\}$/.exec(block.trim());
  if (stretchedTable) {
    const node=importBlock(stretchedTable[2]);
    const value=Number.parseFloat(stretchedTable[1]);
    if(node?.type==='table')return [{...node,attrs:{...node.attrs,...(Number.isFinite(value)?{arrayStretch:value}:{})}}];
  }
  const listing = /^\\begin\{lstlisting\}(?:\[language=([A-Za-z0-9+_-]+)\])?\r?\n([\s\S]*?)\r?\n\\end\{lstlisting\}$/.exec(block.trim());
  if (listing) return [{type:'codeBlock',attrs:{language:listing[1]??null},content:listing[2]?[{type:'text',text:listing[2]}]:[]}];
  return splitParagraphs(block).flatMap(part=>importSegment(part,options));
}
