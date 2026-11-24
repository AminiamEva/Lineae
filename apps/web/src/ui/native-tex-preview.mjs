import {t} from './i18n.mjs';
import {installNativePages} from '../typesetting/rtex/pages.mjs';

// This surface never edits source or intercepts editor input. The existing
// ProseMirror/MathLive history stays authoritative while native parity is built.
export function installNativeTexPreview({host,before,getSource,isComposing}) {
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
  const zoom=document.createElement('select');zoom.id='native-tex-zoom';
  for(const value of [50,75,100,125,150,200]) zoom.append(new Option(value+'%',String(value)));
  zoom.value='75';zoom.setAttribute('aria-label',t('原生预览缩放','Native preview zoom'));
  controls.append(zoom,exportButton,closeButton);
  const pages=document.createElement('div');pages.className='native-tex-pages';
  panel.append(heading,notice,controls,status,pages);
  document.body.append(panel);host.insertBefore(button,before);
  let session=null,sourceRevision=0,sentSource='',wantedSource='',generation=0;
  let timer=null,pollTimer=null,updating=null,exporting=null,opening=false;
  let renderedRevision=-1,error='',active=false;
  const renderer=installNativePages({host:pages,
    getFont:key=>invoke('native_tex_font',{sessionId:session,key}),
    onPaint:revision=>{
      if(!active)return;
      renderedRevision=revision;renderStatus();
    },
    onError:failure=>{error=String(failure?.message??failure);renderStatus();},
  });
  function current() {
    return active && session!==null && !opening && updating!==generation && exporting!==generation && !error &&
      wantedSource===sentSource && renderedRevision===sourceRevision;
  }
  function renderStatus() {
    exportButton.disabled=!current();
    button.setAttribute('aria-pressed',String(active));
    button.textContent=active?t('关闭 LuaLaTeX 预览','Close LuaLaTeX preview'):t('LuaLaTeX 预览（实验）','LuaLaTeX preview (experimental)');
    panel.dataset.state=error?'error':current()?'current':active?'stale':'off';
    status.textContent=error?t('原生预览不可用：','Native preview unavailable: ')+error:
      opening?t('等待信任确认并启动引擎…','Confirm trust and start the engine…'):
      exporting===generation?t('正在导出已确认版本的 PDF…','Exporting the confirmed PDF revision…'):
      current()?t('已显示源码修订 ','Showing source revision ')+sourceRevision:
      t('排版中；现有画面可能过期。编辑可以继续。','Typesetting; the last frame may be stale. Editing can continue.');
  }
  function relocalize() {
    heading.textContent=t('LuaLaTeX 原生排版预览','Native LuaLaTeX preview');
    notice.textContent=t('实验：在原编辑器中编辑，此处只读。尚不支持项目依赖、图片或非 OpenType 字体。',
      'Experimental: edit in the existing editor; this view is read-only. Project dependencies, images and non-OpenType fonts are not supported yet.');
    exportButton.textContent=t('导出干净 PDF','Export clean PDF');
    closeButton.textContent=t('关闭','Close');
    renderStatus();
  }
  async function stop() {
    generation++;active=false;opening=false;error='';
    clearTimeout(timer);clearTimeout(pollTimer);
    panel.hidden=true;document.body.classList.remove('native-tex-open');
    const previous=session;session=null;
    renderer.reset();renderedRevision=-1;renderStatus();
    if(previous!==null) {
      try {await invoke('native_tex_close',{sessionId:previous});}
      catch(failure) {console.warn('Native TeX close:',failure);}
    }
  }
  function fail(failure) {
    error=String(failure?.message??failure);
    renderStatus();
  }
  async function flush() {
    if(!active || session===null || updating===generation || exporting===generation || isComposing())return;
    const attempt=generation;
    updating=attempt;renderStatus();
    try {
      while(active && attempt===generation && wantedSource!==sentSource) {
        const text=wantedSource;
        const result=await invoke('native_tex_update',{sessionId:session,source:text});
        if(attempt!==generation)return;
        sentSource=text;sourceRevision=result.sourceRevision;error='';
        if(isComposing())break;
      }
    } catch(failure) {if(attempt===generation)fail(failure);}
    finally {if(updating===attempt)updating=null;if(attempt===generation)renderStatus();}
  }
  function refresh() {
    if(!active)return;
    if(isComposing()) {
      renderedRevision=-1;renderStatus();return;
    }
    try {wantedSource=getSource();}
    catch(failure) {fail(failure);return;}
    clearTimeout(timer);
    renderStatus();
    timer=setTimeout(flush,250);
  }
  async function poll(attempt) {
    if(!active || attempt!==generation || session===null)return;
    try {
      const events=await invoke('native_tex_poll',{sessionId:session});
      if(attempt!==generation)return;
      for(const event of events) {
        if(event.event==='LayoutUpdate' || event.event==='ParagraphUpdate') {
          if(event.event==='LayoutUpdate' && event.compile?.state!=='Ok') {
            error=t('LuaLaTeX 编译未成功；保留上次有效画面。','LuaLaTeX compilation failed; keeping the last valid frame.');
          } else {
            error='';renderer.accept(event);
          }
        } else if(event.event==='Diagnostics' && event.items?.length) {
          error=event.items.map(item=>item.message??String(item)).join('\n').slice(0,2400);
        }
      }
      renderStatus();
    } catch(failure) {if(attempt===generation)fail(failure);}
    finally {
      if(active && attempt===generation)pollTimer=setTimeout(()=>poll(attempt),100);
    }
  }
  async function start() {
    if(active)return;
    try {wantedSource=getSource();}
    catch(failure) {panel.hidden=false;fail(failure);return;}
    const attempt=++generation;
    const initial=wantedSource;
    active=true;opening=true;error='';renderedRevision=-1;
    panel.hidden=false;document.body.classList.add('native-tex-open');renderStatus();
    try {
      const opened=await invoke('native_tex_open',{source:initial});
      if(attempt!==generation) {
        if(opened)await invoke('native_tex_close',{sessionId:opened.sessionId});
        return;
      }
      if(!opened) {await stop();return;}
      session=opened.sessionId;sourceRevision=opened.sourceRevision;sentSource=initial;opening=false;
      renderer.reset();void poll(attempt);
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
  button.addEventListener('click',()=>{void(active?stop():start());});
  button.addEventListener('mousedown',event=>event.preventDefault());
  closeButton.addEventListener('click',()=>{void stop();});
  exportButton.addEventListener('click',()=>{void exportPdf();});
  zoom.addEventListener('change',()=>renderer.setZoom(Number(zoom.value)/100));
  window.addEventListener('pagehide',()=>{void stop();});
  document.addEventListener('compositionend',refresh,true);
  relocalize();renderer.setZoom(.75);
  return {refresh,documentChanged:()=>{void stop();},relocalize};
}
