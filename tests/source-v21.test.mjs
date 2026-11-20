import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {EditorState} from '@codemirror/state';
import {history, undo, redo, isolateHistory} from '@codemirror/commands';
import {indentLatex} from '../apps/web/src/editor/latex-indent.mjs';
import {clampFont, wheelFontStep} from '../apps/web/src/editor/editor-font.mjs';
import {sourceEndings} from '../apps/web/src/editor/source-eol.mjs';
import {sourceEolExtensions, sourceWithEndings} from '../apps/web/src/editor/source-eol-state.js';

test('font defaults, migration, finite values and integer bounds', () => {
  for (const [input, expected] of [[null,16],['',16],['garbage',16],[Infinity,16],[14,14],[10,11],[99,32],[17.3,17]]) assert.equal(clampFont(input),expected);
});
test('wheel ticks, small trackpad deltas, burst cap, direction and idle reset', () => {
  const step = wheelFontStep();
  assert.equal(step({deltaY:-120,deltaMode:0},0),1);
  assert.equal(step({deltaY:-5000,deltaMode:0},1),0);
  assert.equal(step({deltaY:120,deltaMode:0},70),-1);
  for (let n=0;n<7;n++) assert.equal(step({deltaY:-5,deltaMode:0},300+n*10),0);
  assert.equal(step({deltaY:-5,deltaMode:0},370),1);
  assert.equal(step({deltaY:3,deltaMode:1},450),-1);
  assert.equal(step({deltaY:-1,deltaMode:2},520),1);
  assert.equal(step({deltaY:NaN,deltaMode:0},600),0);
});

for (const env of ['document','itemize','enumerate','equation','align','figure','table','center','theorem','proof','my_custom-env']) {
  test('indent nested environment '+env, () => {
    const body = env==='align' ? 'x &= y \\\\ \nz &= 2' : '\\item 中文 $x$';
    const source = `\\begin{document}\n\\begin{${env}}\n${body}\n\\end{${env}}\n\\end{document}`;
    const expected = `\\begin{document}\n  \\begin{${env}}\n${body.split('\n').map(s=>'    '+s).join('\n')}\n  \\end{${env}}\n\\end{document}`;
    assert.equal(indentLatex(source).text,expected);
    assert.deepEqual(indentLatex(expected).changes,[]);
  });
}
for (const env of ['verbatim','Verbatim','lstlisting','minted','alltt']) {
  test('literal body protected: '+env, () => {
    const body = '\t  x % comment\r\n\\begin{fake}\n }  \\end{oops}\r\n\n';
    const source = `\\begin{document}\n\\begin{${env}}${env==='minted'?'{python}':''}\n${body}\\end{${env}}\n\\end{document}\r\n`;
    const result = indentLatex(source).text;
    assert.ok(result.includes('\n'+body));
    assert.equal(result,source.replace(`\\begin{${env}}`,'  '+`\\begin{${env}}`).replace(`\\end{${env}}`,'  '+`\\end{${env}}`));
    assert.equal(indentLatex(result).text,result);
  });
}
test('comments, comment-joined lines, inline verb, groups, macros and column specs', () => {
  const source = String.raw`\newcommand{\foo}[1]{
   \begin{fake}#1\end{fake}
 }
\begin{document}
% \end{document}
unindented-after-comment
\verb|\begin{fake}%| literal
\foo{
   keep this argument
 }
\begin{tabular}{p{2cm}cr}
a & b & c \\
\end{tabular}
\end{document}`;
  const result = indentLatex(source).text;
  assert.ok(result.includes('   \\begin{fake}#1\\end{fake}\n }'));
  assert.ok(result.includes('\nunindented-after-comment\n'));
  assert.ok(result.includes('   keep this argument\n }'));
  assert.ok(result.includes('    a & b & c \\\\'));
  assert.equal(indentLatex(result).text,result);
});
for (const source of ['\\begin{x}\nhi\n\\end{y}', '\\begin{document}\n{a', '\\catcode`x=1\nhi', '\\iffalse\n\\begin{x}\n\\fi', '\\begin{\\foo}\nx', '\\verb|missing', '\\newcommand{\\foo}\n[1]{x}']) {
  test('uncertain input retained: '+source, () => assert.equal(indentLatex(source).text,source));
}
for (const eols of [['\n'],['\r\n'],['\n','\r\n'],['\r','\r\n','\n']]) {
  for (const final of [false,true]) test('EOL and history '+JSON.stringify(eols)+' final='+final, () => {
    const lines = ['\\begin{document}','\\begin{equation}','x = 1','\\end{equation}','','  ','\\end{document}'];
    const source = lines.map((s,i)=>s+(i<lines.length-1||final?eols[i%eols.length]:'')).join('');
    const formatted = indentLatex(source);
    assert.deepEqual(sourceEndings(formatted.text),sourceEndings(source));
    assert.deepEqual(formatted.text.split(/\r\n|\r|\n/).map(s=>s.trimStart()),source.split(/\r\n|\r|\n/).map(s=>s.trimStart()));
    let state = EditorState.create({doc:source.replace(/\r\n?/g,'\n'),extensions:[history(),sourceEolExtensions(source)]});
    state=state.update({changes:formatted.changes,annotations:isolateHistory.of('full'),userEvent:'input.indent'}).state;
    assert.equal(sourceWithEndings(state),formatted.text);
    const dispatch = tr => state=tr.state;
    assert.ok(undo({state,dispatch})); assert.equal(sourceWithEndings(state),source);
    assert.ok(redo({state,dispatch})); assert.equal(sourceWithEndings(state),formatted.text);
    assert.equal(indentLatex(formatted.text).text,formatted.text);
  });
}
test('452-byte mixed-EOL regression fixture changes only indentation', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/source-workspace-mixed-eol.json',import.meta.url)));
  const source = Buffer.from(fixture.expected.base64,'base64').toString();
  assert.equal(Buffer.byteLength(source),452);
  const result = indentLatex(source);
  assert.equal(result.reason,null);
  assert.deepEqual(sourceEndings(result.text),sourceEndings(source));
  assert.equal(result.text.replace(/^[ \t]+/gm,''),source.replace(/^[ \t]+/gm,''));
  assert.ok(result.text.endsWith('\r\n'));
});
test('multiline optional macro arguments stay byte-exact', () => {
  const source = '\\begin{document}\n\\custom[\n  \\begin{fake}\n x\n  \\end{fake}\n]{text}\n\\end{document}\r\n';
  const result = indentLatex(source).text;
  assert.equal(result,source.replace('\\custom[','  \\custom['));
  assert.equal(indentLatex(result).text,result);
});
