import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {hitMathField} from '../../apps/web/src/editor/native-math/hit.mjs';

// Deliberately a fixture projection, not a general TeX parser or a production
// source mapper. The truly empty denominator must stay empty in the projection.
export function projectFixture(source) {
  const formula='\\frac{a}{}',start=source.indexOf(formula);
  assert.ok(start>=0 && source.indexOf(formula,start+1)===-1,'Expected exactly one fixture fraction');
  const prefix='\\begingroup\\attribute65000=10 ';
  const text=source.slice(0,start)+prefix+formula+'\\endgroup'+source.slice(start+formula.length);
  const sourceOffset16=start+9;
  const projectionOffset16=sourceOffset16+prefix.length;
  return {text,sourceOffset16,projectionOffset16,
    projectionOffset8:Buffer.byteLength(text.slice(0,projectionOffset16),'utf8')};
}

export function matchesEdit(message,result) {
  return message.event==='ParagraphUpdate' && message.edit_id===result.edit_id &&
    message.versions?.source_revision===result.source_revision;
}

export function denominator(dl,empty) {
  const field=dl?.math_owners?.fields?.find(field=>field.owner===10 && field.role==='den' && field.empty===empty);
  assert.ok(field,`Missing observed owner 10/den, empty=${empty}`);
  assert.equal(field.bbox.length,4);
  assert.ok(field.bbox.every(Number.isSafeInteger),'Geometry uses integer TeX scaled points');
  const [left,top,right,bottom]=field.bbox;
  assert.ok(left<=right && top<=bottom);
  if(empty) assert.deepEqual([left,top],[right,bottom],'An empty denominator is an observed point');
  else assert.ok(right>left,'Filled denominator has positive width');
  return field;
}

function command(executable,args,cwd,log) {
  const result=spawnSync(executable,args,{cwd,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,windowsHide:true});
  const output=(result.stdout??'')+(result.stderr??'');
  if(log) writeFileSync(log,output);
  assert.ifError(result.error);
  assert.equal(result.status,0,`${executable} failed: ${output.slice(-1800)}`);
  return (result.stdout??'').trim();
}

async function probe(source,label,out,rtex,texbin) {
  const dir=join(out,label),project=join(dir,'project 空分母');
  mkdirSync(project,{recursive:true});
  const projection=projectFixture(source);
  const filled=source.slice(0,projection.sourceOffset16)+'b'+source.slice(projection.sourceOffset16);
  const tagged=projection.text;
  writeFileSync(join(dir,'source-before.tex'),source);
  writeFileSync(join(dir,'source-after.tex'),filled);
  writeFileSync(join(dir,'projection-before.tex'),tagged);
  writeFileSync(join(project,'main.tex'),tagged);
  const records=[],waiters=new Set();
  let failure=null,closing=false;
  const child=spawn(rtex,['serve','--project',project,'--main','main.tex','--build',join(dir,'build'),
    '--math-owner-attribute','65000','--eligibility','allowlist','--fast-budget-ms','5000',
    '--compile-timeout-ms','30000','--pass-timeout-ms','120000'],{
    stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true,
  });
  const fail=error=>{
    failure=error;
    for(const waiter of [...waiters]) waiter.finish(error);
  };
  const exit=new Promise(done=>child.once('close',done));
  child.on('error',fail);
  child.stdin.on('error',fail);
  child.on('exit',(code,signal)=>{if(!closing) fail(new Error(`rtex exited: ${code}/${signal}`));});
  child.stderr.on('data',data=>appendFileSync(join(dir,'stderr.log'),data));
  const reader=createInterface({input:child.stdout});
  reader.on('line',line=>{
    appendFileSync(join(dir,'protocol.jsonl'),line+'\n');
    try {
      const message=JSON.parse(line);
      records.push(message);
      for(const waiter of [...waiters]) {
        if(records.length-1>=waiter.since && waiter.test(message)) waiter.finish(null,message);
      }
    } catch(error) { fail(error); }
  });
  function waitFor(test,description,since=0) {
    if(failure) return Promise.reject(failure);
    const found=records.slice(since).find(test);
    if(found) return Promise.resolve(found);
    return new Promise((resolve,reject)=>{
      const waiter={test,since,finish(error,message){
        clearTimeout(timer);waiters.delete(waiter);
        if(error) reject(error);else resolve(message);
      }};
      const timer=setTimeout(()=>waiter.finish(new Error(`Timed out: ${description}`)),120000);
      waiters.add(waiter);
    });
  }
  const send=message=>{
    appendFileSync(join(dir,'commands.jsonl'),JSON.stringify(message)+'\n');
    child.stdin.write(JSON.stringify(message)+'\n');
  };
  let summary;
  try {
    const layout=await waitFor(message=>message.event==='LayoutUpdate' &&
      message.convergence?.state==='Converged','initial converged layout');
    assert.equal(layout.compile?.state,'Ok','Initial TeX compilation must succeed');
    const initial=records.filter(message=>message.event==='LayoutUpdate' &&
      message.versions.source_revision===layout.versions.source_revision)
      .flatMap(message=>message.pages_changed).find(page=>page.dl?.math_owners?.fields?.some(
        field=>field.owner===10 && field.role==='den' && field.empty));
    assert.ok(initial,'Converged layout history must contain the empty denominator');
    const empty=denominator(initial.dl,true);
    const frame={sessionId:label,sourceRevision:layout.versions.source_revision,layoutVersion:layout.versions.layout_version};
    for(const zoom of [1,1.5,2]){
      const scale=zoom*(96/72)/65781.76;
      const rect={left:40,top:120,width:initial.dl.page_width*scale,height:initial.dl.page_height*scale};
      const point={x:rect.left+empty.bbox[0]*scale,y:rect.top+empty.bbox[1]*scale};
      // Only eligible fraction roles enter this interaction registry. A
      // generic "math" boundary is not a field owned by our source parser.
      const fields=initial.dl.math_owners.fields.filter(field=>field.role==='num'||field.role==='den');
      assert.deepEqual(hitMathField(fields,rect,point,zoom,frame,frame),{owner:10,role:'den'});
    }
    writeFileSync(join(dir,'initial-layout.json'),JSON.stringify(initial,null,2)+'\n');
    // Reply and event queues are interleaved. Search retained history from the
    // command boundary, including events received before their matching reply.
    const since=records.length;
    send({cmd:'edit',path:'main.tex',start:projection.projectionOffset8,
      end:projection.projectionOffset8,text:'b'});
    const reply=await waitFor(message=>message.reply==='edit' || message.reply==='error','edit reply',since);
    assert.equal(reply.reply,'edit',reply.message);
    const result=reply.result;
    assert.equal(result.routed,'fast',`Edit was not warm: ${JSON.stringify(result.reasons)}`);
    assert.ok(result.source_revision>layout.versions.source_revision);
    const update=await waitFor(message=>matchesEdit(message,result),'revision-matched ParagraphUpdate',since);
    assert.equal(update.status,'ok',JSON.stringify(update.diagnostics));
    const nonempty=denominator(update.dl,false);
    assert.ok(update.dl.math_owners.glyphs.some(glyph=>glyph.owner===10 &&
      [98,119887].includes(glyph.char)),'Observed denominator includes the inserted b');
    writeFileSync(join(dir,'incremental-update.json'),JSON.stringify(update,null,2)+'\n');
    assert.equal(readFileSync(join(project,'main.tex'),'utf8'),tagged,'Session edits do not overwrite input files');
    summary={label,owner:10,role:'den',empty,nonempty,
      sourceOffset16:projection.sourceOffset16,projectionOffset16:projection.projectionOffset16,
      projectionOffset8:projection.projectionOffset8,result,versions:update.versions,
      timing:update.timing,timingScope:'engine-reported single warm edit; not display latency or a percentile'};
  } finally {
    closing=true;
    // The CLI owns child engines. Reap the entire tree, including on failure,
    // rather than leaving a LuaLaTeX warm process behind when the driver exits.
    if(child.pid) {
      if(process.platform==='win32') spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true});
      else {try {process.kill(-child.pid,'SIGKILL');} catch(error) {if(error.code!=='ESRCH') throw error;}}
    }
    await exit;
    reader.close();
  }
  const clean=join(dir,'clean');
  mkdirSync(clean);
  writeFileSync(join(clean,'main.tex'),filled);
  assert.ok(!filled.includes('\\attribute65000'),'The reference input is uninstrumented');
  command(join(texbin,process.platform==='win32'?'lualatex.exe':'lualatex'),
    ['-interaction=nonstopmode','-halt-on-error','-no-shell-escape','main.tex'],clean,join(dir,'clean-compile.log'));
  const pdf=readFileSync(join(clean,'main.pdf'));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  summary.cleanReferencePdf={bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex'),
    note:'Independent uninstrumented compile; not yet a geometry or pixel identity comparison'};
  writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  return summary;
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS,'true','Run real TeX acceptance on remote CI only');
  const rtex=process.env.RTEX_EXECUTABLE,texbin=process.env.RTEX_TEXLIVE_BIN;
  assert.ok(rtex && texbin,'Explicit rtex and TeX Live paths are required; no fallback or skip');
  const out=resolve('artifacts/native-tex');
  mkdirSync(out,{recursive:true});
  const executable=name=>join(texbin,name+(process.platform==='win32'?'.exe':''));
  try {
    const version=command(rtex,['--version']);
    assert.match(version,/\b0\.0\.8\b/);
    command(rtex,['doctor'],undefined,join(out,'rtex-doctor.log'));
    const font=command(executable('kpsewhich'),['latinmodern-math.otf']);
    const environment={
      commit:process.env.GITHUB_SHA,target:process.env.RTEX_TARGET,
      runUrl:`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      rtex:version,archiveSha256:process.env.RTEX_ARCHIVE_SHA256,
      lualatex:command(executable('lualatex'),['--version']),
      packages:readFileSync(join(out,'packages.txt'),'utf8'),
      font:{file:font,sha256:createHash('sha256').update(readFileSync(font)).digest('hex')},
    };
    writeFileSync(join(out,'environment.json'),JSON.stringify(environment,null,2)+'\n');
    const input=readFileSync('tests/native-math/fixtures/empty-denominator.tex','utf8').replace(/\r\n/g,'\n');
    const withFont=input;
    const summaries=[];
    summaries.push(await probe(withFont,'lf',out,rtex,texbin));
    const unicode=withFont.replace('\\begin{document}','% UTF-8 mapping: 中文 𝔸\n\\begin{document}').replace(/\n/g,'\r\n');
    summaries.push(await probe(unicode,'unicode-crlf',out,rtex,texbin));
    writeFileSync(join(out,'result.json'),JSON.stringify({status:'passed',cases:summaries},null,2)+'\n');
    console.log('PASS: real rtex geometry, empty denominator, warm revision-matched edit, Unicode/CRLF and clean reference PDF');
  } catch(error) {
    writeFileSync(join(out,'result.json'),JSON.stringify({status:'failed',error:error.stack},null,2)+'\n');
    throw error;
  }
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
