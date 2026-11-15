import {foldPagePlan,documentLayoutBlocks} from './fold-layout.mjs';
import {icon} from '../editor/icons.js';
import {t} from '../ui/i18n.mjs';

export function installProjectPresentation({editor,page,getComposition,requestLayout,ensureDocument}){
  const layer=document.createElement('div');layer.className='project-source-overlay';layer.contentEditable='false';
  const style=document.createElement('style');style.dataset.projectPresentation='';
  page.append(style,layer);
  const emptyAnchors=new Map();
  let root=null,folded=new Set(),layoutPending=false,adjusting=false,lastHead=0;
  const broadcast=()=>document.dispatchEvent(new CustomEvent('lineae-project-fold-state',{detail:{paths:[...folded]}}));
  function reset(){
    style.textContent='';layer.replaceChildren();
    delete page.dataset.projectFolding;delete page.dataset.skippedPages;
    for(const sheet of page.querySelectorAll('.document-sheet'))sheet.style.display='';
    page.style.removeProperty('--project-folded-height');
  }
  function refresh(){if(layoutPending)return;layoutPending=true;requestAnimationFrame(()=>{layoutPending=false;requestLayout();});}
  function toggle(path){
    ensureDocument();
    if(!getComposition())return;
    if(root!==getComposition().rootId){root=getComposition().rootId;folded.clear();}
    if(folded.has(path))folded.delete(path);else folded.add(path);
    if(folded.has(path)){
      let target=null;
      editor.state.doc.forEach((node,position)=>{
        if(target!==null)return;
        if(node.type.name==='projectRegion'&&node.attrs.path!==path&&!node.attrs.trail?.includes(path)&&node.firstChild?.isTextblock&&node.textContent)target=position+2;
      });
      if(target!==null)editor.commands.setTextSelection(target);
    }
    broadcast();refresh();
  }
  document.addEventListener('lineae-toggle-project-file',event=>toggle(event.detail.path));
  document.addEventListener('lineae-expand-project-files',()=>{folded.clear();broadcast();refresh();});
  window.addEventListener('lineae-before-layout',reset);
  window.addEventListener('lineae-layout',()=>{
    const composition=getComposition();
    reset();
    if(!composition||page.hidden)return;
    if(root!==composition.rootId){root=composition.rootId;folded.clear();broadcast();}
    const rect=page.getBoundingClientRect(),zoom=rect.width/page.offsetWidth||1;
    const {elements,selectors}=documentLayoutBlocks(editor.view.dom);
    const regions=new Map(composition.regions.map(region=>[region.key,region]));
    const boxes=elements.map((element,index)=>{
      const bounds=element.getBoundingClientRect();
      const wrapper=element.closest('[data-project-region]');
      const node=wrapper?Array.from(editor.state.doc.content.content).find(node=>node.attrs.regionKey===wrapper.dataset.projectRegion):null;
      return {element,selector:selectors[index],path:wrapper?.dataset.filePath,trail:node?.attrs.trail??[],from:(bounds.top-rect.top)/zoom,to:(bounds.bottom-rect.top)/zoom,region:regions.get(wrapper?.dataset.projectRegion)};
    });
    const ranges=[];
    for(const path of folded){
      const own=boxes.filter(box=>box.path===path||box.trail.includes(path));
      if(own.length)ranges.push({path,from:Math.min(...own.map(box=>box.from)),to:Math.max(...own.map(box=>box.to))});
    }
    const computed=getComputedStyle(page),sheets=Array.from(page.querySelectorAll('.document-sheet'));
    const pageHeight=sheets[0]?.offsetHeight??page.offsetHeight;
    const plan=foldPagePlan(ranges,{pageHeight,pageGap:Number.parseFloat(computed.getPropertyValue('--page-gap'))||0,marginTop:Number.parseFloat(computed.paddingTop),marginBottom:Number.parseFloat(computed.paddingBottom),pageCount:sheets.length||1});
    const rules=[],styledRegions=new Set();
    for(const box of boxes){
      const selector=box.selector.split('>')[0];
      if(styledRegions.has(selector))continue;
      styledRegions.add(selector);
      const hidden=[...folded].some(path=>box.path===path||box.trail.includes(path));
      const shift=plan.shift(box.from);
      const declarations=[];
      if(hidden)declarations.push('visibility:hidden!important','opacity:0!important','pointer-events:none!important');
      if(shift)declarations.push('transform:translateY(-'+shift+'px)');
      if(declarations.length)rules.push('.document-page .ProseMirror>'+selector+'{'+declarations.join(';')+'}');
    }
    style.textContent=rules.join('\n');
    if(ranges.length){
      page.dataset.projectFolding='true';page.dataset.skippedPages=plan.skipped.map(page=>page+1).join(',');
      page.style.setProperty('--project-folded-height',plan.height+'px');
      for(const index of plan.skipped)if(sheets[index])sheets[index].style.display='none';
    }
    const marginLeft=Number.parseFloat(computed.paddingLeft),marginRight=Number.parseFloat(computed.paddingRight);
    for(const part of plan.placeholders){
      const placeholder=document.createElement('button');placeholder.type='button';placeholder.className='project-fold-placeholder';
      placeholder.dataset.foldPath=part.path;placeholder.dataset.originalPage=part.page;
      placeholder.style.cssText='left:'+marginLeft+'px;right:'+marginRight+'px;top:'+part.top+'px;height:'+part.height+'px';
      placeholder.textContent=part.path+' · '+t('已折叠，点击展开','Folded; click to expand');
      if(plan.skipped.length)placeholder.textContent+=' · '+t('隐藏页 ','Hidden pages ')+plan.skipped.map(page=>page+1).join(', ');
      placeholder.addEventListener('click',()=>toggle(part.path));layer.append(placeholder);
    }
    emptyAnchors.clear();
    const documentTop=(editor.view.dom.getBoundingClientRect().top-rect.top)/zoom;
    for(const [index,region] of composition.regions.entries()){
      const own=boxes.filter(box=>box.region?.key===region.key);
      const node=editor.state.doc.child(index);
      if([...folded].some(path=>node.attrs.path===path||node.attrs.trail?.includes(path)))continue;
      const previous=boxes.findLast(box=>Number(box.region?.key)<index);
      if(!own.length&&!region.continuation&&region.path===composition.regions[0]?.path)continue;
      let contentTop=own[0]?.from??previous?.to??Number.parseFloat(computed.paddingTop);
      const pitch=pageHeight+(Number.parseFloat(computed.getPropertyValue('--page-gap'))||0);
      const inPage=contentTop%pitch;
      if(!own.length&&inPage>=pageHeight-Number.parseFloat(computed.paddingBottom)-8)contentTop=(Math.floor(contentTop/pitch)+1)*pitch+Number.parseFloat(computed.paddingTop);
      const top=contentTop-plan.shift(contentTop);
      emptyAnchors.set(region.key,top-documentTop);
      const badge=document.createElement(region.continuation?'button':'span');
      badge.className='project-source-badge';badge.dataset.sourcePath=region.path;badge.dataset.regionKey=region.key;
      badge.dataset.preferredTop=String(top);badge.style.top=top+'px';
      if(region.continuation){
        badge.type='button';badge.classList.add('project-return-boundary');badge.append(icon('redo'));
        const caption=document.createElement('span');caption.textContent=t('继续 ','Resume ')+region.path;badge.append(caption);
        badge.title=t('结束前面的引用，继续编辑 ','Finish the included file and continue editing ')+region.path;
        badge.setAttribute('aria-label',badge.title);badge.addEventListener('mousedown',event=>event.preventDefault());badge.addEventListener('click',()=>activateRegion(region.key));
      }else{
        const caption=document.createElement(own.length?'span':'button');caption.textContent=region.path;
        if(!own.length){caption.type='button';caption.className='project-empty-entry';caption.dataset.editPath=region.path;caption.setAttribute('aria-label',t('编辑 ','Edit ')+region.path);caption.addEventListener('mousedown',event=>event.preventDefault());caption.onclick=()=>activateRegion(region.key);}
        badge.append(caption);
        badge.title=t('来源文件：','Source file: ')+region.path;
        if(region.path!==composition.regions[0]?.path){
          const button=document.createElement('button');button.type='button';button.append(icon('chevronDown'));
          button.setAttribute('aria-label',t('折叠引用内容','Collapse included content'));button.onclick=()=>toggle(region.path);badge.prepend(button);
        }
      }
      layer.append(badge);
    }
    syncEmptySelection();arrangeMarkers();

  });
  function arrangeMarkers(){
    if(!getComposition()||page.hidden)return;
    const pageRect=page.getBoundingClientRect(),zoom=pageRect.width/page.offsetWidth||1;
    const occupied=[...page.querySelectorAll('[data-structure-marker],.label-node')].filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>node.getBoundingClientRect());
    for(const badge of layer.querySelectorAll('.project-source-badge')){
      let top=Number(badge.dataset.preferredTop);badge.style.top=top+'px';
      for(let tries=0;tries<occupied.length+1;tries++){
        const rect=badge.getBoundingClientRect();
        const conflicts=occupied.filter(other=>rect.left<other.right+2&&rect.right>other.left-2&&rect.top<other.bottom+2&&rect.bottom>other.top-2);
        if(!conflicts.length)break;
        top=Math.max(...conflicts.map(other=>(other.bottom-pageRect.top)/zoom))+3;badge.style.top=top+'px';
      }
      occupied.push(badge.getBoundingClientRect());
    }
  }
  page.addEventListener('lineae-markers-layout',arrangeMarkers);
  function syncEmptySelection(){
    const selection=editor.state.selection;let key=null;
    for(let depth=selection.$from.depth;depth>0;depth--)if(selection.$from.node(depth).type.name==='projectRegion'){key=selection.$from.node(depth).attrs.regionKey;break;}
    for(const element of editor.view.dom.querySelectorAll('[data-project-region]')){
      if(element.dataset.projectRegion===key&&element.dataset.emptyRegion==='true'){
        element.dataset.activeEmptyRegion='true';element.style.setProperty('--project-empty-top',(emptyAnchors.get(key)??0)+'px');
      }else{delete element.dataset.activeEmptyRegion;element.style.removeProperty('--project-empty-top');}
    }
  }
  function activateRegion(key){
    let target=null;
    editor.state.doc.forEach((region,start)=>{
      if(region.attrs.regionKey!==key||target!==null)return;
      region.descendants((node,offset)=>{if(target===null&&node.isTextblock)target=start+offset+2;});
    });
    if(target===null)return;
    const element=[...editor.view.dom.children].find(node=>node.dataset.projectRegion===key);
    if(element?.dataset.emptyRegion==='true'){element.dataset.activeEmptyRegion='true';element.style.setProperty('--project-empty-top',(emptyAnchors.get(key)??0)+'px');}
    editor.commands.setTextSelection(target);
    editor.view.focus();editor.view.dispatch(editor.state.tr.scrollIntoView());
  }
  function normalizeGap(){
    if(adjusting||!getComposition())return false;
    const selection=editor.state.selection;
    if(selection.toJSON().type!=='gapcursor')return false;
    const positions=[],emptyPositions=[];
    editor.state.doc.forEach((region,start)=>{
      if(region.type.name!=='projectRegion'||[...folded].some(path=>region.attrs.path===path||region.attrs.trail?.includes(path)))return;
      region.descendants((node,offset)=>{if(node.isTextblock){const point={from:start+offset+2,to:start+offset+2+node.content.size};(node.content.size?positions:emptyPositions).push(point);}});
    });
    if(!positions.length)positions.push(...emptyPositions);
    if(!positions.length)return false;
    const backwards=selection.head<lastHead;
    const target=backwards?positions.findLast(point=>point.to<=selection.head):positions.find(point=>point.from>=selection.head);
    const point=target??(backwards?positions[0]:positions.at(-1));
    const position=target?(backwards?point.to:point.from):(backwards?point.from:point.to);
    adjusting=true;try{editor.commands.setTextSelection(position);}finally{adjusting=false;}
    lastHead=position;return true;
  }
  editor.view.dom.addEventListener('click',normalizeGap);
  editor.on('selectionUpdate',()=>{
    syncEmptySelection();
    if(adjusting||normalizeGap())return;
    const selection=editor.state.selection;
    let owner;
    for(let depth=selection.$from.depth;depth>0;depth--)if(selection.$from.node(depth).type.name==='projectRegion'){owner=selection.$from.node(depth);break;}
    const hidden=owner&&[...folded].some(path=>owner.attrs.path===path||owner.attrs.trail?.includes(path));
    const backwards=selection.head<lastHead;lastHead=selection.head;
    if(!hidden)return;
    const positions=[];
    editor.state.doc.forEach((region,start)=>{
      if(region.type.name!=='projectRegion'||[...folded].some(path=>region.attrs.path===path||region.attrs.trail?.includes(path)))return;
      region.descendants((node,offset)=>{if(node.isTextblock&&node.content.size)positions.push({from:start+offset+2,to:start+offset+2+node.content.size});});
    });
    const target=backwards?positions.findLast(point=>point.to<selection.head):positions.find(point=>point.from>selection.head);
    const point=target??(backwards?positions[0]:positions.at(-1));
    if(point){adjusting=true;try{editor.commands.setTextSelection(selection.empty?(backwards?point.to:point.from):{anchor:selection.anchor,head:backwards?point.to:point.from});}finally{adjusting=false;}}
  });
  editor.on('transaction',transaction=>{if(transaction.transaction.docChanged)refresh();queueMicrotask(()=>{normalizeGap();syncEmptySelection();});});
  return {toggle,expandAll(){folded.clear();broadcast();refresh();}};
}
