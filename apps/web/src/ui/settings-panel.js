import {t} from './i18n.mjs';
import {toYaml} from '../editor/config.mjs';
import {MARGIN_PRESETS} from '../../latex/geometry.mjs';
import {settingsProposal,layoutProposal} from './settings-values.mjs';

const LABELS = {
  interface:['界面','Appearance'], editing:['编辑','Editing'], keybindings:['快捷键','Keyboard shortcuts'],
  language:['语言','Language'], theme:['主题','Theme'], zoom:['页面缩放 (%)','Page zoom (%)'],
  sourceFontSize:['源码字号 (px)','Source font size (px)'], toolbarAutoHide:['Document 自动折叠功能区','Auto-hide toolbar in Document'],
  sourceToolbarAutoHide:['代码界面自动折叠功能区','Auto-hide toolbar in Source and Split'],
  zoomOnCtrlWheel:['Ctrl+滚轮缩放','Ctrl+wheel zoom'], continuedTables:['跨页重复表头','Repeat table headers'],
  formattingMarks:['非打印标记','Formatting marks'], caretMotion:['光标和选区动画','Caret and selection animation'],
  toolbar:['文件工具栏入口','File toolbar actions'], smartFences:['括号自动配对','Pair delimiters'],
  autoReplaceLigatures:['自动替换连字','Replace ligatures'], indentOnSave:['保存时缩进','Indent on save'],
  ligatures:['连字规则','Ligature rules'], chordTimeoutMs:['组合快捷键等待时间 (ms)','Shortcut chord timeout (ms)'],
  sidebar:['侧栏分区','Sidebar sections'], files:['文件树','File tree'], includes:['文件引用','File includes'],
  outline:['大纲','Outline'], citations:['文献','Citations'], global:['全局','Global'], editor:['编辑器','Editor'],
  paragraph:['段落','Paragraph'], table:['表格','Table'], math:['公式','Math'],
};
const labelFor = key => LABELS[key] ? t(...LABELS[key]) : key;
function labeledRow(name, control) {
  const row = document.createElement('label');
  row.className = 'setting-row';
  const label = document.createElement('span');
  label.textContent = name;
  control.setAttribute('aria-label',name);
  row.append(label,control);
  return row;
}
function selectFrom(entries) {
  const control = document.createElement('select');
  for (const [value,label] of entries) control.append(new Option(label,value));
  return control;
}
function section(name) {
  const details = document.createElement('details');
  const heading = document.createElement('summary');
  heading.textContent = name;
  details.append(heading);
  return details;
}

export function installSettingsPanel({config,onApply,onImport,onExport,getDocument,applyDocument}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'settings-panel';
  dialog.className = 'settings-panel';
  const heading = document.createElement('h2');
  const form = document.createElement('form');
  const fields = document.createElement('div');
  const error = document.createElement('p');
  error.setAttribute('role','alert');
  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  const makeButton = (id,type,action) => {
    const button = document.createElement('button');
    button.id = id;
    button.type = type;
    if (action) button.addEventListener('click',action);
    actions.append(button);
    return button;
  };
  const importButton = makeButton('settings-import','button',onImport);
  const exportButton = makeButton('settings-export','button',onExport);
  const closeButton = makeButton('settings-close','button',() => dialog.close());
  const applyButton = makeButton('settings-apply','submit');
  form.append(fields,error,actions);
  dialog.append(heading,form);
  document.body.append(dialog);
  let controls = [];
  let layoutControls = null;
  let originalLayout = null;
  let yaml;
  let yamlChanged = false;

  function inputFor(path, value) {
    const id = path.join('.');
    let control;
    if (id === 'interface.language') control = selectFrom([
      ['auto',t('跟随系统','System')],['en','English'],['zh-CN','简体中文'],['zh-Hant','繁體中文'],
    ]);
    else if (id === 'interface.theme') control = selectFrom([
      ['system',t('跟随系统','System')],['light',t('浅色','Light')],['dark',t('深色','Dark')],
    ]);
    else {
      control = document.createElement('input');
      control.type = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
    }
    if (typeof value === 'boolean') control.checked = value;
    else control.value = typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value);
    control.dataset.setting = id;
    controls.push({input:control,path,value});
    return control;
  }
  function configFields(mapping, parent, path = []) {
    for (const [key,value] of Object.entries(mapping)) {
      if (key === 'version') continue;
      const currentPath = [...path,key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const group = section(labelFor(key));
        group.dataset.settingsGroup = currentPath.join('.');
        group.open = !path.length;
        configFields(value,group,currentPath);
        parent.append(group);
      } else parent.append(labeledRow(labelFor(key),inputFor(currentPath,value)));
    }
  }
  function documentFields(layout) {
    layoutControls = {};
    const group = section(t('当前文档：页面布局','Current document: page layout'));
    const preset = selectFrom([
      ['normal',t('常规','Normal')],['narrow',t('窄','Narrow')],['wide',t('宽','Wide')],['custom',t('自定义','Custom')],
    ]);
    preset.dataset.documentSetting = 'marginPreset';
    preset.value = Object.keys(MARGIN_PRESETS).find(key => Object.values(layout.margins).every(value => value === MARGIN_PRESETS[key])) ?? 'custom';
    group.append(labeledRow(t('页边距','Margins'),preset));
    const rows = [
      ['paper',t('纸张','Paper'),selectFrom(['a4','a5','letter','legal'].map(value => [value,value.toUpperCase()]))],
      ['orientation',t('方向','Orientation'),selectFrom([['portrait',t('纵向','Portrait')],['landscape',t('横向','Landscape')]])],
    ];
    for (const [side,zh] of [['top','上边距'],['right','右边距'],['bottom','下边距'],['left','左边距']]) {
      const input = document.createElement('input');
      input.type = 'text';
      input.addEventListener('input',() => { preset.value = 'custom'; });
      rows.push([side,t(zh,side + ' margin'),input]);
    }
    for (const [key,label,control] of rows) {
      control.dataset.documentSetting = key;
      control.value = layout[key] ?? layout.margins[key];
      layoutControls[key] = control;
      group.append(labeledRow(label,control));
    }
    preset.addEventListener('change',() => {
      const margin = MARGIN_PRESETS[preset.value];
      if (margin) for (const side of ['top','right','bottom','left']) layoutControls[side].value = margin;
    });
    fields.append(group);
  }
  function render() {
    heading.textContent = t('设置','Settings');
    importButton.textContent = t('导入 YAML','Import YAML');
    exportButton.textContent = t('导出 YAML','Export YAML');
    closeButton.textContent = t('关闭','Close');
    applyButton.textContent = t('应用','Apply');
    controls = [];
    fields.replaceChildren();
    error.textContent = '';
    configFields(config.value,fields);
    originalLayout = getDocument?.() ?? null;
    layoutControls = null;
    if (originalLayout) documentFields(originalLayout);
    const advanced = section(t('完整 YAML（规则与高级设置）','Full YAML (rules and advanced settings)'));
    yaml = document.createElement('textarea');
    yaml.dataset.settingsYaml = '';
    yaml.rows = 16;
    yaml.value = config.exportYaml();
    yamlChanged = false;
    yaml.addEventListener('input',() => { yamlChanged = true; });
    advanced.append(yaml);
    fields.append(advanced);
  }
  form.addEventListener('submit',event => {
    event.preventDefault();
    try {
      const layout = layoutProposal(originalLayout,layoutControls);
      const proposal = yamlChanged ? yaml.value : toYaml(settingsProposal(config.value,controls));
      config.importYaml(proposal);
      if (layout) applyDocument(layout);
      onApply();
      render();
    } catch (failure) { error.textContent = failure.message; }
  });
  dialog.addEventListener('click',event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  return {dialog,show() { render(); if (!dialog.open) dialog.showModal(); },relocalize() { if (dialog.open) render(); }};
}
