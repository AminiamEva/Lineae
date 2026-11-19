import {richTableRow,wrapCell} from '../../latex/table-spans.mjs';
import { importBlock, importBlocks } from '../../latex/blocks.mjs';
import { listLabel, bulletLabel } from '../../latex/list-numbering.mjs';
import { textCommands } from '../../latex/inline.mjs';
import { serializeImage, serializeSubfigures } from '../../latex/images.mjs';
import { alignmentLabel, displayEnvironment } from '../../latex/math-environments.mjs';
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

let serializationClass = 'article';
export function setSerializationClass(name) { serializationClass = (name || 'article').toLowerCase(); }
export function serialize(node) {
  const content = (node.content ?? []).map(serialize).join('');
  if (node.type === 'text') {
    const command = node.marks?.find(mark => mark.type === 'textCommand')?.attrs?.name;
    const glyph=Object.hasOwn(textCommands,command) ? textCommands[command] : '';
    const count=glyph ? node.text.length/glyph.length : 0;
    let value = count && Number.isInteger(count) && glyph.repeat(count)===node.text
      ? ('\\' + command + '{}').repeat(count) : escape(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = '\\textbf{' + value + '}';
      if (mark.type === 'italic') value = '\\textit{' + value + '}';
      if (mark.type === 'strike') value = '\\sout{' + value + '}';
      if (mark.type === 'code') value = '\\texttt{' + value + '}';
      if (mark.type === 'underline') {
        const command={double:'uuline',wavy:'uwave'}[mark.attrs?.style]??'underline';
        value='\\'+command+'{'+value+'}';
      }
      if (mark.type === 'superscript') value = '\\textsuperscript{' + value + '}';
      if (mark.type === 'subscript') value = '\\textsubscript{' + value + '}';
      if (mark.type === 'smallcaps') value = '\\textsc{' + value + '}';
      if (mark.type === 'boxed') value = '\\fbox{' + value + '}';
      if (mark.type === 'circled') value = '\\textcircled{' + value + '}';
      if (mark.type === 'textStyle') {
        if (/^#[\da-f]{6}$/i.test(mark.attrs.color ?? '')) value='\\textcolor[HTML]{'+mark.attrs.color.slice(1)+'}{'+value+'}';
        if (/^#[\da-f]{6}$/i.test(mark.attrs.backgroundColor ?? '')) value='\\colorbox[HTML]{'+mark.attrs.backgroundColor.slice(1)+'}{'+value+'}';
        const size=Number.parseFloat(mark.attrs.fontSize);
        if(size>=6 && size<=72)value='{\\fontsize{'+size+'}{'+Math.ceil(size*1.2)+'}\\selectfont '+value+'}';
        const family={
          'Latin Modern Roman':'\\rmfamily','Georgia':'\\rmfamily','Times New Roman':'\\rmfamily',
          'Cambria':'\\rmfamily','Palatino Linotype':'\\rmfamily','SimSun':'\\rmfamily','Songti SC':'\\rmfamily',
          'Arial':'\\sffamily','Segoe UI':'\\sffamily','Microsoft YaHei':'\\sffamily',
          'Helvetica Neue':'\\sffamily','Verdana':'\\sffamily','Calibri':'\\sffamily',
          'Latin Modern Mono':'\\ttfamily','Consolas':'\\ttfamily','Courier New':'\\ttfamily','monospace':'\\ttfamily',
        }[mark.attrs.fontFamily];
        if(family)value='{'+family+' '+value+'}';
      }
    }
    return value;
  }
  switch (node.type) {
    case 'theoremBlock': return '\\begin{'+node.attrs.kind+'}'+(node.attrs.title?'['+node.attrs.title+']':'')+'\n'+content.trimEnd()+'\n\\end{'+node.attrs.kind+'}\n\n';
    case 'codeBlock': {
      const language=node.attrs?.language;
      if(language==='tikz') return (node.content??[]).map(child=>child.text??'').join('')+'\n\n';
      const option=/^[A-Za-z0-9+_-]+$/.test(language??'') ? '[language='+language+']' : '';
      return '\\begin{lstlisting}'+option+'\n'+(node.content??[]).map(child=>child.text??'').join('')+'\n\\end{lstlisting}\n\n';
    }
    case 'documentImage': return serializeImage(node.attrs);
    case 'subfigures': return serializeSubfigures(node.attrs, node.content.toJSON());
    case 'paragraph': {
      let body=(node.attrs?.indent === false ? '\\noindent ' : node.attrs?.explicitIndent ? '\\indent ' : '') + content;
      const command={left:'raggedright',right:'raggedleft',center:'centering',justify:'justifying'}[node.attrs?.align];
      if (command) body='{\\'+command+' '+body+'\\par}';
      const lineSpacing=Number(node.attrs?.lineSpacing);
      if (lineSpacing && lineSpacing!==1) body='{\\linespread{'+lineSpacing+'}\\selectfont '+body+'\\par}';
      const spaceBefore=node.attrs?.spaceBefore, spaceAfter=node.attrs?.spaceAfter;
      if (spaceBefore || spaceAfter) body='{\\vspace*{'+(spaceBefore??'0pt')+'}'+body+'\\par\\vspace*{'+(spaceAfter??'0pt')+'}}';
      if (node.attrs?.shading) body='{\\colorbox{'+node.attrs.shading+'}{\\parbox{\\linewidth}{'+body+'}}}';
      if (node.attrs?.border) body='{\\fbox{\\parbox{\\linewidth}{'+body+'}}}';
      return body+'\n\n';
    }
    case 'heading': {
      const chaptered = serializationClass === 'book' || serializationClass === 'report';
      const names = chaptered ? ['chapter','section','subsection'] : ['section','subsection','subsubsection'];
      const name = node.attrs.command === 'chapter' ? 'chapter' : names[Math.min(Math.max(node.attrs.level,1),3)-1];
      const short = node.attrs.shortTitle ? '[' + node.attrs.shortTitle + ']' : '';
      const label = node.attrs.label ? '\\label{' + node.attrs.label + '}' : '';
      return '\\' + name + (node.attrs.numbered === false ? '*' : '') + short + '{' + content + '}' + label + '\n\n';
    }
    case 'appendixStart': return '\\appendix\n\n';
    case 'layoutCommand': return node.attrs.command + '\n\n';
    case 'lipsum': return '\\lipsum[' + (node.attrs.range || '1-7') + ']';
    case 'matterStart': return '\\' + (node.attrs.matter || 'main') + '\n\n';
    case 'tableOfContents': return '\\tableofcontents\n\n';
    case 'pageBreak': return '\\newpage\n\n';
    case 'multiColumn': return '\\begin{multicols}{' + (node.attrs.count ?? 2) + '}\n' + content + '\\end{multicols}\n\n';
    case 'blockquote': return '\\begin{quote}\n' + content + '\\end{quote}\n\n';
    case 'horizontalRule': return '\\hrule\n\n';
    case 'bulletList': {
      const marker = bulletLabel(node.attrs.marker);
      const open = marker ? '\\begin{itemize}[label=' + marker + ']' : '\\begin{itemize}';
      return open + '\n' + content + '\\end{itemize}\n\n';
    }
    case 'orderedList': {
      const label = listLabel(node.attrs.labelStyle);
      const options = [label && 'label=' + label, node.attrs.start > 1 && 'start=' + node.attrs.start].filter(Boolean);
      const open = '\\begin{enumerate}' + (options.length ? '['+options.join(',')+']' : '');
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
      const delimiter = node.attrs.delimiter;
      if (delimiter === '$$') return '$$' + latex + '$$\n\n';
      if (delimiter === 'equation' || delimiter === 'equation*') {
        const label = node.attrs.label ? '\\label{'+node.attrs.label+'}' : '';
        const body=label ? latex.trimEnd()+label+latex.slice(latex.trimEnd().length) : latex;
        return '\\begin{' + delimiter + '}' + body + '\\end{' + delimiter + '}\n\n';
      }
      return !delimiter && displayEnvironment(latex)
        ? alignmentLabel(latex,node.attrs.labelRow,node.attrs.label) + '\n\n' : '\\[' + latex + '\\]\n\n';
    }
    case 'math': {
      const latex = withoutPlaceholders(node.attrs.latex);
      const prefix=node.attrs.breakBefore?'\\newline\n':'';
      if (node.attrs.delimiter === '\\(') return prefix + '\\(' + latex + '\\)';
      return prefix + (node.attrs.display ? '\\[' + latex + '\\]' : '$' + latex + '$');
    }
    case 'ref': return (node.attrs.equation ? '\\eqref{' : '\\ref{') + node.attrs.key + '}';
    case 'cite': return '\\cite{' + node.attrs.key + '}';
    case 'footnote': return '\\footnote{' + node.attrs.text + '}';
    case 'label': return '\\label{' + node.attrs.key + '}';
    case 'raw': return node.attrs.source.replace(/\n+$/, '') + '\n\n';
    case 'hardBreak': return '\\\\\n';
    case 'table': {
      let columns = node.attrs.columns || 'l'.repeat(node.content[0]?.content.length ?? 1);
      const columnCount=(node.content[0]?.content??[]).reduce((total,cell)=>total+(cell.attrs.colspan??1),0)||1;
      const occupied=Array(columnCount).fill(0);
      const border = node.attrs.borderMode;
      columns = columns.replace(/\|/g,'');
      if (border === 'outer' || border === 'grid') columns='|'+columns;
      if (border === 'outer' || border === 'grid' || node.attrs.rightRule) columns=columns+'|';
      if (border === 'grid') columns=columns.replace(/([pmb]\{[^{}]*\}|[lcr])(?!\|)/g,'$1|').replace(/\|\|/g,'|');
      if (node.attrs.leftRule && !columns.startsWith('|')) columns='|'+columns;
      if (node.attrs.middleVerticalRule) columns=columns.replace(/([lcr])(?=[lcr])/g,'$1|');
      let body = '';
      const customRules = !border && (node.attrs.topRule || node.attrs.bottomRule || node.attrs.midRuleMode !== 'none');
      node.content.forEach((row, index) => {
        if (border === 'grid' || border === 'horizontal' || (border==='outer' && index===0)) body += '\\hline\n';
        if (!border && !customRules && node.attrs.booktabs && index === 0) body += '\\toprule\n';
        if (customRules && index === 0 && node.attrs.topRule) body += '\\toprule\n';
        body += richTableRow(row,occupied,serialize);
        const mid = node.attrs.midRuleMode;
        if (!border && !customRules && node.attrs.booktabs && index === 0 && node.content.length > 1) body += '\\midrule\n';
        if (customRules && index < node.content.length - 1 && (mid === 'all' || (mid === 'first' && index === 0))) body += '\\midrule\n';
      });
      if (border && border!=='none') body += '\\hline\n';
      if (!border && !customRules && node.attrs.booktabs) body += '\\bottomrule\n';
      if (customRules && node.attrs.bottomRule) body += '\\bottomrule\n';
      let tabular='\\begin{tabular}{' + columns + '}\n' + body + '\\end{tabular}';
      if (node.attrs.arrayStretch && Number(node.attrs.arrayStretch) !== 1) tabular='{\\renewcommand{\\arraystretch}{'+node.attrs.arrayStretch+'}\n'+tabular+'\n}';
      if (node.attrs.fontSize && /^(small|footnotesize|scriptsize)$/.test(node.attrs.fontSize)) tabular='{\\'+node.attrs.fontSize+' '+tabular+'}';
      else if (node.attrs.fontSize && /^\d+(?:\.\d+)?pt$/.test(node.attrs.fontSize)) {
        const points=Number.parseFloat(node.attrs.fontSize);
        tabular='{\\fontsize{'+node.attrs.fontSize+'}{'+(points*1.2).toFixed(1)+'pt}\\selectfont '+tabular+'}';
      }
      if (node.attrs.tableScale && Number(node.attrs.tableScale) !== 1) tabular='\\scalebox{'+node.attrs.tableScale+'}{'+tabular+'}';
      if (/^\d+(?:\.\d+)?pt$/.test(node.attrs.borderWidth??''))
        tabular='{\\setlength{\\arrayrulewidth}{'+node.attrs.borderWidth+'}\n'+tabular+'\n}';
      const hasCaption = node.attrs.captionEnabled || node.attrs.caption!=null;
      if (hasCaption || node.attrs.label || node.attrs.centered || node.attrs.placement)
        return '\\begin{table}'+(node.attrs.placement?'['+node.attrs.placement+']':'')+'\n'
          +(node.attrs.centered?'\\centering\n':'')
          +(hasCaption?'\\caption{'+(node.attrs.caption??'')+'}\n':'')
          +(node.attrs.label?'\\label{'+node.attrs.label+'}\n':'')
          +tabular+'\n\\end{table}\n\n';
      return tabular+'\n\n';
    }
    case 'tableRow': return node.content.map(cell => serialize(cell)).join(' & ') + ' \\\\\n';
    case 'tableCell':
    case 'tableHeader': {
      const value = (node.content ?? []).map(serialize).join('').trim();
      return wrapCell(value,node.attrs.colspan??1,node.attrs.rowspan??1,node.attrs.align);
    }
    default: return content;
  }
}
