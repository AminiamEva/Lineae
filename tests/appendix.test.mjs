import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {importBlocks,serialize} from '../apps/web/src/editor/latex-codec.js';
import {headingOutline} from '../apps/web/latex/heading-numbering.mjs';
function document(source,preamble='\\documentclass{article}'){
 const nodes=importBlocks(source);return {nodes,attrs:{layoutPreamble:preamble},descendants(visit){let position=0;for(const value of nodes){const node={...value,type:{name:value.type},textContent:(value.content??[]).map(n=>n.text??'').join('')};visit(node,position);position+=1;}}};
}
test('appendix is a source-preserving structural switch, not visible paragraph text',()=>{
 const d=document('\\section{Main}\n\\appendix\n\\section{Proofs}\n\\subsection{Detail}\n\\section*{Notes}\n\\section{Data}');
 assert.deepEqual(d.nodes.map(n=>n.type),['heading','appendixStart','heading','heading','heading','heading']);
 assert.deepEqual(headingOutline(d).map(n=>n.number),['1','A','A.1','','B']);
 assert.match(d.nodes.map(serialize).join(''),/\\appendix\n\n\\section\{Proofs\}/);
});
test('report and book appendices reset chapters while sections retain the chapter prefix',()=>{
 for(const kind of ['book','report','ctexbook','ctexrep']){
  const d=document('\\chapter{Main}\n\\section{Body}\n\\appendix\n\\chapter{Proofs}\n\\section{Detail}\n\\subsection{Cases}\n\\chapter{Data}','\\documentclass{'+kind+'}');
  assert.deepEqual(headingOutline(d).map(n=>n.number),['1','1.1','A','A.1','A.1.1','B']);
  assert.match(d.nodes.map(serialize).join(''),/\\chapter\{Proofs\}/);
 }
});
test('a second appendix command resets counters; stars do not consume letters',()=>{
 const d=document('\\appendix\n\\section*{Notes}\n\\section{A}\n\\section{B}\n\\appendix\n\\section{Restart}');
 assert.deepEqual(headingOutline(d).map(n=>n.number),['','A','B','A']);
});

test('appendix reference values agree with actual XeLaTeX compilation',()=>{
 const reference=JSON.parse(readFileSync(new URL('./fixtures/appendix-xelatex.json',import.meta.url),'utf8'));
 for(const [kind,labels] of Object.entries(reference.labels)){
  const primary=kind==='article'?'section':'chapter';
  const source='\\'+primary+'{Main}\n\\appendix\n\\'+primary+'{Proofs}\n\\subsection{Detail}\n\\'+primary+'{Data}';
  const d=document(source,'\\documentclass{'+kind+'}');
  assert.deepEqual(headingOutline(d).map(item=>item.number),labels.map(pair=>pair[1]));
 }
});