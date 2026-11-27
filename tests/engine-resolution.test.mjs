import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolveEngine} from '../apps/web/src/typesetting/engine-resolution.mjs';

const tex = String.raw;
const lua = 'lualatex', xe = 'xelatex';
const input = tex`\input{chapters/one}`;
const children = Object.freeze([
  Object.freeze({path:'chapters/one.tex', text:tex`\input{two}`}),
  Object.freeze({path:'two.tex', text:tex`\RequirePackage{xeCJK}`}),
  Object.freeze({path:'unrelated.tex', text:tex`\directlua{independent()}`}),
]);
for (const [label,source] of [
  ['article',tex`\documentclass{article}`], ['ctex',tex`\documentclass{ctexart}`],
  ['fontspec',tex`\usepackage{fontspec}`], ['unicode-math',tex`\usepackage{unicode-math}`],
]) for (const globalDefault of [undefined,lua,xe]) {
  test(label+' follows default '+globalDefault,()=>{
    const r=resolveEngine({source,globalDefault});
    assert.deepEqual([r.requestedChoice,r.resolvedEngine,r.reason,r.diagnostics],['auto',globalDefault??lua,'default',[]]);
  });
}
for (const [source,engine,command] of [
  [tex`\usepackage[quiet]{fontspec,xeCJK}`,xe,'\\usepackage'],
  [tex`\XeTeXinterchartokenstate=1`,xe,'\\XeTeXinterchartokenstate'],
  [tex`\RequirePackage{luatexja-fontspec}`,lua,'\\RequirePackage'],
  [tex`\directlua{print(1)}`,lua,'\\directlua'],
]) test('exclusive evidence '+source,()=>{
  const r=resolveEngine({source:'% comment\r\n  '+source});
  assert.equal(r.reason,'dependency'); assert.equal(r.resolvedEngine,engine);
  assert.deepEqual([r.evidence[0].file,r.evidence[0].line,r.evidence[0].column,r.evidence[0].command],['main.tex',2,3,command]);
});
test('priority retains main magic and reports opposing dependencies',()=>{
  const source='% !TeX program = lualatex\r\n'+input;
  const r=resolveEngine({source,projectSources:children});
  assert.equal(r.reason,'magic'); assert.equal(r.resolvedEngine,lua);
  assert.deepEqual(r.diagnostics.map(d=>[d.file,d.line,d.command]),[['two.tex',1,'\\RequirePackage']]);
  const explicit=resolveEngine({source,projectSources:children,explicitChoice:xe});
  assert.equal(explicit.reason,'explicit'); assert.equal(explicit.resolvedEngine,xe);
  assert.equal(explicit.diagnostics[0].line,1);assert.equal(explicit.diagnostics[0].file,'main.tex');
});
test('choice switches keep source bytes and graph intact',()=>{
  const source=Object.freeze({path:'paper.tex',text:'% 标记\r\n'+input+'\n'});
  const digest=()=>createHash('sha256').update(source.text).update(JSON.stringify(children)).digest('hex');
  const before=digest();
  for(const [choice,engine,reason,n] of [['auto',xe,'dependency',0],[xe,xe,'explicit',0],[lua,lua,'explicit',1]]){
    const r=resolveEngine({source,projectSources:children,explicitChoice:choice});
    assert.deepEqual([r.requestedChoice,r.resolvedEngine,r.reason,r.diagnostics.length],[choice,engine,reason,n]);
    if(n) assert.deepEqual([r.diagnostics[0].file,r.diagnostics[0].command],['two.tex','\\RequirePackage']);
  }
  assert.equal(digest(),before);
});
test('unresolved conflict includes both exact locations',()=>{
  const r=resolveEngine({source:'\\directlua{}\n'+input,projectSources:children});
  assert.equal(r.resolvedEngine,null);assert.equal(r.reason,'conflict');
  assert.deepEqual(r.diagnostics.map(d=>[d.file,d.line]),[['main.tex',1],['two.tex',1]]);
});
test('root magic outranks disagreeing child declarations independent of traversal order',()=>{
  const source='% !TEX program = xelatex\n\\input{b}\\include{a}';
  const a={path:'a.tex',text:'% !TEX program = lualatex\n\\input{main}'}, b={path:'b.tex',text:'% !TEX program = xelatex'};
  const r=resolveEngine({source,projectSources:[a,b]});
  assert.deepEqual(r,resolveEngine({source,projectSources:[b,a]}));
  assert.equal(r.resolvedEngine,xe);assert.deepEqual(r.diagnostics.map(d=>d.file),['a.tex']);
  assert.equal(resolveEngine({source:source.slice(source.indexOf('\n')),projectSources:[a,b]}).reason,'conflict');
});
test('escaped percent, comments, literal environments and macro bodies',()=>{
  const source=tex`% ordinary \directlua
\verb|\directlua{}| \verb*+\XeTeXversion+
\begin{verbatim}
% !TeX program = lualatex
\directlua{}
\end{verbatim}
\newcommand{\sample}{\directlua{}}
\% still active \usepackage{xeCJK} % \directlua
`;
  const r=resolveEngine({source});assert.equal(r.resolvedEngine,xe);
  assert.deepEqual(r.evidence.map(e=>e.line),[8]);
});
test('conditional commands and includes are not unconditional requirements',()=>{
  const source=tex`\ifXeTeX\usepackage{xeCJK}\else\ifLuaTeX\directlua{}\fi\fi
\ifdefined\XeTeXversion\input{two}\fi
\usepackage{fontspec}`;
  const r=resolveEngine({source,projectSources:children});assert.equal(r.reason,'default');assert.deepEqual(r.evidence,[]);
});
test('nonexecuted aliases, definition names, and text after end are ignored',()=>{
  const r=resolveEngine({source:tex`\newif\ifexample
\let\alias = \directlua
\def\another#1{\XeTeXversion}
\begin{document}hello\end{document}
\usepackage{xeCJK}`});
  assert.deepEqual(r.evidence,[]);assert.equal(r.reason,'default');
});
test('both conflicting magic and package survive an explicit choice',()=>{
  const r=resolveEngine({source:'% !TEX TS-program = xelatex\r\\RequirePackage{xeCJK}',explicitChoice:lua});
  assert.deepEqual(r.diagnostics.map(d=>[d.line,d.column,d.engine]),[[1,1,xe],[2,1,xe]]);
});
test('package options may contain balanced groups and nested brackets',()=>{
  const r=resolveEngine({source:tex`\usepackage[SomeSetting={choice[a]}, % no evidence: \directlua
 Other=1]{fontspec, xeCJK}`});
  assert.equal(r.resolvedEngine,xe);assert.deepEqual(r.evidence.map(d=>d.detail),['xeCJK']);
});

test('etoolbox argument tests end before an unconditional package',()=>{
 const text=['\\documentclass{article}','\\usepackage{etoolbox}','\\newif\\ifdraft',
  '\\ifdraft\\ifXeTeX\\directlua{}\\else\\XeTeXversion\\fi\\fi',
  '\\ifstrequal{a}{b}{\\directlua{}}{}','  \\usepackage{xeCJK}',
  '\\begin{document}\\verb|\\directlua| % \\directlua','\\end{document}'].join('\r\n');
 const source={path:'legacy.tex',text};
 assert.equal(resolveEngine({source}).resolvedEngine,'xelatex');
 const forced=resolveEngine({source,explicitChoice:'lualatex'});
 assert.equal(forced.resolvedEngine,'lualatex');
 assert.deepEqual(forced.diagnostics.map(d=>[d.file,d.line,d.column,d.command,d.detail]),[['legacy.tex',6,3,'\\usepackage','xeCJK']]);
});
