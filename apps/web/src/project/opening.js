import {DEFAULT_DOCUMENT_SOURCE} from '../editor/default-document.mjs';
import {t} from '../ui/i18n.mjs';

export async function newProjectIntent(adapter, mode) {
  if (!mode) return false;
  const empty = (await adapter.list()).length === 0;
  if (mode === 'create' && !empty) throw new Error(t('新建工程请选择空目录','Choose an empty folder for a new project'));
  return empty;
}
export async function seedNewProject(project, requested) {
  if (!requested) return;
  if (project.diskRecovery.length || project.recoveryVersions.length || project.diskRecoveryError) return;
  if (project.files.size || project.directories.length) throw new Error(t('目录在打开期间发生变化，请重新打开工程','Directory changed while opening; open the project again'));
  const main = await project.create('main.tex',DEFAULT_DOCUMENT_SOURCE);
  project.setMain(main.id);
  project.activate(main.id);
}
