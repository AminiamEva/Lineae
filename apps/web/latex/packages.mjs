import { theoremNames } from './theorem.mjs';

// Each rule describes a feature emitted by the editor or recognized in source.
// Dependencies are added only when that feature appears in the document body.
const dependencies = [
  { name: 'ulem', pattern: /\\sout\b/ },
  { name: 'amsmath', pattern: /\\(?:begin\{(?:align|alignat|flalign|gather|multline|equation|split|aligned|alignedat|gathered|cases|[pbBvV]?(?:small)?matrix)\*?\}|(?:dfrac|tfrac|text|operatorname|eqref)\b)/ },
  { name: 'mathtools', pattern: /\\begin\{(?:[dr]cases|drcases|multlined|[pbBvV]smallmatrix)\*?\}/ },
  { name: 'xcolor', pattern: /\\(?:textcolor|colorbox|definecolor)\b/ },
  { name: 'booktabs', pattern: /\\(?:toprule|midrule|bottomrule|cmidrule)\b/ },
  { name: 'enumitem', pattern: /\\begin\{(?:itemize|enumerate)\}\[/ },
  { name: 'zhnumber', pattern: /\\chinese\b/ },
  { name: 'graphicx', pattern: /\\includegraphics\b/ },
  { name: 'amsthm', pattern: /\\begin\{proof\}/ },
  { name: 'listings', pattern: /\\begin\{lstlisting\}/ },
  { name: 'textcomp', pattern: /\\(?:textdegree|textcelsius|textmu|textohm|textcent|textyen|texteuro|textperthousand|textnumero)\b/ },
  { name: 'hyperref', pattern: /\\(?:href|url|hyperref)\b/, satisfies: ['url'], onlyUrl: /\\(?:href|hyperref)\b/ },
  { name: 'fix-cm', pattern: /\\fontsize\s*\{[^{}]+\}\s*\{[^{}]+\}\s*\\selectfont\b/,
    satisfies: ['fontspec', 'lmodern'], beforeClass: true },
];

function withoutComments(source) {
  return source.replace(/\\[\\%]|%[^\r\n]*/g, match => match.startsWith('%') ? '' : match);
}

export function hasTitleCommand(source) {
  return /\\maketitle\b/.test(withoutComments(source));
}

function declaredPackages(preamble) {
  const declarations = withoutComments(preamble).matchAll(
    /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g,
  );
  return new Set(Array.from(declarations).flatMap(match => match[1].split(',').map(name => name.trim())));
}

export function resolvePackages(preamble, body, { chineseTypesetting=false } = {}) {
  const existing = declaredPackages(preamble);
  const source = withoutComments(body);
  const required=dependencies.filter(rule => {
    if (existing.has(rule.name) || !rule.pattern.test(source)) return false;
    const alternative = rule.satisfies?.some(name => existing.has(name));
    return !alternative || Boolean(rule.onlyUrl?.test(source));
  });
  const cleanPreamble=withoutComments(preamble);
  const chineseClass=/\\documentclass\s*(?:\[[^\]]*\]\s*)?\{ctex(?:art|rep|book|beamer)\}/.test(cleanPreamble);
  if (chineseTypesetting && !chineseClass && !existing.has('ctex') && !existing.has('xeCJK') &&
      /\p{Script=Han}/u.test(cleanPreamble + source)) required.push({name:'ctex'});
  return required;
}

export function exportDocument({ start, end, eol }, body, options) {
  let preamble = start;
  for (const { name, beforeClass } of resolvePackages(start, body, options)) {
    if (beforeClass) {
      preamble = preamble.replace(/^([ \t]*\\documentclass)/m, '\\RequirePackage{' + name + '}' + eol + '$1');
    } else {
      preamble = preamble.replace(/^\\begin\{document\}/m, '\\usepackage{' + name + '}' + eol + '\\begin{document}');
    }
  }
  for(const [kind,title] of Object.entries(theoremNames)) {
    if(kind==='proof' || !body.includes('\\begin{'+kind+'}') || new RegExp('\\\\newtheorem\\*?\\s*\\{'+kind+'\\}').test(withoutComments(start)))continue;
    const declaration='\\ifcsname '+kind+'\\endcsname\\else\\newtheorem{'+kind+'}{'+title+'}\\fi';
    preamble=preamble.replace(/^\\begin\{document\}/m,()=>declaration+eol+'\\begin{document}');
  }
  const metadata = withoutComments(start);
  if (/\\title\s*\{/.test(metadata) && !hasTitleCommand(body)) {
    if (!/\\date\s*\{/.test(metadata)) {
      preamble = preamble.replace(/^\\begin\{document\}/m, () => '\\date{}' + eol + '\\begin{document}');
    }
    body = '\\maketitle' + eol + eol + body;
  }
  const separator = body && !body.endsWith('\n') ? eol : '';
  return preamble + body + separator + end;
}
