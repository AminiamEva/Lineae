import {TextSelection} from '@tiptap/pm/state';
import {moveReference} from './include-operations.mjs';

export function installProjectNavigation({outline,paper,sourceView,editor,getProjection,appendInclude,editIncludeSource}) {
  const mime = 'application/x-lineae-file';
  function fileDrag(event) { return event.dataTransfer?.types.includes(mime); }
  function enableDrop(event) {
    if (fileDrag(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  outline.addEventListener('lineae-outline-navigate',event => {
    if (sourceView.hidden) return;
    event.preventDefault();
    sourceView.flush();
    const position = Math.min(event.detail.position,editor.state.doc.content.size);
    const resolved = editor.state.doc.resolve(position);
    // Split view shows the rich preview next to the source. Move its caret and
    // scroll it too, without focusing it, so the source keeps keyboard focus.
    editor.view.dispatch(editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc,Math.min(position+1,editor.state.doc.content.size)))
      .scrollIntoView());
    const index = resolved.index(0);
    const block = getProjection()?.blocks.find(item => index >= item.index && index < item.index + item.count);
    if (!block) return;
    const offset = block.from + Math.max(0,block.raw.indexOf('\\'));
    sourceView.select(offset,offset);
  });
  outline.addEventListener('dragover',enableDrop);
  outline.addEventListener('drop',event => {
    const id = event.dataTransfer.getData(mime);
    if (!id) return;
    event.preventDefault();
    appendInclude(id,event.target.closest?.('[data-outline-file]')?.dataset.outlineFile);
  });
  paper.addEventListener('dragover',enableDrop,true);
  paper.addEventListener('drop',event => {
    const id = event.dataTransfer.getData(mime);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    appendInclude(id,event.target.closest?.('[data-file-path]')?.dataset.filePath);
  },true);
  outline.addEventListener('lineae-move-include',event => {
    const {index,direction} = event.detail;
    editIncludeSource(text => moveReference(text,index,index + direction));
  });
}
