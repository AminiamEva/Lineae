import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';

const previews = new Map();
const rasterTypes = new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif']);

function chooseFile(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = [...rasterTypes].join(',');
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file && rasterTypes.has(file.type)) callback(file);
  }, { once:true });
  input.click();
}

function remember(path, file) {
  const previous = previews.get(path);
  if (previous) URL.revokeObjectURL(previous);
  const preview = URL.createObjectURL(file);
  previews.set(path, preview);
  return preview;
}

export function insertLocalImage(editor) {
  const documentBefore = editor.state.doc;
  const range = { from:editor.state.selection.from, to:editor.state.selection.to };
  chooseFile(file => {
    if (editor.state.doc !== documentBefore) return;
    const path = file.name;
    if (!/^[\p{L}\p{N}_. -]+$/u.test(path)) return;
    remember(path, file);
    editor.chain().focus().insertContentAt(range, {type:'documentImage',attrs:{path}}).run();
  });
}

export const DocumentImage = Node.create({
  name:'documentImage', group:'block', atom:true, draggable:true,
  addAttributes:()=>({path:{default:''},width:{default:null}}),
  renderHTML:({node})=>['figure',{'data-document-image':node.attrs.path},node.attrs.path],
  addNodeView() {
    return ({node}) => {
      const dom=document.createElement('figure');
      dom.className='document-image';
      dom.contentEditable='false';
      const image=document.createElement('img');
      const button=document.createElement('button');
      button.type='button';
      const refresh=()=>{
        const preview=previews.get(node.attrs.path);
        image.hidden=!preview;
        button.hidden=Boolean(preview);
        if(preview)image.src=preview;
        image.alt=node.attrs.path;
        button.textContent=t('定位图片','Locate image')+' · '+node.attrs.path;
        const width=node.attrs.width;
        image.style.width=width?.endsWith('\\linewidth') ? `${Number.parseFloat(width)*100}%` : width ?? '';
      };
      button.addEventListener('click',()=>chooseFile(file=>{remember(node.attrs.path,file);refresh();}));
      dom.append(image,button);
      refresh();
      return {dom,stopEvent:event=>button.contains(event.target),update(next){if(next.type!==node.type)return false;node=next;refresh();return true;}};
    };
  },
});
