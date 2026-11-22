import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {importBlocks} from '../apps/web/src/editor/latex-codec.js';
import {sourceProjection,standaloneParagraphDraft} from '../apps/web/src/editor/source-sync.js';
for(const insertion of [' sample',' ','%','”'])test('literal Chinese quote source stays editable: '+JSON.stringify(insertion),()=>{
 const source='\\documentclass{article}\n% keep this comment\n\\begin{document}\n（中文）“原始引号”保持不变。\n\\end{document}\n';
 let doc={type:'doc',content:parseDocument(source).blocks.flatMap(importBlocks)},draft=source,projection=sourceProjection(source,doc);
 for(const text of [insertion,'next']){
  const after=structuredClone(doc);after.content[0].content.at(-1).text+=text;
  const prepared=standaloneParagraphDraft(draft,projection,JSON.stringify(doc),doc,after,0);
  assert.ok(prepared,'A known Unicode spelling must not make the paragraph read-only');
  assert.ok(prepared.draft.includes('（中文）“原始引号”保持不变。'));
  assert.ok(prepared.draft.startsWith('\\documentclass{article}\n% keep this comment\n'));
  draft=prepared.draft;projection=prepared.projection;doc=after;
 }
});