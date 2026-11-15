import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLayoutPreamble} from '../apps/web/src/project/page-context.mjs';
import {parseDocument} from '../apps/web/latex/document.mjs';
import {readPageSetup} from '../apps/web/latex/geometry.mjs';
test('children inherit the master paper without rewriting their preamble',()=>{
 const main='\\documentclass[a4paper]{article}\n\\usepackage[margin=2.2cm]{geometry}\n\\begin{document}\nRoot.\n\\end{document}\n';
 const child='\\documentclass{article}\n\\begin{document}\nChild.\n\\end{document}\n';
 const files=new Map([['main',{draft:main}],['child',{draft:child}]]),project={mainFileId:'main',activeFileId:'child',file:id=>files.get(id)};
 const preamble=parseDocument(child).start,effective=projectLayoutPreamble(project,preamble);
 assert.equal(readPageSetup(effective).paper,'a4');assert.equal(readPageSetup(effective).margin,'2.2cm');assert.equal(files.get('child').draft,child);
 project.activeFileId='main';const changed='\\documentclass[a5paper]{article}\n';assert.equal(projectLayoutPreamble(project,changed),changed);
 assert.equal(projectLayoutPreamble(null,preamble),preamble);
 project.activeFileId='child';files.get('main').draft='Root fragment.';assert.equal(projectLayoutPreamble(project,preamble),'','A fragment master uses its own default paper, not the child preamble');
});
