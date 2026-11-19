const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const assert = require('node:assert/strict');
const root=resolve('apps/web');
const server=createServer(async(req,res)=>{const pn=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');const p=resolve(root,'.'+pn);if(!p.startsWith(root+sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[extname(p)]??'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(d=>server.listen(0,'127.0.0.1',d));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.waitForTimeout(700);
const body=String.raw`\section{Images}
Before the figure.

\begin{figure}[H]
\centering
\includegraphics[width=0.8\linewidth]{figures/a.png}
\caption{Centered image}
\end{figure}

Before wrap. \begin{wrapfigure}{r}{0.4\textwidth}
\centering
\includegraphics[width=\linewidth]{figures/b.png}
\caption{Wrapped image}
\end{wrapfigure}
After wrap text continues.`;
await page.locator('input[type=file]').setInputFiles({name:'images.tex',mimeType:'text/plain',buffer:Buffer.from('\\documentclass{article}\n\\usepackage{graphicx}\n\\usepackage{wrapfig}\n\\begin{document}\n'+body+'\n\\end{document}\n')});await page.waitForTimeout(1200);
const result=await page.evaluate(()=>{const images=[...document.querySelectorAll('.document-image')];const figure=images.find(d=>d.dataset.wrap==='false');const wrap=images.find(d=>d.dataset.wrap==='true');const frame=figure?.querySelector('.document-image-frame');const page=document.querySelector('.ProseMirror').getBoundingClientRect();return {count:images.length,figure:{centered:figure?.dataset.centered,align:figure?.dataset.align,frameLeft:frame?.getBoundingClientRect().left,frameWidth:frame?.getBoundingClientRect().width,pageLeft:page.left,pageWidth:page.width},wrap:{width:wrap?.style.width,float:wrap?.style.float,frameWidth:wrap?.querySelector('.document-image-frame')?.style.width,top:wrap?.getBoundingClientRect().top??null,marginTop:wrap?getComputedStyle(wrap).marginBlockStart:null,nextTop:wrap?.nextElementSibling?.getBoundingClientRect().top??null,nextMargin:wrap?.nextElementSibling?getComputedStyle(wrap.nextElementSibling).marginBlockStart:null}};});
assert.equal(result.count,2);assert.equal(result.figure.centered,'true');assert.equal(result.figure.align,'center');assert.ok(result.figure.frameWidth>0&&Math.abs((result.figure.frameLeft-result.figure.pageLeft)-(result.figure.pageWidth-result.figure.frameWidth)/2)<3,'centered figure frame is horizontally centered');assert.equal(result.wrap.float,'right');assert.equal(result.wrap.width,'40%');assert.equal(result.wrap.frameWidth,'100%');assert.ok(parseFloat(result.wrap.marginTop)>0,'wrapfigure keeps the standard top separation');assert.ok(parseFloat(result.wrap.nextMargin)>0,'following paragraph reserves the same separation');assert.ok(Math.abs(result.wrap.nextTop-(result.wrap.top??0))<2,'text starts at the float top after the blank');assert.deepEqual(errors,[]);console.log('PASS image centering and wrap width');}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
