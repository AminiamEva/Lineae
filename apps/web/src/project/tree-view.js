import {t} from '../ui/i18n.mjs';
export function installProjectTree({tree,panel,expanded,activate,run}){
  let signature='';const buttons=new Map();
  function clear(empty){tree.replaceChildren(empty);buttons.clear();signature='';}
  function render(project){
    const next=JSON.stringify([project.directories,[...project.files.values()].map(file=>[file.id,file.path,file.kind])]);
    if(next!==signature){
      const focusKey=tree.contains(document.activeElement)?document.activeElement.dataset.focusKey:null,scroll=panel.scrollTop;
      tree.replaceChildren();buttons.clear();
      function append(node,parent){for(const child of node.children){
        if(child.kind==='directory'){
          const details=document.createElement('details'),summary=document.createElement('summary');
          details.open=expanded.has(child.path);summary.textContent=child.name;summary.title=child.path;summary.dataset.path=child.path;summary.dataset.focusKey='directory:'+child.path;summary.setAttribute('aria-haspopup','menu');
          details.ontoggle=()=>{if(details.isConnected)details.open?expanded.add(child.path):expanded.delete(child.path);};
          details.append(summary);parent.append(details);append(child,details);
        }else{
          const button=document.createElement('button');button.type='button';button.onclick=()=>run(()=>activate(child.fileId));button.className='project-file';button.dataset.path=child.path;button.dataset.fileId=child.fileId;button.dataset.focusKey='file:'+child.fileId;button.setAttribute('aria-haspopup','menu');
          button.draggable=project.file(child.fileId).kind==='tex';button.ondragstart=event=>{event.dataTransfer.setData('application/x-lineae-file',child.fileId);event.dataTransfer.effectAllowed='copy';};
          parent.append(button);buttons.set(child.fileId,button);
        }
      }}
      append(project.tree,tree);signature=next;
      if(focusKey)[...tree.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===focusKey)?.focus({preventScroll:true});panel.scrollTop=scroll;
    }
    const icons={tex:'T',bib:'B',image:'▧',pdf:'P',resource:'·'};
    for(const file of project.files.values()){
      const button=buttons.get(file.id);if(!button)continue;
      const label=icons[file.kind]+' '+file.path.split('/').at(-1)+(file.dirty?' ●':'')+(file.missing||file.externalChanged?' ⚠':'');
      if(button.textContent!==label)button.textContent=label;
      button.setAttribute('aria-current',String(file.id===project.activeFileId));button.title=file.path+(file.missing?' · '+t('磁盘文件缺失','Missing on disk'):file.externalChanged?' · '+t('磁盘文件已改变','Changed on disk'):'');
    }
  }
  return {clear,render,invalidate(){signature='';}};
}
