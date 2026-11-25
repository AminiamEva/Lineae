module.exports=function installMockNativeTex() {
  // UI/interaction preservation only, never evidence of actual TeX geometry.
  window.nativeProbe={calls:[],events:[],revision:1,session:0,failFont:false,failPdf:false,delayOpen:false,ruleRects:[]};
  const p=window.nativeProbe;
  p.listeners=[];
  const emit=event=>{
    p.events.push(event);
    for(const listener of p.listeners) {
      try {listener({payload:{sessionId:String(p.session),event}});} catch {}
    }
  };
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
  p.layout=()=>({event:'LayoutUpdate',compile:{state:'Ok'},convergence:{state:'Converged'},    pdf_fallback_registered:Boolean(p.registeredPdf),
    versions:{source_revision:p.revision,context_revision:1,engine_generation:0,layout_version:p.revision},
    placements:[{par_id:1,fragments:[{page:1,first_line:1,last_line:1,xs:[6500000],baselines:[6500000],approximate:false}]}],
    pages_total:1,pages_changed:[{page:1,exact:true,dl:{kind:'page',page:1,
      page_width:39000000,page_height:55000000,width:0,height:0,depth:0,flags:{},images_info:p.raster?{'1':{file:'plot.png'}}:{},
      fonts:{15:{id:15,filename:'/fixture/lmroman10-regular.otf',subfont:1,size:655360,extend:1000,squeeze:1000}},
      other:p.raster?[['i',1,3000000,3000000,1000000,1000000]]:[],lines:[{x:6500000,y:6500000,w:600000,h:600000,d:0,
        items:[['g',15,97,28,6500000,6500000,327680,0],['r',6500000,7000000,3000000,6554]]}]}}]});
  window.__TAURI__={core:{invoke:async(command,args)=>{
    p.calls.push({command,args});
    if(command==='native_tex_open') {
      p.source=args.source;p.revision=1;p.events=[];
      const sessionId=String(++p.session);
      if(p.delayOpen)await new Promise(done=>{p.resolveOpen=done;});
      emit(p.layout());
      return {sessionId,sourceRevision:1};
    }
    if(command==='native_tex_poll'){
      if(args.sessionId!==String(p.session))throw {code:'stale_session',message:'stale test session'};
      return p.events.splice(0);
    }
    if(command==='native_tex_update') {
      if(p.holdUpdate){
        p.holdUpdate=false;
        await new Promise(resolve=>{p.releaseUpdate=resolve;});
      }
      if(p.restartNext){
        p.restartNext=false;p.session++;p.revision=0;p.events=[];
      }
      p.source=args.source;p.revision++;
      if(p.warmNext){
        p.warmNext=false;
        const frame=p.layout();
        emit({event:'ParagraphUpdate',par_id:1,status:'ok',pagination_stale:false,context_stale:false,
          versions:{...frame.versions,layout_version:frame.versions.layout_version-1},fragments:frame.placements[0].fragments,
          dl:frame.pages_changed[0].dl});
        p.finishWarm=()=>emit(frame);
      }else emit(p.layout());
      return {sessionId:String(p.session),editId:p.revision,sourceRevision:p.revision,routed:'fast'};
    }
    if(command==='native_tex_font') {
      if(p.realEvidence){
        const result=await fetch('/native-formula-font?key='+encodeURIComponent(args.key));
        if(!result.ok)throw new Error('The exact recorded native font is not available');
        return result.arrayBuffer();
      }
      if(p.failFont)throw 'The native font is unavailable';
      return [...new Uint8Array(await(await fetch('/assets/fonts/latin-modern/lmroman10-regular.otf')).arrayBuffer())];
    }
    if(command==='native_tex_observe_formula'){
      if(p.realEvidence){
        if(args.projection!==p.realEvidence.projection)throw new Error('Editor projection differs from the actual recorded compile');
        return p.realEvidence.observed;
      }
      const input=p.targetInclude?args.files?.find(file=>file.path==='chapters/one.tex')?.source:args.projection;
      if(!input)throw new Error('No target source in observation request');
      // The mock only treats tags inside math delimiters as formula owners.
      const mathOnly=text=>[...text.matchAll(/\\\[([\s\S]*?)\\\]|\$([^$]*)\$/g)]
        .map(found=>found[1]??found[2]).join('\n');
      const mathInput=mathOnly(input);
      const matches=[...mathInput.matchAll(/\\attribute65000=(\d+) \\(frac|sqrt)/g)];
      const match=matches.at(-1);
      const script=/\\attribute65000=(\d+) x\^\{\}/.exec(mathInput);
      const cell=/&\\attribute65000=(\d+) \s*\\\\/.exec(mathInput);
      const aligned=/&\\aftergroup\\LineaeNativeCell([A-J]+)\s*\\\\/.exec(mathInput);
      const cellOwner=cell?.[1]??(aligned?[...aligned[1]].map(letter=>letter.charCodeAt(0)-65).join(''):null);
      // Prose tags are the attribute assignments outside instrumented math groups.
      const emptyCells=/\\begingroup\\mathsurround=0pt\\attribute65000=(\d+) \$ \$\\endgroup/g;
      const textTags=projection=>[...projection
        .replace(emptyCells,'')
        .replace(/\\\[[\s\S]*?\\\]/g,'')
        .replace(/\$[^$]*\$/g,'')
        .replace(/\\begin\{(?:equation|align|gather)\*?\}[\s\S]*?\\end\{(?:equation|align|gather)\*?\}/g,'')
        .matchAll(/\\attribute65000=(\d+) (.)/gsu)];
      if(!match&&!script&&!cellOwner){
        const text=textTags(input);
        const fields=[...input.matchAll(emptyCells)].map(([,owner],index)=>{
          const x=6500000+index*1000000;
          return {owner:Number(owner),role:'math',empty:true,bbox:[x,10500000,x,10500000]};
        });
        if((!text.length&&!fields.length)||args.sourceRevision!==p.revision)throw new Error('Unexpected formula observation request');
        const observed=p.layout().pages_changed;
        observed[0].dl.math_owners={fields,glyphs:[]};
        let x=6500000;
        for(const [,owner,char] of text){
          observed[0].dl.math_owners.glyphs.push({owner:Number(owner),char:char.codePointAt(0),
            bbox:[x,9000000,x+200000,9500000]});
          x+=200000;
        }
        return observed;
      }
      if((!match&&!script&&!cellOwner)||args.sourceRevision!==p.revision)throw new Error('Unexpected formula observation request');
      const observed=p.layout().pages_changed;
      const denominator=/\\frac\{[^{}]*\}\{(?:\\attribute65000=(\d+) )?([^{}]*)\}/.exec(mathInput);
      observed[0].dl.math_owners={fields:[{owner:Number(match?.[1]??script?.[1]??cellOwner),role:match?(match[2]==='frac'?'den':'radicand'):script?'sup':'cell',
        bbox:[6500000,7000000,6500000,7000000],empty:match?denominator?.[2]==='':true}],glyphs:[]};
      if(match&&denominator){
        let x=6500000;
        for(const char of denominator[2]??''){
          observed[0].dl.math_owners.glyphs.push({owner:Number(denominator[1]),char:char.codePointAt(0),
            bbox:[x,6900000,x+200000,7000000]});
          x+=200000;
        }
      }
      if(cellOwner)observed[0].dl.math_owners.fields.push({owner:2,role:'cell',bbox:[6500000,7000000,6500000,7000000],empty:true});
      const token=/\\attribute65000=(\d+) a(?=\\attribute)/.exec(mathInput);
      if(token)observed[0].dl.math_owners.glyphs.push({owner:Number(token[1]),char:97,
        bbox:[6500000,6000000,6800000,6500000]});
      let textX=6500000;
      for(const [,owner,char] of textTags(input)){
        observed[0].dl.math_owners.glyphs.push({owner:Number(owner),char:char.codePointAt(0),
          bbox:[textX,9000000,textX+200000,9500000]});
        textX+=200000;
      }
      if(p.mismatchObservedDrawing)observed[0].dl.lines[0].items[0][4]++;
      return observed;
    }
    if(command==='native_tex_render_pdf'){
      if(args.sourceRevision!==p.revision)throw {code:'revision_mismatch',message:'stale test revision'};
      if(p.failPdf)throw new Error('PDF compilation failed');
      return p.pdf();
    }
    if(command==='native_tex_pdf'){
      if(!p.registeredPdf||args.sourceRevision!==p.revision||args.layoutVersion!==p.revision)
        throw {code:'revision_mismatch',message:'stale test layout'};
      return p.pdf();
    }
    if(command==='native_tex_export')return {jobId:1,sourceRevision:args.sourceRevision,path:'approved.pdf'};
    if(command==='native_tex_close') {
      if(args.sessionId===String(p.session))p.events=[];
      return;
    }
    throw new Error('Unexpected IPC command '+command);
  }},
  event:{listen:async(name,listener)=>{
    if(name!=='lineae-native-tex')throw new Error('Unexpected event '+name);
    p.listeners.push(listener);
    return ()=>{p.listeners=p.listeners.filter(candidate=>candidate!==listener);};
  }}};
};
