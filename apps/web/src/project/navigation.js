import {moveReference} from './include-operations.mjs';
export function installProjectNavigation({outline,paper,sourceView,editor,getProjection,appendInclude,editIncludeSource}){
outline.addEventListener('lineae-outline-navigate',event=>{
  if(sourceView.hidden)return;
  event.preventDefault();sourceView.flush();
  const index=editor.state.doc.resolve(Math.min(event.detail.position,editor.state.doc.content.size)).index(0);
  const block=getProjection()?.blocks.find(block=>index>=block.index && index<block.index+block.count);
  if(block){const offset=block.from+Math.max(0,block.raw.indexOf('\\'));sourceView.select(offset,offset);}
});
outline.addEventListener('dragover',event=>{
  if(event.dataTransfer.types.includes('application/x-lineae-file'))event.preventDefault();
});
outline.addEventListener('drop',event=>{
  const id=event.dataTransfer.getData('application/x-lineae-file');if(!id)return;
  event.preventDefault();appendInclude(id,event.target.closest?.('[data-outline-file]')?.dataset.outlineFile);
});
paper.addEventListener('dragover',event=>{
  if(event.dataTransfer.types.includes('application/x-lineae-file')){event.preventDefault();event.stopImmediatePropagation();}
},true);
paper.addEventListener('drop',event=>{
  const id=event.dataTransfer.getData('application/x-lineae-file');if(!id)return;
  event.preventDefault();event.stopImmediatePropagation();
  appendInclude(id,event.target.closest?.('[data-file-path]')?.dataset.filePath);
},true);
outline.addEventListener('lineae-move-include',event=>editIncludeSource(text=>moveReference(text,event.detail.index,event.detail.index+event.detail.direction)));
}
