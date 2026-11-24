import {ctexIntercharStretch, usesCtex} from './paragraph-parameters.mjs';
import {fontspecDeclarations} from './font-measurement.mjs';
import {jfmTables} from './lua-jfm-data.mjs';
import {sourceStructure} from '../../latex/source-structure.mjs';

const classes = new Map(Object.entries(jfmTables).map(([name, table]) => [
  name, new Map(table.members.flatMap((group,id) => group.map(char => [char,id]))),
]));
const fandol = /^FandolSong(?:-Regular)?(?:\.otf)?$/i;
function assess(preamble, cssFamily) {
  const preview = reason => ({supported:false, metric:null, reason});
  const family = cssFamily.split(',')[0].trim().replace(/^['"]|['"]$/g,'');
  if (!fandol.test(family)) return preview('unmeasured-cjk-font');
  const declarations = fontspecDeclarations(preamble, 'lualatex');
  const declaration = declarations.filter(d => ['setCJKmainfont','setmainjfont'].includes(d.command)).at(-1);
  if (declaration && !fandol.test(declaration.name)) return preview('unmeasured-cjk-font');
  const commands = [...sourceStructure(preamble)].filter(t => t.topLevel && t.kind === 'command');
  const ctex = usesCtex(preamble, commands);
  if (commands.some(t => ['\\ltjsetparameter','\\ltjglobalsetparameter','\\ctexset'].includes(t.value))) {
    return preview('custom-jfm-parameters');
  }
  // Accept literal options measured in the probe. Unknown shaping, scale and
  // alternate faces remain previewable using the browser's normal inline layout.
  const options = declaration?.options.split(',').map(v => v.trim()).filter(Boolean) ?? [];
  const known = /^(?:JFM\s*=\s*(?:quanjiao|zh_CN\/quanjiao)|Scale\s*=\s*1(?:\.0+)?|BoldFont\s*=\s*FandolSong-Bold(?:\.otf)?)$/i;
  if (options.some(option => !known.test(option))) return preview('unmeasured-jfm-options');
  if (!ctex && !options.some(option => /^JFM\s*=\s*quanjiao$/i.test(option))) return preview('unmeasured-jfm');
  return {supported:true, metric:ctex ? 'ctex-zh-cn' : 'article-quanjiao', reason:'measured-fandol'};
}
function classOf(metric, text) {
  const map = classes.get(metric);
  if (!map || !text) return undefined;
  if (/^\p{Script=Han}$/u.test(text)) return map.get('中');
  if (/^[a-z0-9]+$/i.test(text)) return map.get('A');
  return map.get(text);
}
function japanese(text) {
  return /^\p{Script=Han}$/u.test(text) || (classes.get('article-quanjiao').has(text) && text !== '$x$' && text !== 'A');
}
function box(metric, text, em) {
  if (!japanese(text)) return null;
  const values = jfmTables[metric]?.boxes[classOf(metric,text)];
  return values ? {width:values[0]*em, offset:values[1]*em} : null;
}
function boundary(metric, left, right, em, lineWidth) {
  if (!japanese(left) && !japanese(right)) return null;
  const table = jfmTables[metric];
  const index = table?.matrix[classOf(metric,left)]?.[classOf(metric,right)];
  if (index === undefined) return null;
  const [width,stretch,shrink,cost] = table.boundaries[index];
  // ctexart's default linestretch is one ideograph distributed over a
  // column (ctex_update_stretch_auxiii), so kanjiskip changes with linewidth.
  const kanji = classes.get(metric).get('中');
  const kanjiPair = table.matrix[kanji][kanji];
  if (metric === 'ctex-zh-cn' && index === kanjiPair && Number.isFinite(lineWidth)) {
    return {width:0, stretch:ctexIntercharStretch(lineWidth, em), shrink:0, cost};
  }
  return {width:width*em, stretch:stretch*em, shrink:shrink*em, cost};
}
export const luaCjk = Object.freeze({family:'FandolSong', assess, box, boundary});
