import { t } from './i18n.mjs';
import { icon } from '../editor/icons.js';
import { buildRibbonGroups } from './ribbon-groups.js';
import { openColorPalette } from './color-palette.js';

function setColorButton(button, hex) {
  button.dataset.hex = hex;
  button.style.setProperty('--swatch', hex);
  button.title = hex;
  button.setAttribute('aria-label', hex);
}

function labelText(element, zh, en) {
  element.dataset.zh = zh;
  element.dataset.en = en;
  element.textContent = t(zh,en);
  return element;
}

function dimensions(value) {
  const match = /^(\d+(?:\.\d+)?)(\\textwidth|\\linewidth|\\columnwidth|cm|mm|pt|in)$/.exec(String(value ?? ''));
  return match ? {number:match[1],unit:match[2]} : {number:'',unit:'\\textwidth'};
}

function spacingNumber(value) {
  return String(value ?? '').match(/\d+(?:\.\d+)?/)?.[0] ?? '';
}

export function installImagePanel({onUpdate, onReplace, onSpacing, getSpacing, onCrop, onGroup, onUngroup, onInsertFigure}) {
  const panel = document.createElement('div');
  panel.className = 'tools home-ribbon image-tools';
  panel.hidden = true;
  let attrs = null;

  const header = document.createElement('div');
  header.className = 'image-header';
  const path = document.createElement('code');
  path.className = 'image-path';
  const replace = document.createElement('button');
  replace.type = 'button';
  labelText(replace,'替换图片','Replace image');
  header.append(path,replace);

  const basic = document.createElement('section');
  basic.className = 'image-group';
  const basicTitle = document.createElement('div');
  basicTitle.className = 'image-group-title';
  labelText(basicTitle,'基础变换','Transform');
  const basicGrid = document.createElement('div');
  basicGrid.className = 'image-grid';
  function numberUnit(zh,en,{step='0.1',min='0',max='100'}={}) {
    const field=document.createElement('label');
    field.className='image-field';
    const caption=document.createElement('span');
    labelText(caption,zh,en);
    const line=document.createElement('span');line.className='image-line';
    const number=document.createElement('input');number.type='number';number.step=step;number.min=min;number.max=max;
    number.setAttribute('aria-label',t(zh,en));
    const unit=document.createElement('select');
    unit.setAttribute('aria-label',t(zh+'单位',en+' unit'));
    for(const value of ['\\textwidth','\\linewidth','cm','mm','pt'])unit.append(new Option(value,value));
    line.append(number,unit);field.append(caption,line);
    return {field,number,unit};
  }
  const width=numberUnit('宽度','Width');
  const height=numberUnit('高度','Height');
  const scaleField=document.createElement('label');scaleField.className='image-field';
  const scaleCaption=document.createElement('span');labelText(scaleCaption,'缩放','Scale');
  const scale=document.createElement('input');scale.type='number';scale.min='10';scale.max='200';scale.step='1';scale.setAttribute('aria-label',t('缩放','Scale'));
  const scaleOutput=document.createElement('output');scaleOutput.textContent='100%';
  scaleField.append(scaleCaption,scale,scaleOutput);
  const angleField=document.createElement('label');angleField.className='image-field';
  const angleCaption=document.createElement('span');labelText(angleCaption,'旋转角度','Rotation');
  const angle=document.createElement('input');angle.type='number';angle.min='-360';angle.max='360';angle.step='1';angle.setAttribute('aria-label',t('旋转角度','Rotation'));
  angleField.append(angleCaption,angle);
  const originField=document.createElement('label');originField.className='image-field';
  const originCaption=document.createElement('span');labelText(originCaption,'旋转中心','Origin');
  const origin=document.createElement('select');origin.setAttribute('aria-label',t('旋转中心','Origin'));
  for(const [value,text] of [['c','中心'],['l','左中'],['r','右中'],['t','上中'],['b','下中'],['lt','左上'],['lb','左下'],['rt','右上'],['rb','右下']])origin.append(new Option(t(text,text),value));
  originField.append(originCaption,origin);
  const keepField=document.createElement('label');keepField.className='image-check';
  const keep=document.createElement('input');keep.type='checkbox';
  const keepCaption=document.createElement('span');labelText(keepCaption,'保持宽高比','Keep aspect ratio');
  keepField.append(keep,keepCaption);
  const flipRow=document.createElement('div');flipRow.className='image-flips';
  const flipH=document.createElement('button');flipH.type='button';labelText(flipH,'水平翻转','Flip horizontal');
  const flipV=document.createElement('button');flipV.type='button';labelText(flipV,'垂直翻转','Flip vertical');
  flipRow.append(flipH,flipV);
  const basicRows=document.createElement('div');
  basicRows.className='image-rows';
  const basicRow=(...items)=>{const row=document.createElement('div');row.className='image-grid';row.append(...items);basicRows.append(row);};
  basicRow(width.field,height.field);
  basicRow(scaleField,angleField,originField);
  basicRow(keepField,flipRow);

  const layout = document.createElement('section');
  layout.className='image-group';
  const layoutTitle=document.createElement('div');layoutTitle.className='image-group-title';labelText(layoutTitle,'布局与题注','Layout & caption');
  const layoutGrid=document.createElement('div');layoutGrid.className='image-grid';
  const figureField=document.createElement('label');figureField.className='image-check';
  const figure=document.createElement('input');figure.type='checkbox';
  const figureCaption=document.createElement('span');labelText(figureCaption,'使用 figure 浮动体','Use figure float');figureField.append(figure,figureCaption);
  const placementField=document.createElement('label');placementField.className='image-field';
  const placementCaption=document.createElement('span');labelText(placementCaption,'浮动策略','Float placement');
  const placement=document.createElement('select');
  placement.setAttribute('aria-label',t('浮动策略','Float placement'));
  for(const [value] of [['','默认'],['h','此处优先'],['t','页顶'],['b','页底'],['p','独立浮动页'],['H','固定在此处']])placement.append(new Option(value===''?t('默认 [tbp]','Default [tbp]'):value==='h'?t('优先此处 [h]','Here [h]'):value==='t'?t('页面顶部 [t]','Top [t]'):value==='b'?t('页面底部 [b]','Bottom [b]'):value==='p'?t('独立浮动页 [p]','Float page [p]'):t('固定 [H]','Fixed [H]'),value));
  placementField.append(placementCaption,placement);
  const alignField=document.createElement('label');alignField.className='image-field';
  const alignCaption=document.createElement('span');labelText(alignCaption,'对齐','Alignment');
  const align=document.createElement('select');
  align.setAttribute('aria-label',t('对齐','Alignment'));
  for(const [value,zh,en] of [['center','居中','Center'],['','默认','Default'],['left','左','Left'],['right','右','Right']])align.append(new Option(t(zh,en),value));
  alignField.append(alignCaption,align);
  const captionEnabledField=document.createElement('label');captionEnabledField.className='image-check';
  const captionEnabled=document.createElement('input');captionEnabled.type='checkbox';
  const captionEnabledCaption=document.createElement('span');labelText(captionEnabledCaption,'打开题注','Enable caption');captionEnabledField.append(captionEnabled,captionEnabledCaption);
  const captionNumberedField=document.createElement('label');captionNumberedField.className='image-check';
  const captionNumbered=document.createElement('input');captionNumbered.type='checkbox';
  const captionNumberedCaption=document.createElement('span');labelText(captionNumberedCaption,'题注标号','Numbered caption');captionNumberedField.append(captionNumbered,captionNumberedCaption);
  const captionPosition=document.createElement('select');captionPosition.setAttribute('aria-label',t('题注位置','Caption position'));
  captionPosition.append(new Option(t('图下方','Below image'),'below'),new Option(t('图上方','Above image'),'above'));
  const captionPositionField=document.createElement('label');captionPositionField.className='image-field';
  const cpCaption=document.createElement('span');labelText(cpCaption,'题注位置','Caption position');
  captionPositionField.append(cpCaption,captionPosition);
  const labelField=document.createElement('label');labelField.className='image-field';
  const labelCaption=document.createElement('span');labelText(labelCaption,'标签','Label');
  const label=document.createElement('input');label.type='text';label.placeholder='fig:name';label.setAttribute('aria-label',t('标签','Label'));
  labelField.append(labelCaption,label);
  const wrapEnabledField=document.createElement('label');wrapEnabledField.className='image-check';
  const wrapEnabled=document.createElement('input');wrapEnabled.type='checkbox';
  const wrapEnabledCaption=document.createElement('span');labelText(wrapEnabledCaption,'文字环绕','Wrap text');wrapEnabledField.append(wrapEnabled,wrapEnabledCaption);
  const wrapCenteringField=document.createElement('label');wrapCenteringField.className='image-check';
  const wrapCentering=document.createElement('input');wrapCentering.type='checkbox';
  wrapCentering.setAttribute('aria-label',t('环绕内居中','Center in wrap'));
  const wrapCenteringCaption=document.createElement('span');labelText(wrapCenteringCaption,'环绕内居中\\centering','Center in wrap \\centering');
  wrapCenteringField.append(wrapCentering,wrapCenteringCaption);
  const wrapSideField=document.createElement('label');wrapSideField.className='image-field';
  const wrapSideCaption=document.createElement('span');labelText(wrapSideCaption,'环绕方向','Wrap side');
  const wrapSide=document.createElement('select');wrapSide.setAttribute('aria-label',t('环绕方向','Wrap side'));
  wrapSide.append(new Option(t('右侧','Right'),'r'),new Option(t('左侧','Left'),'l'),new Option(t('内侧','Inside'),'i'),new Option(t('外侧','Outside'),'o'));
  wrapSideField.append(wrapSideCaption,wrapSide);
  const wrapWidthField=document.createElement('label');wrapWidthField.className='image-field';
  const wrapWidthCaption=document.createElement('span');labelText(wrapWidthCaption,'环绕宽度','Wrap width');
  const wrapWidth=document.createElement('input');wrapWidth.type='text';wrapWidth.value='0.4\\textwidth';wrapWidth.setAttribute('aria-label',t('环绕宽度','Wrap width'));
  wrapWidthField.append(wrapWidthCaption,wrapWidth);
  const wrapOverhangField=document.createElement('label');wrapOverhangField.className='image-field';
  const wrapOverhangCaption=document.createElement('span');labelText(wrapOverhangCaption,'伸出量','Overhang');
  const wrapOverhang=document.createElement('input');wrapOverhang.type='text';wrapOverhang.placeholder='0pt';wrapOverhang.setAttribute('aria-label',t('伸出量','Overhang'));
  wrapOverhangField.append(wrapOverhangCaption,wrapOverhang);
  const wrapLinesField=document.createElement('label');wrapLinesField.className='image-field';
  const wrapLinesCaption=document.createElement('span');labelText(wrapLinesCaption,'行数','Lines');
  const wrapLines=document.createElement('input');wrapLines.type='number';wrapLines.min='1';wrapLines.max='80';wrapLines.setAttribute('aria-label',t('环绕行数','Wrapped lines'));
  wrapLinesField.append(wrapLinesCaption,wrapLines);
  const layoutRows=document.createElement('div');
  layoutRows.className='image-rows';
  const layoutRow=(...items)=>{const row=document.createElement('div');row.className='image-grid';row.append(...items);layoutRows.append(row);};
  layoutRow(figureField,placementField,alignField);
  layoutRow(captionEnabledField,captionNumberedField,captionPositionField,labelField);
  layoutRow(wrapEnabledField,wrapCenteringField,wrapSideField,wrapWidthField,wrapOverhangField,wrapLinesField);

  const appearance=document.createElement('section');appearance.className='image-group';
  const appearanceTitle=document.createElement('div');appearanceTitle.className='image-group-title';labelText(appearanceTitle,'裁剪与外观','Crop & appearance');
  const appearanceGrid=document.createElement('div');appearanceGrid.className='image-grid';
  const cropButton=document.createElement('button');cropButton.type='button';cropButton.className='image-crop-button';
  cropButton.dataset.zhTitle='裁剪图片';cropButton.dataset.enTitle='Crop image';
  cropButton.title=t('裁剪图片','Crop image');cropButton.setAttribute('aria-label',cropButton.title);
  cropButton.append(icon('crop'));
  cropButton.addEventListener('click',()=>onCrop?.());
  const borderField=document.createElement('label');borderField.className='image-check';
  const border=document.createElement('input');border.type='checkbox';
  const borderCaption=document.createElement('span');labelText(borderCaption,'边框','Border');borderField.append(border,borderCaption);
  const borderWidth=document.createElement('select');for(const value of ['0.2pt','0.4pt','0.8pt','1pt'])borderWidth.append(new Option(value,value));
  const borderColor=document.createElement('button');borderColor.type='button';borderColor.className='image-color-button';
  setColorButton(borderColor,'#000000');
  borderColor.addEventListener('click',()=>openColorPalette({anchor:borderColor,value:borderColor.dataset.hex,
    onPick:hex=>{setColorButton(borderColor,hex);update({borderColor:hex});}}));
  const backgroundField=document.createElement('label');backgroundField.className='image-field';
  const bgCaption=document.createElement('span');labelText(bgCaption,'背景色','Background');
  const background=document.createElement('button');background.type='button';background.className='image-color-button';
  setColorButton(background,'#ffffff');
  background.addEventListener('click',()=>openColorPalette({anchor:background,value:background.dataset.hex,
    onPick:hex=>{setColorButton(background,hex);if(useBackground.checked)update({background:hex});}}));
  const useBackground=document.createElement('input');useBackground.type='checkbox';
  backgroundField.append(bgCaption,useBackground,background);
  appearanceGrid.append(cropButton,borderField,borderWidth,borderColor,backgroundField);
  appearance.append(appearanceTitle,appearanceGrid);

  const spacing=document.createElement('section');spacing.className='image-group';
  const spacingTitle=document.createElement('div');spacingTitle.className='image-group-title';labelText(spacingTitle,'全局图片间距','Global image spacing');
  const spacingGrid=document.createElement('div');spacingGrid.className='image-grid';
  const spacingInputs={};
  for(const [name,zh,en] of [['textfloatsep','顶部/底部浮动体','Top/bottom floats'],['intextsep','文中浮动体','In-text floats'],['floatsep','浮动体之间','Between floats']]){
    const field=document.createElement('label');field.className='image-field';
    const caption=document.createElement('span');labelText(caption,zh,en);
    const input=document.createElement('input');input.type='number';input.step='1';input.min='0';
    field.append(caption,input);spacingGrid.append(field);spacingInputs[name]=input;
  }
  const resetSpacing=document.createElement('button');resetSpacing.type='button';labelText(resetSpacing,'恢复默认','Reset defaults');
  spacing.append(spacingTitle,spacingGrid,resetSpacing);

  panel.append(header);
  const spacingBody=document.createElement('div');
  spacingBody.append(spacingGrid,resetSpacing);

  const groupingButton=document.createElement('button');
  groupingButton.type='button';groupingButton.className='image-group-button';
  groupingButton.append(icon('image'));
  const groupingLabel=document.createElement('span');
  labelText(groupingLabel,'组合为子图','Combine as subfigure');
  groupingButton.append(groupingLabel);
  const insertFigure=document.createElement('button');
  insertFigure.type='button';
  insertFigure.className='image-insert-figure';
  insertFigure.append(icon('image'));
  const insertFigureLabel=document.createElement('span');
  labelText(insertFigureLabel,'插入图片','Insert figure');
  insertFigure.append(insertFigureLabel);
  insertFigure.disabled=true;
  insertFigure.addEventListener('click',()=>onInsertFigure?.());
  const groupingBody=document.createElement('div');
  groupingBody.className='image-grouping-body';
  groupingBody.append(groupingButton,insertFigure);
  let groupMode=false;
  let multiCount=0,groupingState='none';
  const ribbonGroups=buildRibbonGroups(panel,[
    {id:'image-transform',zh:'基础变换',en:'Transform',iconName:'image',width:330,body:basicRows},
    {id:'image-layout',zh:'布局与题注',en:'Layout & caption',iconName:'layout',width:560,body:layoutRows},
    {id:'image-appearance',zh:'裁剪与外观',en:'Crop & appearance',iconName:'settings',width:300,body:appearanceGrid},
    {id:'image-spacing',zh:'全局图片间距',en:'Global image spacing',iconName:'paragraph',width:220,body:spacingBody},
    {id:'image-grouping',zh:'子图',en:'Subfigure',iconName:'image',width:190,body:groupingBody},
  ],()=>{
    const secondary=['image-spacing','image-appearance'];
    if(groupMode)return [...secondary,'image-transform','image-layout','image-grouping'];
    if(multiCount>0)return [...secondary,'image-layout','image-transform','image-grouping'];
    return [...secondary,'image-grouping','image-layout','image-transform'];
  });
  const groupingGroups=ribbonGroups.filter(state=>state.id!=='image-grouping');
  const perImageGroups=ribbonGroups.filter(state=>state.id==='image-transform'||state.id==='image-appearance');
  const wrapControls=[wrapEnabled,wrapCentering,wrapSide,wrapWidth,wrapOverhang,wrapLines];
  const wrapDetails=[wrapCentering,wrapSide,wrapWidth,wrapOverhang,wrapLines];
  function setGroupMode(enabled){
    const changed=groupMode!==Boolean(enabled);
    groupMode=Boolean(enabled);
    panel.dataset.groupMode=String(groupMode);
    for(const state of perImageGroups){
      state.section.classList.toggle('is-disabled',groupMode);
      state.body.inert=groupMode||state.section.classList.contains('is-collapsed');
    }
    for(const control of [figure,align,captionPosition,...wrapControls])control.disabled=groupMode;
    if(groupMode)replace.disabled=true;
    insertFigure.disabled=!groupMode;
    if(changed)panel.refreshLayout();
  }
  function setMultiSelection(count){
    const wasActive=multiCount>0;
    multiCount=Number(count)||0;
    const active=multiCount>0;
    panel.dataset.multiSelection=String(multiCount);
    for(const state of groupingGroups){
      state.section.classList.toggle('is-disabled',active);
      state.body.inert=active||state.section.classList.contains('is-collapsed');
    }
    replace.disabled=active;
    if(active)path.textContent=t(multiCount+' 张图片',multiCount+' images');
    if(wasActive!==active)panel.refreshLayout();
  }
  function setGroupState(mode){
    groupingState=mode==='ungroup'?'ungroup':mode==='group'?'group':'none';
    const ungroup=groupingState==='ungroup';
    const zh=ungroup?'解除组合':'组合为子图',en=ungroup?'Ungroup':'Combine as subfigure';
    labelText(groupingLabel,zh,en);
    groupingButton.dataset.mode=groupingState;
    groupingButton.dataset.zhTitle=zh;groupingButton.dataset.enTitle=en;
    groupingButton.title=t(zh,en);groupingButton.setAttribute('aria-label',t(zh,en));
    groupingButton.disabled=groupingState==='none';
  }
  groupingButton.addEventListener('click',()=>{
    if(groupingState==='ungroup')onUngroup?.();
    else if(groupingState==='group')onGroup?.();
  });
  setGroupState('none');

  function setPath(value){path.textContent=value||'';}
  function setDimensions(widthValue,wrapValue){
    const w=dimensions(widthValue);
    width.number.value=w.number;
    width.unit.value=w.unit;
    if(wrapValue!==undefined)wrapWidth.value=wrapValue;
  }
  let metrics={naturalWidth:0,naturalHeight:0,textWidth:0};
  const cmToPx=37.7952755906;
  function pxFromValue(number,unit){
    if(number==='')return null;
    const value=Number(number);
    if(!Number.isFinite(value))return null;
    if(unit==='\\textwidth'||unit==='\\linewidth'||unit==='\\columnwidth')return metrics.textWidth?value*metrics.textWidth:null;
    if(unit==='cm')return value*cmToPx;
    if(unit==='mm')return value*cmToPx/10;
    if(unit==='pt')return value*96/72.27;
    if(unit==='in')return value*96;
    return null;
  }
  function valueFromPx(px,unit){
    if(!(px>0))return '';
    let value;
    if(unit==='\\textwidth'||unit==='\\linewidth'||unit==='\\columnwidth'){
      if(!metrics.textWidth)return '';
      value=px/metrics.textWidth;
    }else if(unit==='cm')value=px/cmToPx;
    else if(unit==='mm')value=px*10/cmToPx;
    else if(unit==='pt')value=px*72.27/96;
    else if(unit==='in')value=px/96;
    else return '';
    return String(Math.round(value*1000)/1000);
  }
  function syncAspect(changed){
    if(!keep.checked)return null;
    const {naturalWidth,naturalHeight}=metrics;
    if(!naturalWidth||!naturalHeight)return null;
    if(changed==='scale'){
      const percent=Number(scale.value);
      if(!(percent>0))return null;
      const widthValue=valueFromPx(naturalWidth*percent/100,width.unit.value);
      const heightValue=valueFromPx(naturalHeight*percent/100,height.unit.value);
      if(widthValue===''||heightValue==='')return null;
      width.number.value=widthValue;height.number.value=heightValue;
      return {width:widthValue+width.unit.value,height:heightValue+height.unit.value,scale:percent===100?null:String(percent/100)};
    }
    const aspect=naturalWidth/naturalHeight;
    if(changed==='height'){
      const heightPx=pxFromValue(height.number.value,height.unit.value);
      if(!(heightPx>0))return null;
      const widthPx=heightPx*aspect;
      const widthValue=valueFromPx(widthPx,width.unit.value);
      if(widthValue==='')return null;
      const percent=Math.round(widthPx/naturalWidth*100);
      width.number.value=widthValue;
      scale.value=String(percent);scaleOutput.textContent=scale.value+'%';
      return {width:widthValue+width.unit.value,height:height.number.value+height.unit.value,scale:percent===100?null:String(percent/100)};
    }
    const widthPx=pxFromValue(width.number.value,width.unit.value);
    if(!(widthPx>0))return null;
    const heightValue=valueFromPx(widthPx/aspect,height.unit.value);
    if(heightValue==='')return null;
    const percent=Math.round(widthPx/naturalWidth*100);
    height.number.value=heightValue;
    scale.value=String(percent);scaleOutput.textContent=scale.value+'%';
    return {width:width.number.value+width.unit.value,height:heightValue+height.unit.value,scale:percent===100?null:String(percent/100)};
  }
  function setValues(next,nextMetrics){
    if(nextMetrics)metrics={...metrics,...nextMetrics};
    attrs=next;
    if(!next)return;
    setPath(next.path);
    const w=dimensions(next.width), h=dimensions(next.height);
    width.number.value=w.number;width.unit.value=w.unit;
    height.number.value=h.number;height.unit.value=h.unit;
    scale.value=next.scale?String(Math.round(Number(next.scale)*100)):'100';scaleOutput.textContent=scale.value+'%';
    angle.value=next.angle??'';
    origin.value=next.origin??'c';
    keep.checked=next.keepAspect!==false;
    flipH.setAttribute('aria-pressed',String(Boolean(next.flipH)));flipV.setAttribute('aria-pressed',String(Boolean(next.flipV)));
    figure.checked=Boolean(next.figure);
    const captionOn=Boolean(next.captionEnabled ?? (next.caption !== null && next.caption !== undefined));
    captionEnabled.checked=captionOn;
    for(const control of [captionNumbered,captionPosition,label])control.disabled=!captionOn;
    captionNumbered.checked=next.captionNumbered !== false;
    const placementValue=next.fixed?'H':(next.placement??'');
    if(placementValue && ![...placement.options].some(option=>option.value===placementValue))placement.append(new Option(placementValue,placementValue));
    placement.value=placementValue;
    align.value=next.align??'center';
    captionPosition.value=next.captionPosition??'below';
    label.value=next.label??'';
    wrapEnabled.checked=Boolean(next.wrap);
    wrapCentering.checked=Boolean(next.centered||next.align==='center');
    for(const control of wrapDetails)control.disabled=!next.wrap;
    wrapSide.value=next.wrapSide??'r';
    wrapWidth.value=next.wrapWidth??'0.4\\textwidth';
    wrapOverhang.value=next.wrapOverhang??'';
    wrapLines.value=next.wrapLines??'';
    border.checked=Boolean(next.border);
    borderWidth.value=next.borderWidth??'0.4pt';
    setColorButton(borderColor,next.borderColor??'#000000');
    useBackground.checked=Boolean(next.background);
    setColorButton(background,next.background??'#ffffff');
    const spacingValues=getSpacing();
    for(const [name,input] of Object.entries(spacingInputs))input.value=spacingNumber(spacingValues[name]);
    const tikzMode=Boolean(next.tikzSource);
    replace.disabled=tikzMode;
    cropButton.disabled=tikzMode;
    panel.dataset.tikz=String(tikzMode);
  }
  function update(patch){ if(attrs){attrs={...attrs,...patch};onUpdate?.(patch);} }
  function updateDimension(which){
    const number=which==='width'?width.number:height.number;
    const unit=which==='width'?width.unit:height.unit;
    if(number.value===''){update({[which]:null});return;}
    const synced=syncAspect(which);
    update(synced??{[which]:number.value+unit.value});
  }
  width.number.addEventListener('input',()=>updateDimension('width'));width.unit.addEventListener('change',()=>updateDimension('width'));
  height.number.addEventListener('input',()=>updateDimension('height'));height.unit.addEventListener('change',()=>updateDimension('height'));
  scale.addEventListener('input',()=>{
    scaleOutput.textContent=scale.value+'%';
    if(scale.value===''){update({scale:null});return;}
    const synced=syncAspect('scale');
    update(synced??{scale:scale.value==='100'?null:String(Number(scale.value)/100)});
  });
  angle.addEventListener('input',()=>update({angle:angle.value===''?null:angle.value}));
  origin.addEventListener('change',()=>update({origin:origin.value}));
  keep.addEventListener('change',()=>update({keepAspect:keep.checked}));
  flipH.addEventListener('click',()=>{const value=!attrs?.flipH;update({flipH:value});flipH.setAttribute('aria-pressed',String(value));});
  flipV.addEventListener('click',()=>{const value=!attrs?.flipV;update({flipV:value});flipV.setAttribute('aria-pressed',String(value));});
  figure.addEventListener('change',()=>{
    if(figure.checked&&!attrs?.align&&attrs?.centered!==true)update({figure:true,centered:true,align:'center'});
    else update({figure:figure.checked});
  });
  captionEnabled.addEventListener('change',()=>{
    const on=captionEnabled.checked;
    for(const control of [captionNumbered,captionPosition,label])control.disabled=!on;
    update({captionEnabled:on,figure:on?true:figure.checked});
  });
  captionNumbered.addEventListener('change',()=>update({captionNumbered:captionNumbered.checked}));
  placement.addEventListener('change',()=>update({placement:placement.value==='H'?null:placement.value||null,fixed:placement.value==='H'}));
  align.addEventListener('change',()=>update({align:align.value||null,centered:align.value==='center'}));
  captionPosition.addEventListener('change',()=>update({captionPosition:captionPosition.value}));
  label.addEventListener('input',()=>update({label:label.value||null}));
  wrapEnabled.addEventListener('change',()=>{
    for(const control of wrapDetails)control.disabled=!wrapEnabled.checked;
    update({wrap:wrapEnabled.checked,figure:wrapEnabled.checked?false:undefined});
  });
  wrapCentering.addEventListener('change',()=>update({centered:wrapCentering.checked,align:wrapCentering.checked?'center':null}));
  wrapSide.addEventListener('change',()=>update({wrapSide:wrapSide.value}));
  wrapWidth.addEventListener('change',()=>{if(wrapWidth.value.trim())update({wrapWidth:wrapWidth.value.trim()});});
  wrapOverhang.addEventListener('change',()=>update({wrapOverhang:wrapOverhang.value.trim()||null}));
  wrapLines.addEventListener('change',()=>update({wrapLines:wrapLines.value||null}));
  border.addEventListener('change',()=>update({border:border.checked}));
  borderWidth.addEventListener('change',()=>update({borderWidth:borderWidth.value}));
  useBackground.addEventListener('change',()=>update({background:useBackground.checked?background.dataset.hex:null}));
  for(const [name,input] of Object.entries(spacingInputs))input.addEventListener('change',()=>{
    const current={...getSpacing()};
    current[name]=input.value===''?IMAGE_DEFAULTS[name]:input.value+'pt';
    onSpacing?.(current);
  });
  resetSpacing.addEventListener('click',()=>onSpacing?.({...IMAGE_DEFAULTS}));
  replace.addEventListener('click',()=>onReplace?.());
  window.addEventListener('lineae-image-resize',event=>{
    if(panel.hidden)return;
    setDimensions(event.detail?.width,event.detail?.wrapWidth);
  });
  return {panel,setValues,setPath,setDimensions,setMultiSelection,setGroupState,setGroupMode,setSpacing(values){for(const [name,input] of Object.entries(spacingInputs))input.value=spacingNumber(values[name]);}};
}

const IMAGE_DEFAULTS = Object.freeze({textfloatsep:'20pt plus 2pt minus 4pt',intextsep:'12pt plus 2pt minus 2pt',floatsep:'12pt plus 2pt minus 2pt'});
