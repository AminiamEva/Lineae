import {Project, DirectoryHandleAdapter} from './project.mjs';
import {localize, t} from '../ui/i18n.mjs';
import {sidebarSection} from '../ui/sidebar-section.js';
import {installIncludePanel} from './include-panel.js';
import {projectPath} from './paths.mjs';
import {DEFAULT_DOCUMENT_SOURCE} from '../editor/default-document.mjs';

export function installProjectExplorer({footer, filePanel, sessions}) {
  let project = null, busy = false, switching = false, treeSignature = '';
  const expanded = new Set();
  const fileButtons = new Map();
  const panel = document.createElement('aside');
  panel.id = 'project-explorer'; panel.hidden = true;
  panel.setAttribute('aria-label', t('项目文件','Project files'));
  const title = document.createElement('strong');
  const actions = document.createElement('div'); actions.className = 'project-actions';
  const tree = document.createElement('div'); tree.className = 'project-tree';
  const diagnostics = document.createElement('p');
  const message = document.createElement('p'); message.setAttribute('role','status');
  const contextMenu = document.createElement('div');
  contextMenu.id = 'project-context-menu'; contextMenu.className = 'project-context-menu';
  contextMenu.setAttribute('role','menu');contextMenu.setAttribute('aria-label',t('文件操作','File actions'));contextMenu.hidden = true;
  panel.append(title,actions,message);document.body.append(panel,contextMenu);
  const sectionOptions={getState:()=>sessions.preferences().interface.sidebar,onToggle:(key,open)=>sessions.sidebarChanged(key,open)};
  const sections={
    files:sidebarSection(panel,'files',['文件树','File tree'],sectionOptions),
    includes:sidebarSection(panel,'includes',['文件引用','File includes'],sectionOptions),
    outline:sidebarSection(panel,'outline',['大纲','Outline'],sectionOptions),
    citations:sidebarSection(panel,'citations',['文献','Citations'],sectionOptions),
  };
  sections.files.content.append(diagnostics,tree);
  sections.outline.content.append(sessions.outline.panel);sessions.outline.panel.hidden=false;
  const citeButton=document.createElement('button');citeButton.type='button';citeButton.dataset.zh='管理参考文献';citeButton.dataset.en='Manage references';citeButton.onclick=sessions.citations;sections.citations.content.append(citeButton);
  const includes=installIncludePanel({container:sections.includes.content,getProject:()=>project,edit:sessions.editIncludes,openFile:id=>run(()=>activate(id))});
  panel.addEventListener('lineae-show-sidebar',()=>visible(true));
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
    const selectedEntries=newOrOpen?await adapter.list():null;
    if(newOrOpen==='create' && selectedEntries.length)throw new Error(t('新建工程请选择空目录','Choose an empty folder for a new project'));
    let createNew=Boolean(newOrOpen && !selectedEntries.length);
    const next = await new Project(adapter).open();
    if(createNew && (next.diskRecovery.length || next.recoveryVersions.length || next.diskRecoveryError))createNew=false;
    if(createNew){
      const main=await next.create('main.tex',DEFAULT_DOCUMENT_SOURCE);
      next.setMain(main.id);next.activate(main.id);
    }
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
  const suggestedPath = (base,name) => base ? base+'/'+name : name;
  function createEntry(base,folder){
    sessions.ensureIdle();capture();sections.files.section.open=true;visible(true);
    const parent=base?[...tree.querySelectorAll('summary[data-path]')].find(n=>n.dataset.path===base)?.parentElement:tree;
    if(parent?.tagName==='DETAILS')parent.open=true;
    return new Promise(resolve=>{
      const row=document.createElement('form');row.className='project-inline-entry';
      const input=document.createElement('input');input.dataset.projectName='';input.value=folder?'new-folder':'new.tex';input.autocomplete='off';input.spellcheck=false;
      input.setAttribute('aria-label',folder?t('新建目录名称','New folder name'):t('新建文件名称','New file name'));
      const error=document.createElement('small');error.setAttribute('role','alert');row.append(input,error);(parent??tree).append(row);
      let done=false;
      const cancel=()=>{if(done)return;done=true;row.remove();resolve();};
      row.onsubmit=async event=>{
        event.preventDefault();if(done||input.disabled)return;
        try{
          const target=projectPath(input.value.trim(),base);
          if(!folder&&!target.endsWith('.tex'))throw new Error(t('文件名需要 .tex 扩展名','Use a .tex filename'));
          input.disabled=true;
          if(folder){await project.mkdir(target);expanded.add(target);}
          else{const file=await project.create(target,'');capture();project.activate(file.id);expanded.add(parentPath(file.path));show(file);}
          cancel();
        }catch(e){input.disabled=false;error.textContent=e.message;input.focus();}
      };
      input.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cancel();}};
      input.focus();input.select();
    });
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
    const references=project.rewriteMovedReferences(change);
    const activeRewrite=references.files.find(file=>file.fileId===project.activeFileId);
    if(activeRewrite && sessions.applyChanges){
      sessions.applyChanges(activeRewrite.changes);
      const active=project.file(project.activeFileId);active.session=sessions.capture(active.draft);
    }
    if (change) for (const entry of [...expanded]) {
      if (entry===change.source || entry.startsWith(change.source+'/')) {
        expanded.delete(entry); expanded.add(change.target+entry.slice(change.source.length));
      }
    }
    show(project.file(project.activeFileId));
    message.textContent=references.count
      ? t(`路径已更新；已重写 ${references.count} 处 LaTeX 引用，请保存受影响文件`,`Paths updated; rewrote ${references.count} LaTeX references. Save the affected files.`)
      : t('路径已更新；未发现可安全重写的字面量引用','Paths updated; no literal references required rewriting');
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
    const files=[...project.files.values()].filter(file=>file.path.startsWith(path+'/'));
    if(files.some(file=>file.id===project.mainFileId))throw new Error(t('不能删除包含主文档的目录','Cannot delete a directory containing the main document'));
    const dirty=files.filter(file=>file.dirty).length;
    const zhDetail=dirty?`，其中 ${dirty} 个文件有未保存修改`:'';
    const enDetail=dirty?`, including ${dirty} files with unsaved changes`:'';
    if(!confirm(t(`从磁盘删除目录 ${path} 及其中 ${files.length} 个文件${zhDetail}？此操作不可撤销。`,
      `Delete ${path} and its ${files.length} files from disk${enDetail}? This cannot be undone.`)))return;
    const active=project.activeFileId,result=await project.removeDirectory(path);
    for(const entry of [...expanded])if(entry===path || entry.startsWith(path+'/'))expanded.delete(entry);
    if(active!==project.activeFileId || result.retained.includes(active))show(project.file(project.activeFileId));
    message.textContent=result.retained.length
      ? t(`目录已删除；删除期间的新输入保留为 ${result.retained.length} 个缺失文件草稿`,`Directory deleted; new edits were retained as ${result.retained.length} missing-file drafts`)
      : t('目录已删除','Directory deleted');
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
  function closeContextMenu() { contextMenu.hidden=true;contextMenu.replaceChildren();delete contextMenu.dataset.path; }
  function contextAction(label,action) {
    const [zh,en]=label;
    const control=document.createElement('button');control.type='button';control.setAttribute('role','menuitem');
    control.dataset.zh=zh;control.dataset.en=en;control.textContent=t(zh,en);
    control.addEventListener('click',()=>{closeContextMenu();run(action);});
    contextMenu.append(control);return control;
  }
  function contextSeparator() {
    const separator=document.createElement('hr');separator.setAttribute('role','separator');contextMenu.append(separator);
  }
  function showContextMenu(event) {
    if(!project || event.target.closest?.('button:not(.project-file)'))return;
    const fileNode=event.target.closest?.('.project-file');
    const directoryNode=fileNode?null:event.target.closest?.('summary[data-path]');
    const file=fileNode?project.file(fileNode.dataset.fileId):null;
    const directory=directoryNode?.dataset.path ?? '';
    const base=file?parentPath(file.path):directory;
    event.preventDefault();closeContextMenu();contextMenu.dataset.path=file?.path ?? directory;
    contextAction(['新建文件','New file'],()=>createFile(base));
    contextAction(['新建目录','New folder'],()=>createDirectory(base));
    if(file){
      contextSeparator();
      if(file.kind==='tex' && file.id!==project.activeFileId)contextAction(['追加到当前文档','Append to current document'],()=>sessions.includeFile(file.id));
      if(file.kind==='tex' && file.id!==project.mainFileId)contextAction(['设为主文档','Set as main document'],()=>setMainFile(file.id));
      if(file.draft!==null)contextAction(['重新加载','Reload'],()=>reloadFile(file.id));
      if(project.adapter.move){
        contextAction(['重命名','Rename'],()=>relocate(file.path,false));
        contextAction(['移动','Move'],()=>relocate(file.path,true));
      }
      if(file.id!==project.mainFileId)contextAction(['删除','Delete'],()=>deleteFile(file.id));
    } else if(directory && project.adapter.move){
      contextSeparator();
      contextAction(['重命名目录','Rename folder'],()=>relocate(directory,false));
      contextAction(['移动目录','Move folder'],()=>relocate(directory,true));
      contextAction(['删除目录','Delete folder'],()=>deleteDirectory(directory));
    } else if(directory){
      contextSeparator();contextAction(['删除目录','Delete folder'],()=>deleteDirectory(directory));
    }
    contextSeparator();contextAction(['刷新文件树','Refresh tree'],refreshTree);
    contextMenu.hidden=false;
    const target=event.target.getBoundingClientRect();
    const x=event.clientX || target.left+12, y=event.clientY || target.bottom;
    const bounds=contextMenu.getBoundingClientRect();
    contextMenu.style.left=Math.max(6,Math.min(x,window.innerWidth-bounds.width-6))+'px';
    contextMenu.style.top=Math.max(6,Math.min(y,window.innerHeight-bounds.height-6))+'px';
    contextMenu.querySelector('button')?.focus({preventScroll:true});
  }
  tree.addEventListener('contextmenu',showContextMenu);
  tree.addEventListener('keydown',event=>{if(event.key==='ContextMenu' || (event.shiftKey && event.key==='F10'))showContextMenu(event);});
  contextMenu.addEventListener('contextmenu',event=>event.preventDefault());
  contextMenu.addEventListener('keydown',event=>{
    if(event.target.matches('input,textarea') || !['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=[...contextMenu.querySelectorAll('button')],current=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:items.length-1))%items.length;
    items[next]?.focus();
  });
  document.addEventListener('pointerdown',event=>{if(!contextMenu.hidden&&!contextMenu.contains(event.target))closeContextMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeContextMenu();});
  window.addEventListener('resize',closeContextMenu);panel.addEventListener('scroll',closeContextMenu);
  function render() {
    includes.render();for(const section of Object.values(sections))section.relocalize();localize(sections.citations.content);
    panel.dataset.state=project?'open':'empty';newProjectButton.hidden=Boolean(project);
    actions.hidden = !project;
    if (!project) {
      closeContextMenu();tree.replaceChildren(emptyState);localize(emptyState);
      fileButtons.clear();treeSignature='';title.textContent=t('项目','Project');diagnostics.textContent='';return;
    }
    const missing=project.dependencies.filter(item=>item.status==='missing');
    const pending=project.dependencies.filter(item=>item.status==='pending');
    diagnostics.textContent=t('依赖','Dependencies')+' '+project.dependencies.length+' · '+t('缺失','missing')+' '+missing.length+' · '+t('待解析','pending')+' '+pending.length;
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
          summary.title=child.path;summary.setAttribute('aria-haspopup','menu');summary.dataset.path=child.path;summary.dataset.focusKey='directory:'+child.path;
          details.ontoggle = () => {if(details.isConnected) details.open ? expanded.add(child.path) : expanded.delete(child.path);};
          details.append(summary); parent.append(details); append(child, details);

        } else {
          const node = button(parent, '', () => activate(child.fileId));
          node.draggable=project.file(child.fileId).kind==='tex';
          node.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-lineae-file',child.fileId);event.dataTransfer.effectAllowed='copy';});
          node.dataset.path = child.path;node.dataset.fileId=child.fileId;node.className='project-file';node.setAttribute('aria-haspopup','menu');
          node.dataset.focusKey='file:'+child.fileId;fileButtons.set(child.fileId,node);
          node.title = child.path;

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
      const label=`${icons[file.kind]} ${file.path.split('/').at(-1)}${file.dirty?' ●':''}${file.missing || file.externalChanged?' ⚠':''}`;
      if(node.textContent!==label)node.textContent=label;
      node.setAttribute('aria-current',String(file.id===project.activeFileId));
      node.title=file.path+(file.missing?' · '+t('磁盘文件缺失','Missing on disk'):file.externalChanged?' · '+t('磁盘文件已改变','Changed on disk'):'');
    }
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
      treeSignature = '';
      render();
    }};
}
