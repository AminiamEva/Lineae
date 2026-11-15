import {Extension} from '@tiptap/core';
import {closeHistory} from '@tiptap/pm/history';
import {parseDocument} from '../../latex/document.mjs';
import {readPageSetup,writePageSetup} from '../../latex/geometry.mjs';

export function mergePageLayout(current, patch) {
  const updated = {...current,...patch,margins:{...current.margins,...patch.margins}};
  if (patch.margin && !patch.margins) {
    updated.margins = Object.fromEntries(['top','right','bottom','left'].map(side => [side,patch.margin]));
  }
  const values = Object.values(updated.margins);
  updated.margin = values.every(value => value === values[0]) ? values[0] : 'custom';
  return updated;
}
export function textPatch(before, after) {
  if (before === after) return [];
  let from = 0;
  let to = before.length;
  let end = after.length;
  while (from < to && from < end && before[from] === after[from]) from++;
  while (to > from && end > from && before[to - 1] === after[end - 1]) { to--; end--; }
  return [{from,to,insert:after.slice(from,end)}];
}
export function changePageLayout({editor,sourceView,current,preamble,patch}) {
  if (!sourceView.hidden) sourceView.flush();
  const baseline = sourceView.hidden ? current : readPageSetup(parseDocument(sourceView.value,{fragment:true})?.start ?? '');
  if (editor.state.doc.attrs.layoutPreamble === null) {
    editor.view.dispatch(editor.state.tr.setDocAttribute('layoutPreamble',preamble).setMeta('addToHistory',false));
  }
  const updated = mergePageLayout(baseline,patch);
  if (sourceView.hidden) {
    const nextPreamble = writePageSetup(preamble,updated);
    editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute('layoutPreamble',nextPreamble));
  } else {
    const before = sourceView.value;
    const changes = textPatch(before,writePageSetup(before,updated));
    if (changes.length) sourceView.applyChanges(changes);
    sourceView.flush();
  }
  return updated;
}

export const PageLayoutHistory=Extension.create({
  name:'pageLayoutHistory',
  addGlobalAttributes(){
    return [{types:['doc'],attributes:{layoutPreamble:{default:null,rendered:false}}}];
  },
});
