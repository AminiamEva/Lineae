import { parseInline } from '../../latex/inline.mjs';
import { parseTable } from '../../latex/tables.mjs';
const escape = text => text.replace(/[\\{}%$&#_^~]/g, char => ({
  '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}[char] ?? '\\' + char));
export function serialize(node) {
  const content = (node.content ?? []).map(serialize).join('');
  if (node.type === 'text') {
    let value = escape(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = '\\textbf{' + value + '}';
      if (mark.type === 'italic') value = '\\textit{' + value + '}';
      if (mark.type === 'strike') value = '\\sout{' + value + '}';
      if (mark.type === 'underline') value = '\\underline{' + value + '}';
      if (mark.type === 'textStyle') {
        if (/^#[\da-f]{6}$/i.test(mark.attrs.color ?? '')) value='\\textcolor[HTML]{'+mark.attrs.color.slice(1)+'}{'+value+'}';
        const size=Number.parseFloat(mark.attrs.fontSize);
        if(size>=6 && size<=72)value='{\\fontsize{'+size+'}{'+Math.ceil(size*1.2)+'}\\selectfont '+value+'}';
        const family={'Georgia':'\\rmfamily','Arial':'\\sffamily','monospace':'\\ttfamily'}[mark.attrs.fontFamily];
        if(family)value='{'+family+' '+value+'}';
      }
    }
    return value;
  }
  switch (node.type) {
    case 'paragraph': return content + '\n\n';
    case 'heading': return '\\' + ['section','subsection','subsubsection'][Math.min(node.attrs.level,3)-1] + '{' + content + '}\n\n';
    case 'bulletList': return '\\begin{itemize}\n' + content + '\\end{itemize}\n\n';
    case 'orderedList': return '\\begin{enumerate}\n' + content + '\\end{enumerate}\n\n';
    case 'listItem': return '\\item ' + content.trim() + '\n';
    case 'math': return node.attrs.display ? '\\[' + node.attrs.latex + '\\]' : '$' + node.attrs.latex + '$';
    case 'raw': return node.attrs.source;
    case 'hardBreak': return '\\\\\n';
    case 'table': return '\\begin{tabular}{' + 'l'.repeat(node.content[0].content.length) + '}\n' + content + '\\end{tabular}\n\n';
    case 'tableRow': return node.content.map(cell => serialize(cell).trim()).join(' & ') + ' \\\\\n';
    default: return content;
  }
}
function inlineContent(text) {
  const parsed=parseInline(text);
  if(!parsed)return null;
  function convert(parts,marks=[]) {
    return parts.flatMap(part=>{
      if(typeof part==='string')return part?[{type:'text',text:part,marks}]:[];
      if(part.math!==undefined)return [{type:'math',attrs:{latex:part.math,display:false}}];
      const type={strong:'bold',em:'italic',u:'underline'}[part.tag];
      if(type)return convert(part.children,[...marks,{type}]);
      const attrs=part.points?{fontSize:part.points+'pt'}:
        part.attribute==='color'?{color:part.value}:
        part.attribute==='face'?{fontFamily:part.value}:null;
      if(!attrs)throw new Error('Unsupported inline formatting');
      return convert(part.children,[...marks,{type:'textStyle',attrs}]);
    });
  }
  try{return convert(parsed);}catch{return null;}
}
export function importBlock(block) {
  const text=block.trim();
  if(!text)return null;
  const heading=text.match(/^\\(section|subsection|subsubsection)\{([^{}]*)\}$/);
  if(heading)return {type:'heading',attrs:{level:['section','subsection','subsubsection'].indexOf(heading[1])+1},content:[{type:'text',text:heading[2]}]};
  const math=text.match(/^\\\[([\s\S]*?)\\\]$/) ?? text.match(/^\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}$/);
  if(math)return {type:'paragraph',content:[{type:'math',attrs:{latex:math[1],display:true}}]};
  const list=text.match(/^\\begin\{(itemize|enumerate)\}\n([\s\S]*?)\n\\end\{\1\}$/);
  if(list) {
    const items=list[2].split(/\n(?=\\item)/).map(item=>inlineContent(item.replace(/^\\item\s?/,'')));
    if(items.every(Boolean))return {type:list[1]==='itemize'?'bulletList':'orderedList',content:items.map(content=>({type:'listItem',content:[{type:'paragraph',content}]}))};
  }
  const table=parseTable(text);
  if(table && !table.trailing.length && table.rows.every(row=>!row.rules.length)) {
    return {type:'table',content:table.rows.map(row=>({type:'tableRow',content:row.cells.map(cell=>({type:'tableCell',content:[{type:'paragraph',content:cell.trim()?[{type:'text',text:cell.trim()}]:[]}]}))}))};
  }
  const content=inlineContent(text);
  if(content)return {type:'paragraph',content};
  return {type:'raw',attrs:{source:block}};
}
