let library;
async function pdfjs() {
  if(!library)library=(async()=>{
    const base=new URL('vendor/pdfjs/',document.baseURI);
    const url=new URL('legacy/build/pdf.mjs?v=4.10.38',base);
    const api=await import(url.href);
    api.GlobalWorkerOptions.workerSrc=new URL('legacy/build/pdf.worker.mjs?v=4.10.38',base).href;
    return {api,base};
  })();
  return library;
}

// PDF pixels may be paired with a separately verified native geometry revision.
export function installNativePdf({host,onPaint,onError}) {
  let epoch=0,zoom=.75,documentTask=null,pages=[],revision=-1,frame=0;
  const clearTasks=()=>{
    for(const entry of pages){entry.render?.cancel();entry.render=null;}
  };
  async function draw(entry,attempt) {
    if(entry.render)return;
    const renderZoom=zoom;
    const viewport=entry.page.getViewport({scale:renderZoom*96/72});
    const dpr=window.devicePixelRatio||1;
    if(entry.painted?.zoom===renderZoom&&entry.painted.dpr===dpr)return;
    if(viewport.width*dpr>16384 || viewport.height*dpr>16384)throw new Error('PDF page exceeds supported Canvas size at this zoom');
    entry.painted=null;
    entry.canvas.width=Math.ceil(viewport.width*dpr);entry.canvas.height=Math.ceil(viewport.height*dpr);
    entry.canvas.style.width=viewport.width+'px';entry.canvas.style.height=viewport.height+'px';
    entry.dom.style.width=viewport.width+'px';entry.dom.style.height=viewport.height+'px';
    const task=entry.page.render({canvasContext:entry.canvas.getContext('2d'),viewport,
      transform:dpr===1?null:[dpr,0,0,dpr,0,0],annotationMode:0});
    entry.render=task;
    try {
      await task.promise;
      if(attempt===epoch&&entry.render===task){
        entry.painted={zoom:renderZoom,dpr};
        onPaint(revision);
      }
    }catch(error){if(error.name!=='RenderingCancelledException'&&attempt===epoch)onError(error);}
    finally {if(entry.render===task)entry.render=null;}
  }
  function redraw() {
    cancelAnimationFrame(frame);
    const attempt=epoch;
    frame=requestAnimationFrame(()=>{
      for(const entry of pages) {
        const box=entry.dom.getBoundingClientRect();
        if(box.bottom>=0 && box.top<window.innerHeight+600)void draw(entry,attempt).catch(onError);
        else if(!entry.render&&entry.painted){
          entry.canvas.width=1;entry.canvas.height=1;entry.painted=null;
        }
      }
    });
  }
  async function show(bytes,sourceRevision) {
    const attempt=++epoch;
    clearTasks();
    const previous=documentTask;
    documentTask=null;
    await previous?.destroy();
    const {api,base}=await pdfjs();
    if(attempt!==epoch)return;
    const task=api.getDocument({data:new Uint8Array(bytes),
      cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,
      standardFontDataUrl:new URL('standard_fonts/',base).href,
      useSystemFonts:false,isEvalSupported:false,enableXfa:false});
    documentTask=task;
    const doc=await task.promise;
    if(attempt!==epoch){await task.destroy();return;}
    const next=[];
    for(let number=1;number<=doc.numPages;number++) {
      const page=await doc.getPage(number);
      if(attempt!==epoch)return;
      const viewport=page.getViewport({scale:zoom*96/72});
      const dom=document.createElement('div'),canvas=document.createElement('canvas');
      dom.className='native-tex-page';dom.dataset.pdfPage=String(number);
      canvas.width=1;canvas.height=1;
      dom.style.width=viewport.width+'px';dom.style.height=viewport.height+'px';
      canvas.setAttribute('aria-label','LuaLaTeX PDF page '+number);
      dom.append(canvas);next.push({number,dom,canvas,page,render:null});
    }
    pages=next;revision=sourceRevision;
    host.replaceChildren(...pages.map(entry=>entry.dom));
    redraw();
    return pages.map(({number,dom,canvas,page})=>{
      const standard=page.rotate===0&&page.userUnit===1&&page.view[0]===0&&page.view[1]===0;
      const {width,height}=page.getViewport({scale:1});
      return {number,dom,canvas,width:standard?width:NaN,height:standard?height:NaN};
    });
  }
  function reset({clear=true}={}) {
    epoch++;revision=-1;cancelAnimationFrame(frame);clearTasks();pages=[];
    void documentTask?.destroy();documentTask=null;if(clear)host.replaceChildren();
  }
  host.addEventListener('scroll',redraw,{passive:true});
  host.parentElement?.addEventListener('scroll',redraw,{passive:true});
  window.addEventListener('resize',redraw);
  return {show,reset,redraw,setZoom(value){
    zoom=value;clearTasks();
    for(const entry of pages) {
      const viewport=entry.page.getViewport({scale:zoom*96/72});
      entry.dom.style.width=viewport.width+'px';entry.dom.style.height=viewport.height+'px';
    }
    redraw();
  }};
}
