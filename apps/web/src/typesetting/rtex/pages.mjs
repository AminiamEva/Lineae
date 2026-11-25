import {rasterContains,stagedRasterPath} from './raster-assets.mjs';
import {nativeFontFace} from './font-collection.mjs';
import {FontStore,Painter,inexactReason} from './upstream/webview/render.ts';
import {fontKey} from './upstream/src/fontKey.ts';
import {hitMathField,hitMathGlyph} from '../../editor/native-math/hit.mjs';
import {warmRows} from './warm-rows.mjs';

const CSS_PER_SP=(96/72)/65781.76;

// Strict read-only full-page adapter. No browser font fallback or inferred
// glyph positions: a page is shown only when all its resources are exact.
export function installNativePages({host,getFont,getRaster,onPaint,onError,onMathHit,onImageHit,proseRanges,foldLabel,onExpandFile}) {
  let generation=0,epoch=0,zoom=.75,revision=-1,layoutVersion=-1;
  let fonts=new FontStore();
  const imageResources=new Map(),imageLoads=new Map();
  const images={get:file=>imageResources.get(file)};
  const pages=new Map(),loaded=new Map();
  let frame=0;
  let ownership=null;
  let boundaries=[],boundaryMarks=[];
  let foldedRanges=[],foldMasks=[],hiddenPages=[];
  let complete=null,warm=null;
  let pdfBacked=false;
  function drawing(dl) {
    const resources=Object.entries(dl.images_info??{}).map(([key,info])=>
      [key,{...info,file:stagedRasterPath(info.file)??info.file}]);
    const paintable=items=>items.filter(item=>item[0]!=='m');
    return JSON.stringify([dl.page_width,dl.page_height,dl.fonts,paintable(dl.other),resources,
      dl.lines.map(line=>[line.x,line.y,line.w,line.h,line.d,paintable(line.items)])]);
  }
  function attachOwners(observed,stamp,owners) {
    if(warm||stamp.sourceRevision!==revision||observed.length!==pages.size)return false;
    const fields=new Map(),glyphs=new Map(),selectionGlyphs=new Map(),seen=new Set();
    const proseByFile=new Map(),formulaParagraphs=new Map();
    for(const {paragraph} of owners.values()){
      if(!paragraph)continue;
      if(!proseByFile.has(paragraph.filePath))proseByFile.set(paragraph.filePath,new Set());
      proseByFile.get(paragraph.filePath).add(paragraph);
    }
    const addGlyph=(group,entry)=>{
      if(!selectionGlyphs.has(group))selectionGlyphs.set(group,[]);
      selectionGlyphs.get(group).push(entry);
    };
    for(const page of observed) {
      const entry=pages.get(page.page);
      if(!entry||page.exact!==entry.exact||drawing(entry.dl)!==drawing(page.dl))return false;
      const targets=page.dl.math_owners?.fields?.filter(field=>{
        if(!field.empty)return false;
        const owner=owners.get(field.owner);
        return ['num','den','radicand','degree','sup','sub'].includes(field.role)||
          (field.role==='cell'&&owner?.atom?.kind==='cell')||
          (['body','math'].includes(field.role)&&owner?.atom?.kind==='fence')||
          (['math','cell'].includes(field.role)&&owner?.paragraph?.tableCell&&owner.paragraph.text==='');
      })??[];
      for(const field of targets){
        const key=`${field.owner}/${field.role}`;
        if(seen.has(key))return false;
        seen.add(key);
      }
      fields.set(page.page,targets);
      const tokens=page.dl.math_owners?.glyphs?.filter(glyph=>owners.has(glyph.owner))??[];
      glyphs.set(page.page,tokens);
      for(const glyph of tokens){
        const owner=owners.get(glyph.owner);
        const group=owner.formula??owner.paragraph;
        const from16=owner.formula?owner.formula.from16+owner.atom.from16:owner.paragraph.from16+owner.glyph.from16;
        const to16=owner.formula
          ?owner.formula.from16+(owner.atom.nucleus===undefined?owner.atom.to16:owner.atom.from16+owner.atom.nucleus.length)
          :owner.paragraph.from16+owner.glyph.to16;
        const entry={number:page.page,glyph,from16,to16};
        addGlyph(group,entry);
        const formula=owner.formula;
        if(!formula)continue;
        if(!formulaParagraphs.has(formula)){
          const paragraphs=proseByFile.get(formula.filePath);
          const matches=[...(paragraphs??[])].filter(paragraph=>paragraph.parts.some(part=>
            part.kind==='math'&&paragraph.from16+part.from16<=formula.from16&&
            paragraph.from16+part.to16>=formula.to16));
          formulaParagraphs.set(formula,matches);
        }
        for(const paragraph of formulaParagraphs.get(formula))addGlyph(paragraph,entry);
      }
    }
    if(![...fields.values(),...glyphs.values()].some(items=>items.length))return false;
    ownership={stamp:{...stamp,layoutVersion},fields,glyphs,selectionGlyphs,owners};
    return true;
  }
  function locate(canvas,event) {
    if(!canvas||!ownership)return null;
    const page=Number(canvas.parentElement.dataset.nativePage);
    const args=[canvas.getBoundingClientRect(),{x:event.clientX,y:event.clientY},zoom,ownership.stamp,
      {...ownership.stamp,sourceRevision:revision,layoutVersion}];
    return hitMathGlyph(ownership.glyphs.get(page)??[],...args)||
      hitMathField(ownership.fields.get(page)??[],...args);
  }
  let drag=null,caret=null,selection=[],gesture=0;
  function clearSelection(){
    for(const box of selection)box.remove();
    selection=[];
  }
  let previousCaret=null;
  function takeCaret(){
    if(caret){
      previousCaret={page:caret.parentElement,x:parseFloat(caret.style.left),y:parseFloat(caret.style.top),
        time:performance.now()};
      caret.remove();caret=null;
    }
  }
  function clearCaret(){gesture++;takeCaret();clearSelection();}
  function showFileBoundaries(next){
    for(const mark of boundaryMarks)mark.remove();
    boundaryMarks=[];
    boundaries=next;
    for(const {path,page,y,atPageStart} of next){
      const dom=pages.get(page)?.dom;
      if(!dom)continue;
      const mark=document.createElement('span');
      mark.className='native-tex-file-boundary';
      mark.dataset.file=path;
      mark.setAttribute('aria-hidden','true');
      mark.style.top=Math.max(0,y*CSS_PER_SP*zoom-(atPageStart?6:0))+'px';
      dom.append(mark);
      boundaryMarks.push(mark);
    }
  }
  function showFoldedFiles(next,repaint=true){
    if(!next.length&&!foldedRanges.length)return;
    for(const mask of foldMasks)mask.remove();
    for(const entry of hiddenPages)entry.hidden=false;
    foldedRanges=next;foldMasks=[];hiddenPages=[];
    const skipped=new Set(),scale=CSS_PER_SP*zoom;
    for(const {path,firstPage,lastPage,from,to} of next){
      const interior=[];
      for(let number=firstPage+1;number<lastPage;number++){
        const dom=pages.get(number)?.dom;
        if(!dom)continue;
        dom.hidden=true;hiddenPages.push(dom);
        skipped.add(number);interior.push(number);
      }
      for(const number of new Set([firstPage,lastPage])){
        const dom=pages.get(number)?.dom;
        if(!dom)continue;
        const mask=document.createElement('button');
        mask.type='button';mask.className='native-tex-fold-mask';
        mask.dataset.foldPath=path;mask.dataset.originalPage=String(number);
        mask.style.top=(number===firstPage?from*scale:0)+'px';
        mask.style.bottom=number===lastPage?`calc(100% - ${to*scale}px)`:'0';
        mask.textContent=foldLabel(path,interior);
        mask.onclick=()=>onExpandFile(path);
        dom.append(mask);foldMasks.push(mask);
      }
    }
    if(skipped.size)host.dataset.skippedPages=[...skipped].sort((a,b)=>a-b).join(',');
    else delete host.dataset.skippedPages;
    if(repaint)redraw();
  }
  function showCaret(hit){
    if(!ownership||ownership.stamp.sourceRevision!==revision||ownership.stamp.layoutVersion!==layoutVersion)return;
    clearSelection();
    takeCaret();
    const candidates=hit.role==='nucleus'?ownership.glyphs:ownership.fields;
    const targets=[];
    for(const [number,entries] of candidates)
      for(const field of entries)
        if(field.owner===hit.owner&&(hit.role==='nucleus'||field.role===hit.role))targets.push({number,field});
    const target=hit.caretBox?targets.find(target=>target.number===hit.page):targets.length===1?targets[0]:null;
    if(!target)return;
    const {number,field}=target;
    const [left,top,right,bottom]=hit.page===number&&hit.caretBox?hit.caretBox:field.bbox,scale=CSS_PER_SP*zoom;
    const height=Math.max(12,(bottom-top)*scale);
    caret=document.createElement('span');caret.className='native-tex-caret';caret.setAttribute('aria-hidden','true');
    if(hit.operatorHint){
      caret.classList.add('native-tex-operator-caret');
      caret.style.fontSize=height+'px';
    }
    const x=(hit.after?right:left)*scale,y=(top+bottom)*scale/2-height/2,page=pages.get(number)?.dom;
    caret.style.left=x+'px';caret.style.top=y+'px';
    caret.style.height=height+'px';page?.append(caret);
    if(previousCaret?.page===page&&performance.now()-previousCaret.time<250&&
       Math.hypot(previousCaret.x-x,previousCaret.y-y)<96&&
       !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      caret.animate([{transform:`translate(${previousCaret.x-x}px,${previousCaret.y-y}px)`},{transform:'none'}],
        {duration:85,easing:'ease-out'});
    }
    previousCaret=null;
  }
  function showSelection(start,end){
    clearSelection();
    caret?.remove();caret=null;
    previousCaret=null;
    if(!ownership||ownership.stamp.sourceRevision!==revision||ownership.stamp.layoutVersion!==layoutVersion||
      start?.role!=='nucleus'||end?.role!=='nucleus')return;
    const a=ownership.owners.get(start.owner),b=ownership.owners.get(end.owner);
    if(a?.paragraph&&b?.paragraph){
      for(const {paragraph,formula,from,to} of proseRanges?.(start,end)??[]){
        if(formula)paintRange(formula,formula.from16,formula.to16);
        else paintRange(paragraph,paragraph.from16+from,paragraph.from16+to);
      }
      return;
    }
    const group=a?.formula??a?.paragraph;
    if(!a||!b||group!==(b?.formula??b?.paragraph))return;
    const at=(owner,hit)=>owner.formula
      ?owner.formula.from16+owner.atom.from16+(hit.after?owner.atom.nucleus.length:0)
      :owner.paragraph.from16+owner.glyph.from16+(hit.after?owner.glyph.to16-owner.glyph.from16:0);
    const x=at(a,start),y=at(b,end);
    if(x===y)return;
    paintRange(group,Math.min(x,y),Math.max(x,y));
  }
  function paintRange(group,from,to){
    const scale=CSS_PER_SP*zoom;
    for(const {number,glyph,from16,to16} of ownership.selectionGlyphs.get(group)??[]){
      if(from16<from||to16>to)continue;
      const [left,top,right,bottom]=glyph.bbox;
      if(right<=left||bottom<=top)continue;
      const marker=document.createElement('span');marker.className='native-tex-selection';
      marker.setAttribute('aria-hidden','true');
      Object.assign(marker.style,{left:left*scale+'px',top:top*scale+'px',width:(right-left)*scale+'px',height:(bottom-top)*scale+'px'});
      pages.get(number)?.dom.append(marker);selection.push(marker);
    }
  }
  window.addEventListener('keydown',event=>{
    if(event.isComposing||(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c')return;
    if(!['Shift','Control','Alt','Meta','AltGraph'].includes(event.key))clearCaret();
  },true);
  window.addEventListener('pointerdown',clearCaret,true);
  host.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    const canvas=event.target.closest?.('canvas');
    const hit=locate(canvas,event);
    drag=hit?{canvas,hit,ownership,id:event.pointerId,x:event.clientX,y:event.clientY}:null;
    if(drag){try{canvas.setPointerCapture(event.pointerId);}catch{/* synthetic or already released pointer */}}
  });
  host.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId||drag.ownership!==ownership)return;
    showSelection(drag.hit,locate(canvasAt(event)??drag.canvas,event));
  });
  function canvasAt(event){
    const canvas=document.elementFromPoint(event.clientX,event.clientY)?.closest('canvas');
    return canvas&&host.contains(canvas)?canvas:null;
  }
  host.addEventListener('pointerup',async event=>{
    if(drag?.id!==event.pointerId)return;
    const start=drag;drag=null;
    if(start.ownership!==ownership){clearSelection();return;}
    const hit=locate(canvasAt(event)??start.canvas,event);
    if(!hit){clearSelection();return;}
    const moved=Math.hypot(start.x-event.clientX,start.y-event.clientY)>=4;
    const attempt=gesture,stamp=ownership.stamp;
    const sameGesture=()=>attempt===gesture&&ownership?.stamp===stamp;
    let accepted;
    try {accepted=await onMathHit?.(hit,stamp,moved?start.hit:null,sameGesture);}
    catch {accepted=false;}
    if(!sameGesture())return;
    if(!accepted){clearSelection();return;}
    if(moved){showSelection(start.hit,hit);return;}
    clearSelection();
    showCaret(hit);
  });
  host.addEventListener('pointercancel',()=>{drag=null;clearSelection();});
  host.addEventListener('click',event=>{
    if(warm||event.button!==0)return;
    const canvas=event.target.closest?.('canvas');
    if(!canvas||locate(canvas,event))return;
    const entry=pages.get(Number(canvas.parentElement.dataset.nativePage));
    if(entry?.canvas!==canvas)return;
    const rect=canvas.getBoundingClientRect(),scale=CSS_PER_SP*zoom;
    const x=(event.clientX-rect.left)/scale,y=(event.clientY-rect.top)/scale;
    const hits=entry.rasterHits?.filter(hit=>rasterContains(hit,x,y));
    if(hits?.length===1)onImageHit?.(hits[0].path,revision);
  });
  async function prepare(dl,attempt) {
    for(const info of Object.values(dl.images_info??{})){
      if(info.cached_picture||info.page>1||info.pages>1)throw new Error('Native image requires PDF rendering');
      if(!imageLoads.has(info.file)){
        const resource=getRaster?.(info.file);
        if(!resource)throw new Error('Native image is not a raster asset in the current snapshot');
        imageLoads.set(info.file,createImageBitmap(new Blob([resource.data],{type:resource.mime})).then(image=>{
          if(attempt===generation)imageResources.set(info.file,{kind:'bitmap',image});
          else image.close();
        }));
      }
      await imageLoads.get(info.file);
    }
    for(const item of [...(dl.other??[]),...(dl.lines??[]).flatMap(line=>line.items)]) {
      if(!['g','r','c','m','M','i'].includes(item[0]))throw new Error('Unsupported native drawing operation: '+item[0]);
    }
    for(const desc of Object.values(dl.fonts??{})) {
      if(!desc.filename||!/\.(?:otf|ttf|otc|ttc)$/i.test(desc.filename)||
          (desc.squeeze&&desc.squeeze!==1000))throw new Error('Native preview requires a supported OpenType font');
      const key=fontKey(desc);
      if(!loaded.has(key))loaded.set(key,(async()=>{
        const bytes=await getFont(key);
        if(attempt!==generation)return;
        fonts.add(key,{kind:'sfnt',data:nativeFontFace(new Uint8Array(bytes),desc.subfont)});
      })());
      await loaded.get(key);
    }
    const reason=inexactReason(dl,fonts,images);
    if(reason)throw new Error('Inexact native display list: '+reason);
  }
  function draw(entry) {
    const {canvas,dl}=entry;
    const width=dl.page_width*CSS_PER_SP*zoom,height=dl.page_height*CSS_PER_SP*zoom;
    const dpr=window.devicePixelRatio||1;
    const rows=warm?.pages.get(Number(entry.dom.dataset.nativePage));
    const previous=entry.painted;
    if(previous?.dl===dl&&previous.rows===rows&&previous.zoom===zoom&&previous.dpr===dpr)return;
    if(!Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0 ||
        width*dpr>16384 || height*dpr>16384)throw new Error('Unsupported native page dimensions or zoom');
    entry.dom.style.width=width+'px';entry.dom.style.height=height+'px';
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    const scale=CSS_PER_SP*zoom*dpr;
    entry.rasterHits=[];
    const painter=new Painter(ctx,[scale,0,0,scale,0,0],fonts,images,(file,transform,box)=>{
      const path=stagedRasterPath(file);
      if(path)entry.rasterHits.push({path,transform,box});
    });
    painter.draw(dl,dl.other??[]);
    for(const [index,line] of (dl.lines??[]).entries()){
      const replacement=rows?.get(index);
      if(replacement)painter.draw(warm.dl,replacement.line.items,replacement.dx,replacement.dy);
      else painter.draw(dl,line.items);
    }
    entry.painted={dl,rows,zoom,dpr};
  }
  function redraw() {
    if(pdfBacked)return;
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      try {
        for(const entry of pages.values()) {
          if(entry.dom.hidden)continue;
          const box=entry.dom.getBoundingClientRect(),viewport=host.getBoundingClientRect();
          if(box.bottom>=viewport.top-1000 && box.top<=Math.min(viewport.bottom,window.innerHeight)+1000)draw(entry);
          else if(entry.painted){
            entry.canvas.width=1;entry.canvas.height=1;
            entry.painted=null;entry.rasterHits=[];
          }
        }
        if(revision>=0&&!warm)onPaint(revision);
      } catch(error) {onError(error,revision);}
    });
  }
  async function layout(message) {
    const stamp=message.versions;
    if(stamp.source_revision<revision ||
        (stamp.source_revision===revision && stamp.layout_version<layoutVersion))return;
    const attempt=++generation;
    const changed=message.pages_changed??[];
    try {
      // Prepare the complete changed set before changing anything visible.
      for(const page of changed) {
        if(page.exact!==true)throw new Error('LuaLaTeX reported an inexact page; PDF fallback is not integrated yet');
        await prepare(page.dl,attempt);
        if(attempt!==generation)return;
      }
      for(const page of changed) {
        let entry=pages.get(page.page);
        if(!entry) {
          const dom=document.createElement('div'),canvas=document.createElement('canvas');
          dom.className='native-tex-page';canvas.setAttribute('aria-label','LuaLaTeX page '+page.page);
          canvas.width=1;canvas.height=1;
          dom.dataset.nativePage=String(page.page);
          dom.append(canvas);entry={dom,canvas};pages.set(page.page,entry);
        }
        entry.dl=page.dl;entry.exact=page.exact;
      }
      for(const [number,entry] of pages) {
        if(number>message.pages_total){entry.dom.remove();pages.delete(number);}
      }
      if(pages.size!==message.pages_total)throw new Error('Native layout is missing page geometry');
      host.replaceChildren(...[...pages].sort(([a],[b])=>a-b).map(([,entry])=>entry.dom));
      revision=stamp.source_revision;layoutVersion=stamp.layout_version;
      complete=message;warm=null;
      delete host.dataset.warmRevision;
      clearCaret();
      showFileBoundaries([]);
      showFoldedFiles([],false);
      for(const entry of pages.values()) {
        entry.dom.style.width=entry.dl.page_width*CSS_PER_SP*zoom+'px';
        entry.dom.style.height=entry.dl.page_height*CSS_PER_SP*zoom+'px';
      }
      redraw();
    } catch(error) {if(attempt===generation)onError(error,stamp.source_revision);}
  }
  // Preserve deltas in order while resources load. A later layout may omit an
  // unchanged page which was first sent in the previous layout.
  let pending=Promise.resolve();
  function accept(message) {
    if(!['LayoutUpdate','ParagraphUpdate'].includes(message.event))return;
    const currentEpoch=epoch;
    pending=pending.then(async()=>{
      if(currentEpoch!==epoch)return;
      if(message.event==='LayoutUpdate')return layout(message);
      if(warm&&message.versions.source_revision<=warm.revision)return;
      const overlay=warmRows(message,complete,pages);
      if(!overlay)return;
      try {
        await prepare(message.dl,generation);
        if(currentEpoch!==epoch)return;
        warm={pages:overlay,dl:message.dl,revision:message.versions.source_revision};
        host.dataset.warmRevision=String(warm.revision);
        ownership=null;clearCaret();showFileBoundaries([]);showFoldedFiles([],false);redraw();
      } catch {/* Complete layout will handle unsupported resources. */}
    }).catch(onError);
  }
  function reset({clear=true}={}) {
    epoch++;generation++;revision=-1;layoutVersion=-1;pending=Promise.resolve();ownership=null;drag=null;
    complete=null;warm=null;pdfBacked=false;
    delete host.dataset.warmRevision;
    clearCaret();showFileBoundaries([]);showFoldedFiles([],false);cancelAnimationFrame(frame);previousCaret=null;pages.clear();loaded.clear();fonts=new FontStore();
    for(const resource of imageResources.values())resource.image.close();
    imageResources.clear();imageLoads.clear();if(clear)host.replaceChildren();
  }
  function bindPdfLayout(stamp,geometry,views) {
    if(geometry.size!==views.length||!views.length)return false;
    const entries=views.map(({number,dom,canvas,width,height})=>{
      const page=geometry.get(number);
      // The PDF writer rounds media boxes in bp. One thousandth of a bp is
      // smaller than a CSS pixel at every supported zoom.
      const tolerance=66;
      if(!page||!Number.isFinite(width)||!Number.isFinite(height)||
          Math.abs(width*65781.76-page.dl.page_width)>tolerance||
          Math.abs(height*65781.76-page.dl.page_height)>tolerance)return null;
      return {number,dom,canvas,dl:page.dl,exact:page.exact};
    });
    if(entries.some(entry=>!entry))return false;
    clearCaret();showFileBoundaries([]);showFoldedFiles([],false);ownership=null;pages.clear();pdfBacked=true;
    revision=stamp.source_revision;layoutVersion=stamp.layout_version;
    for(const entry of entries){
      const {number,dom}=entry;
      dom.dataset.nativePage=String(number);
      pages.set(number,entry);
    }
    return true;
  }
  host.addEventListener('scroll',redraw,{passive:true});
  host.parentElement?.addEventListener('scroll',redraw,{passive:true});
  window.addEventListener('resize',redraw);
  return {accept,reset,attachOwners,bindPdfLayout,showCaret,showSelection,showFileBoundaries,showFoldedFiles,clearCaret,redraw,setZoom(value){clearCaret();zoom=value;showFileBoundaries(boundaries);showFoldedFiles(foldedRanges,false);if(pdfBacked)return;for(const entry of pages.values()){
    entry.dom.style.width=entry.dl.page_width*CSS_PER_SP*zoom+'px';
    entry.dom.style.height=entry.dl.page_height*CSS_PER_SP*zoom+'px';
  }redraw();}};
}
