const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
if (!existsSync('apps/web/vendor/mp-tikz-wasm/index.js')) { console.log('SKIP general TikZ studio: vendor runtime is not installed (npm run vendor:tikz)'); process.exit(0); }
const root=resolve('apps/web');
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');const p=resolve(root,'.'+pathname);if(!p.startsWith(root+sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',types[extname(p)]??'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
const knotLibraries = String.raw`\usepackage{tikz}
\usetikzlibrary{knots}
% one motif, turned three times: a single strand that crosses itself
\newcommand{\motif}[1]{
  to ++(180+#1:0.50) arc (270+#1:150+#1:0.15)
  to ++( 60+#1:0.50) arc (-30+#1:150+#1:0.15)
  to ++(240+#1:0.25) arc (150+#1:330+#1:0.25)
  to ++( 60+#1:0.55) arc (150+#1: 30+#1:0.20)
}`;
const knotPicture = String.raw`\begin{tikzpicture}
  \begin{knot}[line width=2pt, line join=round, clip width=2, scale=5,
      consider self intersections, ignore endpoint intersections=false, background color=white,
      only when rendering/.style={draw=blue!55!black, double=white, double distance=6pt, line cap=round}]
    \strand (0,0) \motif{0}\motif{120}\motif{240};
    \flipcrossings{1,3,6,8,10}
  \end{knot}
  \begin{scope}[xshift=5.4cm, yshift=-1.6cm]
    \begin{knot}[clip width=5, flip crossing=2]
      \strand[red!70!black, ultra thick] (0,0) .. controls +(1,0) and +(-1,0) .. (2,1) .. controls +(1,0) and +(-1,0) .. (4,0);
      \strand[blue!70!black, ultra thick] (0,1) .. controls +(1,0) and +(-1,0) .. (2,0) .. controls +(1,0) and +(-1,0) .. (4,1);
    \end{knot}
  \end{scope}
\end{tikzpicture}`;
const knotDocument = `\\documentclass[tikz]{standalone}\n${knotLibraries}\n\\begin{document}\n${knotPicture}\n\\end{document}`;
(async()=>{await new Promise(d=>server.listen(0,'127.0.0.1',d));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:900},locale:'en-US'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.waitForTimeout(700);await page.locator('.ribbon-tabs [data-group=insert]').click();await page.getByRole('button',{name:'TikZ',exact:true}).click();
const libraries=page.locator('.tikz-studio-libraries');const code=page.locator('.tikz-studio-code');const status=page.locator('.tikz-studio-status');
await page.locator('.tikz-studio-window').waitFor({state:'visible'});await page.locator('.tikz-studio-preview svg').waitFor({state:'visible',timeout:120000});
// Each successful render replaces the SVG, including a cached redraw.
async function previousSvg(){return page.locator('.tikz-studio-preview svg').elementHandle();}
async function waitForRedraw(previous){
  await page.waitForFunction(old=>document.querySelector('.tikz-studio-preview svg')!==old,previous,{timeout:120000});
}
// graph drawing exercises the LuaTeX bundle and \usegdlibrary.
let previous=await previousSvg();
await libraries.fill(String.raw`\usetikzlibrary{graphs,graphdrawing}
\usegdlibrary{layered}`);
await code.fill(String.raw`\tikz \graph[layered layout]{a -> b -> c};`);
await waitForRedraw(previous);
assert.match(await status.innerText(), /^\s*$/, 'graph drawing renders without diagnostics');
// a fragment with a multi-line \newcommand in the staging pane.
previous=await previousSvg();
await libraries.fill(knotLibraries);
await code.fill(knotPicture);
await waitForRedraw(previous);
assert.match(await status.innerText(), /^\s*$/, 'fragment libraries and macro render');
assert.equal(await page.locator('.tikz-studio-preview svg').count(),1);
// a complete standalone document still passes through unchanged.
previous=await previousSvg();
await libraries.fill('');
await code.fill(knotDocument);
await waitForRedraw(previous);
assert.match(await status.innerText(), /^\s*$/, 'standalone document renders');
// the split divider is draggable.
const topBefore=await libraries.evaluate(el=>el.closest('.tikz-studio-code-shell').getBoundingClientRect().height);
const divider=page.locator('.tikz-studio-divider');const box=await divider.boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+80);await page.mouse.up();
const topAfter=await libraries.evaluate(el=>el.closest('.tikz-studio-code-shell').getBoundingClientRect().height);
assert.ok(topAfter>topBefore+20,'divider increases the libraries pane');
// insertion moves libraries/macros out of the picture and keeps only the drawing.
await libraries.fill(knotLibraries);await code.fill(knotPicture);await page.waitForTimeout(1000);await page.locator('.tikz-studio-insert').click();await page.waitForTimeout(500);
const readDrawing=()=>page.locator('.ProseMirror').evaluate(element=>element.editor.getJSON().content.find(node=>node.type==='documentImage')?.attrs??{});
const inserted=(await readDrawing()).tikzSource;
assert.equal((await readDrawing()).tikzEditor,'general','general TikZ uses the studio editor');
assert.doesNotMatch(inserted, /\\documentclass|\\begin\{document\}|\\end\{document\}/);
assert.doesNotMatch(inserted, /\\usepackage|\\usetikzlibrary|\\newcommand/);
assert.match(inserted, /\\begin\{tikzpicture\}/);
await page.locator('.document-image-tikz svg').waitFor({state:'visible',timeout:120000});
await page.locator('.document-image-tikz').first().dblclick();
await page.locator('.tikz-studio-window').waitFor({state:'visible'});
assert.match(await page.locator('.tikz-studio-libraries').inputValue(), /\\usetikzlibrary\{knots\}/);
assert.match(await page.locator('.tikz-studio-code').inputValue(), /\\begin\{tikzpicture\}/);
await page.locator('.tikz-studio-code').fill(String.raw`\begin{tikzpicture}\draw (0,0) -- (2,0);\end{tikzpicture}`);
await page.locator('.tikz-studio-insert').click();
await page.waitForTimeout(500);
assert.equal(await page.locator('.document-image-tikz').count(),1,'the picture stays one image node');
assert.match((await readDrawing()).tikzSource, /-- \(2,0\)/);
// inserting the same macro again must highlight its block and keep the dialog open.
await page.locator('.ribbon-tabs [data-group=insert]').click();await page.getByRole('button',{name:'TikZ',exact:true}).click();await page.locator('.tikz-studio-window').waitFor({state:'visible'});await libraries.fill(knotLibraries);await code.fill(knotPicture);await page.waitForTimeout(1000);await page.locator('.tikz-studio-insert').click();await page.waitForTimeout(500);
assert.match(await page.locator('.tikz-studio-status').innerText(), /Already defined: motif/);
assert.ok(await page.locator('.tikz-studio-highlight-line.duplicate').count()>0,'duplicate macro lines are highlighted');
assert.equal(await page.locator('.tikz-studio-window').count(),1,'dialog remains open after duplicate');
assert.deepEqual(errors,[]);console.log('PASS general TikZ studio');}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
