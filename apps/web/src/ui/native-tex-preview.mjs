import {t} from './i18n.mjs';
import {installNativePages} from '../typesetting/rtex/pages.mjs';
import {installNativePdf} from '../typesetting/rtex/pdf.mjs';
import {matchesRichFormula,nativeCaretTargets} from '../editor/native-math/rich-slot.mjs';
import {createMathSurface,surfaceCaretRect} from '../editor/native-surface/math-surface.mjs';
import {createTextSurface} from '../editor/native-surface/text-surface.mjs';
import {projectMixedDocument,projectMixedSnapshot,textTarget} from '../editor/native-text/projection.mjs';
import {nativeTarget} from '../editor/native-math/resolve.mjs';

// Native LaTeX output is the primary page. The opt-in native input mode sends
// supported keys, caret and IME through this surface into ProseMirror; the old
// JS-formatted page and MathLive inputs stay available as the migration fallback.
export function installNativeTexPreview({host,before,getSource,getSnapshot,isComposing,focusMathSlot,commitMath,commitText,history}) {
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
  const editButton=document.createElement('button');editButton.type='button';editButton.id='native-tex-edit';
  editButton.setAttribute('aria-pressed','false');
  const targetStatus=document.createElement('p');targetStatus.setAttribute('role','status');
  const zoom=document.createElement('select');zoom.id='native-tex-zoom';
  for(const value of [50,75,100,125,150,200]) zoom.append(new Option(value+'%',String(value)));
  zoom.value='75';zoom.setAttribute('aria-label',t('原生预览缩放','Native preview zoom'));
  controls.append(zoom,editButton,exportButton,targetButton,closeButton);
  const pages=document.createElement('div');pages.className='native-tex-pages';
  const input=document.createElement('textarea');
  input.id='native-tex-input';input.className='native-tex-input';input.rows=1;
  input.spellcheck=false;input.autocapitalize='off';input.autocomplete='off';
  input.setAttribute('aria-label',t('原生公式输入','Native formula input'));
  panel.append(heading,notice,controls,status,targetStatus,pages);
  panel.append(input);
  document.body.append(panel);host.insertBefore(button,before);
  let session=null,sourceRevision=0,sentSource='',wantedSource='',generation=0;
  let timer=null,pollTimer=null,updating=null,exporting=null,opening=false;
  let sentSnapshot=null,wantedSnapshot=null,captureId=0,capturing=null,pdfRendered=-1;
  let renderedRevision=-1,error='',active=false,terminal=false;
  let mode='canvas',pdfWanted=-1,pdfAttempt=null,pdfLayout=null;
  let pollEpoch=0;
  let targeting=null,observation=null,targetArmed=false,lastTarget=null,targetTimer=null;
  let previousProjection=null;
  let mirror=null;
  let compositionField=null;
  const composing=()=>isComposing()||Boolean(compositionField?.isConnected);
  const mathSurface=createMathSurface({resolve:endpoint=>{
    const target=resolveEndpoint(endpoint);
    return target?.kind==='math'?target:null;
  }});
  let textSurface=null;
  let surface=mathSurface;
  let nativeEditing=false;
  let pendingLatency=null;
  let inputStart=0;
  const latency=[];
  const eventApi=window.__TAURI__?.event;
  function resolveEndpoint(endpoint) {
    const owned=observation?.projection?.owners.get(endpoint?.owner);
    if(owned?.paragraph)
      return textTarget(observation.projection, endpoint.owner, Boolean(endpoint.after));
    return nativeTarget(observation?.projection, endpoint);
  }
  function targetSurface(target) {
    return target?.kind==='text'?textSurface:mathSurface;
  }
  function paintSurfaceSelection() {
    const caret = surface.caret, anchor = surface.anchor;
    if (!caret) return;
    if (anchor && anchor.docOffset !== caret.docOffset) renderer.showSelection(anchor.hit, caret.hit);
    else renderer.showCaret(caret.hit);
  }
  function positionInput() {
    const stop = surface.caret;
    if (!stop) return;
    const canvas = pages.querySelector(`[data-native-page="${stop.page}"] canvas`);
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const scale = Number(zoom.value) / 100 * (96 / 72) / 65781.76;
    const rect = surfaceCaretRect(stop, scale, box.left, box.top);
    if (!rect) return;
    input.style.left = rect.x + 'px';
    input.style.top = rect.y + 'px';
    input.style.height = Math.max(14, rect.height) + 'px';
  }
  function commitSurface(edit) {
    if (!edit) return;
    const started=inputStart || performance.now();
    inputStart=0;
    const applied = edit.kind === 'text'
      ? commitText?.({ paragraph: edit.paragraph, patch: edit.patch, text: edit.text })
      : commitMath?.({ formula: edit.formula, patch: edit.patch, text: edit.text, structure:edit.structure });
    input.value = '';
    if (!applied) {
      surface.clearPending();
      targetStatus.textContent = t('原生编辑未能写入文档。', 'The native edit could not be written to the document.');
      return;
    }
    pendingLatency ??= {started, committed:performance.now()};
    return true;
  }
  function selectedSource() {
    const [from,to]=surface.range;
    if(!from||from===to)return null;
    if(from.kind==='text'&&from.paragraph===to.paragraph)
      return from.paragraph.text.slice(from.local,to.local);
    if(from.kind==='math'&&from.formula===to.formula&&from.slot.id===to.slot.id)
      return from.slot.raw.slice(from.local,to.local);
    return null;
  }
  for(const type of ['copy','cut']){
    input.addEventListener(type,event=>{
      const text=selectedSource();
      if(text===null||!event.clipboardData)return;
      if(type==='cut'){
        if(!current()||!observation)return;
        const edit=surface.erase();
        if(!commitSurface(edit))return;
      }
      event.clipboardData.setData('text/plain',text);
      event.preventDefault();
    });
  }
  input.addEventListener('paste',event=>{
    if(!nativeEditing||!event.clipboardData)return;
    event.preventDefault();
    if(!current()||!observation)return;
    const text=event.clipboardData.getData('text/plain');
    if(text)commitSurface(surface.insert(text));
  });
  input.addEventListener('compositionstart', () => { compositionField = input; });
  input.addEventListener('compositionend', event => {
    compositionField = null;
    if (event.data) commitSurface(surface.insert(event.data));
    input.value = '';
    setTimeout(refresh, 0);
  });
  input.addEventListener('input', event => {
    if (event.isComposing || composing()) return;
    const text = input.value;
    if (!text) return;
    commitSurface(surface.insert(text));
    input.value = '';
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (nativeEditing === false) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey && [...event.key].length===1) inputStart=performance.now();
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      surface.clearPending();
      history?.(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      surface.clearPending();
      history?.('redo');
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (surface.move(event.key === 'ArrowLeft' ? -1 : 1, event.shiftKey)) {
        paintSurfaceSelection();
        positionInput();
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      surface.move(event.key === 'Home' ? -1e6 : 1e6, event.shiftKey);
      paintSurfaceSelection();
      positionInput();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      inputStart = performance.now();
      commitSurface(surface.erase(event.key === 'Backspace'));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      input.blur();
      return;
    }
    if (event.key === 'Enter') event.preventDefault();
  });
  let unlisten=null;
  let eventsLive=false;
  if(eventApi?.listen){
    eventApi.listen('lineae-native-tex',({payload})=>{
      if(!active||!payload||payload.sessionId!==session)return;
      handleEvent(payload.event);
      renderStatus();
    }).then(fn=>{unlisten=fn;eventsLive=true;}).catch(()=>{});
  }
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
      const head=resolveEndpoint(hit),anchor=origin?resolveEndpoint(origin):head;
      if(!head||!anchor||head.kind!==anchor.kind)return false;
      if((anchor.kind==='text'||head.kind==='text')&&!nativeEditing)return false;
      if(nativeEditing){
        const next=targetSurface(head);
        if(!next||!next.selectBetween(anchor.docOffset,head.docOffset,anchor.formula?.filePath??anchor.paragraph?.filePath,
          head.formula?.filePath??head.paragraph?.filePath))return false;
        surface=next;
        inputStart=performance.now();
        paintSurfaceSelection();positionInput();input.focus({preventScroll:true});
        return true;
      }
      const focused=await focusMathSlot?.(anchor,head,()=>
        sameGesture()&&active&&session===stamp.sessionId&&sourceRevision===stamp.sourceRevision&&
        wantedSnapshot?.signature===sentSnapshot?.signature);
      if(focused?.field&&sameGesture())bindCaret(focused.field,head.formula);
      return Boolean(focused);
    },
  });
  function syncCaret() {
    if(!observation||observation.kind==='text'||!mirror||!current()||document.activeElement!==mirror.field)return;
    const formula=[...observation.projection.owners.values()].find(({formula})=>
      formula&&formula.kind===mirror.kind&&formula.ordinal===mirror.ordinal&&
      formula.filePath===mirror.filePath)?.formula;
    if(!formula||formula.math.atoms.length>200||!matchesRichFormula(mirror.field,formula))return;
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
    editButton.disabled=!current()||mode!=='canvas'||!observation;
    editButton.setAttribute('aria-pressed',String(nativeEditing));
    const canRefreshTargets=nativeEditing||(!sentSnapshot?.files&&sentSource.length<=32*1024);
    if(targetArmed&&!targetButton.disabled&&canRefreshTargets&&targetTimer===null&&
        (lastTarget?.sessionId!==session||lastTarget?.sourceRevision!==sourceRevision||
         lastTarget?.signature!==sentSnapshot?.signature)){
      targetTimer=setTimeout(()=>{
        targetTimer=null;
        if(targetArmed&&!targetButton.disabled)void observe();
      },nativeEditing?0:350);
    }
    button.setAttribute('aria-pressed',String(active));
    button.textContent=active?t('关闭 LuaLaTeX 预览','Close LuaLaTeX preview'):t('LuaLaTeX 预览（实验）','LuaLaTeX preview (experimental)');
    panel.dataset.state=error?'error':current()?'current':active?'stale':'off';
    panel.dataset.renderer=mode;
    panel.dataset.editing=String(nativeEditing);
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
    editButton.textContent=nativeEditing?t('退出原生输入','Leave native input'):t('原生输入（实验）','Native input (experimental)');
    editButton.title=t('在原生排版页面上直接输入；ProseMirror 继续保存历史。','Type directly on native pages; ProseMirror keeps the history.');
    renderStatus();
  }
  async function stop() {
    generation++;captureId++;pollEpoch++;active=false;opening=false;error='';capturing=null;terminal=false;
    clearTimeout(timer);clearTimeout(pollTimer);
    panel.hidden=true;document.body.classList.remove('native-tex-open');
    const previous=session;session=null;
    wantedSnapshot=null;sentSnapshot=null;wantedSource='';sentSource='';
    observation=null;targetStatus.textContent='';
    previousProjection=null;
    nativeEditing=false;mathSurface.clearPending();mathSurface.reset();
    textSurface?.clearPending();textSurface?.reset();textSurface=null;surface=mathSurface;
    input.blur();input.value='';
    pendingLatency=null;inputStart=0;latency.length=0;delete panel.dataset.latencySamples;
    delete panel.dataset.latencyP50;delete panel.dataset.latencyP95;delete panel.dataset.latencyP99;
    delete panel.dataset.latencyLastTransaction;
    delete panel.dataset.latencyLastGeometry;
    delete panel.dataset.latencyLastRepaint;
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
        if(observation&&snapshot.signature!==sentSnapshot.signature){
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
    renderStatus();
    void flush();
  }
  async function poll(attempt,epoch=pollEpoch) {
    if(!active || attempt!==generation || epoch!==pollEpoch || session===null)return;
    try {
      const events=await invoke('native_tex_poll',{sessionId:session});
      if(attempt!==generation||epoch!==pollEpoch)return;
      for(const event of events)handleEvent(event);
      renderStatus();
    } catch(failure) {
      if(attempt===generation&&epoch===pollEpoch&&!eventsLive)fail(failure);
    }
    finally {
      if(!eventsLive&&active && !terminal && attempt===generation&&epoch===pollEpoch)
        pollTimer=setTimeout(()=>poll(attempt,epoch),100);
    }
  }
  // Protocol events are pushed from the Rust reader. Polling is only a
  // compatibility fallback for hosts without a Tauri event bridge.
  function handleEvent(event) {
    if(!event)return;
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
    const signature=sentSnapshot.signature;
    lastTarget={...stamp,signature};
    const projection=sentSnapshot?.files?.length
      ?projectMixedSnapshot(sentSnapshot,previousProjection)
      :projectMixedDocument(sentSource,{previous:previousProjection??[]});
    if(!projection||!projection.owners.size){
      targetStatus.textContent=t('当前文档没有可定位的公式或纯文本段落。','No supported formula or plain paragraph in this document snapshot.');
      return;
    }
    const kind=projection.kind;
    if(kind==='math'&&![...projection.owners.values()].some(({atom})=>
      atom&&['frac','sqrt','token','cell'].includes(atom.kind))){
      targetStatus.textContent=t('当前文档没有可定位的公式或纯文本段落。','No supported formula or plain paragraph in this document snapshot.');
      return;
    }
    const attempt=generation;
    targeting=attempt;observation=null;renderStatus();
    targetStatus.textContent=t('正在核对源码标记及实际排版…','Checking projected source against the visible layout…');
    try {
      const observed=await invoke('native_tex_observe_formula',{...stamp,projection:projection.projection,
        files:projection.files});
      if(attempt!==generation||stamp.sessionId!==session||stamp.sourceRevision!==sourceRevision||
          sentSnapshot?.signature!==signature||wantedSnapshot?.signature!==signature||
          sentSource!==projection.source||wantedSource!==projection.source)return;
      if(!renderer.attachOwners(observed,stamp,projection.owners))throw new Error(t('标记版排版与当前页面不一致，未启用命中。','Projected geometry differs from the displayed page; targeting remains disabled.'));
      if(kind==='text'||kind==='mixed'){
        if(textSurface)textSurface.setProjection(projection);
        else textSurface=createTextSurface({projection});
      }
      if(kind!=='text')previousProjection=projection;
      observation={kind,projection,stamp,observed};
      if(nativeEditing){
        const candidates=kind==='mixed'?[mathSurface,textSurface]:kind==='text'?[textSurface]:[mathSurface];
        let applied=false;
        for(const candidate of candidates) if(candidate.setObservation(observed))applied=true;
        if(!candidates.includes(surface))surface=candidates.find(candidate=>candidate.caret)??candidates[0];
        if(applied){
          paintSurfaceSelection();
          positionInput();
          if(pendingLatency){
            const sample=pendingLatency;
            const geometry=performance.now();
            pendingLatency=null;
            // The next animation frame after the caret update bounds browser
            // repaint. It does not measure device input or display scan-out.
            requestAnimationFrame(()=>requestAnimationFrame(()=>{
              if(attempt!==generation)return;
              const repaint=performance.now();
              latency.push(repaint-sample.started);
              const ordered=[...latency].sort((left,right)=>left-right);
              const percentile=q=>ordered[Math.ceil(ordered.length*q)-1].toFixed(1);
              panel.dataset.latencySamples=String(ordered.length);
              panel.dataset.latencyP50=percentile(.50);
              panel.dataset.latencyP95=percentile(.95);
              panel.dataset.latencyP99=percentile(.99);
              panel.dataset.latencyLastTransaction=(sample.committed-sample.started).toFixed(1);
              panel.dataset.latencyLastGeometry=(geometry-sample.committed).toFixed(1);
              panel.dataset.latencyLastRepaint=(repaint-geometry).toFixed(1);
            }));
          }
          input.focus({preventScroll:true});
        }
      }
      requestAnimationFrame(syncCaret);
      targetStatus.textContent=kind==='text'
        ?t('点击原生页面中的文字定位光标，输入会写入原文。','Click text on the native page to place the caret; typing edits the source.')
        :kind==='mixed'
        ?t('点击原生页面中的文字或空槽定位光标，输入会写入原文。','Click prose on the native page, or click the empty numerator or denominator, another supported empty slot, or a glyph edge to continue typing.')
        :t('点击预览中的空槽或字符边缘，继续在编辑器输入。','Click the empty numerator or denominator, another supported empty slot, or a glyph edge to continue typing in the editor.');
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
  editButton.addEventListener('mousedown',event=>event.preventDefault());
  editButton.addEventListener('click',()=>{
    if(nativeEditing){
      nativeEditing=false;surface.clearPending();input.blur();renderStatus();return;
    }
    if(!observation)return;
    nativeEditing=true;targetArmed=true;
    const candidates=observation.kind==='mixed'?[mathSurface,textSurface]:
      observation.kind==='text'?[textSurface]:[mathSurface];
    let applied=false;
    for(const candidate of candidates) if(candidate.setObservation(observation.observed))applied=true;
    if(!applied){
      nativeEditing=false;renderStatus();return;
    }
    if(!candidates.includes(surface))surface=candidates.find(candidate=>candidate.caret)??candidates[0];
    if(surface.caret){
      paintSurfaceSelection();positionInput();input.focus({preventScroll:true});
    }
    renderStatus();
  });
  zoom.addEventListener('change',()=>{
    const value=Number(zoom.value)/100;
    renderer.setZoom(value);pdf.setZoom(value);
    if(nativeEditing){paintSurfaceSelection();positionInput();}
  });
  window.addEventListener('resize',()=>{if(nativeEditing)positionInput();});
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
  return {
    refresh,documentChanged:()=>{void stop();},relocalize,
    hasMathInput: event => event.target===input && nativeEditing && surface===mathSurface,
    runMathCommand(command) {
      if(command==='undo'||command==='redo'){
        surface.clearPending();
        history?.(command);
        return true;
      }
      if(!current()||!observation||surface!==mathSurface)return false;
      const edit=surface.command(command);
      if(!edit)return false;
      inputStart=performance.now();
      commitSurface(edit);
      return true;
    },
  };
}
