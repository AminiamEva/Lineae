const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {resolve}=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.cwd()]}));
const {openXeReference}=require(resolve('tests/xe-reference-page.cjs'));

async function main(){
  const reference=JSON.parse(await fs.readFile('tests/fixtures/paragraph-layout/xelatex-reference.json','utf8')).cases[1];
  const nested=await fs.readFile('tests/fixtures/tex-compat/lists/lists-nested.tex','utf8');
  const body=nested.includes('\\begin{document}')?nested.split('\\begin{document}')[1].split('\\end{document}')[0]:nested;
  const source=reference.source.replace('\\end{document}', '\n'+body+'\n\\end{document}');
  const port=39786;
  const server=spawn(process.execPath,['scripts/serve.mjs','apps/web',String(port)],{stdio:['ignore','pipe','inherit']});
  let browser;
  try{
    await once(server.stdout,'data');
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1});
    await openXeReference(page,'http://127.0.0.1:'+port);
    await page.locator('input[type=file]').setInputFiles({name:'list-and-indent.tex',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('.ProseMirror ol ul').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const para=page.locator('.ProseMirror > p[data-tex-paragraph]').first();
    await para.waitFor();
    const vals=await para.evaluate(node=>{
      const p=node.getBoundingClientRect(),list=node.closest('.ProseMirror').querySelector('ol');
      const first=document.createRange(),text=node.firstChild;
      first.setStart(text,0);first.setEnd(text,1);
      const r=first.getBoundingClientRect();
      return {childCount:list.children.length,textIndent:getComputedStyle(node).textIndent,firstAdvance:r.left-p.left,
        listItems:[...list.querySelectorAll('li')].map(item=>{
          const rect=item.getBoundingClientRect();return {x:rect.x-p.x,y:rect.y-p.y,width:rect.width,text:item.textContent};
        })};
    });
    console.log('XE_INDENT_LIST '+JSON.stringify(vals));
    const indent=15*96/72.27;
    assert.ok(Math.abs(vals.firstAdvance-indent)<1,'First character follows 15pt paragraph indentation');
    assert.ok(vals.listItems.some(item=>item.x>vals.listItems[0].x),'Nested item begins inside outer item');
    if(process.argv[3]){
      const expected=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
      assert.deepEqual(vals,expected,'Fixed-environment list and paragraph geometry changed');
    }
    await fs.writeFile(process.argv[2],JSON.stringify(vals,null,2)+'\n');
  }finally{await browser?.close();server.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
