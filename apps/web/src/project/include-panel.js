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

  function change(operation) {
    status.textContent = '';
    try { edit(operation); } catch (error) { status.textContent = error.message; }
  }
  function insert(id, before) {
    const project = getProject();
    if (!project || !id) return;
    if (wouldCycle(project,project.activeFileId,id)) {
      status.textContent = t('该引用会形成循环','This reference would create a cycle');
      return;
    }
    const file = project.file(id);
    change(text => addReference(text,file.path,kind.value,before));
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
    if (dragged !== '') {
      const end = includeEdges(project.file(project.activeFileId).draft).length - 1;
      change(text => moveReference(text,Number(dragged),index ?? end));
    } else insert(event.dataTransfer.getData(FILE_DRAG),index);
  });

  function rowFor(project, reference, index, count) {
    const row = document.createElement('div');
    row.className = 'include-row';
    row.dataset.includeIndex = index;
    const editable = reference.status === 'literal';
    row.draggable = editable;
    row.addEventListener('dragstart',event => {
      event.dataTransfer.setData(INCLUDE_DRAG,String(index));
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
    select.addEventListener('change',() => change(text => setReferenceKind(text,index,select.value)));
    row.append(link,select);
    const actions = [
      {symbol:'↑',label:t('前移','Move earlier'),disabled:index === 0,apply:text => moveReference(text,index,index - 1)},
      {symbol:'↓',label:t('后移','Move later'),disabled:index === count - 1,apply:text => moveReference(text,index,index + 1)},
      {symbol:'×',label:t('移除引用（保留文件）','Remove reference (keep file)'),apply:text => removeReference(text,index)},
    ];
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.symbol;
      button.title = action.label;
      button.setAttribute('aria-label',action.label);
      button.disabled = !editable || Boolean(action.disabled);
      button.addEventListener('click',() => change(action.apply));
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
    const signature = JSON.stringify([file?.id,references.map(reference => [reference.command,reference.path,reference.status,referenceTarget(project,reference)?.id]),document.documentElement.lang]);
    if (signature === listKey) return;
    listKey = signature;
    list.replaceChildren(...references.map((reference,index) => rowFor(project,reference,index,references.length)));
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
