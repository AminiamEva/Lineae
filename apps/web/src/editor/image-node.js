import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';
import { askText } from './dialog.js';
import { imageWidthPattern } from '../../latex/images.mjs';

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
  addAttributes:()=>({path:{default:''},width:{default:null},figure:{default:false},placement:{default:null},centered:{default:false},caption:{default:null},label:{default:null}}),
  renderHTML:({node})=>['figure',{'data-document-image':node.attrs.path},node.attrs.path],
  addNodeView() {
    return ({node,editor,getPos}) => {
      const dom=document.createElement('figure');
      dom.className='document-image';
      dom.contentEditable='false';
      const image=document.createElement('img');
      const button=document.createElement('button');
      button.type='button';
      const caption=document.createElement('figcaption');
      const controls=document.createElement('div');
      controls.className='document-image-controls';
      const size=document.createElement('button');
      size.type='button';size.textContent=t('尺寸','Size');
      const editCaption=document.createElement('button');
      editCaption.type='button';editCaption.textContent=t('题注','Caption');
      controls.append(size,editCaption);
      function update(patch, expected) {
        if (!dom.isConnected || node !== expected) return;
        const position=getPos();
        if(typeof position==='number') editor.view.dispatch(editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,...patch}));
      }
      size.addEventListener('click',async()=>{
        const expected=node;
        const width=await askText(t('图片宽度，例如 0.5\\linewidth 或 6cm','Image width, e.g. 0.5\\linewidth or 6cm'),node.attrs.width??'');
        if(width!==null && (!width || imageWidthPattern.test(width))) update({width:width||null},expected);
      });
      editCaption.addEventListener('click',async()=>{
        const expected=node;
        const text=await askText(t('题注（LaTeX）','Caption (LaTeX)'),node.attrs.caption??'');
        if(text!==null && !/[{}%\r\n]/.test(text))update({figure:true,caption:text||null},expected);
      });
      const refresh=()=>{
        const preview=previews.get(node.attrs.path);
        image.hidden=!preview;
        button.hidden=Boolean(preview);
        if(preview)image.src=preview;
        image.alt=node.attrs.path;
        caption.textContent=node.attrs.caption??'';
        caption.hidden=node.attrs.caption===null;
        dom.dataset.centered=String(node.attrs.centered);
        button.textContent=t('定位图片','Locate image')+' · '+node.attrs.path;
        const width=node.attrs.width;
        image.style.width=width?.endsWith('\\linewidth') ? `${Number.parseFloat(width)*100}%` : width ?? '';
      };
      button.addEventListener('click',()=>chooseFile(file=>{remember(node.attrs.path,file);refresh();}));
      dom.append(image,button,caption,controls);
      refresh();
      return {dom,stopEvent:event=>button.contains(event.target)||controls.contains(event.target),update(next){if(next.type!==node.type)return false;node=next;refresh();return true;}};
    };
  },
});
