// Opt-in check of the packaged WebView and embedded resources on both platforms.
window.addEventListener('load', async () => {
  try {
    if ((location.protocol !== 'tauri:' && location.hostname !== 'tauri.localhost') ||
        !document.querySelector('.ProseMirror')?.editor) {
      throw new Error('the packaged editor did not initialize');
    }
    if (!customElements.get('math-field')) throw new Error('MathLive did not load');
    const fonts = await document.fonts.load('10pt "Latin Modern Roman"', 'Lineae');
    if (!fonts.length) throw new Error('the packaged Latin Modern font did not load');
    const symbols = await fetch('assets/tikz-symbols.svg');
    if (!symbols.ok || !(await symbols.text()).includes('<svg')) {
      throw new Error('the packaged symbol library did not load');
    }
    const invoke = window.__TAURI__.core.invoke;
    const rejection = await invoke('write_tex', {
      path: window.__LINEAE_SMOKE_UNAUTHORIZED_PATH__,
      contents: '',
    }).then(() => '', String);
    if (rejection !== 'The file was not selected through a native dialog') {
      throw new Error('the native file bridge did not reject an unauthorized path');
    }
    const base=new URL('vendor/pdfjs/',document.baseURI);
    const pdfjs=await import(new URL('legacy/build/pdf.mjs',base).href);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('legacy/build/pdf.worker.mjs',base).href;
    const text='BT /F1 18 Tf 72 720 Td (Offline LuaLaTeX PDF preview) Tj ET\n';
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${text.length} >>\nstream\n${text}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let data='%PDF-1.4\n';const offsets=[0];
    for(let i=0;i<objects.length;i++){offsets.push(data.length);data+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
    const start=data.length;data+='xref\n0 6\n0000000000 65535 f \n';
    for(const offset of offsets.slice(1))data+=String(offset).padStart(10,'0')+' 00000 n \n';
    data+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    const task=pdfjs.getDocument({data:new TextEncoder().encode(data),isEvalSupported:false,
      useSystemFonts:false,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,
      standardFontDataUrl:new URL('standard_fonts/',base).href});
    const doc=await task.promise,page=await doc.getPage(1),viewport=page.getViewport({scale:1});
    const canvas=document.createElement('canvas');
    canvas.width=viewport.width;canvas.height=viewport.height;document.body.append(canvas);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const words=(await page.getTextContent()).items.map(item=>item.str??'').join(' ');
    if(!words.includes('Offline LuaLaTeX PDF preview'))throw new Error('packaged PDF worker/font preview failed');
    await task.destroy();canvas.remove();
    document.title = 'Lineae smoke: ok';
  } catch (error) {
    document.title = 'Lineae smoke: ' + error.message;
  }
}, { once: true });
