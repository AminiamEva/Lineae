import { importBlock, importBlocks } from '../../latex/blocks.mjs';
export { importBlock, importBlocks };

const escape = text => text.replace(/[\u00A0\\{}%$&#_^~§¶•…–—‘’“”®™©]/g, char => ({
  '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '\u00A0': '~',
  '§': '\\textsection{}', '¶': '\\textparagraph{}', '•': '\\textbullet{}', '…': '\\ldots{}',
  '–': '\\textendash{}', '—': '\\textemdash{}', '‘': '\\textquoteleft{}', '’': '\\textquoteright{}',
  '“': '\\textquotedblleft{}', '”': '\\textquotedblright{}', '®': '\\textregistered{}',
  '™': '\\texttrademark{}', '©': '\\copyright{}',
}[char] ?? '\\' + char));

// MathLive placeholders are editing aids with no LaTeX meaning.
const withoutPlaceholders = latex => latex.replace(/\\placeholder\{[^{}]*\}/g, '');

export function serialize(node) {
  const content = (node.content ?? []).map(serialize).join('');
  if (node.type === 'text') {
    let value = escape(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = '\\textbf{' + value + '}';
      if (mark.type === 'italic') value = '\\textit{' + value + '}';
      if (mark.type === 'strike') value = '\\sout{' + value + '}';
      if (mark.type === 'code') value = '\\texttt{' + value + '}';
      if (mark.type === 'underline') value = '\\underline{' + value + '}';
      if (mark.type === 'superscript') value = '\\textsuperscript{' + value + '}';
      if (mark.type === 'subscript') value = '\\textsubscript{' + value + '}';
      if (mark.type === 'smallcaps') value = '\\textsc{' + value + '}';
      if (mark.type === 'boxed') value = '\\fbox{' + value + '}';
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
    case 'blockquote': return '\\begin{quote}\n' + content + '\\end{quote}\n\n';
    case 'horizontalRule': return '\\hrule\n\n';
    case 'bulletList': {
      const open = node.attrs.marker ? '\\begin{itemize}[label=' + node.attrs.marker + ']' : '\\begin{itemize}';
      return open + '\n' + content + '\\end{itemize}\n\n';
    }
    case 'orderedList': {
      const labels = { decimal: '\\arabic*', 'lower-alpha': '\\alph*', 'upper-alpha': '\\Alph*', 'lower-roman': '\\roman*', 'upper-roman': '\\Roman*', 'cjk-heavenly-stem': '\\chinese*' };
      const label = labels[node.attrs.labelStyle];
      const open = label ? '\\begin{enumerate}[label=' + label + ']' : '\\begin{enumerate}';
      return open + '\n' + content + '\\end{enumerate}\n\n';
    }
    case 'listItem': {
      const body = node.content.some(child => child.type === 'bulletList' || child.type === 'orderedList')
        ? content.replace(/\n\n(?=\\begin\{)/, '\n')
        : content;
      return '\\item ' + body.trim() + '\n';
    }
    case 'descriptionList': return '\\begin{description}\n' + content + '\\end{description}\n\n';
    case 'descriptionItem': return '\\item[' + node.attrs.term + '] ' + content.trim() + '\n';
    case 'mathBlock': {
      const latex = withoutPlaceholders(node.attrs.latex);
      return /^\\begin\{/.test(latex.trim()) ? latex + '\n\n' : '\\[' + latex + '\\]\n\n';
    }
    case 'math': {
      const latex = withoutPlaceholders(node.attrs.latex);
      return node.attrs.display ? '\\[' + latex + '\\]' : '$' + latex + '$';
    }
    case 'ref': return '\\ref{' + node.attrs.key + '}';
    case 'label': return '\\label{' + node.attrs.key + '}';
    case 'raw': return node.attrs.source.replace(/\n+$/, '') + '\n\n';
    case 'hardBreak': return '\\\\\n';
    case 'table': {
      const columns = node.attrs.columns || 'l'.repeat(node.content[0]?.content.length ?? 1);
      let body = '';
      node.content.forEach((row, index) => {
        if (node.attrs.booktabs && index === 0) body += '\\toprule\n';
        body += serialize(row);
        if (node.attrs.booktabs && index === 0 && node.content.length > 1) body += '\\midrule\n';
      });
      if (node.attrs.booktabs) body += '\\bottomrule\n';
      return '\\begin{tabular}{' + columns + '}\n' + body + '\\end{tabular}\n\n';
    }
    case 'tableRow': return node.content.map(cell => serialize(cell)).join(' & ') + ' \\\\\n';
    case 'tableCell':
    case 'tableHeader': {
      const value = (node.content ?? []).map(serialize).join('').trim();
      const span = node.attrs.colspan ?? 1;
      if (span > 1) {
        const align = node.attrs.align === 'center' ? 'c' : node.attrs.align === 'right' ? 'r' : 'l';
        return '\\multicolumn{' + span + '}{' + align + '}{' + value + '}';
      }
      return value;
    }
    default: return content;
  }
}
