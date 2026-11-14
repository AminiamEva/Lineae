export const environments = ['document','itemize','enumerate','figure','table','equation','align','cases','matrix','center','abstract','theorem','proof'];

export function environmentSnippet(name, selected = '') {
  const inside = selected || '${1}';
  if (name === 'figure') return '\\begin{figure}[htbp]\n\t\\centering\n\t' + inside + '\n\t\\caption{${2}}\n\t\\label{fig:${3}}\n\\end{figure}';
  if (name === 'table') return '\\begin{table}[htbp]\n\t\\centering\n\t\\caption{${1}}\n\t\\label{tab:${2}}\n\t\\begin{tabular}{cc}\n\t\t' + (selected || 'A & B') + ' \\\\\n\t\tC & D\n\t\\end{tabular}\n\\end{table}';
  return '\\begin{' + name + '}\n\t' + inside + '\n\\end{' + name + '}';
}

export const commandSnippets = {
  section: ['\\section{${1}}', 'Section heading'],
  subsection: ['\\subsection{${1}}', 'Subsection heading'],
  subsubsection: ['\\subsubsection{${1}}', 'Subsubsection heading'],
  begin: ['\\begin{${1:environment}}\n\t${2}\n\\end{${1:environment}}', 'Paired environment'],
  frac: ['\\frac{${1}}{${2}}', 'Fraction'], sqrt: ['\\sqrt{${1}}', 'Square root'],
  sum: ['\\sum', 'Summation'], int: ['\\int', 'Integral'],
  label: ['\\label{${1}}', 'Define a label'], ref: ['\\ref{${1}}', 'Reference a label'],
  eqref: ['\\eqref{${1}}', 'Equation reference'], cite: ['\\cite{${1}}', 'Citation key'],
  textbf: ['\\textbf{${1}}', 'Bold text'], textit: ['\\textit{${1}}', 'Italic text'],
  emph: ['\\emph{${1}}', 'Emphasis'], item: ['\\item ${1}', 'List item'],
  includegraphics: ['\\includegraphics[width=\\linewidth]{${1}}', 'Include an image'],
  caption: ['\\caption{${1}}', 'Figure or table caption'],
  footnote: ['\\footnote{${1}}', 'Footnote'],
  usepackage: ['\\usepackage{${1}}', 'Load a package'],
  newcommand: ['\\newcommand{\\${1:name}}{${2}}', 'Define a macro'],
};

// Keys are stable original toolbar labels, never translated display strings.
export const toolbarSnippets = {
  B: '\\textbf{${1}}', I: '\\textit{${1}}', U: '\\underline{${1}}',
  S: '\\sout{${1}}', 'x²': '\\textsuperscript{${1}}', 'x₂': '\\textsubscript{${1}}',
  sc: '\\textsc{${1}}', box: '\\fbox{${1}}',
  '$': '$${1}$', '$$': '$$\n\t${1}\n$$',
  label: '\\label{${1}}', ref: '\\ref{${1}}', refs: '\\ref{${1}}',
  eqref: '\\eqref{${1}}', cite: '\\cite{${1}}', fn: '\\footnote{${1}}',
  '\\LaTeX': '\\LaTeX{}', '\\TeX': '\\TeX{}',
  desc: '\\begin{description}\n\t\\item[${1}] ${2}\n\\end{description}',
};
for (const name of environments) toolbarSnippets[name] = environmentSnippet(name);
for (const name of ['prod','iint','iiint','oint','oiint']) toolbarSnippets['\\'+name] = '\\'+name+' ${1}';
toolbarSnippets['ⁿ√'] = '\\sqrt[${1}]{${2}}';
