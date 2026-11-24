import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {hitMathField} from '../../apps/web/src/editor/native-math/hit.mjs';
import {projectMath,applySlotEdit} from '../../apps/web/src/editor/native-math/source.mjs';
import {projectDisplayMath,projectDocumentFormulas,editDisplayMathSlot} from '../../apps/web/src/editor/native-math/document.mjs';
import {warmRows} from '../../apps/web/src/typesetting/rtex/warm-rows.mjs';

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

export function denominator(dl,empty,owner=10) {
  const field=dl?.math_owners?.fields?.find(field=>field.owner===owner && field.role==='den' && field.empty===empty);
  assert.ok(field,`Missing observed owner ${owner}/den, empty=${empty}`);
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

async function probe(source,label,out,rtex,texbin,structured=false) {
  const dir=join(out,label),project=join(dir,'project 空分母');
  mkdirSync(project,{recursive:true});
  const aftergroup=structured==='aligned-aftergroup';
  const matrix=structured==='matrix'||aftergroup;
  const whole=structured==='multi'||matrix?projectDocumentFormulas(source):null;
  const documentProjection=whole&&!matrix
    ?{...whole.formulas.find(formula=>formula.math.slots.some(slot=>slot.role==='denominator'&&slot.raw==='')),
      projection:whole.projection}
    :structured&&!matrix?projectDisplayMath(source):null;
  if(structured&&!matrix)assert.ok(documentProjection,'Source display projection must be supported');
  const slot=documentProjection?.math.slots.find(slot=>slot.role==='denominator'&&slot.raw==='');
  const owner=slot?.tag??10;
  const projection=matrix?{
    text:aftergroup?source
      .replace('\\begin{document}','\\def\\LineaeEmptyA{\\attribute65000=82 }\n'+
        '\\def\\LineaeEmptyB{\\attribute65000=83 }\n\\begin{document}')
      .replace('\\begin{aligned}a & \\\\ & d\\end{aligned}',
        '\\begingroup\\attribute65000=80 \\begin{aligned}a &\\aftergroup\\LineaeEmptyA \\\\'+
        '\\aftergroup\\LineaeEmptyB & d\\end{aligned}\\endgroup')
      :whole?.projection??source,
    sourceOffset16:0,projectionOffset16:0,
  }:documentProjection?{
    text:documentProjection.projection,
    sourceOffset16:documentProjection.from16+slot.from16,
    projectionOffset16:(documentProjection.projectionFrom16??documentProjection.from16)+
      documentProjection.math.mapping.sourceToProjection16[slot.from16],
  }:projectFixture(source);
  projection.projectionOffset8=Buffer.byteLength(projection.text.slice(0,projection.projectionOffset16));
  const filled=matrix?source:source.slice(0,projection.sourceOffset16)+'b'+source.slice(projection.sourceOffset16);
  const tagged=projection.text;
  if(matrix)assert.notEqual(tagged,source,'Matrix fixture must contain per-cell tags');
  writeFileSync(join(dir,'source-before.tex'),source);
  if(!matrix)writeFileSync(join(dir,'source-after.tex'),filled);
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
    if(label.startsWith('lf-pages-'))assert.equal(layout.pages_total,Number(label.slice('lf-pages-'.length)));
    if(matrix){
      const captured=new Map();
      for(const message of records)if(message.event==='LayoutUpdate'&&
        message.versions.source_revision===layout.versions.source_revision)
        for(const page of message.pages_changed)captured.set(page.page,page);
      const fields=[...captured.values()].flatMap(page=>page.dl?.math_owners?.fields??[])
        .filter(field=>field.role==='cell');
      // Characterize the actual observer before a production cell target is
      // allowed. Do not infer that the nth emitted box belongs to the nth cell.
      const expected=aftergroup?[82,83]:
        [...whole.owners].filter(([,entry])=>entry.atom.kind==='cell'&&!entry.atom.raw.trim()).map(([tag])=>tag);
      const uniqueEmptyOwners=expected.length===2&&expected.every(owner=>fields.filter(field=>field.empty&&field.owner===owner).length===1);
      const summary={label,versions:layout.versions,fields,expected,uniqueEmptyOwners,
        scope:'real LuaLaTeX ownership of empty matrix slots'};
      writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
      console.log(`Observed matrix cell ownership: ${JSON.stringify({uniqueEmptyOwners,fields})}`);
      if(!aftergroup)assert.ok(uniqueEmptyOwners,'Each supported empty cell needs a distinct source owner');
      return summary;
    }
    const initial=records.filter(message=>message.event==='LayoutUpdate' &&
      message.versions.source_revision===layout.versions.source_revision)
      .flatMap(message=>message.pages_changed).find(page=>page.dl?.math_owners?.fields?.some(
        field=>field.owner===owner && field.role==='den' && field.empty));
    assert.ok(initial,'Converged layout history must contain the empty denominator');
    if(structured){
      const digit=documentProjection.math.atoms.find(atom=>atom.kind==='token'&&atom.raw==='7');
      assert.ok(digit&&initial.dl.math_owners.glyphs.some(glyph=>glyph.owner===digit.tag&&glyph.char===55),
        'A digit immediately after an owner assignment must remain a tagged TeX glyph');
    }
    if(label==='structured-math-text'){
      for(const text of ['中','文']){
        const glyph=documentProjection.math.atoms.find(atom=>atom.nucleus===text);
        assert.ok(glyph&&initial.dl.math_owners.glyphs.some(item=>item.owner===glyph.tag&&item.char===text.codePointAt(0)),
          `Real LuaLaTeX supplies a matching owner for ${text}`);
      }
    }
    const empty=denominator(initial.dl,true,owner);
    const frame={sessionId:label,sourceRevision:layout.versions.source_revision,layoutVersion:layout.versions.layout_version};
    const formula=projectMath('\\frac{a}{}');
    const denSlot=formula.slots.find(slot=>slot.role==='denominator');
    // This probe uses a single explicit owner in the TeX fixture. Production
    // will require the whole source projection and matching owner registry.
    const slotByOwner=new Map([['10/den',denSlot]]);
    let patch;
    for(const zoom of [1,1.5,2]){
      const scale=zoom*(96/72)/65781.76;
      const rect={left:40,top:120,width:initial.dl.page_width*scale,height:initial.dl.page_height*scale};
      const point={x:rect.left+empty.bbox[0]*scale,y:rect.top+empty.bbox[1]*scale};
      // Only eligible fraction roles enter this interaction registry. A
      // generic "math" boundary is not a field owned by our source parser.
      const fields=initial.dl.math_owners.fields.filter(field=>field.empty&&(field.role==='num'||field.role==='den'));
      const hit=hitMathField(fields,rect,point,zoom,frame,frame);
      assert.deepEqual(hit,{owner,role:'den'});
      const command={from16:0,to16:0,insert:'b'};
      const edit=documentProjection
        ?editDisplayMathSlot(documentProjection,source,hit,command)
        :applySlotEdit(formula,{slotId:slotByOwner.get(`${hit.owner}/${hit.role}`).id,...command});
      const at=documentProjection?projection.sourceOffset16:9;
      assert.deepEqual(edit.patch,{from:at,to:at,insert:'b'});
      patch=edit.patch;
    }
    writeFileSync(join(dir,'initial-layout.json'),JSON.stringify(initial,null,2)+'\n');
    // Reply and event queues are interleaved. Search retained history from the
    // command boundary, including events received before their matching reply.
    const since=records.length;
    send({cmd:'edit',path:'main.tex',start:projection.projectionOffset8,
      end:projection.projectionOffset8,text:patch.insert});
    const reply=await waitFor(message=>message.reply==='edit' || message.reply==='error','edit reply',since);
    assert.equal(reply.reply,'edit',reply.message);
    const result=reply.result;
    assert.ok(result.source_revision>layout.versions.source_revision);
    if(label==='structured-math-text'&&result.routed!=='fast'){
      const resultLayout=await waitFor(message=>message.event==='LayoutUpdate'&&
        message.versions?.source_revision===result.source_revision&&message.convergence?.state==='Converged',
      'complete CJK layout for the edited source',since);
      assert.equal(resultLayout.compile?.state,'Ok');
      writeFileSync(join(dir,'background-update.json'),JSON.stringify(resultLayout,null,2)+'\n');
      const drawn=records.slice(since).filter(message=>message.event==='LayoutUpdate'&&
        message.versions.source_revision===result.source_revision).flatMap(message=>message.pages_changed)
        .find(page=>page.dl.math_owners?.fields.some(field=>field.owner===owner&&field.role==='den'&&!field.empty));
      assert.ok(drawn,'Complete CJK layout must include the edit');
      writeFileSync(join(dir,'summary.json'),JSON.stringify({label,owner,empty,
        nonempty:denominator(drawn.dl,false,owner),result,versions:resultLayout.versions,
        scope:'CJK source ownership and confirmed complete layout, not a warm-latency measurement'},null,2)+'\n');
      return {label,route:result.routed};
    }
    assert.equal(result.routed,'fast',`Edit was not warm: ${JSON.stringify(result.reasons)}`);
    const update=await waitFor(message=>matchesEdit(message,result),'revision-matched ParagraphUpdate',since);
    assert.equal(update.status,'ok',JSON.stringify(update.diagnostics));
    if(label==='lf'){
      const overlay=warmRows(update,layout,new Map([[initial.page,initial]]));
      assert.ok(overlay?.get(initial.page)?.size,'Real warm rows must align with the converged page placements');
    }
    const nonempty=denominator(update.dl,false,owner);
    assert.ok(update.dl.math_owners.glyphs.some(glyph=>glyph.owner===owner &&
      [98,119887].includes(glyph.char)),'Observed denominator includes the inserted b');
    writeFileSync(join(dir,'incremental-update.json'),JSON.stringify(update,null,2)+'\n');
    assert.equal(readFileSync(join(project,'main.tex'),'utf8'),tagged,'Session edits do not overwrite input files');
    summary={label,owner,role:'den',empty,nonempty,patch,
      sourceOffset16:projection.sourceOffset16,projectionOffset16:projection.projectionOffset16,
      projectionOffset8:projection.projectionOffset8,result,versions:update.versions,
      timing:update.timing,timingScope:'engine-reported single warm edit; not display latency or a percentile'};
    const repetitions=Number(process.env.LINEAE_WARM_REPETITIONS??0);
    assert.ok(Number.isInteger(repetitions)&&repetitions>=0&&repetitions<=1000);
    if(label.startsWith('lf')&&repetitions){
      const samples=[],routes={};
      for(let index=0;index<repetitions;index++){
        const start=projection.projectionOffset8,since=records.length,begin=performance.now();
        send({cmd:'edit',path:'main.tex',start,end:start+1,text:index%2?'b':'c'});
        const reply=await waitFor(message=>message.reply==='edit'||message.reply==='error','timed edit reply',since);
        assert.equal(reply.reply,'edit',reply.message);
        const routed=reply.result.routed;
        routes[routed]=(routes[routed]??0)+1;
        if(routed!=='fast')continue;
        const result=await waitFor(message=>matchesEdit(message,reply.result),'timed warm result',since);
        assert.equal(result.status,'ok');
        samples.push(performance.now()-begin);
      }
      const ordered=samples.toSorted((a,b)=>a-b);
      const percentile=q=>ordered.length?ordered[Math.ceil(ordered.length*q)-1]:null;
      const timing={repetitions,pages:layout.pages_total,routes,sampleCount:samples.length,p50Ms:percentile(.50),p95Ms:percentile(.95),
        p99Ms:percentile(.99),scope:'stdin edit dispatch to matching stdout event; no drawing, input method or display latency',samplesMs:samples};
      writeFileSync(join(dir,'warm-timing.json'),JSON.stringify(timing,null,2)+'\n');
    }
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
    summaries.push(await probe(unicode.replace('\\frac{a}{}','\\frac{7}{}'),'structured-projection',out,rtex,texbin,true));
    summaries.push(await probe(unicode.replace('\\frac{a}{}','\\frac{\\frac{7}{}}{c}'),
      'structured-nested-denominator',out,rtex,texbin,true));
    summaries.push(await probe(unicode.replace('\\[\r\n\\frac{a}{}','\\[z\\]\r\n\r\n\\[\r\n\\frac{7}{}'),
      'structured-multiple-displays',out,rtex,texbin,'multi'));
    summaries.push(await probe(unicode.replace('\\[\r\n\\frac{a}{}\r\n\\]','Inline $\\alpha+\\frac{7}{}=y$ here.'),
      'structured-inline-denominator',out,rtex,texbin,'multi'));
    summaries.push(await probe(unicode.replace('\\[\r\n\\frac{a}{}\r\n\\]',
      '\\begin{equation}\r\n\\frac{7}{}\r\n\\end{equation}'),'structured-numbered-equation',out,rtex,texbin,'multi'));
    summaries.push(await probe(unicode.replace('\\frac{a}{}','\\left(\\frac{7}{}\\right)'),
      'structured-fenced-fraction',out,rtex,texbin,'multi'));
    summaries.push(await probe(unicode.replace('\\usepackage{amsmath}',
      '\\usepackage[fontset=fandol]{ctex}\r\n\\usepackage{amsmath}')
      .replace('\\frac{a}{}','\\frac{7}{}+\\text{中文}'),
      'structured-math-text',out,rtex,texbin,'multi'));
    summaries.push(await probe(unicode.replace('\\frac{a}{}','\\begin{pmatrix}a & \\\\ & d\\end{pmatrix}'),
      'matrix-cell-ownership',out,rtex,texbin,'matrix'));
    summaries.push(await probe(unicode.replace('\\frac{a}{}','\\begin{aligned}a & \\\\ & d\\end{aligned}'),
      'aligned-cell-ownership',out,rtex,texbin,'matrix'));
    if(Number(process.env.LINEAE_WARM_REPETITIONS??0)){
      summaries.push(await probe(unicode.replace('\\frac{a}{}','\\begin{aligned}a & \\\\ & d\\end{aligned}'),
        'aligned-group-boundary-experiment',out,rtex,texbin,'aligned-aftergroup'));
    }
    if(process.env.LINEAE_LARGE_DOCUMENTS==='true'){
      assert.ok(Number(process.env.LINEAE_WARM_REPETITIONS)>0,'Large document timing requires explicit repetitions');
      for(const pages of [10,100,300]){
        const body=Array.from({length:pages-1},(_,index)=>
          `\\newpage\nSynthetic page ${index+2}. A short paragraph keeps the corpus independent of user documents.\n\n`).join('');
        summaries.push(await probe(withFont.replace('\\end{document}',body+'\\end{document}'),
          `lf-pages-${pages}`,out,rtex,texbin));
      }
    }
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
