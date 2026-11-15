import {t} from '../ui/i18n.mjs';
import {includeEdges,referenceTarget,wouldCycle,addReference,removeReference,setReferenceKind,moveReference} from './include-operations.mjs';

export function installIncludePanel({container,getProject,edit,openFile}){
  const form=document.createElement('form'),select=document.createElement('select'),kind=document.createElement('select'),add=document.createElement('button');
  form.className='include-add';select.dataset.includeTarget='';kind.dataset.includeKind='';
  for(const name of ['input','include'])kind.append(new Option('\\'+name,name));
  add.type='submit';add.dataset.includeAdd='';form.append(select,kind,add);
  const list=document.createElement('div');list.className='include-list';const status=document.createElement('p');status.setAttribute('role','status');
  container.append(form,list,status);
  let signature='',pendingFocus;
  function perform(change){try{status.textContent='';edit(change);}catch(e){status.textContent=e.message;}}
  function insert(id,index){const p=getProject();if(!p)return;const file=p.file(id);
    if(wouldCycle(p,p.activeFileId,id)){status.textContent=t('该引用会形成循环','This reference would create a cycle');return;}
    perform(text=>addReference(text,file.path,kind.value,index));
  }
  form.onsubmit=event=>{event.preventDefault();if(select.value)insert(select.value);};
  container.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-lineae-file')||event.dataTransfer.types.includes('application/x-lineae-include'))event.preventDefault();});
  container.addEventListener('drop',event=>{
    const p=getProject();if(!p)return;event.preventDefault();event.stopPropagation();
    const target=event.target.closest('[data-include-index]'),to=target?Number(target.dataset.includeIndex):includeEdges(p.file(p.activeFileId).draft).length-1;
    const from=event.dataTransfer.getData('application/x-lineae-include');
    if(from!=='')perform(text=>moveReference(text,Number(from),to));
    else {const id=event.dataTransfer.getData('application/x-lineae-file');if(id)insert(id,target?to:undefined);}
  });
  function render(){
    const p=getProject(),active=p?.file(p.activeFileId);
    select.setAttribute('aria-label',t('要引用的文件','File to include'));kind.setAttribute('aria-label',t('引用命令','Include command'));
    add.textContent=t('添加','Add');
    const previous=select.value;
    select.replaceChildren(new Option(t('选择 TeX 文件','Choose a TeX file'),''));
    for(const file of p?.files.values()??[])if(file.kind==='tex'&&file.id!==active?.id&&!file.missing)select.append(new Option(file.path,file.id));
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    form.hidden=!active||active.kind!=='tex';
    const edges=active?.kind==='tex'?includeEdges(active.draft):[];
    const next=JSON.stringify([active?.id,edges.map(e=>[e.command,e.path,e.status,referenceTarget(p,e)?.id]),document.documentElement.lang]);
    if(next===signature)return;signature=next;list.replaceChildren();
    if(!edges.length){const empty=document.createElement('p');empty.className='sidebar-empty';empty.textContent=t('拖入文件或选择文件添加引用','Drag a file here or choose one above');list.append(empty);}
    edges.forEach((edge,index)=>{
      const row=document.createElement('div');row.className='include-row';row.dataset.includeIndex=index;row.draggable=edge.status==='literal';
      row.ondragstart=event=>{event.dataTransfer.setData('application/x-lineae-include',String(index));event.dataTransfer.effectAllowed='move';};
      const file=referenceTarget(p,edge),link=document.createElement('button');link.type='button';link.className='include-file';link.textContent=edge.path;link.disabled=!file||file.missing;
      link.onclick=()=>openFile(file.id);row.append(link);
      const type=document.createElement('select');type.setAttribute('aria-label',t('引用类型','Reference type'));for(const name of ['input','include'])type.append(new Option('\\'+name,name));type.value=edge.command;type.disabled=edge.status!=='literal';type.onchange=()=>perform(text=>setReferenceKind(text,index,type.value));row.append(type);
      for(const [symbol,label,run,disabled] of [
        ['↑',t('前移','Move earlier'),()=>perform(text=>moveReference(text,index,index-1)),index===0],
        ['↓',t('后移','Move later'),()=>perform(text=>moveReference(text,index,index+1)),index===edges.length-1],
        ['×',t('移除引用（保留文件）','Remove reference (keep file)'),()=>perform(text=>removeReference(text,index)),false],
      ]){const b=document.createElement('button');b.type='button';b.textContent=symbol;b.title=label;b.setAttribute('aria-label',label);b.disabled=disabled||edge.status!=='literal';b.onclick=run;row.append(b);}
      if(!file||file.missing||edge.status!=='literal'){const warning=document.createElement('small');warning.textContent=edge.status!=='literal'?t('动态路径','Dynamic path'):t('文件缺失','Missing file');row.append(warning);}
      list.append(row);
    });
  }
  render();return {render,show(){container.closest('details').open=true;select.focus();}};
}
