// Lexical metadata only. Never expand commands or change the input document.
import {sourceStructure, groupEnd} from '../../latex/source-structure.mjs';
import {resolveMetadata} from '../project/dependencies.mjs';
import {dependencyRanges} from '../project/reference-paths.mjs';

const engines = new Set(['xelatex', 'lualatex']);
const primitives = new Map([
  ...['XeTeXversion','XeTeXrevision','XeTeXinterchartokenstate','XeTeXinterchartoks',
    'XeTeXcharclass','XeTeXglyph','XeTeXglyphindex','XeTeXfontname','XeTeXlinebreaklocale',
    'XeTeXlinebreakskip','XeTeXlinebreakpenalty','XeTeXinputencoding','XeTeXdefaultencoding']
    .map(name => [name,'xelatex']),
  ...['directlua','latelua','luafunction','luabytecode','luatexversion','luatexrevision',
    'luaescapestring'].map(name => [name,'lualatex']),
]);
const packages = new Map([
  ['xeCJK','xelatex'], ['xeCJKfntef','xelatex'], ['luatexja','lualatex'],
  ['luatexja-fontspec','lualatex'], ['luatexja-preset','lualatex'],
]);
const definitions = new Set(['\\def','\\gdef','\\edef','\\xdef']);

// Read a literal braced argument after optional package options and TeX trivia.
function argument(text, offset) {
  const trivia = /(?:\s+|%[^\r\n]*)*/y;
  trivia.lastIndex = offset;
  trivia.exec(text);
  let start = trivia.lastIndex;
  if (text[start] === '[') {
    const optionEnd = groupEnd(text,start);
    if (optionEnd < 0) return null;
    trivia.lastIndex = optionEnd;
    trivia.exec(text);
    start = trivia.lastIndex;
  }
  if (text[start] !== '{') return null;
  const end = groupEnd(text,start);
  if (end < 0) return null;
  const value = text.slice(start+1,end-1).replace(/%[^\r\n]*(?:\r\n?|\n|$)/g,'');
  return /[{}\\#]/.test(value) ? null : {value,end};
}

function scan({path, text}) {
  const evidence = [], includes = [];
  const lines = text.split(/\r\n?|\n/);
  let line = 1, lineStart = 0;
  // Editor directives are accepted only in the initial blank/comment header.
  for (const [i, value] of lines.entries()) {
    if (!/^\s*(?:%|$)/.test(value)) break;
    const magic = /^(\s*)%\s*!\s*TeX\s+(?:TS-)?program\s*=\s*(xelatex|lualatex)\s*$/i.exec(value);
    if (magic) evidence.push({kind:'magic',engine:magic[2].toLowerCase(),file:path,
      line:i+1,column:magic[1].length+1,command:value.trim()});
  }
  let groups = 0, condition = 0, skipTo = 0, defining = false, skipOperand = false;
  for (const token of sourceStructure(text)) {
    const {value,index,end,kind} = token;
    if (index < skipTo) continue;
    if (kind === 'group') {
      if (value === '{') { groups++; defining = false; }
      else groups--;
      continue;
    }
    if (!condition && kind === 'end' && value === '\\end{document}') break;
    if (groups || kind !== 'command') continue;
    if (skipOperand) {skipOperand = false; continue;}
    if (definitions.has(value)) {defining = true; continue;}
    if (defining) continue;
    if (value === '\\let') {
      const alias = /\s*\\(?:[A-Za-z@]+|[^\s])\s*=?\s*(?:\\[A-Za-z@]+|\\[\s\S]|[^\s])/y;
      alias.lastIndex = end;
      if (alias.test(text)) skipTo = alias.lastIndex;
      continue;
    }
    if (value === '\\newif') {skipOperand = true; continue;}
    if (/^\\if/.test(value) && value !== '\\ifthenelse') {
      condition++;
      if (value === '\\ifdefined') skipOperand = true;
      continue;
    }
    if (value === '\\fi') {condition = Math.max(0,condition-1); continue;}
    if (condition) continue;
    if (value === '\\endinput') break;
    const command = value.slice(1);
    // Advance source coordinates monotonically, including CR-only legacy files.
    while (index >= lineStart + lines[line-1].length + 1 && line < lines.length) {
      lineStart += lines[line-1].length;
      lineStart += text.startsWith('\r\n',lineStart) ? 2 : 1;
      line++;
    }
    const record = (engine,detail) => evidence.push({kind:'dependency',engine,file:path,line,
      column:index-lineStart+1,command:value,detail});
    if (primitives.has(command)) record(primitives.get(command),command);
    if (!['usepackage','RequirePackage','input','include'].includes(command)) continue;
    const arg = argument(text,end);
    if (!arg) continue;
    skipTo = arg.end;
    if (command === 'input' || command === 'include') {
      for (const dep of dependencyRanges(command,arg.value,end,index)) {
        if (dep.status === 'literal') includes.push(dep);
      }
    } else {
      for (const name of arg.value.split(',').map(part => part.trim())) {
        if (packages.has(name)) record(packages.get(name),name);
      }
    }
  }
  return {evidence,includes};
}

// source: string (main.tex), or {path,text}. projectSources: project-root paths,
// with the same literal include/input spelling rules as the project metadata.
export function resolveEngine({explicitChoice='auto', source, projectSources=[], globalDefault='lualatex'}) {
  if (explicitChoice !== 'auto' && !engines.has(explicitChoice)) throw new TypeError('Unknown explicit engine selection');
  if (!engines.has(globalDefault)) throw new TypeError('Unknown default engine');
  const root = typeof source === 'string' ? {path:'main.tex',text:source} : source;
  const files = new Map();
  for (const file of [root,...projectSources]) {
    if (!file || typeof file.text !== 'string' || !file.path) throw new TypeError('Expected a project path and source text');
    if (files.has(file.path)) throw new TypeError('Duplicate project source: '+file.path);
    files.set(file.path,{...file,id:file.path});
  }
  const visited = new Set(), queue = [root], evidence = [];
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file.path)) continue;
    visited.add(file.path);
    const result = scan(file);
    evidence.push(...result.evidence);
    const edges = resolveMetadata(files,[[file.path,{dependencies:result.includes}]]);
    for (const edge of edges) {
      if (edge.status === 'resolved') queue.push(files.get(edge.targetId));
    }
  }
  evidence.sort((a,b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line-b.line || a.column-b.column);
  const magic = evidence.filter(e => e.kind === 'magic');
  const mainMagic = magic.filter(e => e.file === root.path);
  const deciding = mainMagic.length ? mainMagic : magic.length ? magic : evidence;
  let resolvedEngine = explicitChoice, reason = 'explicit';
  if (explicitChoice === 'auto') {
    const candidates = new Set(deciding.map(e => e.engine));
    resolvedEngine = candidates.size > 1 ? null : deciding[0]?.engine ?? globalDefault;
    reason = resolvedEngine === null ? 'conflict' : deciding[0]?.kind ?? 'default';
  }
  const diagnostics = evidence.filter(e => !resolvedEngine || e.engine !== resolvedEngine)
    .map(e => ({...e, code:resolvedEngine ? 'incompatible-engine' : 'engine-conflict',
      message:resolvedEngine ? `${e.detail ?? e.command} requires ${e.engine}; selected ${resolvedEngine}`
        : `Conflicting engine evidence for ${e.engine}`}));
  return {requestedChoice:explicitChoice,resolvedEngine,reason,evidence,diagnostics};
}
