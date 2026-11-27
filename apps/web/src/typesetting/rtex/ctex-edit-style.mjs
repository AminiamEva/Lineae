// Metrics selected by ctex-scheme-chinese.def and ctex-c5size.clo for an
// ordinary article. Read the preamble actually sent to Lua (it may include
// the automatically inserted ctex package even for an initially empty file).
export function ctexEditStyle(preamble) {
  const source=preamble.replace(/(?<!\\)%[^\r\n]*/g,'');
  const article=/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{article\}/.exec(source);
  if(!article||!/\\usepackage\s*\{ctex\}/.test(source)||
      /\\(?:fontsize|linespread|baselinestretch|parindent|ctexset|setCJKmainfont|setmainjfont)\b/.test(source)||
      /\b(?:scheme|zihao|autoindent|linespread)\s*=/.test(source))return null;
  if(!/\\PassOptionsToPackage\{fontset=fandol\}\{ctex\}/.test(source))return null;
  const size=article[1]?.match(/(?:^|,)\s*(10|11|12)pt\s*(?:,|$)/)?.[1];
  // size11.clo uses 10.95 TeX points for normalsize. With no size
  // option ctex chooses 10.5 big points and a 1.2 baseline multiplier.
  const texPt=72/72.27;
  const font=size?({'10':10,'11':10.95,'12':12}[size]*texPt):10.5;
  const baseline=size?({'10':12,'11':13.6,'12':14.5}[size]*texPt):12.6;
  return {font:font+'pt',line:baseline*1.3+'pt',indent:2*font+'pt'};
}
