import {TextSelection} from '@tiptap/pm/state';
// An editor command for the Project adapter; it does not replace core key handling.
export function exitProjectHeading(editor){
  const {$from}=editor.state.selection;if($from.parent.type.name!=='heading')return false;
  const at=$from.after(),tr=editor.state.tr;
  tr.insert(at,editor.schema.nodes.paragraph.create({indent:true,explicitIndent:true}));
  tr.setSelection(TextSelection.create(tr.doc,at+1));editor.view.dispatch(tr.scrollIntoView());editor.view.focus();return true;
}
