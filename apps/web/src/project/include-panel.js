import {icon} from '../editor/icons.js';
import {t} from '../ui/i18n.mjs';
import {includeEdges,referenceTarget,wouldCycle,addReference,removeReference,setReferenceKind,moveReference} from './include-operations.mjs';

const FILE_DRAG = 'application/x-lineae-file';
const INCLUDE_DRAG = 'application/x-lineae-include';
const accepts = data => data && (data.types.includes(FILE_DRAG) || data.types.includes(INCLUDE_DRAG));
function commandSelect() {
  const select = document.createElement('select');
  for (const command of ['input','include']) select.append(new Option('\\' + command,command));
  return select;
}

export function installIncludePanel({container,getProject,edit,openFile}) {
  const form = document.createElement('form');
  form.className = 'include-add';
  const target = document.createElement('select');
  target.dataset.includeTarget = '';
  const kind = commandSelect();
  kind.dataset.includeKind = '';
  const add = document.createElement('button');
  add.type = 'submit';
  add.dataset.includeAdd = '';
  const list = document.createElement('div');
  list.className = 'include-list';
  const status = document.createElement('p');
  status.setAttribute('role','status');
  form.append(target,kind,add);
  container.append(form,list,status);
  let listKey = '';
  let targetsKey = '';
  let folded=new Set();
  document.addEventListener('lineae-project-fold-state',event=>{folded=new Set(event.detail.paths);render();});

  function change(operation,owner) {
    status.textContent = '';
    try { edit(operation,owner); } catch (error) { status.textContent = error.message; }
  }
  function insert(id, before,owner) {
    const project = getProject();
    if (!project || !id) return;
    owner??=project.activeFileId;
    if (wouldCycle(project,owner,id)) {
      status.textContent = t('该引用会形成循环','This reference would create a cycle');
      return;
    }
    const file = project.file(id);
    change(text => addReference(text,file.path,kind.value,before),owner);
  }
  form.addEventListener('submit',event => { event.preventDefault(); insert(target.value); });
  container.addEventListener('dragover',event => { if (accepts(event.dataTransfer)) event.preventDefault(); });
  container.addEventListener('drop',event => {
    if (!accepts(event.dataTransfer)) return;
    const project = getProject();
    if (!project?.activeFileId) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.target.closest('[data-include-index]');
    const index = row ? Number(row.dataset.includeIndex) : undefined;
    const dragged = event.dataTransfer.getData(INCLUDE_DRAG);
    if(dragged!==''){
      let from;try{from=JSON.parse(dragged);}catch{return;}
      const owner=row?.dataset.includeOwner??project.activeFileId;
      if(from.owner!==owner)return;
      const end=includeEdges(project.file(owner).draft).length-1;
      change(text=>moveReference(text,from.index,index??end),owner);
    }else insert(event.dataTransfer.getData(FILE_DRAG),index,row?.dataset.includeOwner);

  });

  function rowFor(project, reference, index, count,owner,depth=0) {
    const row = document.createElement('div');
    row.className = 'include-row';
    row.dataset.includeIndex = index;
    row.dataset.includeOwner=owner;
    row.style.setProperty('--include-depth',depth);
    const editable = reference.status === 'literal';
    row.draggable = editable;
    row.addEventListener('dragstart',event => {
      event.dataTransfer.setData(INCLUDE_DRAG,JSON.stringify({owner,index}));
      event.dataTransfer.effectAllowed = 'move';
    });
    const file = referenceTarget(project,reference);
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'include-file';
    link.textContent = reference.path;
    link.disabled = !file || file.missing;
    link.addEventListener('click',() => openFile(file.id));
    const select = commandSelect();
    select.value = reference.command;
    select.disabled = !editable;
    select.setAttribute('aria-label',t('引用类型','Reference type'));
    select.addEventListener('change',() => change(text => setReferenceKind(text,index,select.value),owner));
    const drag=document.createElement('span');drag.className='include-drag-handle';drag.append(icon('drag'));drag.draggable=true;drag.tabIndex=0;drag.setAttribute('role','button');drag.setAttribute('aria-label',t('拖动排序；Alt 加上下键移动','Drag to reorder; Alt+Up/Down to move'));
    drag.addEventListener('keydown',event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const next=index+(event.key==='ArrowUp'?-1:1);if(next>=0&&next<count)change(text=>moveReference(text,index,next),owner);}});
    const fold=document.createElement('button');fold.type='button';fold.dataset.includeFold='';fold.append(icon('chevronDown'));
    fold.setAttribute('aria-label',folded.has(file?.path)?t('展开引用内容','Expand included content'):t('折叠引用内容','Collapse included content'));
    fold.setAttribute('aria-expanded',String(!folded.has(file?.path)));fold.disabled=!file;
    fold.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('lineae-toggle-project-file',{detail:{path:file.path}})));
    row.append(drag,fold,link,select);
    const actions = [
      {symbol:'↑',label:t('前移','Move earlier'),disabled:index === 0,apply:text => moveReference(text,index,index - 1)},
      {symbol:'↓',label:t('后移','Move later'),disabled:index === count - 1,apply:text => moveReference(text,index,index + 1)},
      {symbol:'×',label:t('移除引用（保留文件）','Remove reference (keep file)'),apply:text => removeReference(text,index)},
    ];
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.append(icon(action.symbol==='×'?'delete':action.symbol==='↑'?'chevronUp':'chevronDown'));
      button.title = action.label;
      button.setAttribute('aria-label',action.label);
      button.disabled = !editable || Boolean(action.disabled);
      button.dataset.includeAction=action.symbol==='×'?'remove':action.symbol==='↑'?'up':'down';
      button.addEventListener('click',() => change(action.apply,owner));
      row.append(button);
    }
    if (!editable || !file || file.missing) {
      const warning = document.createElement('small');
      warning.textContent = !editable ? t('动态路径','Dynamic path') : t('文件缺失','Missing file');
      row.append(warning);
    }
    return row;
  }

  function render() {
    const project = getProject();
    const file = project?.activeFileId ? project.file(project.activeFileId) : null;
    const candidates = Array.from(project?.files.values() ?? []).filter(item => item.kind === 'tex' && !item.missing && item.id !== file?.id);
    target.setAttribute('aria-label',t('要引用的文件','File to include'));
    kind.setAttribute('aria-label',t('引用命令','Include command'));
    add.textContent = t('添加','Add');
    form.hidden = file?.kind !== 'tex';
    const optionsKey = JSON.stringify([candidates.map(item => [item.id,item.path]),document.documentElement.lang]);
    if (targetsKey !== optionsKey) {
      targetsKey = optionsKey;
      const selected = target.value;
      target.replaceChildren(new Option(t('选择 TeX 文件','Choose a TeX file'),''));
      for (const candidate of candidates) target.append(new Option(candidate.path,candidate.id));
      if (candidates.some(candidate => candidate.id === selected)) target.value = selected;
    }
    const references = file?.kind === 'tex' ? includeEdges(file.draft) : [];
    const signature = JSON.stringify([file?.id,Array.from(project?.files.values()??[],entry=>[entry.id,includeEdges(entry.draft??'')]),[...folded],document.documentElement.lang]);
    if (signature === listKey) return;
    listKey = signature;
    const rows=[];
    function appendReferences(owner,depth,ancestry){
      if(ancestry.has(owner))return;
      const edges=includeEdges(project.file(owner).draft??'');
      edges.forEach((reference,index)=>{
        rows.push(rowFor(project,reference,index,edges.length,owner,depth));
        const child=referenceTarget(project,reference);
        if(child&&!child.missing)appendReferences(child.id,depth+1,new Set(ancestry).add(owner));
      });
    }
    if(file?.kind==='tex')appendReferences(file.id,0,new Set());
    list.replaceChildren(...rows);
    if (!references.length) {
      const empty = document.createElement('p');
      empty.className = 'sidebar-empty';
      empty.textContent = t('拖入文件或选择文件添加引用','Drag a file here or choose one above');
      list.append(empty);
    }
  }
  render();
  return {render,show() { container.closest('details').open = true; target.focus(); }};
}
