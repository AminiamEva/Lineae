import {TextSelection} from '@tiptap/pm/state';
import {indentationAttributes} from '../editor/paragraph-format.js';

export function exitProjectHeading(editor) {
  const selection = editor.state.selection;
  const {$from} = selection;
  if ($from.parent.type.name !== 'heading') return false;
  const boundary = $from.after();
  const paragraph = editor.schema.nodes.paragraph.create(indentationAttributes({},true));
  const transaction = editor.state.tr.insert(boundary,paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc,boundary + 1));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return true;
}
