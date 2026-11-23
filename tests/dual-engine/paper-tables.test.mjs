import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBlock} from '../../apps/web/latex/blocks.mjs';
import {serialize} from '../../apps/web/src/editor/latex-codec.js';
import {planPagination} from '../../apps/web/latex/typeset-layout.mjs';

function environment(name, env) {
  const source = readFileSync(new URL(name + '.tex', import.meta.url), 'utf8');
  return source.slice(source.indexOf('\\begin{' + env + '}'), source.indexOf('\\end{' + env + '}') + env.length + 6);
}

test('24 editable longtable rows patch only the changed cell', () => {
  const source = environment('long','longtable').replace('Row 01 &','Row 01   &').replace('\n','\r\n');
  const table = importBlock(source);
  assert.equal(table.type, 'table');
  assert.equal(table.content.length, 24);
  table.content[23].content[1].content[0].content[0].text = 'Edited';
  assert.equal(serialize(table), source.replace('Cell 24','Edited'));
});

test('fixed rule in a wrapfigure keeps dimensions and exact source', () => {
  const source = environment('rule','wrapfigure');
  const shape = importBlock(source);
  assert.equal(shape.type,'documentImage');
  assert.deepEqual(shape.attrs.rule,{width:'20mm',height:'12mm'});
  assert.equal(serialize(shape).trim(),source);
  assert.equal(importBlock(source.replace('\\rule','\\unknown')).type,'raw');
});

test('unbreakable overflowing table owns one sheet and following text resumes on the next', () => {
  const geometry = {pageHeight:120,pageGap:20,marginTop:10,marginBottom:10};
  const plan=height=>planPagination([{top:10,height:40},{top:50,height,atomicTable:true},{top:50+height,height:10}],geometry);
  assert.equal(plan(25).translations[1],0);
  assert.equal(plan(80).translations[1],100);
  assert.equal(plan(290).translations[1],100);
  assert.equal(340+plan(290).translations[2],290);
  assert.equal(plan(290).pageCount,3);
});

test('geometry paper dimensions for a short longtable page', async () => {
  const {pageMetrics,readPageSetup}=await import('../../apps/web/latex/geometry.mjs');
  const setup=readPageSetup('\\usepackage[paperheight=70mm,paperwidth=110mm,margin=10mm]{geometry}');
  const metrics=pageMetrics(setup);
  assert.equal(metrics.width,'110mm');
  assert.equal(metrics.height,'70mm');
});

test('unimplemented longtable headers retain original markup',()=>{
  const source=environment('long','longtable').replace('Row 02','\\endhead\nRow 02');
  const block=importBlock(source);
  assert.equal(block.type,'raw');
  assert.equal(serialize(block),source);
});
