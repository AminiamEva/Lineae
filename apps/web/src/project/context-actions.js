const parentPath = path => path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : '';

export function projectContextActions(project, file, directory, commands) {
  const base = file ? parentPath(file.path) : directory;
  const items = [
    {label:['新建文件','New file'],run:() => commands.createFile(base)},
    {label:['新建目录','New folder'],run:() => commands.createDirectory(base)},
  ];
  const divider = () => items.push({separator:true});
  const action = (label,run) => items.push({label,run});
  if (file) {
    divider();
    if (file.kind === 'tex' && file.id !== project.activeFileId) action(['追加到当前文档','Append to current document'],() => commands.includeFile(file.id));
    if (file.kind === 'tex' && file.id !== project.mainFileId) action(['设为主文档','Set as main document'],() => commands.setMainFile(file.id));
    if (file.draft !== null) action(['重新加载','Reload'],() => commands.reloadFile(file.id));
    if (project.adapter.move) {
      action(['重命名','Rename'],() => commands.relocate(file.path,false));
      action(['移动','Move'],() => commands.relocate(file.path,true));
    }
    if (file.id !== project.mainFileId) action(['删除','Delete'],() => commands.deleteFile(file.id));
  } else if (directory) {
    divider();
    if (project.adapter.move) {
      action(['重命名目录','Rename folder'],() => commands.relocate(directory,false));
      action(['移动目录','Move folder'],() => commands.relocate(directory,true));
    }
    action(['删除目录','Delete folder'],() => commands.deleteDirectory(directory));
  }
  divider();
  action(['刷新文件树','Refresh tree'],commands.refreshTree);
  return items;
}
