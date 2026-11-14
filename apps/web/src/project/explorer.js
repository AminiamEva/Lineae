import {Project, DirectoryHandleAdapter} from './project.mjs';

export function installProjectExplorer({footer, sessions}) {
  let project = null, busy = false, switching = false, treeSignature = '';
  const expanded = new Set();
  const fileButtons = new Map();
  const panel = document.createElement('aside');
  panel.id = 'project-explorer'; panel.hidden = true;
  panel.setAttribute('aria-label', '项目文件 / Project files');
  const title = document.createElement('strong');
  const actions = document.createElement('div'); actions.className = 'project-actions';
  const tree = document.createElement('div');
  const diagnostics = document.createElement('p');
  const message = document.createElement('p'); message.setAttribute('role','status');
  panel.append(title, actions, diagnostics, tree, message); document.body.append(panel);
  const toggle = document.createElement('button'); toggle.id = 'project-toggle';
  toggle.textContent = '▤'; toggle.title = '显示/隐藏项目文件 / Toggle project files';
  toggle.setAttribute('aria-label', toggle.title); toggle.setAttribute('aria-controls', panel.id);
  function visible(value) {
    panel.hidden = !value; toggle.setAttribute('aria-expanded', String(value));
    document.body.classList.toggle('project-visible', value);
    if (project) project.treeVisible = value;
    window.dispatchEvent(new Event('resize'));
  }
  toggle.onclick = () => visible(panel.hidden); visible(false); footer.prepend(toggle);
  function button(parent, label, action, id) {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    if (id) node.id = id;
    node.onclick = () => run(action); parent.append(node); return node;
  }
  async function run(action) {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy','true');
    try { message.textContent = ''; await action(); }
    catch (error) { if (error.name !== 'AbortError') { message.textContent = error.message; sessions.error(error.message); } }
    finally { busy = false; panel.setAttribute('aria-busy','false'); render(); }
  }
  function show(file) {
    switching = true;
    try { sessions.open(file); } finally { switching = false; }
  }
  function capture() {
    if (!project?.activeFileId) return;
    const file = project.file(project.activeFileId);
    project.edit(file.id, sessions.text());
    file.session = sessions.capture();
  }
  function dirty() { capture(); return project && [...project.files.values()].some(file => file.dirty); }
  function approveClose() { return !dirty() || confirm('项目中有未保存修改，放弃这些修改？ / Discard unsaved project changes?'); }
  async function activate(id) {
    sessions.ensureIdle();
    capture();
    const file = project.file(id);
    if (file.draft === null) { message.textContent = '资源文件 / Resource: ' + file.path; return; }
    if (id === project.activeFileId) return;
    project.activate(id);
    show(file);
    render();
  }
  async function open() {
    sessions.ensureIdle();
    if (!approveClose()) return;
    const previous = project;
    const before = previous && new Map([...previous.files.values()].map(file=>[file.id,file.draft]));
    const standaloneBefore = !previous && sessions.text();
    if (!project && !sessions.approveOpen()) return;
    if (!window.lineaeProject && !window.showDirectoryPicker) throw new Error('当前环境不支持目录读写，请使用桌面应用或支持 File System Access 的浏览器。');
    const adapter = window.lineaeProject ? await window.lineaeProject.open() : new DirectoryHandleAdapter(await window.showDirectoryPicker({mode:'readwrite'}));
    const next = await new Project(adapter).open();
    let recoveryNotice='';
    try {
      for(const version of next.recoveryVersions){
        const detail=version.drafts.map(draft=>`${draft.path}: ${draft.draft.length} 字符 · ${next.files.get(draft.path)?.saved===draft.saved?'磁盘未变':'磁盘已变或缺失'}\n${draft.draft.slice(0,160)}`).join('\n\n');
        if(confirm(`恢复版本 ${version.id}？同名草稿会替换当前编辑器草稿；其他版本仍保留。\nRestore this version?\n${detail}`)){
          next.restoreDrafts(version.drafts);next.diskRecovery=[];next.checkpoint();await next.pendingCheckpoint;
          if(next.persistenceError)throw new Error(next.persistenceError);
          await adapter.acknowledge(version);recoveryNotice='已恢复选择的版本；原检查点已归档 / Selected checkpoint restored and archived';
        }
      }
      const drafts=next.diskRecovery.length?next.diskRecovery:adapter.loadState?[]:next.recovery?.read() ?? [];
      const summary=drafts.map(draft=>`${draft.path}: ${draft.draft.length} 字符 · ${next.files.get(draft.path)?.saved===draft.saved?'磁盘未变 / unchanged':'磁盘已变或缺失 / changed or missing'}`).join('\n');
      if(drafts.length && confirm('恢复以下未保存草稿？磁盘文件不会被改写。 / Restore drafts?\n'+summary)) {
        const restored=next.restoreDrafts(drafts);recoveryNotice=`已恢复 ${restored}/${drafts.length} 个草稿；请核对磁盘冲突 / Recovered drafts`;
      }
      next.diskRecovery=[];next.checkpoint();
    } catch(error) { recoveryNotice='草稿恢复失败 / Recovery unavailable: '+error.message; }
    if (!next.mainFileId) throw new Error('目录中没有 .tex 文件或已确认恢复的 TeX 草稿 / No TeX file or restored TeX draft in this directory');
    // The picker and directory scan may take time while the old editor remains
    // usable. Confirm edits made since the first discard prompt before swapping.
    if (previous) {
      capture();
      if ([...previous.files.values()].some(file=>before.get(file.id)!==file.draft) && !approveClose()) return;
    } else if (sessions.text()!==standaloneBefore && !sessions.approveOpen()) return;
    sessions.ensureIdle();
    sessions.begin();
    project = next; expanded.clear(); title.textContent = adapter.name ?? adapter.handle.name;
    treeSignature = '';
    show(project.file(project.mainFileId));
    visible(false); render();
    if(recoveryNotice){message.textContent=recoveryNotice;sessions.error(recoveryNotice);}
    if(next.persistenceError){message.textContent=next.persistenceError;sessions.error(next.persistenceError);}
  }
  async function save() {
    if(sessions.prepareSave && !sessions.prepareSave())return;
    capture();
    const file = project.file(project.activeFileId);
    await project.save(file.id);
    capture();
    sessions.saved(file.saved); message.textContent = '已保存 / Saved'; render();
  }
  function close() {
    sessions.ensureIdle();
    if (!approveClose()) return false;
    project.checkpoint();
    project.recovery?.storage.removeItem(project.recovery.key);
    project.diskRecovery=[];for(const file of project.files.values())file.dirty=false;project.checkpoint();
    project = null; switching = true;
    try { sessions.end(); } finally { switching = false; }
    visible(false); render(); return true;
  }
  button(footer, '打开工程', open, 'project-open');
  button(actions, '保存', save, 'project-save');
  button(actions, '关闭工程', close, 'project-close');
  button(actions, '主文档', async () => {
    const path=prompt('主文档路径 / Main document',project.file(project.mainFileId).path);
    if(path) {const file=project.files.get(path);if(!file)throw new Error('文件不存在');project.setMain(file.id);}
  }, 'project-main');
  async function relocate(path, move) {
    sessions.ensureIdle();capture();
    const target=prompt(move?'移动到项目内路径 / Move to path':'新路径 / Rename path',path);
    if(!target || target===path)return;
    await project.move(path,target);
    // Keep input accepted while the native operation was pending, including
    // CodeMirror history/selection. The model retained the same file identity.
    capture();
    const change = project.pathChanges.at(-1);
    if (change) for (const entry of [...expanded]) {
      if (entry===change.source || entry.startsWith(change.source+'/')) {
        expanded.delete(entry); expanded.add(change.target+entry.slice(change.source.length));
      }
    }
    show(project.file(project.activeFileId));
    message.textContent='路径已更新；LaTeX 引用路径尚未自动重写 / References require review';
    if(project.persistenceError)message.textContent+=' · '+project.persistenceError;
  }
  button(actions, '重新加载', async () => {
    sessions.ensureIdle(); capture();
    const file = project.file(project.activeFileId);
    if (file.dirty && !confirm('放弃当前文件草稿并重新读取磁盘？ / Discard this draft and reload disk?')) return;
    await project.reload(file.id); show(file);
  }, 'project-reload');
  button(actions, '刷新文件树', async () => {
    sessions.ensureIdle(); capture();
    const active = project.file(project.activeFileId);
    const result = await project.refresh();
    if (result.changed.includes(active.id)) show(active);
    message.textContent = result.errors.length ? result.errors.map(item=>`${item.path}: ${item.message}`).join('\n')
      : result.missing.length ? '磁盘中有文件缺失；已保留编辑内容 / Missing files; editor content retained'
      : '文件树已刷新 / File tree refreshed';
  }, 'project-refresh');
  button(actions, '新建文件', async () => {
    const path = prompt('新建 .tex 文件路径 / New .tex path');
    if (!path) return;
    if (!path.endsWith('.tex')) throw new Error('请使用 .tex 扩展名');
    await project.create(path, '');
  }, 'project-create');
  button(actions, '新建目录', async () => {
    const path = prompt('目录路径 / Directory path'); if (path) await project.mkdir(path);
  }, 'project-mkdir');
  button(actions, '删除当前文件', async () => {
    sessions.ensureIdle();
    capture();
    const file = project.file(project.activeFileId);
    if (file.id === project.mainFileId) throw new Error('不能删除当前主文档 / Cannot delete the main document');
    if (!confirm(`从磁盘删除 ${file.path}？此操作不可撤销。`)) return;
    const result=await project.remove(file.id);
    if (result?.retained) {
      message.textContent='文件已删除；删除期间的新输入已保留为缺失文件草稿 / File deleted; new edits retained as a missing-file draft';
      return;
    }
    project.activate(project.mainFileId); show(project.file(project.mainFileId));
  }, 'project-delete');
  function render() {
    actions.hidden = !project;
    if (!project) { tree.replaceChildren();fileButtons.clear();treeSignature='';title.textContent = '项目 / Project'; diagnostics.textContent=''; return; }
    const missing=project.dependencies.filter(item=>item.status==='missing');
    const pending=project.dependencies.filter(item=>item.status==='pending');
    diagnostics.textContent=`依赖 ${project.dependencies.length} · 缺失 ${missing.length} · 待解析 ${pending.length}`;
    diagnostics.title=missing.map(item=>item.path).join('\n');
    // Editing changes row state, not tree topology. Keep DOM nodes (and their
    // focus, native details state and scroll position) until paths change.
    const signature=JSON.stringify([project.directories,[...project.files.values()].map(file=>[file.id,file.path,file.kind])]);
    if (signature!==treeSignature) {
    const focusKey=tree.contains(document.activeElement)?document.activeElement.dataset.focusKey:null;
    const scroll=panel.scrollTop;
    tree.replaceChildren();fileButtons.clear();
    function append(node, parent) {
      for (const child of node.children) {
        if (child.kind === 'directory') {
          const details = document.createElement('details'), summary = document.createElement('summary');
          details.open = expanded.has(child.path); summary.textContent = child.name;
          summary.title=child.path; summary.dataset.focusKey='directory:'+child.path;
          details.ontoggle = () => {if(details.isConnected) details.open ? expanded.add(child.path) : expanded.delete(child.path);};
          details.append(summary); parent.append(details); append(child, details);
          if(project.adapter.move){button(details,'重命名目录',()=>relocate(child.path,false));button(details,'移动目录',()=>relocate(child.path,true));}
        } else {
          const node = button(parent, '', () => activate(child.fileId));
          node.dataset.path = child.path; node.className = 'project-file';
          node.dataset.focusKey='file:'+child.fileId;fileButtons.set(child.fileId,node);
          node.title = child.path;
          if(project.adapter.move){button(parent,'重命名 '+child.name,()=>relocate(child.path,false));button(parent,'移动 '+child.name,()=>relocate(child.path,true));}
        }
      }
    }
    append(project.tree, tree);
    treeSignature=signature;
    if(focusKey){const target=[...tree.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===focusKey);target?.focus({preventScroll:true});}
    panel.scrollTop=scroll;
    }
    const icons = {tex:'T', bib:'B', image:'▧', pdf:'PDF', resource:'◇'};
    for(const file of project.files.values()) {
      const node=fileButtons.get(file.id);
      const label=`${icons[file.kind]} ${file.path.split('/').at(-1)}${file.dirty?' ●':''}${file.missing?' ⚠':''}`;
      if(node.textContent!==label)node.textContent=label;
      node.setAttribute('aria-current',String(file.id===project.activeFileId));
      node.title=file.path+(file.missing?' · 磁盘文件缺失 / Missing on disk':'');
    }
  }
  window.addEventListener('beforeunload', event => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  render();
  return {get active() { return !!project; }, save:() => run(save),
    close() {
      if (busy) { sessions.error('请等待当前文件操作完成 / Wait for the current file operation');return false; }
      try {return close();}catch(error){sessions.error(error.message);return false;}
    },
    changed() { if (project && !switching) { try { capture(); render(); } catch(error) {message.textContent='草稿检查点失败 / Draft checkpoint failed: '+error.message;sessions.error(message.textContent);} } }};
}
