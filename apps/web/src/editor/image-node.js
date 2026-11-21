import {localizedLabel,localizedPlaceholder} from '../ui/localized-control.mjs';
import { Node } from '@tiptap/core';
import { t } from '../ui/i18n.mjs';
import { askText } from './dialog.js';
import { imageWidthPattern, relativeImageWidth } from '../../latex/images.mjs';
import { rememberAsset, resolveImageAsset, onAssetsChanged } from './project-assets.js';

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

export function startImageCrop(editor, position) {
  const dom = editor.view.nodeDOM(position);
  if (!dom?.dispatchEvent) return false;
  const event = new CustomEvent('lineae-image-crop', { bubbles:false, cancelable:true });
  dom.dispatchEvent(event);
  return !event.defaultPrevented;
}

export function insertSubfigures(editor) {
  const sub = index => ({
    type:'documentImage',
    attrs:{figure:false,centered:false,width:'0.48\\textwidth',captionEnabled:true,caption:''},
  });
  editor.chain().focus().insertContent({type:'subfigures',content:[sub(0),sub(1)]}).run();
}

export const Subfigures = Node.create({
  name:'subfigures', group:'block', content:'documentImage+', defining:true,
  addAttributes:()=>({
    placement:{default:null},fixed:{default:false},
    caption:{default:null},captionEnabled:{default:false},captionNumbered:{default:true},
    label:{default:null},
  }),
  parseHTML(){return [{tag:'div[data-subfigures]'}];},
  renderHTML({HTMLAttributes}){return ['div',mergeAttributes(HTMLAttributes,{'data-subfigures':'true'}),0];},
  addNodeView(){
    return ({node,editor,getPos})=>{
      const dom=document.createElement('div');
      dom.className='document-subfigures';
      dom.dataset.subfigures='true';
      const row=document.createElement('div');
      row.className='subfigures-row';
      const caption=document.createElement('figcaption');
      caption.className='document-subfigures-caption';
      caption.contentEditable='false';
      const captionLabel=document.createElement('span');
      captionLabel.className='caption-label';
      const captionText=document.createElement('span');
      captionText.className='caption-text';
      captionText.contentEditable='true';
      captionText.setAttribute('data-placeholder','Caption');
      caption.append(captionLabel,captionText);
      dom.append(row,caption);
      const refresh=()=>{
        const enabled=node.attrs.captionEnabled ?? (node.attrs.caption!==null);
        caption.hidden=!enabled;
        captionLabel.textContent=enabled?(node.attrs.captionNumbered===false?'Figure:':'Figure 1:').replace('1',captionNumber(getPos()))+' ':'';
        captionText.textContent=node.attrs.caption??'';
        captionText.addEventListener('input',()=>{
          const pos=getPos();
          if(typeof pos!=='number')return;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,caption:captionText.textContent,captionEnabled:true}));
        },{once:true});
      };
      function captionNumber(pos){
        if(typeof pos!=='number')return'1';
        let count=0;
        editor.state.doc.nodesBetween(0,pos,n=>{if(n.type.name==='subfigures')count++;return true;});
        return String(count+1);
      }
      captionText.addEventListener('blur',()=>refresh());
      refresh();
      return {dom,contentDOM:row,stopEvent:event=>caption.contains(event.target),
        update(next){if(next.type!==node.type)return false;node=next;refresh();return true;}};
    };
  },
});

export const DocumentImage = Node.create({
  name:'documentImage', group:'block', atom:true, draggable:true,
  addAttributes:()=>({
    figureSource:{default:null},path:{default:''},width:{default:null},height:{default:null},scale:{default:null},
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
      const resourceStatus=document.createElement('div');
      resourceStatus.setAttribute('role','status');
      let previewFile=null,previewURL=null,resourceState='missing',destroyed=false;
      const imageFrame=document.createElement('div');
      imageFrame.className='document-image-frame';
      imageFrame.append(image);
      const syncHandleVisibility=()=>{dom.dataset.smallImage=String(image.naturalWidth>0&&image.naturalWidth<24);};
      image.addEventListener('load',()=>{
        syncHandleVisibility();
        window.dispatchEvent(new Event('lineae-image-layout'));
      });
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
      const cropLayer=document.createElement('div');
      cropLayer.className='image-crop-layer';
      cropLayer.hidden=true;
      const cropMasks={};
      for(const side of ['top','right','bottom','left']){
        const mask=document.createElement('div');
        mask.className='image-crop-mask';
        mask.dataset.cropMask=side;
        cropLayer.append(mask);
        cropMasks[side]=mask;
      }
      const cropBox=document.createElement('div');
      cropBox.className='image-crop-box';
      cropLayer.append(cropBox);
      for(const dir of ['nw','n','ne','e','se','s','sw','w']){
        const handle=document.createElement('span');
        handle.className='image-crop-handle';
        handle.dataset.cropDir=dir;
        handle.addEventListener('pointerdown',event=>startCropDrag(dir,event));
        cropBox.append(handle);
      }
      const cropActions=document.createElement('div');
      cropActions.className='image-crop-actions';
      const cropCancel=document.createElement('button');
      cropCancel.type='button';cropCancel.className='image-crop-cancel';cropCancel.textContent='✕';
      cropCancel.setAttribute('aria-label',t('取消','Cancel'));cropCancel.title=t('取消','Cancel');
      const cropApply=document.createElement('button');
      cropApply.type='button';cropApply.className='image-crop-apply';cropApply.textContent='✓';
      cropApply.setAttribute('aria-label',t('应用','Apply'));cropApply.title=t('应用','Apply');
      cropActions.append(cropCancel,cropApply);
      cropLayer.append(cropActions);
      imageFrame.append(cropLayer);
      let cropping=false,cropInsets=null;
      const cropPxPerCm=37.7952755906;
      const cropPx=value=>{
        const match=/^(\d+(?:\.\d+)?)(cm|mm|pt|in)$/.exec(String(value??'').trim());
        if(!match)return 0;
        const number=Number(match[1]);
        return match[2]==='cm'?number*cropPxPerCm:match[2]==='mm'?number*cropPxPerCm/10:match[2]==='pt'?number*96/72.27:number*96;
      };
      function cropSize(){
        return {width:imageFrame.clientWidth||image.offsetWidth||0,height:imageFrame.clientHeight||image.offsetHeight||0};
      }
      function currentCropInsets(){
        const {width,height}=cropSize();
        const min=16;
        const left=Math.max(0,Math.min(cropPx(node.attrs.cropLeft),Math.max(0,width-min)));
        const right=Math.max(0,Math.min(cropPx(node.attrs.cropRight),Math.max(0,width-left-min)));
        const top=Math.max(0,Math.min(cropPx(node.attrs.cropTop),Math.max(0,height-min)));
        const bottom=Math.max(0,Math.min(cropPx(node.attrs.cropBottom),Math.max(0,height-top-min)));
        return {left,top,right,bottom};
      }
      function layoutCrop(){
        if(!cropInsets)return;
        const {width,height}=cropSize();
        const {left,top,right,bottom}=cropInsets;
        const innerWidth=Math.max(0,width-left-right),innerHeight=Math.max(0,height-top-bottom);
        Object.assign(cropMasks.top.style,{left:'0px',top:'0px',width:width+'px',height:top+'px'});
        Object.assign(cropMasks.bottom.style,{left:'0px',top:(top+innerHeight)+'px',width:width+'px',height:bottom+'px'});
        Object.assign(cropMasks.left.style,{left:'0px',top:top+'px',width:left+'px',height:innerHeight+'px'});
        Object.assign(cropMasks.right.style,{left:(left+innerWidth)+'px',top:top+'px',width:right+'px',height:innerHeight+'px'});
        Object.assign(cropBox.style,{left:left+'px',top:top+'px',width:innerWidth+'px',height:innerHeight+'px'});
      }
      function startCropDrag(direction,event){
        if(event.button!==0||!cropping)return;
        event.preventDefault();event.stopPropagation();
        const {width,height}=cropSize();
        const start={...cropInsets,width,height};
        const startX=event.clientX,startY=event.clientY;
        const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
        const move=pointer=>{
          const dx=pointer.clientX-startX,dy=pointer.clientY-startY;
          const min=16,next={left:start.left,top:start.top,right:start.right,bottom:start.bottom};
          if(direction.includes('w'))next.left=clamp(start.left+dx,0,width-start.right-min);
          if(direction.includes('e'))next.right=clamp(start.right-dx,0,width-start.left-min);
          if(direction.includes('n'))next.top=clamp(start.top+dy,0,height-start.bottom-min);
          if(direction.includes('s'))next.bottom=clamp(start.bottom-dy,0,height-start.top-min);
          cropInsets=next;layoutCrop();
        };
        const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish,true);};
        window.addEventListener('pointermove',move);
        window.addEventListener('pointerup',finish,{once:true,capture:true});
      }
      function cropValue(px){return px>0.5?(px/cropPxPerCm).toFixed(2)+'cm':null;}
      function cropKeydown(event){
        if(!cropping)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelCrop();}
        else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();applyCrop();}
      }
      function exitCropMode(){
        cropping=false;cropInsets=null;cropLayer.hidden=true;
        dom.classList.remove('is-cropping');
        document.removeEventListener('keydown',cropKeydown,true);
      }
      function applyCrop(){
        if(!cropping)return;
        const values={...cropInsets};
        const expected=node;
        const patch={cropLeft:cropValue(values.left),cropBottom:cropValue(values.bottom),cropRight:cropValue(values.right),cropTop:cropValue(values.top)};
        exitCropMode();
        update(patch,expected);
      }
      function cancelCrop(){
        if(!cropping)return;
        exitCropMode();
        refresh();
      }
      function enterCropMode(){
        if(cropping)return;
        const {width,height}=cropSize();
        if(!width||!height)return;
        cropping=true;
        cropInsets=currentCropInsets();
        image.style.clipPath='';
        cropLayer.hidden=false;
        dom.classList.add('is-cropping');
        layoutCrop();
        document.addEventListener('keydown',cropKeydown,true);
        requestAnimationFrame(()=>{cropInsets=currentCropInsets();layoutCrop();});
      }
      dom.addEventListener('lineae-image-crop',event=>{event.preventDefault();enterCropMode();});
      cropApply.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();applyCrop();});
      cropCancel.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();cancelCrop();});
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
          const resized=factor.toFixed(3)+'\\textwidth';
          if(node.attrs.wrap){
            dom.style.width=`${factor*100}%`;
            imageFrame.style.width=node.attrs.width?relativeImageWidth(node.attrs.width,resized):'100%';
          }else{
            imageFrame.style.width=`${factor*100}%`;
          }
          image.style.width='100%';
          image.style.height='';
          window.dispatchEvent(new CustomEvent('lineae-image-resize',{detail:{width:node.attrs.wrap?(node.attrs.width??resized):resized,wrapWidth:node.attrs.wrap?resized:undefined}}));
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

      const size=document.createElement('button');
      size.type='button';
      localizedLabel(size,'图片宽度','Image width');
      controls.append(size);
      dom.addEventListener('mouseenter',()=>{controls.hidden=false;});
      dom.addEventListener('mouseleave',()=>{controls.hidden=true;});
      size.addEventListener('click',async()=>{
        const expected=node;
        const width=await askText(t('图片宽度，例如 0.5\\linewidth 或 6cm','Image width, e.g. 0.5\\linewidth or 6cm'),node.attrs.width??'');
        if(width!==null && (!width || imageWidthPattern.test(width))) update({width:width||null},expected);
      });
      const showResourceState=()=>{
        dom.dataset.resourceState=resourceState;
        image.hidden=resourceState!=='ready';
        button.hidden=resourceState==='ready';
        resourceStatus.hidden=resourceState==='ready';
        const labels={missing:['资源缺失：','Missing image resource: '],loading:['正在加载图片：','Loading image: '],
          error:['无法读取图片：','Cannot decode image: '],unsupported:['资源已保留，无法预览：','Resource retained; preview unavailable: ']};
        const label=labels[resourceState];
        if(label)localizedLabel(resourceStatus,label[0]+node.attrs.path,label[1]+node.attrs.path);
      };
      const refresh=()=>{
        const file=resolveImageAsset(node.attrs.path);
        if(file!==previewFile) {
          if(previewURL)URL.revokeObjectURL(previewURL);
          previewURL=null;previewFile=file;image.removeAttribute('src');
          resourceState=file?'unsupported':'missing';
          if(file && (rasterTypes.has(file.type) || ((!file.type || file.type==='application/octet-stream') && /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name??node.attrs.path)))) {
            previewURL=URL.createObjectURL(file);resourceState='loading';image.src=previewURL;
          }
        }
        showResourceState();
        let subIndex=-1;
        try{const $pos=editor.state.doc.resolve(getPos());if($pos.parent.type.name==='subfigures')subIndex=$pos.index();}catch{}
        dom.dataset.subfigure=String(subIndex>=0);
        const cssDimension=value => {
          if(!value)return '';
          const match=/^(\d*(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(value);
          if(!match)return '';
          return match[2].startsWith('\\') ? `${Number(match[1]||1)*100}%` : value;
        };
        image.alt=node.attrs.path;
        syncHandleVisibility();
        captionText.textContent=node.attrs.caption??'';
        const captionEnabled=node.attrs.captionEnabled;
        caption.hidden=!captionEnabled;
        caption.dataset.captionNumbered=String(Boolean(captionEnabled && node.attrs.captionNumbered!==false));
        const captionLanguage=editor.view.dom.closest('.document-page')?.dataset.captionLanguage==='zh'?'zh':'en';
        caption.dataset.captionName=captionLanguage==='zh'?t('图','Figure'):'Figure';
        captionText.setAttribute('data-placeholder',captionLanguage==='zh'?t('题注','Caption'):'Caption');
        captionLabel.dataset.captionName=caption.dataset.captionName;
        dom.dataset.captionNumbered=caption.dataset.captionNumbered;
        dom.dataset.centered=String(node.attrs.centered);        dom.dataset.figure=String(Boolean(node.attrs.figure));
        dom.dataset.placement=node.attrs.placement??'';
        dom.dataset.wrap=String(Boolean(node.attrs.wrap));
        dom.dataset.wrapSide=node.attrs.wrapSide??'r';
        dom.dataset.wrapOverhang=node.attrs.wrapOverhang??'';
        dom.dataset.captionPosition=node.attrs.captionPosition??'below';
        if(subIndex>=0)captionLabel.textContent='('+String.fromCharCode(97+subIndex)+') ';
        if(node.attrs.wrap&&subIndex<0){
          dom.style.float=node.attrs.wrapSide==='l'||node.attrs.wrapSide==='L'?'left':'right';
          dom.style.width=cssDimension(node.attrs.wrapWidth||'0.4\\textwidth');
          dom.style.margin='';
        }else{
          dom.style.float='';dom.style.width='';dom.style.margin='';
        }        if(subIndex>=0)dom.style.width=cssDimension(node.attrs.width||'0.48\\textwidth');
        if(node.attrs.align)dom.dataset.align=node.attrs.align;
        else delete dom.dataset.align;
        localizedLabel(button,'定位图片 · '+node.attrs.path,'Locate image · '+node.attrs.path);
        const imageWidth=subIndex>=0
          ? '100%'
          : node.attrs.wrap
            ? relativeImageWidth(node.attrs.width,node.attrs.wrapWidth||'0.4\\textwidth')
            : cssDimension(node.attrs.width);
        imageFrame.style.width=imageWidth||'max-content';
        image.style.width=imageWidth?'100%':'';
        image.style.height=cssDimension(node.attrs.height);
        image.style.maxWidth='100%';
        const transforms=[];
        if(node.attrs.angle)transforms.push(`rotate(${node.attrs.angle}deg)`);
        if(node.attrs.scale && !node.attrs.width && !node.attrs.height)transforms.push(`scale(${node.attrs.scale})`);
        if(node.attrs.flipH)transforms.push('scaleX(-1)');
        if(node.attrs.flipV)transforms.push('scaleY(-1)');
        image.style.transform=transforms.join(' ');
        image.style.transformOrigin={c:'center',l:'left center',r:'right center',t:'center top',b:'center bottom',lt:'left top',lb:'left bottom',rt:'right top',rb:'right bottom'}[node.attrs.origin??'c']??'center';
        const crops=[node.attrs.cropTop,node.attrs.cropRight,node.attrs.cropBottom,node.attrs.cropLeft];
        image.style.clipPath=!cropping&&crops.some(Boolean) ? `inset(${crops.map(value=>value||'0').join(' ')})` : '';
        dom.style.border=node.attrs.border ? `${node.attrs.borderWidth||'0.4pt'} solid ${node.attrs.borderColor||'#000000'}` : '';
        dom.style.background=node.attrs.background||'';
        if(node.attrs.captionPosition==='above') dom.insertBefore(caption,imageFrame);
        else dom.insertBefore(caption,controls);
        requestAnimationFrame(measureCaption);
      };
      image.addEventListener('load',()=>{if(!destroyed && previewURL && image.currentSrc===previewURL){resourceState='ready';showResourceState();}});
      image.addEventListener('error',()=>{if(!destroyed && previewURL && image.getAttribute('src')===previewURL){resourceState='error';showResourceState();}});
      const unsubscribe=onAssetsChanged(refresh);
      button.addEventListener('click',()=>chooseFile(file=>{remember(node.attrs.path,file);refresh();}));
      image.addEventListener('click',event=>{
        if(event.target!==image||event.defaultPrevented)return;
        const position=getPos();
        if(typeof position==='number')editor.commands.setNodeSelection(position);
      });
      dom.append(imageFrame,resourceStatus,button,caption,controls);
      const captionObserver=new ResizeObserver(()=>requestAnimationFrame(measureCaption));
      captionObserver.observe(caption);
      refresh();
      return {dom,stopEvent:event=>button.contains(event.target)||controls.contains(event.target)||caption.contains(event.target)||cropLayer.contains(event.target)||resizeHandles.some(handle=>handle.contains(event.target)),update(next){if(next.type!==node.type)return false;node=next;refresh();return true;},destroy(){captionObserver.disconnect();destroyed=true;document.removeEventListener('keydown',cropKeydown,true);unsubscribe();if(previewURL)URL.revokeObjectURL(previewURL);}};
    };
  },
});
