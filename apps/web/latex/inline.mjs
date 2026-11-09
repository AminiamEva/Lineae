export const fontFamilies = { Georgia: '\\rmfamily', Arial: '\\sffamily', monospace: '\\ttfamily' };
export const fontSizes = { 1: '\\scriptsize', 2: '\\small', 3: '\\normalsize', 4: '\\large', 5: '\\Large', 6: '\\LARGE', 7: '\\Huge' };

export function parseInline(source, depth = 0) {
  if (depth > 40) return null;
  const nodes = [];
  let cursor = 0;
  while (cursor < source.length) {
    const rest = source.slice(cursor);
    const text = rest.match(/^[^\\{}%$&#_^~\r\n]+/);
    const math = rest.match(/^\$([^$\r\n]+)\$/) ?? rest.match(/^\\\(([^\r\n]+?)\\\)/);
    if (text || math) {
      nodes.push(text ? text[0] : { math: math[1], delimiters: math[0].startsWith('$') ? ['$', '$'] : ['\\(', '\\)'] });
      cursor += (text ?? math)[0].length;
      continue;
    }
    const emphasis = rest.match(/^\\(textbf|textit|underline)\{/);
    const color = rest.match(/^\\textcolor\[HTML\]\{([0-9a-f]{6})\}\{/i);
    const points = rest.match(/^\{\\fontsize\{(\d{1,2})\}\{\d{1,2}\}\\selectfont /);
    const group = rest.match(/^\{(\\[A-Za-z]+) /);
    const family = group && Object.keys(fontFamilies).find(key => fontFamilies[key] === group[1]);
    const size = group && Object.keys(fontSizes).find(key => fontSizes[key] === group[1]);
    if (!emphasis && !color && !family && !size && !points) return null;
    const start = (emphasis ?? color ?? points ?? group)[0].length;
    let balance = 1;
    let end = start;
    for (; end < rest.length && balance; end++) {
      if (rest[end] === '\\' && /[{}\\]/.test(rest[end + 1] ?? '')) {
        end++;
      } else if (rest[end] === '{') balance++;
      else if (rest[end] === '}') balance--;
    }
    if (balance) return null;
    const children = parseInline(rest.slice(start, end - 1), depth + 1);
    if (!children) return null;
    nodes.push({
      tag: { textbf: 'strong', textit: 'em', underline: 'u' }[emphasis?.[1]],
      points: points?.[1],
      attribute: color ? 'color' : family ? 'face' : size ? 'size' : null,
      value: color ? '#' + color[1] : family || size,
      children,
    });
    cursor += end;
  }
  return nodes;
}
