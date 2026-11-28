// From the checkout: node tests/lua-pdf-browser.cjs lualatex REFERENCE.json OUT.json
// Each case carries {id,source,lines:[{text,bbox,baselineBp}]} or points to
// <reference-directory>/<case id>/<engine>/main.tex, as generated in Phase C.
// Baselines are PDF text origins (bp), never bbox tops. Source bytes from
// Phase C are checked against the source hash before importing them.
const fs = require('node:fs/promises');
const {spawn, execFileSync} = require('node:child_process');
const {dirname, join, resolve} = require('node:path');
const {once} = require('node:events');
const {createHash} = require('node:crypto');
const {chromium} = require(require.resolve('playwright', {paths:[process.cwd()]}));
const [, , engine, reference, output] = process.argv;

function collect(paragraph) {
  // Each calibration sample is outside the editor. Measure ascent from a
  // text Range to a zero-height inline-block aligned to its baseline.
  const calibrator = document.createElement('div');
  calibrator.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;white-space:pre;text-indent:0';
  document.body.append(calibrator);
  const ascents = new Map();
  function ascent(style, char) {
    const key = [style.fontFamily,style.fontSize,style.fontStyle,style.fontWeight,char].join('|');
    if (ascents.has(key)) return ascents.get(key);
    for (const prop of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','fontFeatureSettings']) calibrator.style[prop] = style[prop];
    const text = document.createTextNode(char), marker = document.createElement('i');
    marker.style.cssText='display:inline-block;width:0;height:0;line-height:0;vertical-align:baseline';
    calibrator.replaceChildren(text,marker);
    const r=document.createRange();r.selectNodeContents(text);
    const value=marker.getBoundingClientRect().top-r.getBoundingClientRect().top;
    ascents.set(key,value);return value;
  }
  const lines=[];
  let previous;
  try {
    function collectText(text){
      const style=getComputedStyle(text.parentElement);
      for(let i=0;i<text.length;i++){
        const char=text.data[i];
        if(/[\u200b\u2060\ufeff]/.test(char))continue;
        if(/\s/.test(char)){if(previous)previous.text+=char;continue;}
        const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);
        const box=range.getBoundingClientRect();
        if(!box.width&&!box.height)continue;
        const baseline=box.top+ascent(style,char);
        let line=lines.find(l=>Math.abs(l.baseline-baseline)<3);
        if(!line){line={text:'',left:box.left,right:box.right,baseline,top:box.top,boundaries:[]};lines.push(line);}
        line.text+=char;line.left=Math.min(line.left,box.left);line.right=Math.max(line.right,box.right);
        line.boundaries.push({char,x:box.left,right:box.right});previous=line;
      }
    }
    const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode;
      if(node.nodeName==='MATH-FIELD'){
        // MathLive renders the visible glyphs in its shadow tree. The light
        // DOM contains the original LaTeX and the drag handle is editor UI.
        const content=node.shadowRoot?.querySelector('.ML__content');
        if(!content || !content.getBoundingClientRect().width)throw Error('MathLive has no rendered content');
        const glyphs=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);
        while(glyphs.nextNode())collectText(glyphs.currentNode);
      }else if(node.nodeType===Node.TEXT_NODE && !node.parentElement.closest('math-field,.ProseMirror-widget,.math-drag-handle')){
        collectText(node);
      }
    }
    for(const hyphen of paragraph.querySelectorAll('.tex-discretionary-hyphen')){
      const box=hyphen.getBoundingClientRect();
      const line=[...lines].sort((a,b)=>Math.abs(a.top-box.top)-Math.abs(b.top-box.top))[0];
      if(line){line.text+='-';line.right=Math.max(line.right,box.right);}
    }
    const style=getComputedStyle(paragraph);
    return {lines,optimized:paragraph.dataset.texParagraph,engine:paragraph.dataset.texEngine,
      profile:paragraph.closest('.ProseMirror').dataset.paragraphProfile,paragraphWidth:paragraph.getBoundingClientRect().width,
      css:{fontFamily:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,indent:style.textIndent},
      cssZoom:document.querySelector('.document-page')?.getBoundingClientRect().width/document.querySelector('.document-page')?.offsetWidth,
      fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>[f.family,f.weight,f.style])};
  } finally {calibrator.remove();}
}
function key(text,chinese) {
  text=text.trim().replace(/[\ufb00-\ufb06]/g,ligature=>ligature.normalize('NFKC'));
  text=text.replace(/\s+/g,' ');
  // Poppler inserts gaps next to CJK runs. Keep word separators inside
  // English fragments rather than accepting a merged "Englishwords".
  return chinese?text.replace(/(?<![A-Za-z0-9]) | (?![A-Za-z0-9])/g,''):text;
}
// The PDF harness emits logging commands and dumps a box register. Import
// the typeset paragraph with the very same preamble, indent and hyphen minima.
function editorInput(source) {
  const text = source.toString('utf8');
  if (!text.includes('\\typeout{LINEAE-PARAGRAPH:')) return source;
  const documentStart = '\\begin{document}';
  const [preamble,body] = text.split(documentStart);
  const setup = [], content = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^\\(?:parindent=|lefthyphenmin=)/.test(line)) setup.push(line);
    else if (/^\\typeout\{LINEAE-/.test(line) || line === '\\ifLuaTeX\\directlua{dofile("nodes.lua")}\\fi') continue;
    else content.push(line);
  }
  let paragraph = content.join('\n');
  const control = /\\setbox0=\\hbox\{([^{}]*)\}\n\\noindent\\box0\\par/.exec(paragraph);
  if (control) {setup.push('\\setlength{\\parindent}{0pt}');paragraph=paragraph.replace(control[0],()=>control[1]);}
  return Buffer.from(preamble + setup.join('\n') + '\n' + documentStart + paragraph);
}
async function main(){
  const fixtures=JSON.parse(await fs.readFile(reference)).cases;
  const port=Number(process.env.LINEAE_BROWSER_PORT||39785);
  const server=spawn(process.execPath,['scripts/serve.mjs','apps/web',String(port)],{stdio:['ignore','pipe','inherit']});
  let browser;
  const result={engine,reference,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),viewport:[1600,1100],deviceScaleFactor:1,cases:[],errors:[]};
  try{
    await once(server.stdout,'data');
    browser=await chromium.launch();result.chromium=browser.version();
    const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1});
    page.on('pageerror',error=>result.errors.push(error.message));
    await page.addInitScript(engine=>{
      const pin=()=>document.documentElement.dataset.typesettingEngine=engine;
      if(document.documentElement)pin();else document.addEventListener('readystatechange',pin,{once:true});
    },engine);
    await page.goto('http://127.0.0.1:'+port);
    await page.locator('.ProseMirror[data-paragraph-profile]').waitFor({state:'attached',timeout:6000});
    if(await page.locator('.ProseMirror').first().getAttribute('data-paragraph-profile')!==engine)throw Error('wrong active profile');
    for(const fixture of fixtures){
      const id=fixture.id||fixture.name+'-'+fixture.margin;
      const source=fixture.source?Buffer.from(fixture.source):await fs.readFile(join(dirname(reference),id,engine,'main.tex'));
      const sha256=createHash('sha256').update(source).digest('hex');
      if(fixture.sourceSha256 && fixture.sourceSha256!==sha256)throw Error('input bytes differ: '+id);
      const input=editorInput(source);
      const row={id,sourceSha256:sha256,editorInputSha256:createHash('sha256').update(input).digest('hex'),pass:false};result.cases.push(row);
      await page.locator('input[type=file]').setInputFiles({name:id+'.tex',mimeType:'text/plain',buffer:input});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(400);
      const first=fixture.lines.map(line=>line.text).join('').replace(/[\s-]+/g,'').normalize('NFKC').slice(0,8);
      const ps=page.locator('.ProseMirror p');
      const list=await ps.evaluateAll(nodes=>nodes.map(p=>{
        const copy=p.cloneNode(true);
        const atoms=p.querySelectorAll('math-field');
        copy.querySelectorAll('math-field').forEach((field,i)=>field.replaceWith(atoms[i].value));
        return copy.textContent.replaceAll('\u2060','');
      }));
      const index=list.length===1?0:list.findIndex(t=>t.replace(/\s+/g,'').normalize('NFKC').includes(first));
      if(index<0){row.error='PDF body absent from editor paragraphs';row.paragraphs=list;continue;}
      const evidence=await ps.nth(index).evaluate(collect);row.evidence=evidence;
      const chinese=/\p{Script=Han}/u.test(fixture.lines.map(l=>l.text).join(''));
      row.sameCount=fixture.lines.length===evidence.lines.length;
      row.comparison=fixture.lines.map((expected,i)=>{
        const actual=evidence.lines[i];
        if(!actual)return {text:expected.text,ok:false};
        const sameText=key(actual.text,chinese)===key(expected.text,chinese);
        const widthDelta=actual.right-actual.left-(expected.bbox[2]-expected.bbox[0])*96/72;
        const baselineDelta=(actual.baseline-evidence.lines[0].baseline)-(expected.baselineBp-fixture.lines[0].baselineBp)*96/72;
        return {expected:expected.text,actual:actual.text,sameText,widthDelta,baselineDelta,
          ok:sameText && Math.abs(widthDelta)<1 && Math.abs(baselineDelta)<.5};
      });
      row.pass=evidence.profile===engine && row.sameCount && row.comparison.every(line=>line.ok);
      const firstDiff=row.comparison.findIndex(line=>!line.ok);
      if(firstDiff>=0){
        const line=row.comparison[firstDiff],expected=key(fixture.lines[firstDiff].text,chinese), actual=key(line.actual||'',chinese);
        let common=0;
        while(common<Math.min(expected.length,actual.length) && expected[common]===actual[common])common++;
        row.firstDifference={line:firstDiff+1,commonPrefix:expected.slice(0,common),expectedSuffix:expected.slice(common),actualSuffix:actual.slice(common),widthDelta:line.widthDelta,baselineDelta:line.baselineDelta};
      }
    }
  }catch(error){result.errors.push(error.message);}
  finally{await browser?.close();server.kill();}
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({engine,chromium:result.chromium,pass:result.cases.filter(c=>c.pass).length,total:fixtures.length,errors:result.errors}));
  if(result.errors.length||result.cases.length!==fixtures.length||result.cases.some(c=>!c.pass))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
