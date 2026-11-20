import {parseDocument} from '../../latex/document.mjs';

// Project fragments and standalone children are viewed in their master layout.
export function projectLayoutPreamble(project,current){
  if(!project||project.activeFileId===project.mainFileId)return current;
  const master=project.file(project.mainFileId);
  return parseDocument(master.draft,{fragment:true})?.start??current;
}
