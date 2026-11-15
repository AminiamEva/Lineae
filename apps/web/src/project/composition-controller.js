import {addReference,includeEdges,referenceTarget,wouldCycle} from './include-operations.mjs';
import {t} from '../ui/i18n.mjs';

export function createCompositionController(port){
  const model=()=>port.explorer()?.model;
  const editable=()=>model()&&port.fileKind()==='tex'&&!port.composing();
  function show(){
    const project=model();
    if(!project||!port.sourceHidden()||port.fileKind()!=='tex')return;
    if(port.session.composition?.rootId===project.activeFileId)return;
    const composed=port.session.compose(project,project.activeFileId);
    if(composed.issues.length){port.report(composed.issues.join('; '));return;}
    if(composed.regions.length>1)port.present(composed);
  }
  function edit(transform){
    if(!editable())return false;
    const before=port.read(),after=transform(before);
    if(after===before)return false;
    const project=model();
    project.edit(project.activeFileId,after);
    port.replace(before,after,show);
    port.explorer().changed();
    return true;
  }
  function append(id,beforePath,command='input'){
    const project=model();
    if(!project)return false;
    const file=project.file(id);
    if(file.kind!=='tex'||wouldCycle(project,project.activeFileId,id)){
      port.report(t('该引用会形成循环','This reference would create a cycle'));return false;
    }
    return edit(text=>{
      const index=beforePath?includeEdges(text).findIndex(edge=>referenceTarget(project,edge)?.path===beforePath):-1;
      return addReference(text,file.path,command,index<0?undefined:index);
    });
  }
  async function request(command){
    const project=model();
    if(!project){port.explorer()?.showIncludes();return;}
    const path=await port.ask(t('引用 TeX 文件路径','TeX file to include'));
    if(!path||project!==model())return;
    const target=[...project.files.values()].find(file=>file.kind==='tex'&&(file.path===path||file.path===path+'.tex'));
    if(target)append(target.id,undefined,command);
    else port.report(t('项目中没有该 TeX 文件','No such TeX file in this project'));
  }
  return {show,edit,append,request};
}
