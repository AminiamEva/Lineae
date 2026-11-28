import {alignPageCanvas,sizePageCanvas} from './page-pixels.mjs';

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
    // PDF.js can yield many times while drawing fonts. Keep the committed
    // canvas (and its hit-test identity) intact until the replacement is ready.
    const buffer=document.createElement('canvas');
    sizePageCanvas(buffer,viewport.width,viewport.height,dpr);
    const task=entry.page.render({canvasContext:buffer.getContext('2d'),viewport,
      transform:dpr===1?null:[dpr,0,0,dpr,0,0],annotationMode:0});
    entry.render=task;
    try {
      await task.promise;
      if(attempt===epoch&&entry.render===task){
        sizePageCanvas(entry.canvas,viewport.width,viewport.height,dpr);
        entry.canvas.getContext('2d').drawImage(buffer,0,0);
        entry.painted={zoom:renderZoom,dpr};
        entry.dom.dataset.paintRevision=String(revision);
        onPaint(revision);
      }
    }catch(error){if(error.name!=='RenderingCancelledException'&&attempt===epoch)onError(error);}
    finally {if(entry.render===task)entry.render=null;}
  }
  function redraw() {
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      const attempt=epoch;
      const viewport=host.getBoundingClientRect();
      if(!viewport.width||!viewport.height)return;
      for(const entry of pages) {
        const box=entry.dom.getBoundingClientRect();
        if(box.bottom>=0 && box.top<window.innerHeight+600){
          alignPageCanvas(entry.canvas,box,window.devicePixelRatio||1);
          void draw(entry,attempt).catch(onError);
        }
        else if(!entry.render&&entry.painted){
          entry.canvas.width=1;entry.canvas.height=1;entry.painted=null;delete entry.dom.dataset.paintRevision;
        }
      }
    });
  }
  async function show(bytes,sourceRevision) {
    const attempt=++epoch;
    clearTasks();
    pages=[];
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
      const old=host.querySelector('[data-pdf-page="'+number+'"],[data-native-page="'+number+'"]');
      const dom=old??document.createElement('div'),canvas=dom.querySelector('canvas')??document.createElement('canvas');
      dom.className='native-tex-page';dom.dataset.pdfPage=String(number);
      if(!canvas.parentNode){canvas.width=1;canvas.height=1;dom.append(canvas);}
      dom.style.width=viewport.width+'px';dom.style.height=viewport.height+'px';
      canvas.setAttribute('aria-label','LuaLaTeX PDF page '+number);
      next.push({number,dom,canvas,page,render:null});
    }
    pages=next;revision=sourceRevision;
    if(host.children.length!==pages.length||pages.some((entry,i)=>host.children[i]!==entry.dom))
      host.replaceChildren(...pages.map(entry=>entry.dom));
    redraw();
    return pages.map(({number,dom,canvas,page})=>{
      const standard=page.rotate===0&&page.userUnit===1&&page.view[0]===0&&page.view[1]===0;
      const {width,height}=page.getViewport({scale:1});
      return {number,dom,canvas,width:standard?width:NaN,height:standard?height:NaN};
    });
  }
  function reset({clear=true}={}) {
    epoch++;revision=-1;cancelAnimationFrame(frame);frame=0;clearTasks();pages=[];
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
