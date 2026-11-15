import {projectPath} from './paths.mjs';
import {scanDependencies} from './dependencies.mjs';
import {dependencyMatchesPath,dependencySpelling} from './reference-paths.mjs';

const contained = (path,directory) => path === directory || path.startsWith(directory + '/');
const sameBytes = (left,right) => left.length === right.length && left.every((value,index) => value === right[index]);

export async function removeProjectDirectory(project,value) {
  const path = projectPath(value);
  if (!project.directories.includes(path)) throw new Error('Directory does not exist');
  const members = Array.from(project.files.values()).filter(file => file.path.startsWith(path + '/'));
  if (members.some(file => file.id === project.mainFileId)) throw new Error('Cannot delete a directory containing the main document');
  const revisions = new Map(members.map(file => [file.id,file.revision ?? 0]));
  const manifest = [
    ...project.directories.filter(directory => contained(directory,path)).map(path => ({path,kind:'directory'})),
    ...members.map(file => ({path:file.path,kind:'file',bytes:Array.from(file.bytes)})),
  ].sort((left,right) => left.path.localeCompare(right.path,'en'));
  const membership = entries => entries.map(entry => entry.path + '\0' + entry.kind).sort();
  const actual = (await project.adapter.list()).filter(entry => contained(entry.path,path));
  if (JSON.stringify(membership(manifest)) !== JSON.stringify(membership(actual))) throw new Error('Directory changed on disk; refresh before deleting');
  for (const file of members) {
    if (!sameBytes(await project.adapter.read(file.path),file.bytes)) throw new Error('File changed on disk: ' + file.path);
  }
  await project.adapter.remove(path,undefined,manifest);
  const retained = [], removed = [];
  for (const file of members) {
    if ((file.revision ?? 0) !== revisions.get(file.id)) {
      file.missing = true;
      retained.push(file.id);
    } else {
      project.files.delete(file.path);
      project.scans.delete(file.id);
      removed.push(file.id);
    }
  }
  project.directories = project.directories.filter(directory => !contained(directory,path));
  if (!Array.from(project.files.values()).some(file => file.id === project.activeFileId)) project.activeFileId = project.mainFileId;
  project.mainCandidates = Array.from(project.files.values()).filter(file => project.scans.get(file.id)?.document);
  project.resolveDependencies();
  project.checkpoint();
  return {retained,removed};
}

export function rewriteProjectReferences(project, change = project.pathChanges.at(-1)) {
  if (!change?.changes?.length) return {status:'unchanged',count:0,files:[]};
  const affected = [];
  let count = 0;
  for (const file of project.files.values()) {
    if (typeof file.draft !== 'string') continue;
    const changes = scanDependencies(file.draft).dependencies.flatMap(reference => {
      if (reference.status !== 'literal') return [];
      const moved = change.changes.find(item => dependencyMatchesPath(reference.command,reference.path,item.from));
      if (!moved) return [];
      const insert = dependencySpelling(reference.command,reference.path,moved.to);
      return insert === reference.path ? [] : [{from:reference.from,to:reference.to,insert}];
    });
    if (!changes.length) continue;
    const updated = changes.sort((a,b) => b.from - a.from).reduce((source,patch) => source.slice(0,patch.from) + patch.insert + source.slice(patch.to),file.draft);
    if (updated === file.draft) continue;
    file.draft = updated;
    file.revision = (file.revision ?? 0) + 1;
    file.dirty = updated !== file.saved;
    if (file.id !== project.activeFileId) file.session = null;
    project.scan(file);
    count += changes.length;
    affected.push({fileId:file.id,path:file.path,count:changes.length,changes:changes.sort((a,b) => a.from - b.from)});
  }
  if (count) { project.resolveDependencies(); project.checkpoint(); }
  change.references = {status:count ? 'rewritten' : 'unchanged',count,files:affected};
  return change.references;
}
