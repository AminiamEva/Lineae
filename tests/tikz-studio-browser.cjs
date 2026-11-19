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
const knotBody = String.raw`\usepackage{tikz}
\usetikzlibrary{knots}
% one motif, turned three times: a single strand that crosses itself
\newcommand{\motif}[1]{
  to ++(180+#1:0.50) arc (270+#1:150+#1:0.15)
  to ++( 60+#1:0.50) arc (-30+#1:150+#1:0.15)
  to ++(240+#1:0.25) arc (150+#1:330+#1:0.25)
  to ++( 60+#1:0.55) arc (150+#1: 30+#1:0.20)
}
\begin{tikzpicture}
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
(async()=>{await new Promise(d=>server.listen(0,'127.0.0.1',d));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:900},locale:'en-US'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.waitForTimeout(700);await page.locator('.ribbon-tabs [data-group=insert]').click();await page.getByRole('button',{name:'TikZ',exact:true}).click();await page.locator('.tikz-studio-window').waitFor({state:'visible'});await page.locator('.tikz-studio-preview svg').waitFor({state:'visible',timeout:120000});
// graph drawing exercises the LuaTeX bundle and \usegdlibrary.
await page.locator('.tikz-studio-code').fill(String.raw`\usetikzlibrary{graphs,graphdrawing}
\usegdlibrary{layered}
\tikz \graph[layered layout]{a -> b -> c};`);
await page.waitForTimeout(3000);
assert.match(await page.locator('.tikz-studio-status').innerText(), /^\s*$/, 'graph drawing renders without diagnostics');
// a fragment with a multi-line \newcommand keeps the whole definition in the preamble.
await page.locator('.tikz-studio-code').fill(knotBody);
await page.waitForTimeout(8000);
assert.match(await page.locator('.tikz-studio-status').innerText(), /^\s*$/, 'multi-line macro fragment renders');
assert.equal(await page.locator('.tikz-studio-preview svg').count(),1);
// a complete LaTeX document passes through unchanged.
await page.locator('.tikz-studio-code').fill(`\\documentclass[tikz]{standalone}\n${knotBody.replace('\\begin{tikzpicture}', '\\begin{document}\n\\begin{tikzpicture}')}\n\\end{document}`);
await page.waitForTimeout(8000);
assert.match(await page.locator('.tikz-studio-status').innerText(), /^\s*$/, 'full LaTeX document renders');
const zoomBefore=await page.locator('.tikz-studio-preview').evaluate(el=>el.style.transform);
await page.locator('.tikz-studio-preview').hover();
await page.mouse.wheel(0,-300);
await page.waitForTimeout(200);
const zoomAfter=await page.locator('.tikz-studio-preview').evaluate(el=>el.style.transform);
assert.notEqual(zoomAfter,zoomBefore);
await page.locator('.tikz-studio-insert').click();
await page.waitForTimeout(300);
const inserted=await page.locator('pre[data-language="tikz-general"]').innerText();
assert.doesNotMatch(inserted, /\\documentclass|\\begin\{document\}|\\end\{document\}/, 'insertion strips the standalone wrapper');
assert.doesNotMatch(inserted, /\\usepackage\{tikz\}/, 'insertion does not put \\usepackage in the body');
assert.match(inserted, /\\usetikzlibrary\{knots\}/);
assert.match(inserted, /\\newcommand\{\\motif\}/);
assert.match(inserted, /\\begin\{tikzpicture\}/);
await page.locator('.tikz-general-preview svg').waitFor({state:'visible',timeout:120000});
assert.deepEqual(errors,[]);console.log('PASS general TikZ studio');}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
