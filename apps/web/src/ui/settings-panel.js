import {MARGIN_PRESETS} from '../../latex/geometry.mjs';
import {t} from './i18n.mjs';
import {parseYaml,toYaml} from '../editor/config.mjs';
const labels={
  interface:['界面','Appearance'],editing:['编辑','Editing'],keybindings:['快捷键','Keyboard shortcuts'],
  language:['语言','Language'],theme:['主题','Theme'],zoom:['页面缩放 (%)','Page zoom (%)'],sourceFontSize:['源码字号 (px)','Source font size (px)'],
  toolbarAutoHide:['Document 自动隐藏工具栏','Auto-hide toolbar in Document'],sourceToolbarAutoHide:['代码界面自动隐藏工具栏','Auto-hide toolbar in Source and Split'],zoomOnCtrlWheel:['Ctrl+滚轮缩放','Ctrl+wheel zoom'],continuedTables:['跨页重复表头','Repeat table headers'],
  formattingMarks:['非打印标记','Formatting marks'],caretMotion:['光标和选区动画','Caret and selection animation'],toolbar:['文件工具栏入口','File toolbar actions'],
  smartFences:['括号自动配对','Pair delimiters'],autoReplaceLigatures:['自动替换连字','Replace ligatures'],indentOnSave:['保存时缩进','Indent on save'],ligatures:['连字规则','Ligature rules'],
  chordTimeoutMs:['组合快捷键等待时间 (ms)','Shortcut chord timeout (ms)'],sidebar:['侧栏分区','Sidebar sections'],files:['文件树','File tree'],includes:['文件引用','File includes'],outline:['大纲','Outline'],citations:['文献','Citations'],
};
export function installSettingsPanel({config,onApply,onImport,onExport,getDocument,applyDocument}){
  const dialog=document.createElement('dialog');dialog.id='settings-panel';dialog.className='settings-panel';
  const heading=document.createElement('h2'),form=document.createElement('form'),fields=document.createElement('div'),error=document.createElement('p'),actions=document.createElement('div');
  error.setAttribute('role','alert');actions.className='settings-actions';
  const apply=document.createElement('button'),close=document.createElement('button'),importButton=document.createElement('button'),exportButton=document.createElement('button');
  apply.type='submit';apply.id='settings-apply';close.type='button';close.id='settings-close';close.onclick=()=>dialog.close();
  importButton.type=exportButton.type='button';importButton.onclick=onImport;exportButton.onclick=onExport;
  actions.append(importButton,exportButton,close,apply);form.append(fields,error,actions);dialog.append(heading,form);document.body.append(dialog);
  let controls=[],documentControls,originalDocument;
  function name(key){return labels[key]?t(...labels[key]):key;}
  function render(){
    heading.textContent=t('设置','Settings');apply.textContent=t('应用','Apply');close.textContent=t('关闭','Close');importButton.textContent=t('导入 YAML','Import YAML');exportButton.textContent=t('导出 YAML','Export YAML');
    controls=[];fields.replaceChildren();error.textContent='';
    function walk(value,parent,path=[]){
      for(const [key,current] of Object.entries(value)){
        if(key==='version')continue;
        const keys=[...path,key],id=keys.join('.');
        if(current&&typeof current==='object'&&!Array.isArray(current)){
          const group=document.createElement('details');group.open=path.length===0;const summary=document.createElement('summary');summary.textContent=name(key);group.append(summary);walk(current,group,keys);parent.append(group);continue;
        }
        const row=document.createElement('label');row.className='setting-row';const text=document.createElement('span');text.textContent=name(key);let input;
        if(id==='interface.language'||id==='interface.theme'){
          input=document.createElement('select');const options=id.endsWith('language')?[['auto',t('跟随系统','System')],['en','English'],['zh-CN','简体中文'],['zh-Hant','繁體中文']]:[['system',t('跟随系统','System')],['light',t('浅色','Light')],['dark',t('深色','Dark')]];
          for(const [value,label] of options)input.append(new Option(label,value));input.value=current;
        }else if(typeof current==='boolean'){input=document.createElement('input');input.type='checkbox';input.checked=current;}
        else if(typeof current==='number'){input=document.createElement('input');input.type='number';input.value=current;input.step='1';}
        else{input=document.createElement('input');input.type='text';input.value=typeof current==='string'?current:JSON.stringify(current);}
        input.dataset.setting=id;input.setAttribute('aria-label',name(key));controls.push({input,keys,current});row.append(text,input);parent.append(row);
      }
    }
    walk(config.value,fields);
    documentControls=null;originalDocument=getDocument?.();
    if(originalDocument){
      const section=document.createElement('details'),summary=document.createElement('summary');summary.textContent=t('当前文档：页面布局','Current document: page layout');section.append(summary);fields.append(section);
      documentControls={};
      const presetRow=document.createElement('label');presetRow.className='setting-row';const presetLabel=document.createElement('span');presetLabel.textContent=t('页边距','Margins');const preset=document.createElement('select');preset.dataset.documentSetting='marginPreset';for(const [value,label] of [['normal',t('常规','Normal')],['narrow',t('窄','Narrow')],['wide',t('宽','Wide')],['custom',t('自定义','Custom')]])preset.append(new Option(label,value));preset.value=Object.keys(MARGIN_PRESETS).find(key=>Object.values(originalDocument.margins).every(value=>value===MARGIN_PRESETS[key]))??'custom';presetRow.append(presetLabel,preset);section.append(presetRow);preset.onchange=()=>{if(MARGIN_PRESETS[preset.value])for(const side of ['top','right','bottom','left'])documentControls[side].value=MARGIN_PRESETS[preset.value];};
      const options={paper:['a4','a5','letter','legal'],orientation:['portrait','landscape']};
      for(const [key,label] of [['paper',t('纸张','Paper')],['orientation',t('方向','Orientation')],...['top','right','bottom','left'].map(side=>[side,t({top:'上边距',right:'右边距',bottom:'下边距',left:'左边距'}[side],side+' margin')])]){
        const row=document.createElement('label');row.className='setting-row';const text=document.createElement('span');text.textContent=label;
        const input=document.createElement(options[key]?'select':'input');
        if(options[key])for(const value of options[key])input.append(new Option(key==='orientation'?(value==='portrait'?t('纵向','Portrait'):t('横向','Landscape')):value.toUpperCase(),value));else input.type='text';
        input.value=originalDocument[key]??originalDocument.margins[key];input.dataset.documentSetting=key;input.setAttribute('aria-label',label);documentControls[key]=input;if(!options[key])input.oninput=()=>{preset.value='custom';};row.append(text,input);section.append(row);
      }
    }
    const advanced=document.createElement('details'),label=document.createElement('summary'),yaml=document.createElement('textarea');label.textContent=t('完整 YAML（规则与高级设置）','Full YAML (rules and advanced settings)');yaml.dataset.settingsYaml='';yaml.value=config.exportYaml();yaml.rows=16;advanced.append(label,yaml);fields.append(advanced);
    yaml.addEventListener('input',()=>{dialog.dataset.yamlEdited='true';});delete dialog.dataset.yamlEdited;
  }
  form.onsubmit=event=>{
    event.preventDefault();
    try{
      let documentPatch;
      if(documentControls){
        documentPatch={paper:documentControls.paper.value,orientation:documentControls.orientation.value,margins:{}};
        for(const side of ['top','right','bottom','left']){const value=documentControls[side].value.trim();if(!/^\d+(?:\.\d+)?(?:mm|cm|in|pt)$/.test(value))throw new Error(t('请输入有效的页边距及单位','Enter a valid margin with units'));documentPatch.margins[side]=value;}
        if(JSON.stringify({...originalDocument,paper:documentPatch.paper,orientation:documentPatch.orientation,margins:documentPatch.margins})===JSON.stringify(originalDocument))documentPatch=null;
      }
      if(dialog.dataset.yamlEdited==='true')config.importYaml(fields.querySelector('textarea').value);
      else{
        const next=structuredClone(config.value);
        for(const {input,keys,current} of controls){let parent=next;for(const key of keys.slice(0,-1))parent=parent[key];parent[keys.at(-1)]=typeof current==='boolean'?input.checked:typeof current==='number'?Number(input.value):(Array.isArray(current)||current===null)?parseYaml('value: '+input.value).value:input.value;}
        config.importYaml(toYaml(next));
      }
      onApply();if(documentPatch)applyDocument(documentPatch);render();
    }catch(e){error.textContent=e.message;}
  };
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  return {dialog,show(){render();if(!dialog.open)dialog.showModal();},relocalize(){if(dialog.open)render();}};
}
