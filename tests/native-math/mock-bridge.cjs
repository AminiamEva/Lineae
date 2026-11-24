module.exports=function installMockNativeTex() {
  // UI/interaction preservation only, never evidence of actual TeX geometry.
  window.nativeProbe={calls:[],events:[],revision:1,session:0,failFont:false,failPdf:false,delayOpen:false,ruleRects:[]};
  const p=window.nativeProbe;
  p.pdf=()=>{
    const text='BT /F1 18 Tf 72 720 Td (LuaLaTeX PDF fallback) Tj ET\n';
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${text.length} >>\nstream\n${text}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let output='%PDF-1.4\n';const offsets=[0];
    for(let i=0;i<objects.length;i++){offsets.push(output.length);output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
    const start=output.length;output+='xref\n0 6\n0000000000 65535 f \n';
    for(const offset of offsets.slice(1))output+=String(offset).padStart(10,'0')+' 00000 n \n';
    output+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return [...new TextEncoder().encode(output)];
  };
  const fillRect=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h) {
    if(this.canvas.closest('#native-tex-preview'))p.ruleRects.push({w,h});
    return fillRect.call(this,x,y,w,h);
  };
  p.layout=()=>({event:'LayoutUpdate',compile:{state:'Ok'},convergence:{state:'Converged'},
    versions:{source_revision:p.revision,context_revision:1,engine_generation:0,layout_version:p.revision},
    pages_total:1,pages_changed:[{page:1,exact:true,dl:{kind:'page',page:1,
      page_width:39000000,page_height:55000000,width:0,height:0,depth:0,flags:{},images_info:{},
      fonts:{15:{id:15,filename:'/fixture/lmroman10-regular.otf',subfont:1,size:655360,extend:1000,squeeze:1000}},
      other:[],lines:[{x:6500000,y:6500000,w:600000,h:600000,d:0,
        items:[['g',15,97,28,6500000,6500000,327680,0],['r',6500000,7000000,3000000,6554]]}]}}]});
  window.__TAURI__={core:{invoke:async(command,args)=>{
    p.calls.push({command,args});
    if(command==='native_tex_open') {
      p.source=args.source;p.revision=1;p.events=[];
      const sessionId=String(++p.session);
      if(p.delayOpen)await new Promise(done=>{p.resolveOpen=done;});
      p.events.push(p.layout());
      return {sessionId,sourceRevision:1};
    }
    if(command==='native_tex_poll'){
      if(args.sessionId!==String(p.session))throw {code:'stale_session',message:'stale test session'};
      return p.events.splice(0);
    }
    if(command==='native_tex_update') {
      if(p.restartNext){
        p.restartNext=false;p.session++;p.revision=0;p.events=[];
      }
      p.source=args.source;p.revision++;
      p.events.push(p.layout());
      return {sessionId:String(p.session),editId:p.revision,sourceRevision:p.revision,routed:'fast'};
    }
    if(command==='native_tex_font') {
      if(p.failFont)throw 'The native font is unavailable';
      return [...new Uint8Array(await(await fetch('/assets/fonts/latin-modern/lmroman10-regular.otf')).arrayBuffer())];
    }
    if(command==='native_tex_observe_formula'){
      const match=/\\attribute65000=(\d+) \\frac/.exec(args.projection);
      if(!match||args.sourceRevision!==p.revision)throw new Error('Unexpected formula observation request');
      const observed=p.layout().pages_changed;
      observed[0].dl.math_owners={fields:[{owner:Number(match[1]),role:'den',
        bbox:[6500000,7000000,6500000,7000000],empty:true}],glyphs:[]};
      if(p.mismatchObservedDrawing)observed[0].dl.lines[0].items[0][4]++;
      return observed;
    }
    if(command==='native_tex_render_pdf'){
      if(args.sourceRevision!==p.revision)throw {code:'revision_mismatch',message:'stale test revision'};
      if(p.failPdf)throw new Error('PDF compilation failed');
      return p.pdf();
    }
    if(command==='native_tex_export')return {jobId:1,sourceRevision:args.sourceRevision,path:'approved.pdf'};
    if(command==='native_tex_close') {
      if(args.sessionId===String(p.session))p.events=[];
      return;
    }
    throw new Error('Unexpected IPC command '+command);
  }}};
};
