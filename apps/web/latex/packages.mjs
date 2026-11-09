// Each rule describes a feature emitted by the editor or recognized in source.
// Dependencies are added only when that feature appears in the document body.
const dependencies = [
  { name: 'amsmath', pattern: /\\(?:begin\{(?:align\*?|gather\*?|multline\*?|equation\*|split|aligned|cases|[pbBvV]?matrix)\}|(?:dfrac|tfrac|text|operatorname)\b)/ },
  { name: 'xcolor', pattern: /\\(?:textcolor|colorbox|definecolor)\b/ },
  { name: 'booktabs', pattern: /\\(?:toprule|midrule|bottomrule|cmidrule)\b/ },
  { name: 'graphicx', pattern: /\\includegraphics\b/ },
  { name: 'hyperref', pattern: /\\(?:href|url|hyperref)\b/, satisfies: ['url'], onlyUrl: /\\(?:href|hyperref)\b/ },
  { name: 'fix-cm', pattern: /\\fontsize\s*\{[^{}]+\}\s*\{[^{}]+\}\s*\\selectfont\b/,
    satisfies: ['fontspec', 'lmodern'], beforeClass: true },
];

function withoutComments(source) {
  return source.replace(/\\[\\%]|%[^\r\n]*/g, match => match.startsWith('%') ? '' : match);
}

function declaredPackages(preamble) {
  const declarations = withoutComments(preamble).matchAll(
    /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g,
  );
  return new Set(Array.from(declarations).flatMap(match => match[1].split(',').map(name => name.trim())));
}

export function resolvePackages(preamble, body) {
  const existing = declaredPackages(preamble);
  const source = withoutComments(body);
  return dependencies.filter(rule => {
    if (existing.has(rule.name) || !rule.pattern.test(source)) return false;
    const alternative = rule.satisfies?.some(name => existing.has(name));
    return !alternative || Boolean(rule.onlyUrl?.test(source));
  });
}

export function exportDocument({ start, end, eol }, body) {
  let preamble = start;
  for (const { name, beforeClass } of resolvePackages(start, body)) {
    if (beforeClass) {
      preamble = preamble.replace(/^([ \t]*\\documentclass)/m, '\\RequirePackage{' + name + '}' + eol + '$1');
    } else {
      preamble = preamble.replace(/^\\begin\{document\}/m, '\\usepackage{' + name + '}' + eol + '\\begin{document}');
    }
  }
  const separator = body && !body.endsWith('\n') ? eol : '';
  return preamble + body + separator + end;
}
