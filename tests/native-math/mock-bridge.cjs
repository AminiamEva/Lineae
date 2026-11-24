module.exports=function installMockNativeTex() {
  // UI/interaction preservation only, never evidence of actual TeX geometry.
  window.nativeProbe={calls:[],events:[],revision:1,session:0,failFont:false,delayOpen:false};
  const p=window.nativeProbe;
  p.layout=()=>({event:'LayoutUpdate',compile:{state:'Ok'},convergence:{state:'Converged'},
    versions:{source_revision:p.revision,context_revision:1,engine_generation:0,layout_version:p.revision},
    pages_total:1,pages_changed:[{page:1,exact:true,dl:{kind:'page',page:1,
      page_width:39000000,page_height:55000000,width:0,height:0,depth:0,flags:{},images_info:{},
      fonts:{15:{id:15,filename:'/fixture/lmroman10-regular.otf',subfont:1,size:655360,extend:1000,squeeze:1000}},
      other:[],lines:[{x:6500000,y:6500000,w:600000,h:600000,d:0,
        items:[['g',15,97,28,6500000,6500000,327680,0]]}]}}]});
  window.__TAURI__={core:{invoke:async(command,args)=>{
    p.calls.push({command,args});
    if(command==='native_tex_open') {
      p.source=args.source;p.revision=1;
      const sessionId=String(++p.session);
      if(p.delayOpen)await new Promise(done=>{p.resolveOpen=done;});
      p.events.push(p.layout());
      return {sessionId,sourceRevision:1};
    }
    if(command==='native_tex_poll')return p.events.splice(0);
    if(command==='native_tex_update') {
      p.source=args.source;p.revision++;
      p.events.push(p.layout());
      return {editId:p.revision,sourceRevision:p.revision,routed:'fast'};
    }
    if(command==='native_tex_font') {
      if(p.failFont)throw 'The native font is unavailable';
      return [...new Uint8Array(await(await fetch('/assets/fonts/latin-modern/lmroman10-regular.otf')).arrayBuffer())];
    }
    if(command==='native_tex_export')return {jobId:1,sourceRevision:args.sourceRevision,path:'approved.pdf'};
    if(command==='native_tex_close')return;
    throw new Error('Unexpected IPC command '+command);
  }}};
};
