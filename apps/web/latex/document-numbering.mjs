// Page numbering for book/report: frontmatter roman, mainmatter arabic restart.
export function toRoman(n) {
  if (n <= 0) return String(n);
  const table = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}
// displayPageNumber(index, {frontmatter, mainStart}) -> {text, value, odd}
// value = LaTeX \\value{page} (drives \\ifodd parity and E/O slots);
// text  = rendered \\thepage (roman in frontmatter, restarted arabic in mainmatter).
export function displayPageNumber(index, { frontmatter = false, mainStart = null } = {}) {
  const inMain = frontmatter && mainStart !== null && index >= mainStart;
  const value = inMain ? index - mainStart + 1 : index + 1;
  return { text: frontmatter && !inMain ? toRoman(value) : String(value), value, odd: value % 2 === 1 };
}
