export function indentationAttributes(previous, enabled) {
  return {...previous,indent:enabled,explicitIndent:enabled,indentLevel:enabled ? previous.indentLevel ?? 0 : 0};
}

export function setParagraphIndent(editor, enabled) {
  const {state} = editor;
  const positions = [];
  state.doc.nodesBetween(state.selection.from,state.selection.to,(node,position) => {
    if (node.type.name === 'paragraph') positions.push(position);
  });
  const {$from} = state.selection;
  if (!positions.length && $from.parent.type.name === 'paragraph') positions.push($from.before());
  if (!positions.length) return false;
  const transaction = state.tr;
  for (const position of positions) {
    const paragraph = transaction.doc.nodeAt(position);
    if (paragraph?.type.name === 'paragraph') transaction.setNodeMarkup(position,undefined,indentationAttributes(paragraph.attrs,enabled));
  }
  editor.view.dispatch(transaction);
  return true;
}

export function paragraphHasIndent(editor) {
  const {$from} = editor.state.selection;
  const paragraph = $from.parent;
  if (paragraph.type.name !== 'paragraph' || paragraph.attrs.indent === false) return false;
  if (paragraph.attrs.explicitIndent) return true;
  const parent = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  return index === 0 || parent.child(index - 1).type.name !== 'heading';
}
