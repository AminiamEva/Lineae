export function listDepthLimit(editor){
  const view=editor.view.dom;
  const em=Number.parseFloat(getComputedStyle(view).fontSize)||16;
  const available=view.getBoundingClientRect().width/em;
  return Math.min(10,Math.max(1,Math.floor((available-12)/2)));
}
export function canIndentList(editor,depthAt){
  const {selection,doc}=editor.state;
  let deepest=depthAt(selection.$from);
  doc.nodesBetween(selection.from,selection.to,(node,position)=>{
    if(node.type.name==='listItem')deepest=Math.max(deepest,depthAt(doc.resolve(position+1)));
  });
  return deepest<listDepthLimit(editor);
}
