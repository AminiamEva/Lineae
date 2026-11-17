import {localizedLabel,localizedPlaceholder} from '../ui/localized-control.mjs';
import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';
import { relativeImageWidth } from '../../latex/images.mjs';
import { rememberAsset } from './project-assets.js';

const previews = new Map();
const rasterTypes = new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif']);
let measureContext = null;

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
  rememberAsset(path,file);
  const previous = previews.get(path);
  if (previous) URL.revokeObjectURL(previous);
  const preview = URL.createObjectURL(file);
  previews.set(path, preview);
  return preview;
}

export function installImageDrop(editor, paper) {
  paper.addEventListener('paste',event=>{
    if (event.composedPath().some(node=>node?.tagName==='MATH-FIELD')) return;
    const data=event.clipboardData;
    // Preserve the richer Lineae HTML when a document image is copied with text.
    if (data?.getData('text/html').includes('data-document-image=')) return;
    const files=Array.from(data?.items??[])
      .filter(item=>item.kind==='file' && rasterTypes.has(item.type))
      .map(item=>item.getAsFile()).filter(Boolean);
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation();
    const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
    const content=files.map(file=>{
      const path='clipboard-'+crypto.randomUUID()+'.'+extensions[file.type];
      remember(path,file);
      return {type:'documentImage',attrs:{path}};
    });
    editor.chain().focus().insertContent(content).run();
  },true);
  paper.addEventListener('dragover',event=>{
    if(Array.from(event.dataTransfer?.items??[]).some(item=>item.kind==='file'&&rasterTypes.has(item.type)))event.preventDefault();
  },true);
  paper.addEventListener('drop',event=>{
    const files=Array.from(event.dataTransfer?.files??[]).filter(file=>rasterTypes.has(file.type)&&/^[\p{L}\p{N}_. -]+$/u.test(file.name));
    if(!files.length)return;
    event.preventDefault();event.stopPropagation();
    const position=editor.view.posAtCoords({left:event.clientX,top:event.clientY})?.pos ?? editor.state.selection.from;
    const content=files.map(file=>{remember(file.name,file);return {type:'documentImage',attrs:{path:file.name}};});
    editor.chain().focus().insertContentAt(position,content).run();
  },true);
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

export function replaceLocalImage(editor, position) {
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== 'documentImage') return;
  chooseFile(file => {
    const path = file.name;
    if (!/^[\p{L}\p{N}_. -]+$/u.test(path) || editor.state.doc.nodeAt(position) !== node) return;
    remember(path, file);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,path}));
  });
}

export const DocumentImage = Node.create({
  name:'documentImage', group:'block', atom:true, draggable:true,
  addAttributes:()=>({
    path:{default:''},width:{default:null},height:{default:null},scale:{default:null},
    angle:{default:null},origin:{default:null},keepAspect:{default:true},
    flipH:{default:false},flipV:{default:false},
    figure:{default:false},placement:{default:null},fixed:{default:false},
    centered:{default:false},align:{default:null},caption:{default:null},
    captionEnabled:{default:false},captionNumbered:{default:true},
    captionPosition:{default:'below'},label:{default:null},
    wrap:{default:false},wrapSide:{default:'r'},wrapWidth:{default:'0.4\\textwidth'},
    wrapOverhang:{default:null},wrapLines:{default:null},
    border:{default:false},borderWidth:{default:'0.4pt'},borderColor:{default:'#000000'},
    background:{default:null},cropLeft:{default:null},cropBottom:{default:null},
    cropRight:{default:null},cropTop:{default:null},
  }),
  parseHTML:()=>[{tag:'figure[data-document-image]',getAttrs:element=>{
    try {return {...JSON.parse(element.dataset.imageAttrs??'{}'),path:element.dataset.documentImage};}
    catch {return false;}
  }}],
  renderText:({node})=>'\\includegraphics{'+node.attrs.path+'}',
  renderHTML:({node})=>['figure',{'data-document-image':node.attrs.path,'data-image-attrs':JSON.stringify(node.attrs)},node.attrs.path],
  addNodeView() {
    return ({node,editor,getPos}) => {
      const dom=document.createElement('figure');
      dom.className='document-image';
      dom.contentEditable='false';
      const image=document.createElement('img');
      const imageFrame=document.createElement('div');
      imageFrame.className='document-image-frame';
      imageFrame.append(image);
      const resizeDirs=['nw','n','ne','e','se','s','sw','w'];
      const resizeHandles=resizeDirs.map(direction=>{
        const handle=document.createElement('span');
        handle.className='image-resize-handle';
        handle.dataset.resizeDir=direction;
        handle.addEventListener('pointerdown',event=>startResize(direction,event));
        imageFrame.append(handle);
        return handle;
      });
      const button=document.createElement('button');
      button.type='button';
      const caption=document.createElement('figcaption');
      const captionLabel=document.createElement('span');
      captionLabel.className='document-caption-label';
      captionLabel.setAttribute('aria-hidden','true');
      const captionText=document.createElement('span');
      captionText.className='document-caption-text';
      captionText.contentEditable='true';
      captionText.spellcheck=false;
      localizedPlaceholder(captionText,'题注','Caption');
      caption.append(captionLabel,captionText);
      captionText.addEventListener('keydown',event=>{
        if(event.key==='Enter'){event.preventDefault();captionText.blur();}
      });
      captionText.addEventListener('blur',()=>{
        const text=captionText.textContent.trim();
        if(text!==(node.attrs.caption??''))update({caption:text},node);
      });
      const measureCaption = () => {
        if(!caption.isConnected || caption.hidden)return;
        const style=getComputedStyle(captionText);
        measureContext??=document.createElement('canvas').getContext('2d');
        if(measureContext){
          measureContext.font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');
        }
        const text=captionText.textContent??'';
        const numbered=caption.dataset.captionNumbered==='true';
        const labelWidth=numbered?captionLabel.getBoundingClientRect().width:0;
        const gap=numbered?(Number.parseFloat(getComputedStyle(caption).columnGap)||0):0;
        const textWidth=measureContext?.measureText(text).width??0;
        const available=caption.clientWidth;
        caption.dataset.captionStyle=!text||labelWidth+gap+textWidth<=available+0.5?'single':'multi';
      };
      captionText.addEventListener('input',measureCaption);
      captionText.addEventListener('click',()=>captionText.focus());
      const controls=document.createElement('div');
      controls.className='document-image-controls';
      controls.hidden=true;
      function update(patch, expected) {
        if (!dom.isConnected || node !== expected) return;
        const position=getPos();
        if(typeof position==='number') editor.view.dispatch(editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,...patch}));
      }
      function startResize(direction,event) {
        if(event.button!==0)return;
        event.preventDefault();event.stopPropagation();
        const startRect=imageFrame.getBoundingClientRect();
        const pageWidth=editor.view.dom.clientWidth||startRect.width;
        const startX=event.clientX,startY=event.clientY;
        const startWidth=startRect.width,startHeight=startRect.height||1;
        let changed=false;
        let resizeFactor=null;
        const move=pointer=>{
          const dx=pointer.clientX-startX,dy=pointer.clientY-startY;
          const horizontal=direction.includes('e')?dx:direction.includes('w')?-dx:0;
          const vertical=direction.includes('s')?dy:direction.includes('n')?-dy:0;
          let width=startWidth+horizontal;
          if(!horizontal&&vertical)width=startWidth*(startHeight+vertical)/startHeight;
          width=Math.max(24,Math.min(pageWidth,width));
          const factor=Math.max(.03,Math.min(1,width/pageWidth));
          if(node.attrs.wrap){
            dom.style.width=`${factor*100}%`;
            imageFrame.style.width='100%';
          }else{
            imageFrame.style.width=`${factor*100}%`;
          }
          image.style.width='100%';
          image.style.height='';
          const resized=factor.toFixed(3)+'\\textwidth';
          window.dispatchEvent(new CustomEvent('lineae-image-resize',{detail:{width:resized,wrapWidth:node.attrs.wrap?resized:undefined}}));
          resizeFactor=factor;
          changed=true;
        };
        const finish=()=>{
          window.removeEventListener('pointermove',move);
          window.removeEventListener('pointerup',finish);
          if(!changed||resizeFactor===null)return;
          const width=resizeFactor.toFixed(3)+'\\textwidth';
          update(node.attrs.wrap?{width,wrapWidth:width,height:null}:{width,height:null},node);
        };
        window.addEventListener('pointermove',move);
        window.addEventListener('pointerup',finish,{once:true,capture:true});
      }
      const refresh=()=>{
        const preview=previews.get(node.attrs.path);
        const cssDimension=value => {
          if(!value)return '';
          const match=/^(\d+(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(value);
          if(!match)return '';
          return match[2].startsWith('\\') ? `${Number(match[1])*100}%` : value;
        };
        image.hidden=!preview;
        button.hidden=Boolean(preview);
        if(preview)image.src=preview;
        image.alt=node.attrs.path;
        captionText.textContent=node.attrs.caption??'';
        caption.hidden=!(node.attrs.captionEnabled ?? (node.attrs.caption!==null));
        caption.dataset.captionNumbered=String(Boolean(node.attrs.captionEnabled && node.attrs.captionNumbered!==false));
        const captionLanguage=editor.view.dom.closest('.document-page')?.dataset.captionLanguage==='zh'?'zh':'en';
        caption.dataset.captionName=captionLanguage==='zh'?t('图','Figure'):'Figure';
        captionText.setAttribute('data-placeholder',captionLanguage==='zh'?t('题注','Caption'):'Caption');
        captionLabel.dataset.captionName=caption.dataset.captionName;
        dom.dataset.captionNumbered=caption.dataset.captionNumbered;
        dom.dataset.centered=String(node.attrs.centered);        dom.dataset.figure=String(Boolean(node.attrs.figure));
        dom.dataset.wrap=String(Boolean(node.attrs.wrap));
        dom.dataset.wrapSide=node.attrs.wrapSide??'r';
        dom.dataset.captionPosition=node.attrs.captionPosition??'below';
        if(node.attrs.wrap){
          dom.style.float=node.attrs.wrapSide==='l'||node.attrs.wrapSide==='L'?'left':'right';
          dom.style.width=cssDimension(node.attrs.wrapWidth||'0.4\\textwidth');
          dom.style.margin=node.attrs.wrapSide==='l'||node.attrs.wrapSide==='L'?'0 1em 1em 0':'0 0 1em 1em';
        }else{
          dom.style.float='';dom.style.width='';dom.style.margin='';
        }        if(node.attrs.align)dom.dataset.align=node.attrs.align;
        else delete dom.dataset.align;
        localizedLabel(button,'定位图片 · '+node.attrs.path,'Locate image · '+node.attrs.path);
        const imageWidth=node.attrs.wrap
          ? relativeImageWidth(node.attrs.width,node.attrs.wrapWidth||'0.4\\textwidth')
          : cssDimension(node.attrs.width);
        imageFrame.style.width=imageWidth||'max-content';
        image.style.width=imageWidth?'100%':'';
        image.style.height=cssDimension(node.attrs.height);
        image.style.maxWidth='100%';
        const transforms=[];
        if(node.attrs.angle)transforms.push(`rotate(${node.attrs.angle}deg)`);
        if(node.attrs.scale)transforms.push(`scale(${node.attrs.scale})`);
        if(node.attrs.flipH)transforms.push('scaleX(-1)');
        if(node.attrs.flipV)transforms.push('scaleY(-1)');
        image.style.transform=transforms.join(' ');
        image.style.transformOrigin={c:'center',l:'left center',r:'right center',t:'center top',b:'center bottom',lt:'left top',lb:'left bottom',rt:'right top',rb:'right bottom'}[node.attrs.origin??'c']??'center';
        const crops=[node.attrs.cropTop,node.attrs.cropRight,node.attrs.cropBottom,node.attrs.cropLeft];
        image.style.clipPath=crops.every(Boolean) ? `inset(${crops[0]} ${crops[1]} ${crops[2]} ${crops[3]})` : '';
        dom.style.border=node.attrs.border ? `${node.attrs.borderWidth||'0.4pt'} solid ${node.attrs.borderColor||'#000000'}` : '';
        dom.style.background=node.attrs.background||'';
        if(node.attrs.captionPosition==='above') dom.insertBefore(caption,imageFrame);
        else dom.insertBefore(caption,controls);
        requestAnimationFrame(measureCaption);
      };
      button.addEventListener('click',()=>chooseFile(file=>{remember(node.attrs.path,file);refresh();}));
      image.addEventListener('click',event=>{
        if(event.target!==image||event.defaultPrevented)return;
        const position=getPos();
        if(typeof position==='number')editor.commands.setNodeSelection(position);
      });
      dom.append(imageFrame,button,caption,controls);
      const captionObserver=new ResizeObserver(()=>requestAnimationFrame(measureCaption));
      captionObserver.observe(caption);
      refresh();
      return {dom,stopEvent:event=>button.contains(event.target)||controls.contains(event.target)||caption.contains(event.target)||resizeHandles.some(handle=>handle.contains(event.target)),update(next){if(next.type!==node.type)return false;node=next;refresh();return true;},destroy(){captionObserver.disconnect();}};
    };
  },
});
