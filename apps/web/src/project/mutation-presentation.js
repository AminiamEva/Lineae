import {t} from '../ui/i18n.mjs';

export function updateMovedReferences(project,sessions){
  const changes=project.rewriteMovedReferences(project.pathChanges.at(-1));
  const active=changes.files.find(file=>file.fileId===project.activeFileId);
  if(active&&sessions.applyChanges){
    sessions.applyChanges(active.changes);
    const file=project.file(project.activeFileId);
    file.session=sessions.capture(file.draft);
  }
  return changes.count?t('路径已更新；已重写 '+changes.count+' 处 LaTeX 引用，请保存受影响文件','Paths updated; rewrote '+changes.count+' LaTeX references. Save the affected files.')
    :t('路径已更新；未发现可安全重写的字面量引用','Paths updated; no literal references required rewriting');
}
export async function removeDirectoryWithNotice({project,path,sessions,expanded,show,confirm}){
  sessions.ensureIdle();
  const files=[...project.files.values()].filter(file=>file.path.startsWith(path+'/'));
  if(files.some(file=>file.id===project.mainFileId))throw new Error(t('不能删除包含主文档的目录','Cannot delete a directory containing the main document'));
  const dirty=files.filter(file=>file.dirty).length;
  const detail=t(dirty?'，其中 '+dirty+' 个文件有未保存修改':'',dirty?', including '+dirty+' files with unsaved changes':'');
  if(!confirm(t('从磁盘删除目录 '+path+' 及其中 '+files.length+' 个文件','Delete '+path+' and its '+files.length+' files from disk')+detail+t('？此操作不可撤销。','? This cannot be undone.')))return '';
  const active=project.activeFileId;
  const result=await project.removeDirectory(path);
  for(const entry of expanded)if(entry===path||entry.startsWith(path+'/'))expanded.delete(entry);
  if(active!==project.activeFileId||result.retained.includes(active))show(project.file(project.activeFileId));
  return result.retained.length?t('目录已删除；删除期间的新输入保留为 '+result.retained.length+' 个缺失文件草稿','Directory deleted; new edits were retained as '+result.retained.length+' missing-file drafts'):t('目录已删除','Directory deleted');
}
