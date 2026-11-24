import {FontStore,ImageStore,Painter,inexactReason} from './upstream/webview/render.ts';
import {fontKey} from './upstream/src/fontKey.ts';
import {hitMathField,hitMathGlyph} from '../../editor/native-math/hit.mjs';

const CSS_PER_SP=(96/72)/65781.76;

// Strict read-only full-page adapter. No browser font fallback or inferred
// glyph positions: a page is shown only when all its resources are exact.
export function installNativePages({host,getFont,onPaint,onError,onMathHit}) {
  let generation=0,epoch=0,zoom=.75,revision=-1,layoutVersion=-1;
  let fonts=new FontStore();
  const images=new ImageStore(async()=>{throw new Error('Native PDF image resources are not supported yet');});
  const pages=new Map(),loaded=new Map();
  let frame=0;
  let ownership=null;
  function drawing(dl) {
    return JSON.stringify([dl.page_width,dl.page_height,dl.fonts,dl.other,
      dl.lines.map(line=>[line.x,line.y,line.w,line.h,line.d,line.items])]);
  }
  function attachOwners(observed,stamp,tokenOwners) {
    if(stamp.sourceRevision!==revision||observed.length!==pages.size)return false;
    const fields=new Map(),glyphs=new Map(),seen=new Set();
    for(const page of observed) {
      const entry=pages.get(page.page);
      if(!entry||page.exact!==true||drawing(entry.dl)!==drawing(page.dl))return false;
      const targets=page.dl.math_owners?.fields?.filter(field=>
        field.empty&&['num','den','radicand'].includes(field.role))??[];
      for(const field of targets){
        const key=`${field.owner}/${field.role}`;
        if(seen.has(key))return false;
        seen.add(key);
      }
      fields.set(page.page,targets);
      glyphs.set(page.page,page.dl.math_owners?.glyphs?.filter(glyph=>tokenOwners.has(glyph.owner))??[]);
    }
    if(![...fields.values(),...glyphs.values()].some(items=>items.length))return false;
    ownership={stamp:{...stamp,layoutVersion},fields,glyphs};
    return true;
  }
  host.addEventListener('click',event=>{
    const canvas=event.target.closest?.('canvas');
    if(!canvas||!ownership||event.button!==0)return;
    const page=Number(canvas.parentElement.dataset.nativePage);
    const args=[canvas.getBoundingClientRect(),{x:event.clientX,y:event.clientY},zoom,ownership.stamp,
      {...ownership.stamp,sourceRevision:revision,layoutVersion}];
    const hit=hitMathGlyph(ownership.glyphs.get(page)??[],...args)||
      hitMathField(ownership.fields.get(page)??[],...args);
    if(hit)onMathHit?.(hit,ownership.stamp);
  });
  async function prepare(dl,attempt) {
    if(Object.keys(dl.images_info??{}).length)throw new Error('Native image resources are not supported yet');
    for(const item of [...(dl.other??[]),...(dl.lines??[]).flatMap(line=>line.items)]) {
      if(!['g','r','c','m','M'].includes(item[0]))throw new Error('Unsupported native drawing operation: '+item[0]);
    }
    for(const desc of Object.values(dl.fonts??{})) {
      if(!desc.filename || !/\.(?:otf|ttf)$/i.test(desc.filename) || (desc.subfont && desc.subfont!==1) ||
          (desc.squeeze && desc.squeeze!==1000))throw new Error('Native preview requires a supported single-face OTF/TTF font');
      const key=fontKey(desc);
      if(!loaded.has(key))loaded.set(key,(async()=>{
        const bytes=await getFont(key);
        if(attempt!==generation)return;
        fonts.add(key,{kind:'sfnt',data:new Uint8Array(bytes)});
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
    if(!Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0 ||
        width*dpr>16384 || height*dpr>16384)throw new Error('Unsupported native page dimensions or zoom');
    entry.dom.style.width=width+'px';entry.dom.style.height=height+'px';
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    const scale=CSS_PER_SP*zoom*dpr;
    const painter=new Painter(ctx,[scale,0,0,scale,0,0],fonts,images);
    painter.draw(dl,dl.other??[]);
    for(const line of dl.lines??[])painter.draw(dl,line.items);
  }
  function redraw() {
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      try {
        for(const entry of pages.values()) {
          const box=entry.dom.getBoundingClientRect(),viewport=host.getBoundingClientRect();
          if(box.bottom>=viewport.top-1000 && box.top<=Math.min(viewport.bottom,window.innerHeight)+1000)draw(entry);
          else {entry.canvas.width=1;entry.canvas.height=1;}
        }
        if(revision>=0)onPaint(revision);
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
          dom.dataset.nativePage=String(page.page);
          dom.append(canvas);entry={dom,canvas};pages.set(page.page,entry);
        }
        entry.dl=page.dl;
      }
      for(const [number,entry] of pages) {
        if(number>message.pages_total){entry.dom.remove();pages.delete(number);}
      }
      if(pages.size!==message.pages_total)throw new Error('Native layout is missing page geometry');
      host.replaceChildren(...[...pages].sort(([a],[b])=>a-b).map(([,entry])=>entry.dom));
      revision=stamp.source_revision;layoutVersion=stamp.layout_version;
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
    if(message.event!=='LayoutUpdate')return;
    const currentEpoch=epoch;
    pending=pending.then(()=>{if(currentEpoch===epoch)return layout(message);}).catch(onError);
  }
  function reset({clear=true}={}) {
    epoch++;generation++;revision=-1;layoutVersion=-1;pending=Promise.resolve();ownership=null;
    cancelAnimationFrame(frame);pages.clear();loaded.clear();fonts=new FontStore();if(clear)host.replaceChildren();
  }
  host.addEventListener('scroll',redraw,{passive:true});
  host.parentElement?.addEventListener('scroll',redraw,{passive:true});
  window.addEventListener('resize',redraw);
  return {accept,reset,attachOwners,setZoom(value){zoom=value;for(const entry of pages.values()){
    entry.dom.style.width=entry.dl.page_width*CSS_PER_SP*zoom+'px';
    entry.dom.style.height=entry.dl.page_height*CSS_PER_SP*zoom+'px';
  }redraw();}};
}
