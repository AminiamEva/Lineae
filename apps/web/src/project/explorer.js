import {DEFAULT_DOCUMENT_SOURCE} from '../editor/default-document.mjs';
import {updateMovedReferences,removeDirectoryWithNotice} from './mutation-presentation.js';
import {newProjectIntent,seedNewProject} from './opening.js';
import {createProjectSidebar} from './sidebar.js';
import {projectContextActions} from './context-actions.js';
import {installProjectContextMenu} from './context-menu.js';
import {promptTreeEntry} from './tree-entry.js';
import {installProjectTree} from './tree-view.js';
import {Project, DirectoryHandleAdapter} from './project.mjs';
import {localize, t} from '../ui/i18n.mjs';
import {projectPath} from './paths.mjs';

export function installProjectExplorer({footer, filePanel, sessions}) {
  let project = null, busy = false, switching = false;
  const expanded = new Set();

  const panel = document.createElement('aside');
  panel.id = 'project-explorer'; panel.hidden = true;
  panel.setAttribute('aria-label', t('项目文件','Project files'));
  const title = document.createElement('strong');
  const actions = document.createElement('div'); actions.className = 'project-actions';
  const tree = document.createElement('div'); tree.className = 'project-tree';
  const treeView=installProjectTree({tree,panel,expanded,activate,run});
  const diagnostics = document.createElement('p');diagnostics.className='project-diagnostics';
  const message = document.createElement('p'); message.setAttribute('role','status');
  const contextMenu = document.createElement('div');
  contextMenu.id = 'project-context-menu'; contextMenu.className = 'project-context-menu';
  contextMenu.setAttribute('role','menu');contextMenu.setAttribute('aria-label',t('文件操作','File actions'));contextMenu.hidden = true;
  const menu=installProjectContextMenu({contextMenu,panel,run});
  const closeContextMenu=menu.close,contextAction=menu.action,contextSeparator=menu.separator;
  const sidebar=createProjectSidebar({panel,title,actions,message,tree,diagnostics,sessions,
    getProject:()=>project,openFile:id=>run(()=>activate(id)),show:visible});
  const {sections,includes}=sidebar;
  document.body.append(panel,contextMenu);
  const toggle = document.createElement('button'); toggle.id = 'project-toggle';
  toggle.textContent = '▤'; toggle.title = t('显示/隐藏项目文件','Toggle project files');
  toggle.setAttribute('aria-label', toggle.title); toggle.setAttribute('aria-controls', panel.id);
  function visible(value) {
    panel.hidden = !value; toggle.setAttribute('aria-expanded', String(value));
    document.body.classList.toggle('project-visible', value);
    if (project) project.treeVisible = value;
    window.dispatchEvent(new Event('resize'));
  }
  toggle.onclick = () => visible(panel.hidden); visible(false); footer.prepend(toggle);
  function button(parent, label, action, id) {
    const [zh,en] = Array.isArray(label) ? label : [label,label];
    const node = document.createElement('button'); node.type = 'button';
    if (zh) { node.dataset.zh = zh; node.dataset.en = en; }
    node.textContent = t(zh,en);
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
    file.session = sessions.capture(file.draft);
  }
  function dirty() { capture(); return project && [...project.files.values()].some(file => file.dirty); }
  function approveClose() { return !dirty() || confirm(t('项目中有未保存修改，放弃这些修改？','Discard unsaved project changes?')); }
  async function activate(id) {
    sessions.ensureIdle();
    capture();
    const file = project.file(id);
    if (file.draft === null) { message.textContent = t('资源文件','Resource') + ': ' + file.path; return; }
    if (id === project.activeFileId) return;
    project.activate(id);
    show(file);
    render();
  }
  async function open(newOrOpen = false) {
    sessions.ensureIdle();
    if (!approveClose()) return;
    const previous = project;
    const before = previous && new Map([...previous.files.values()].map(file=>[file.id,file.draft]));
    const standaloneBefore = !previous && sessions.text();
    if (!project && !sessions.approveOpen(newOrOpen)) return;
    if (!window.lineaeProject && !window.showDirectoryPicker) throw new Error(t('当前环境不支持目录读写，请使用桌面应用或支持 File System Access 的浏览器。','This browser cannot write to a directory. Use the desktop app or a browser with File System Access.'));
    const adapter = window.lineaeProject ? await window.lineaeProject.open() : new DirectoryHandleAdapter(await window.showDirectoryPicker({mode:'readwrite'}));
    const createNew=await newProjectIntent(adapter,newOrOpen);
    const next = await new Project(adapter).open();
    await seedNewProject(next,createNew);
    let recoveryNotice='';
    try {
      for(const version of next.recoveryVersions){
        const detail=version.drafts.map(draft=>`${draft.path}: ${draft.draft.length} ${t('字符','characters')} · ${next.files.get(draft.path)?.saved===draft.saved?t('磁盘未变','unchanged on disk'):t('磁盘已变或缺失','changed or missing')}\n${draft.draft.slice(0,160)}`).join('\n\n');
        if(confirm(t('恢复版本','Restore version')+' '+version.id+t('？同名草稿会替换当前编辑器草稿；其他版本仍保留。','? Drafts with the same name replace the current editor draft; other versions are kept.')+'\n'+detail)){
          next.restoreDrafts(version.drafts);next.diskRecovery=[];next.checkpoint();await next.pendingCheckpoint;
          if(next.persistenceError)throw new Error(next.persistenceError);
          await adapter.acknowledge(version);recoveryNotice=t('已恢复选择的版本；原检查点已归档','Selected checkpoint restored and archived');
        }
      }
      const drafts=next.diskRecovery.length?next.diskRecovery:adapter.loadState?[]:next.recovery?.read() ?? [];
      const summary=drafts.map(draft=>`${draft.path}: ${draft.draft.length} ${t('字符','characters')} · ${next.files.get(draft.path)?.saved===draft.saved?t('磁盘未变','unchanged'):t('磁盘已变或缺失','changed or missing')}`).join('\n');
      if(drafts.length && confirm(t('恢复以下未保存草稿？磁盘文件不会被改写。','Restore these unsaved drafts? Files on disk are not modified.')+'\n'+summary)) {
        const restored=next.restoreDrafts(drafts);recoveryNotice=t('已恢复','Recovered')+' '+restored+'/'+drafts.length+t(' 个草稿；请核对磁盘冲突',' drafts; review disk conflicts');
      }
      next.diskRecovery=[];next.checkpoint();
    } catch(error) { recoveryNotice=t('草稿恢复失败','Recovery unavailable')+': '+error.message; }
    if (!next.mainFileId) throw new Error(t('目录中没有 .tex 文件或已确认恢复的 TeX 草稿','No TeX file or restored TeX draft in this directory'));
    // The picker and directory scan may take time while the old editor remains
    // usable. Confirm edits made since the first discard prompt before swapping.
    if (previous) {
      capture();
      if ([...previous.files.values()].some(file=>before.get(file.id)!==file.draft) && !approveClose()) return;
    } else if (sessions.text()!==standaloneBefore && !sessions.approveOpen(newOrOpen)) return;
    sessions.ensureIdle();
    sessions.begin();
    project = next; expanded.clear(); title.textContent = adapter.name ?? adapter.handle?.name ?? t('工程','Project');
    treeView.invalidate();
    show(project.file(project.mainFileId));
    visible(false); render();
    if(recoveryNotice){message.textContent=recoveryNotice;sessions.error(recoveryNotice);}
    if(next.persistenceError){message.textContent=next.persistenceError;sessions.error(next.persistenceError);}
  }
  async function save() {
    if(sessions.prepareSave && !sessions.prepareSave())return;
    capture();
    const file = project.file(project.activeFileId);
    const saveIds=sessions.saveFileIds?.()??[file.id];
    for(const id of saveIds)if(project.file(id).dirty)await project.save(id);
    capture();
    sessions.saved(file.saved); message.textContent = t('已保存','Saved'); render();
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
  const parentPath = path => path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : '';
  function createEntry(base,folder){
    sessions.ensureIdle();capture();sections.files.section.open=true;visible(true);
    const parent=base?[...tree.querySelectorAll('summary[data-path]')].find(n=>n.dataset.path===base)?.parentElement:tree;
    if(parent?.tagName==='DETAILS')parent.open=true;
    return promptTreeEntry({parent:parent??tree,folder,submit:async value=>{
      const target=projectPath(value,base);
      if(!folder&&!target.endsWith('.tex'))throw new Error(t('文件名需要 .tex 扩展名','Use a .tex filename'));
      if(folder){await project.mkdir(target);expanded.add(target);}
      else{const file=await project.create(target,DEFAULT_DOCUMENT_SOURCE);capture();project.activate(file.id);expanded.add(parentPath(file.path));show(file);sessions.focusNewFile?.(file);}
    }});
  }
  const createFile=(base='')=>createEntry(base,false);
  const createDirectory=(base='')=>createEntry(base,true);
  async function relocate(path, move) {
    sessions.ensureIdle();capture();
    const target=prompt(move?t('移动到项目内路径','Move to path'):t('新路径','Rename path'),path);
    if(!target || target===path)return;
    await project.move(path,target);
    // Keep input accepted while the native operation was pending, including
    // CodeMirror history/selection. The model retained the same file identity.
    capture();
    const change = project.pathChanges.at(-1);
    const notice=updateMovedReferences(project,sessions);
    if (change) for (const entry of [...expanded]) {
      if (entry===change.source || entry.startsWith(change.source+'/')) {
        expanded.delete(entry); expanded.add(change.target+entry.slice(change.source.length));
      }
    }
    show(project.file(project.activeFileId));
    message.textContent=notice;
    if(change?.warning)message.textContent+=' · '+change.warning;
    if(project.persistenceError)message.textContent+=' · '+project.persistenceError;
  }
  async function reloadFile(id) {
    sessions.ensureIdle(); capture();
    const file = project.file(id), active=id===project.activeFileId;
    if (file.dirty && !confirm(t('放弃当前文件草稿并重新读取磁盘？','Discard this draft and reload from disk?'))) return;
    await project.reload(file.id); if(active)show(file);
  }
  async function refreshTree() {
    sessions.ensureIdle(); capture();
    const active = project.file(project.activeFileId);
    const result = await project.refresh();
    if (result.changed.includes(active.id)) show(active);
    message.textContent = result.errors.length ? result.errors.map(item=>`${item.path}: ${item.message}`).join('\n')
      : (result.missing.length || [...project.files.values()].some(file=>file.missing)) ? t('磁盘中有文件缺失；已保留编辑内容','Missing files; editor content retained')
      : (result.conflicts.length || [...project.files.values()].some(file=>file.externalChanged)) ? t('磁盘文件已改变；已保留草稿，请核对后重新加载','Files changed on disk; drafts retained, review before reloading')
      : t('文件树已刷新','File tree refreshed');
  }
  async function deleteFile(id) {
    sessions.ensureIdle();
    capture();
    const file = project.file(id), active=id===project.activeFileId;
    if (file.id === project.mainFileId) throw new Error(t('不能删除当前主文档','Cannot delete the main document'));
    if (!confirm(t('从磁盘删除','Delete from disk')+' '+file.path+t('？此操作不可撤销。','? This cannot be undone.'))) return;
    const result=await project.remove(file.id);
    if (result?.retained) {
      message.textContent=t('文件已删除；删除期间的新输入已保留为缺失文件草稿','File deleted; new edits retained as a missing-file draft');
      return;
    }
    if(active)show(project.file(project.activeFileId));
  }
  async function deleteDirectory(path) {
    sessions.ensureIdle();capture();
    message.textContent=await removeDirectoryWithNotice({project,path,sessions,expanded,show,confirm});
  }
  function setMainFile(id) {
    project.setMain(id);message.textContent=t('已设置主文档','Main document updated');render();
  }
  button(filePanel ?? footer,['打开工程','Open project'],()=>open(false),'project-open');
  const newProjectButton=button(filePanel ?? footer,['新建工程','New project'],()=>open('create'),'project-new');
  button(actions,['保存','Save'],save,'project-save');
  button(actions,['关闭工程','Close project'],close,'project-close');
  const emptyState=document.createElement('div');emptyState.className='project-empty';
  button(emptyState,['新建/打开工程','New/Open project'],()=>open(true),'project-new-empty');
  function showContextMenu(event) {
    event.preventDefault();
    if(!project)return;
    const referenceRow=event.target.closest?.('[data-include-index]');
    if(referenceRow){
      closeContextMenu();
      const addItem=(labels,selector)=>{const button=referenceRow.querySelector(selector);if(button&&!button.disabled)contextAction(labels,()=>button.click());};
      addItem(['打开引用文件','Open included file'],'.include-file');
      addItem(['折叠/展开引用内容','Collapse/expand included content'],'[data-include-fold]');
      contextSeparator();
      addItem(['前移引用','Move reference earlier'],'[data-include-action=up]');
      addItem(['后移引用','Move reference later'],'[data-include-action=down]');
      addItem(['移除引用（保留文件）','Remove reference (keep file)'],'[data-include-action=remove]');
      menu.position(event);return;
    }
    const sidebar=event.target.closest?.('.sidebar-section');
    if(sidebar&&sidebar.id!=='sidebar-files'){
      closeContextMenu();
      const heading=event.target.closest?.('[data-heading-position],.outline-file');
      if(heading)contextAction(['跳转到此处','Go to this location'],()=>heading.click());
      if(sidebar.id==='sidebar-includes'){
        contextAction(['添加文件引用','Add file reference'],()=>includes.show());
        contextAction(['展开全部引用内容','Expand all included content'],()=>document.dispatchEvent(new Event('lineae-expand-project-files')));
      }
      if(sidebar.id==='sidebar-citations')contextAction(['管理参考文献','Manage references'],sessions.citations);
      contextAction(['折叠面板','Collapse panel'],()=>{sidebar.open=false;});
      menu.position(event);return;
    }
    const fileNode=event.target.closest?.('.project-file');
    const directoryNode=fileNode?null:event.target.closest?.('summary[data-path]');
    const file=fileNode?project.file(fileNode.dataset.fileId):null;
    const directory=directoryNode?.dataset.path ?? '';
    const base=file?parentPath(file.path):directory;
    event.preventDefault();closeContextMenu();contextMenu.dataset.path=file?.path ?? directory;
    const commands={createFile,createDirectory,includeFile:sessions.includeFile,setMainFile,reloadFile,relocate,deleteFile,deleteDirectory,refreshTree};
    for(const item of projectContextActions(project,file,directory,commands)){
      if(item.separator)contextSeparator();else contextAction(item.label,item.run);
    }
    menu.position(event);
  }
  panel.addEventListener('contextmenu',showContextMenu);
  panel.addEventListener('keydown',event=>{if(event.key==='ContextMenu' || (event.shiftKey && event.key==='F10'))showContextMenu(event);});
  function render() {
    sidebar.render();
    panel.dataset.state=project?'open':'empty';newProjectButton.hidden=Boolean(project);
    actions.hidden = !project;
    if (!project) {
      closeContextMenu();treeView.clear(emptyState);localize(emptyState);
      treeView.invalidate();title.textContent=t('项目','Project');diagnostics.textContent='';return;
    }
    const missing=project.dependencies.filter(item=>item.status==='missing');
    const pending=project.dependencies.filter(item=>item.status==='pending');
    diagnostics.textContent=t('依赖','Deps')+' '+project.dependencies.length+' · '+t('缺失','Missing')+' '+missing.length+' · '+t('待定','Pending')+' '+pending.length;
    diagnostics.title=missing.map(item=>item.path).join('\n');
    treeView.render(project);
  }
  window.addEventListener('beforeunload', event => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  render();
  return {get model(){return project;},get active() { return !!project; }, save:() => run(save),
    close() {
      if (busy) { sessions.error(t('请等待当前文件操作完成','Wait for the current file operation'));return false; }
      try {return close();}catch(error){sessions.error(error.message);return false;}
    },
    changed() { if (project && !switching) { try { capture(); render(); } catch(error) {message.textContent=t('草稿检查点失败','Draft checkpoint failed')+': '+error.message;sessions.error(message.textContent);} } },
    showIncludes(){visible(true);sections.includes.section.open=true;includes.show();},
    showOutline(){visible(true);sections.outline.section.open=true;sessions.outline.show();},
    relocalize() {
      closeContextMenu();
      panel.setAttribute('aria-label', t('项目文件','Project files'));
      contextMenu.setAttribute('aria-label',t('文件操作','File actions'));
      toggle.title = t('显示/隐藏项目文件','Toggle project files');
      toggle.setAttribute('aria-label', toggle.title);
      localize(panel);
      treeView.invalidate();
      render();
    }};
}
