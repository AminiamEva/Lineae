export const FONT_FAMILIES = Object.freeze([
  'Latin Modern Roman','Georgia','Times New Roman','Cambria','Palatino Linotype','SimSun','Songti SC',
  'Arial','Segoe UI','Microsoft YaHei','Helvetica Neue','Verdana','Calibri','Latin Modern Mono','Consolas','Courier New','monospace',
]);
export function selectionTypography(editor) {
  const explicit = editor.getAttributes('textStyle');
  const {$from} = editor.state.selection;
  const location = editor.view.domAtPos($from.pos);
  let element = location.node.nodeType === 1 ? location.node : location.node.parentElement;
  if (element === editor.view.dom && $from.depth) {
    const block = editor.view.nodeDOM($from.before());
    if (block?.nodeType === 1) element = block;
  }
  const computed = getComputedStyle(element ?? editor.view.dom);
  const family = computed.fontFamily.split(',')[0].trim().replace(/["']/g,'');
  const pixels = Number.parseFloat(computed.fontSize);
  const points = Number((pixels * 72.27 / 96).toFixed(2));
  return {
    color:explicit.color ?? '#000000',
    fontFamily:explicit.fontFamily ?? family,
    fontSize:explicit.fontSize ?? points + 'pt',
  };
}
