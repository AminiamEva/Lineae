export function deleteTableKeepingScroll(editor) {
  return editor.chain().focus(undefined, { scrollIntoView: false }).command(({ state, tr }) => {
    const $pos = state.selection.$anchor;
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.spec.tableRole === 'table') {
        tr.delete($pos.before(depth), $pos.after(depth));
        return true;
      }
    }
    return false;
  }).run();
}
