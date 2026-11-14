import {Project, DirectoryHandleAdapter} from './project.mjs';

export function installProjectExplorer({footer, sessions}) {
  let project = null, busy = false;
  const expanded = new Set();
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
    busy = true;
    try { message.textContent = ''; await action(); }
    catch (error) { if (error.name !== 'AbortError') { message.textContent = error.message; sessions.error(error.message); } }
    finally { busy = false; render(); }
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
    sessions.open(file);
    project.activate(id);
    render();
  }
  async function open() {
    sessions.ensureIdle();
    if (!approveClose()) return;
    if (!project && !sessions.approveOpen()) return;
    if (!window.lineaeProject && !window.showDirectoryPicker) throw new Error('当前环境不支持目录读写，请使用桌面应用或支持 File System Access 的浏览器。');
    const adapter = window.lineaeProject ? await window.lineaeProject.open() : new DirectoryHandleAdapter(await window.showDirectoryPicker({mode:'readwrite'}));
    const next = await new Project(adapter).open();
    if (!next.mainFileId) throw new Error('目录中没有 .tex 文件 / No TeX file in this directory');
    sessions.begin();
    project = next; expanded.clear(); title.textContent = adapter.name ?? adapter.handle.name;
    sessions.open(project.file(project.mainFileId));
    visible(false); render();
  }
  async function save() {
    capture();
    const file = project.file(project.activeFileId);
    await project.save(file.id);
    capture();
    sessions.saved(file.saved); message.textContent = '已保存 / Saved'; render();
  }
  function close() {
    sessions.ensureIdle();
    if (!approveClose()) return false;
    project = null; sessions.end(); visible(false); render(); return true;
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
    sessions.open(project.file(project.activeFileId));
    message.textContent='路径已更新；LaTeX 引用路径尚未自动重写 / References require review';
  }
  button(actions, '重新加载', async () => {
    sessions.ensureIdle(); capture();
    const file = project.file(project.activeFileId);
    if (file.dirty && !confirm('放弃当前文件草稿并重新读取磁盘？ / Discard this draft and reload disk?')) return;
    await project.reload(file.id); sessions.open(file);
  }, 'project-reload');
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
    capture();
    const file = project.file(project.activeFileId);
    if (file.id === project.mainFileId) throw new Error('不能删除当前主文档 / Cannot delete the main document');
    if (!confirm(`从磁盘删除 ${file.path}？此操作不可撤销。`)) return;
    await project.remove(file.id);
    sessions.open(project.file(project.mainFileId)); project.activate(project.mainFileId);
  }, 'project-delete');
  function render() {
    tree.replaceChildren(); actions.hidden = !project;
    if (!project) { title.textContent = '项目 / Project'; diagnostics.textContent=''; return; }
    const missing=project.dependencies.filter(item=>item.status==='missing');
    const pending=project.dependencies.filter(item=>item.status==='pending');
    diagnostics.textContent=`依赖 ${project.dependencies.length} · 缺失 ${missing.length} · 待解析 ${pending.length}`;
    diagnostics.title=missing.map(item=>item.path).join('\n');
    function append(node, parent) {
      for (const child of node.children) {
        if (child.kind === 'directory') {
          const details = document.createElement('details'), summary = document.createElement('summary');
          details.open = expanded.has(child.path); summary.textContent = '▸ ' + child.name;
          details.ontoggle = () => details.open ? expanded.add(child.path) : expanded.delete(child.path);
          details.append(summary); parent.append(details); append(child, details);
          if(project.adapter.move){button(details,'重命名目录',()=>relocate(child.path,false));button(details,'移动目录',()=>relocate(child.path,true));}
        } else {
          const icons = {tex:'T', bib:'B', image:'▧', pdf:'PDF', resource:'◇'};
          const node = button(parent, `${icons[child.kind]} ${child.name}${child.dirty ? ' ●' : ''}`, () => activate(child.fileId));
          node.dataset.path = child.path; node.className = 'project-file';
          node.setAttribute('aria-current', String(child.fileId === project.activeFileId));
          node.title = child.path;
          if(project.adapter.move){button(parent,'重命名 '+child.name,()=>relocate(child.path,false));button(parent,'移动 '+child.name,()=>relocate(child.path,true));}
        }
      }
    }
    append(project.tree, tree);
  }
  window.addEventListener('beforeunload', event => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  render();
  return {get active() { return !!project; }, save:() => run(save), close,
    changed() { if (project && !busy) { capture(); render(); } }};
}
