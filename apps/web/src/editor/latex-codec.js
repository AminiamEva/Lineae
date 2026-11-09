import { importBlock, importBlocks } from '../../latex/blocks.mjs';
export { importBlock, importBlocks };

const escape = text => text.replace(/[\u00A0\\{}%$&#_^~]/g, char => ({
  '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '\u00A0': '~',
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
    case 'heading': {
      const name = ['section','subsection','subsubsection'][Math.min(node.attrs.level,3)-1];
      const short = node.attrs.shortTitle ? '[' + node.attrs.shortTitle + ']' : '';
      const label = node.attrs.label ? '\\label{' + node.attrs.label + '}' : '';
      return '\\' + name + (node.attrs.numbered === false ? '*' : '') + short + '{' + content + '}' + label + '\n\n';
    }
    case 'tableOfContents': return '\\tableofcontents\n\n';
    case 'bulletList': return '\\begin{itemize}\n' + content + '\\end{itemize}\n\n';
    case 'orderedList': return '\\begin{enumerate}\n' + content + '\\end{enumerate}\n\n';
    case 'listItem': return '\\item ' + content.trim() + '\n';
    case 'mathBlock': return '\\[' + node.attrs.latex + '\\]\n\n';
    case 'math': return node.attrs.display ? '\\[' + node.attrs.latex + '\\]' : '$' + node.attrs.latex + '$';
    case 'ref': return '\\ref{' + node.attrs.key + '}';
    case 'raw': return node.attrs.source;
    case 'hardBreak': return '\\\\\n';
    case 'table': return '\\begin{tabular}{' + 'l'.repeat(node.content[0].content.length) + '}\n' + content + '\\end{tabular}\n\n';
    case 'tableRow': return node.content.map(cell => serialize(cell).trim()).join(' & ') + ' \\\\\n';
    default: return content;
  }
}
