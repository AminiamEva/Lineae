import {t} from './i18n.mjs';
import {installNativePages} from '../typesetting/rtex/pages.mjs';
import {installNativePdf} from '../typesetting/rtex/pdf.mjs';
import {projectSnapshotFormulas,editDisplayMathSlot} from '../editor/native-math/document.mjs';
import {nativeCaretTargets} from '../editor/native-math/rich-slot.mjs';

// This surface never edits source or intercepts editor input. The existing
// ProseMirror/MathLive history stays authoritative while native parity is built.
export function installNativeTexPreview({host,before,getSource,getSnapshot,isComposing,focusMathSlot}) {
  const invoke=window.__TAURI__?.core?.invoke;
  if(!invoke) return {refresh(){},documentChanged(){},relocalize(){}};
  const button=document.createElement('button');
  button.id='native-tex-toggle';button.type='button';button.setAttribute('aria-pressed','false');
  const panel=document.createElement('aside');
  panel.id='native-tex-preview';panel.hidden=true;
  panel.setAttribute('aria-label','LuaLaTeX');
  const heading=document.createElement('h2');
  const notice=document.createElement('p');
  const controls=document.createElement('div');controls.className='native-tex-controls';
  const status=document.createElement('p');status.setAttribute('role','status');
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.id='native-tex-export';
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.id='native-tex-close';
  const targetButton=document.createElement('button');targetButton.type='button';targetButton.id='native-tex-target';
  const targetStatus=document.createElement('p');targetStatus.setAttribute('role','status');
  const zoom=document.createElement('select');zoom.id='native-tex-zoom';
  for(const value of [50,75,100,125,150,200]) zoom.append(new Option(value+'%',String(value)));
  zoom.value='75';zoom.setAttribute('aria-label',t('原生预览缩放','Native preview zoom'));
  controls.append(zoom,exportButton,targetButton,closeButton);
  const pages=document.createElement('div');pages.className='native-tex-pages';
  panel.append(heading,notice,controls,status,targetStatus,pages);
  document.body.append(panel);host.insertBefore(button,before);
  let session=null,sourceRevision=0,sentSource='',wantedSource='',generation=0;
  let timer=null,pollTimer=null,updating=null,exporting=null,opening=false;
  let sentSnapshot=null,wantedSnapshot=null,captureId=0,capturing=null,pdfRendered=-1;
  let renderedRevision=-1,error='',active=false,terminal=false;
  let mode='canvas',pdfWanted=-1,pdfAttempt=null,pdfLayout=null;
  let pollEpoch=0;
  let targeting=null,observation=null,targetArmed=false,lastTarget=null,targetTimer=null;
  let mirror=null;
  let compositionField=null;
  const composing=()=>isComposing()||Boolean(compositionField?.isConnected);
  const pdf=installNativePdf({host:pages,onPaint:revision=>{
    if(!active||mode!=='pdf')return;
    renderedRevision=revision;pdfRendered=revision;if(!terminal&&revision>=sourceRevision)error='';renderStatus();
  },onError:failure=>{if(active&&mode==='pdf')fail(failure);}});
  const renderer=installNativePages({host:pages,
    getFont:key=>invoke('native_tex_font',{sessionId:session,key}),
    onPaint:revision=>{
      if(!active||mode!=='canvas')return;
      renderedRevision=revision;if(!terminal&&revision>=sourceRevision)error='';renderStatus();
      syncCaret();
    },
    onError:(failure,revision)=>{if(active&&mode==='canvas')void fallback(failure,revision);},
    onMathHit:async(hit,stamp,origin,sameGesture)=>{
      if(!current()||mode!=='canvas'||!observation||
          stamp.sessionId!==observation.stamp.sessionId||
          stamp.sourceRevision!==observation.stamp.sourceRevision)return;
      const {projection}=observation;
      function resolve(endpoint){
        const owned=projection.owners.get(endpoint.owner);
        if(!owned)return null;
        const {formula,atom}=owned;
        const offset=endpoint.after?formula.math.slots.find(slot=>slot.tag===endpoint.owner&&slot.role==='nucleus')?.raw.length:0;
        if(offset==null)return null;
        try {
          const target=editDisplayMathSlot(formula,formula.source,endpoint,{from16:offset,to16:offset,insert:''});
          return target?{formula,owner:atom,hit:endpoint,position:target.selection.head}:null;
        } catch {return null;}
      }
      const head=resolve(hit),anchor=origin?resolve(origin):head;
      if(!head||!anchor)return false;
      const focused=await focusMathSlot?.(anchor,head,()=>
        sameGesture()&&active&&session===stamp.sessionId&&sourceRevision===stamp.sourceRevision&&
        wantedSnapshot?.signature===sentSnapshot?.signature);
      if(focused?.field&&sameGesture())bindCaret(focused.field,head.formula);
      return Boolean(focused);
    },
  });
  function syncCaret() {
    if(!mirror||!observation||!current()||document.activeElement!==mirror.field)return;
    const formula=[...observation.projection.owners.values()].find(({formula})=>
      formula.kind===mirror.kind&&formula.ordinal===mirror.ordinal&&formula.filePath===mirror.filePath)?.formula;
    if(!formula||formula.math.atoms.length>200||
      mirror.field.value.replace(/\s/g,'')!==formula.math.source.replace(/\s/g,''))return;
    const range=mirror.field.selection.ranges[0];
    if(!range)return;
    const model=mirror.field._mathfield?.model;
    if(!model)return;
    if(mirror.formula!==formula||mirror.model!==model){
      mirror.formula=formula;mirror.model=model;mirror.targets=nativeCaretTargets(model,formula);
    }
    if(range[0]!==range[1]){
      renderer.showSelection(mirror.targets.get(range[0]),mirror.targets.get(range[1]));
      return;
    }
    const target=mirror.targets.get(mirror.field.position);
    if(target)renderer.showCaret(target);
  }
  function bindCaret(field,formula){
    mirror?.lifetime.abort();
    const lifetime=new AbortController();
    mirror={field,lifetime,kind:formula.kind,ordinal:formula.ordinal,filePath:formula.filePath};
    field.addEventListener('selection-change',()=>requestAnimationFrame(syncCaret),{signal:lifetime.signal});
  }
  function current() {
    return active && session!==null && !opening && !composing() && updating!==generation && exporting!==generation &&
      capturing!==generation && !terminal && !error && wantedSnapshot?.signature===sentSnapshot?.signature &&
      wantedSource===sentSource && renderedRevision===sourceRevision;
  }
  function renderStatus() {
    exportButton.disabled=!current();
    targetButton.disabled=!current()||mode!=='canvas'||targeting===generation;
    if(targetArmed&&!targetButton.disabled&&!sentSnapshot?.files&&sentSource.length<=32*1024&&targetTimer===null&&
        (lastTarget?.sessionId!==session||lastTarget?.sourceRevision!==sourceRevision)){
      targetTimer=setTimeout(()=>{
        targetTimer=null;
        if(targetArmed&&!targetButton.disabled)void observe();
      },350);
    }
    button.setAttribute('aria-pressed',String(active));
    button.textContent=active?t('关闭 LuaLaTeX 预览','Close LuaLaTeX preview'):t('LuaLaTeX 预览（实验）','LuaLaTeX preview (experimental)');
    panel.dataset.state=error?'error':current()?'current':active?'stale':'off';
    panel.dataset.renderer=mode;
    status.textContent=error?t('原生预览不可用：','Native preview unavailable: ')+error:
      opening?t('等待信任确认并启动引擎…','Confirm trust and start the engine…'):
      exporting===generation?t('正在导出已确认版本的 PDF…','Exporting the confirmed PDF revision…'):
      current()?t('已显示源码修订 ','Showing source revision ')+sourceRevision+(mode==='pdf'?' · PDF':''):
      t('排版中；现有画面可能过期。编辑可以继续。','Typesetting; the last frame may be stale. Editing can continue.');
  }
  function relocalize() {
    heading.textContent=t('LuaLaTeX 原生排版预览','Native LuaLaTeX preview');
    notice.textContent=t('在原编辑器中编辑，此处显示 LuaLaTeX 输出。复杂字体、图片和绘图使用 PDF 回退；PDF 页面本身不提供公式语义编辑。',
      'Edit in the existing editor; this view shows LuaLaTeX output. Complex fonts, images and drawings use PDF fallback, not semantic formula editing on PDF pages.');
    exportButton.textContent=t('导出干净 PDF','Export clean PDF');
    closeButton.textContent=t('关闭','Close');
    targetButton.textContent=t('定位公式光标（实验）','Target formula caret (experimental)');
    renderStatus();
  }
  async function stop() {
    generation++;captureId++;pollEpoch++;active=false;opening=false;error='';capturing=null;terminal=false;
    clearTimeout(timer);clearTimeout(pollTimer);
    panel.hidden=true;document.body.classList.remove('native-tex-open');
    const previous=session;session=null;
    wantedSnapshot=null;sentSnapshot=null;wantedSource='';sentSource='';
    observation=null;targetStatus.textContent='';
    compositionField=null;
    mirror?.lifetime.abort();mirror=null;
    targetArmed=false;lastTarget=null;clearTimeout(targetTimer);targetTimer=null;
    renderer.reset();pdf.reset();mode='canvas';pdfWanted=-1;pdfLayout=null;pdfRendered=-1;renderedRevision=-1;renderStatus();
    delete panel.dataset.fallbackReason;
    if(previous!==null) {
      try {await invoke('native_tex_close',{sessionId:previous});}
      catch(failure) {console.warn('Native TeX close:',failure);}
    }
  }
  function fail(failure) {
    if(['engine_exit','engine_io','timeout','session_closed','stale_session','event_overflow','protocol'].includes(failure?.code))
      terminal=true;
    error=String(failure?.message??failure);
    renderStatus();
  }
  async function fallback(failure,revision) {
    if(mode==='canvas'){
      panel.dataset.fallbackReason=String(failure?.message??failure).slice(0,300);
      mode='pdf';renderer.reset({clear:false});
    }
    if(!Number.isSafeInteger(revision)||revision<0){fail(failure);return;}
    if(pdfRendered===revision)return;
    pdfWanted=Math.max(pdfWanted,revision);
    if(pdfAttempt?.generation===generation&&pdfAttempt?.sessionId===session)return;
    const attempt=generation;
    const flight={generation:attempt,sessionId:session};
    pdfAttempt=flight;renderStatus();
    try {
      let finished=-1;
      while(active&&attempt===generation&&flight.sessionId===session&&pdfWanted>finished) {
        const target=pdfWanted;
        try {
          const args={sessionId:flight.sessionId,sourceRevision:target};
          let bytes;
          if(pdfLayout?.source_revision===target){
            // The host checks both revisions and retains the only permitted
            // path. Frontend never requests a file by name.
            try {bytes=await invoke('native_tex_pdf',{...args,layoutVersion:pdfLayout.layout_version});}
            catch {/* The captured PDF may have expired; compile a clean copy. */}
          }
          if(attempt!==generation||flight.sessionId!==session)return;
          bytes??=await invoke('native_tex_render_pdf',args);
          if(attempt!==generation||flight.sessionId!==session)return;
          if(target===pdfWanted)await pdf.show(bytes,target);
        }catch(problem){
          if(attempt!==generation||flight.sessionId!==session)return;
          if(problem?.code!=='revision_mismatch'&&target===pdfWanted){fail(problem);return;}
        }
        finished=target;
      }
    }finally{if(pdfAttempt===flight)pdfAttempt=null;}
  }
  async function flush() {
    if(!active || terminal || session===null || updating===generation || exporting===generation ||
      capturing===generation || composing())return;
    const attempt=generation;
    updating=attempt;renderStatus();
    try {
      while(active && attempt===generation && wantedSnapshot?.signature!==sentSnapshot?.signature) {
        const snapshot=wantedSnapshot;
        if(snapshot.mainFile!==sentSnapshot.mainFile)throw new Error(t('主文件已改变，请重新打开原生预览。','Main document changed; reopen native preview.'));
        const files=snapshot.dependencySignature===sentSnapshot.dependencySignature?undefined:snapshot.files;
        const result=await invoke('native_tex_update',{sessionId:session,source:snapshot.source,files});
        if(attempt!==generation){
          if(result.sessionId)await invoke('native_tex_close',{sessionId:result.sessionId}).catch(()=>{});
          return;
        }
        if(result.sessionId&&result.sessionId!==session){
          session=result.sessionId;pollEpoch++;renderedRevision=-1;pdfRendered=-1;pdfWanted=-1;pdfLayout=null;
          renderer.reset({clear:false});pdf.reset({clear:false});
          void poll(attempt,pollEpoch);
        }
        if(observation&&snapshot.source!==observation.projection.source){
          observation=null;targetStatus.textContent='';
        }
        sentSource=snapshot.source;sentSnapshot=snapshot;sourceRevision=result.sourceRevision;error='';
        if(composing())break;
      }
    } catch(failure) {if(attempt===generation)fail(failure);}
    finally {if(updating===attempt)updating=null;if(attempt===generation)renderStatus();}
  }
  async function readSnapshot() {
    if(getSnapshot)return getSnapshot();
    const source=getSource();
    return {source,mainFile:'main.tex',signature:source};
  }
  async function refresh() {
    if(!active)return;
    if(composing()) {renderStatus();return;}
    const attempt=generation,request=++captureId;
    capturing=attempt;renderStatus();
    try {
      const snapshot=await readSnapshot();
      if(attempt!==generation||request!==captureId)return;
      wantedSnapshot=snapshot;wantedSource=snapshot.source;
    }catch(failure) {if(attempt===generation&&request===captureId)fail(failure);return;}
    finally {if(attempt===generation&&request===captureId)capturing=null;}
    if(attempt!==generation||request!==captureId)return;
    clearTimeout(timer);
    renderStatus();
    timer=setTimeout(flush,250);
  }
  async function poll(attempt,epoch=pollEpoch) {
    if(!active || attempt!==generation || epoch!==pollEpoch || session===null)return;
    try {
      const events=await invoke('native_tex_poll',{sessionId:session});
      if(attempt!==generation||epoch!==pollEpoch)return;
      for(const event of events) {
        if(event.event==='ParagraphUpdate'&&event.status==='error'){
          error=event.diagnostics?.map(item=>item.message??String(item)).join('\n').slice(0,2400)||
            t('LuaLaTeX 增量排版失败；修正源码后重试。','LuaLaTeX incremental compilation failed; correct the source and retry.');
        } else if(event.event==='LayoutUpdate' || event.event==='ParagraphUpdate') {
          if(event.event==='LayoutUpdate')pdfLayout=event.pdf_fallback_registered&&
            event.convergence?.state==='Converged'&&event.compile?.state==='Ok'?event.versions:null;
          if(event.event==='LayoutUpdate' && event.compile?.state!=='Ok') {
            error=t('LuaLaTeX 编译未成功；保留上次有效画面。','LuaLaTeX compilation failed; keeping the last valid frame.');
          } else {
            if(mode==='pdf'&&event.event==='LayoutUpdate')void fallback(null,event.versions.source_revision);
            else renderer.accept(event);
          }
        } else if(event.event==='Diagnostics' && event.items?.length) {
          error=event.items.map(item=>item.message??String(item)).join('\n').slice(0,2400);
        }
      }
      renderStatus();
    } catch(failure) {if(attempt===generation&&epoch===pollEpoch)fail(failure);}
    finally {
      if(active && !terminal && attempt===generation&&epoch===pollEpoch)pollTimer=setTimeout(()=>poll(attempt,epoch),100);
    }
  }
  async function start() {
    if(active)return;
    const attempt=++generation;
    active=true;opening=true;error='';terminal=false;renderedRevision=-1;mode='canvas';pdfWanted=-1;pdfRendered=-1;
    panel.hidden=false;document.body.classList.add('native-tex-open');renderStatus();
    try {
      const initial=await readSnapshot();
      if(attempt!==generation)return;
      wantedSource=initial.source;wantedSnapshot=initial;
      const opened=await invoke('native_tex_open',{source:initial.source,mainFile:initial.mainFile,files:initial.files});
      if(attempt!==generation) {
        if(opened)await invoke('native_tex_close',{sessionId:opened.sessionId});
        return;
      }
      if(!opened) {await stop();return;}
      session=opened.sessionId;sourceRevision=opened.sourceRevision;sentSource=initial.source;sentSnapshot=initial;opening=false;
      renderer.reset();pdf.reset();void poll(attempt);
      refresh();renderStatus();
    } catch(failure) {if(attempt===generation){opening=false;fail(failure);}}
  }
  async function exportPdf() {
    if(!current())return;
    const attempt=generation,revision=sourceRevision;
    exporting=attempt;renderStatus();
    try {
      const result=await invoke('native_tex_export',{sessionId:session,sourceRevision:revision});
      if(attempt!==generation)return;
      if(result)status.textContent=t('已导出源码修订 ','Exported source revision ')+result.sourceRevision+' — '+result.path;
    } catch(failure) {if(attempt===generation)fail(failure);}
    finally {if(exporting===attempt)exporting=null;if(attempt===generation){void flush();exportButton.disabled=!current();}}
  }
  async function observe() {
    if(targetButton.disabled)return;
    const stamp={sessionId:session,sourceRevision};
    lastTarget=stamp;
    const projection=projectSnapshotFormulas(sentSnapshot);
    if(!projection||![...projection.owners.values()].some(({atom})=>['frac','sqrt','token','cell'].includes(atom.kind))){
      targetStatus.textContent=t('当前文档没有可定位的公式。','No supported formula in this document snapshot.');
      return;
    }
    const attempt=generation;
    targeting=attempt;observation=null;renderStatus();
    targetStatus.textContent=t('正在核对源码标记及实际排版…','Checking projected source against the visible layout…');
    try {
      const observed=await invoke('native_tex_observe_formula',{...stamp,projection:projection.projection,files:projection.files});
      if(attempt!==generation||stamp.sessionId!==session||stamp.sourceRevision!==sourceRevision||
          sentSource!==projection.source||wantedSource!==projection.source)return;
      if(!renderer.attachOwners(observed,stamp,projection.owners))throw new Error(t('标记版排版与当前页面不一致，未启用命中。','Projected geometry differs from the displayed page; targeting remains disabled.'));
      observation={projection,stamp};
      requestAnimationFrame(syncCaret);
      targetStatus.textContent=t('点击预览中的空槽或字符边缘，继续在编辑器输入。','Click the empty numerator or denominator, another supported empty slot, or a glyph edge to continue typing in the editor.');
    } catch(failure) {
      if(attempt===generation)targetStatus.textContent=String(failure?.message??failure);
    } finally {
      if(targeting===attempt)targeting=null;
      if(attempt===generation)renderStatus();
    }
  }
  button.addEventListener('click',()=>{void(active?stop():start());});
  button.addEventListener('mousedown',event=>event.preventDefault());
  closeButton.addEventListener('click',()=>{void stop();});
  exportButton.addEventListener('click',()=>{void exportPdf();});
  targetButton.addEventListener('click',()=>{
    targetArmed=true;clearTimeout(targetTimer);targetTimer=null;void observe();
  });
  zoom.addEventListener('change',()=>{
    const value=Number(zoom.value)/100;
    renderer.setZoom(value);pdf.setZoom(value);
  });
  window.addEventListener('pagehide',()=>{void stop();});
  document.addEventListener('compositionstart',event=>{
    if(event.target?.tagName==='MATH-FIELD')compositionField=event.target;
    if(active){renderer.clearCaret();renderStatus();}
  },true);
  document.addEventListener('compositionend',event=>{
    if(event.target===compositionField)compositionField=null;
    setTimeout(refresh,0);
  },true);
  relocalize();renderer.setZoom(.75);pdf.setZoom(.75);
  return {refresh,documentChanged:()=>{void stop();},relocalize};
}
