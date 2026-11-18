import test from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {documentNumbers} from '../apps/web/latex/document-numbering.mjs';
import {counterProfile,formatCounter} from '../apps/web/latex/counter-profile.mjs';
import {planPagination} from '../apps/web/latex/typeset-layout.mjs';
const schema=new Schema({nodes:{doc:{content:'block*',attrs:{layoutPreamble:{default:''}}},text:{group:'inline'},heading:{group:'block',content:'inline*',attrs:{level:{default:1},command:{default:null},numbered:{default:true},label:{default:null}}},appendixStart:{group:'block',atom:true},mathBlock:{group:'block',atom:true,attrs:{latex:{default:'x'},delimiter:{default:'equation'},label:{default:null}}},documentImage:{group:'block',atom:true,attrs:{captionEnabled:{default:true},captionNumbered:{default:true},caption:{default:'Image'},label:{default:null}}},table:{group:'block',atom:true,attrs:{captionEnabled:{default:true},captionNumbered:{default:true},caption:{default:'Table'},label:{default:null}}}}});
const heading=(title,command='chapter',extra={})=>({type:'heading',attrs:{command,...extra},content:[{type:'text',text:title}]}),equation=label=>({type:'mathBlock',attrs:{label}}),image=label=>({type:'documentImage',attrs:{label}}),table=label=>({type:'table',attrs:{label}});
const doc=(content,preamble='\\documentclass{report}')=>schema.nodeFromJSON({type:'doc',attrs:{layoutPreamble:preamble},content});
test('chapters, appendix equations, figures, tables and labels share resets',()=>{
 const numbering=documentNumbers(doc([heading('Main'),equation('e1'),image('f1'),table('t1'),{type:'appendixStart'},heading('Proof'),equation('ea'),image('fa'),table('ta'),heading('Extra'),equation('eb')]));
 assert.deepEqual(numbering.labels.map(item=>[item.key,item.number]),[['e1','1.1'],['f1','1.1'],['t1','1.1'],['ea','A.1'],['fa','A.1'],['ta','A.1'],['eb','B.1']]);
});
test('article appendices leave global equation numbers intact unless numberwithin is requested',()=>{
 const content=[heading('Main','section'),equation('one'),{type:'appendixStart'},heading('Proof','section'),equation('two')];
 assert.deepEqual(documentNumbers(doc(content,'\\documentclass{article}')).labels.map(item=>item.number),['1','2']);
 assert.deepEqual(documentNumbers(doc(content,'\\documentclass{article}\n\\numberwithin{equation}{section}')).labels.map(item=>item.number),['1.1','A.1']);
});
test('explicit equation tags do not consume a counter and starred chapters do not reset it',()=>{
 const content=[heading('Main'),equation('first'),{type:'mathBlock',attrs:{latex:'x\\tag{T}',label:'tag'}},heading('Notes','chapter',{numbered:false}),equation('second')];
 assert.deepEqual(documentNumbers(doc(content)).labels.map(item=>item.number),['1.1','T','1.2']);
});
test('declarative names, counter formats, depth, and class options are honored',()=>{
 const profile=counterProfile('\\documentclass[openany]{book}\n\\renewcommand{\\appendixname}{Supplement}\n\\renewcommand{\\theequation}{\\thechapter-\\Roman{equation}}');
 assert.equal(profile.openRight,false);assert.equal(profile.names.appendix,'Supplement');assert.equal(formatCounter('equation',{chapter:2,equation:4},profile,true),'B-IV');
 assert.equal(counterProfile('% \\documentclass{book}\n\\documentclass {report}').className,'report');
});
test('book chapters may start on recto while report chapters use the next page',()=>{
 const geometry={pageHeight:100,pageGap:10,marginTop:10,marginBottom:10};
 assert.deepEqual(planPagination([{top:10,height:15},{top:30,height:20,forceBreak:'odd'}],geometry).translations,[0,200]);
 assert.deepEqual(planPagination([{top:10,height:15},{top:30,height:20,forceBreak:true}],geometry).translations,[0,90]);
});