import { t } from './i18n.mjs';
import { icon } from '../editor/icons.js';

const openMenus = new Set();

function closeMenu(entry) {
  entry.menu.hidden = true;
  entry.caret?.setAttribute('aria-expanded','false');
  openMenus.delete(entry);
}

function closeMenus(except) {
  for (const entry of [...openMenus]) if (entry !== except) closeMenu(entry);
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', event => {
    for (const entry of [...openMenus]) {
      if (!entry.wrapper.contains(event.target)) closeMenu(entry);
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
  }, true);
}

function localizedLabel(element, zh, en) {
  element.dataset.zh = zh;
  element.dataset.en = en;
  element.textContent = t(zh,en);
  return element;
}

function describe(element, {zh,en,hintZh,hintEn}) {
  element.dataset.zhTitle = zh;
  element.dataset.enTitle = en;
  element.setAttribute('aria-label',t(zh,en));
  element.dataset.tooltipZh = hintZh ?? zh;
  element.dataset.tooltipEn = hintEn ?? en;
  element.dataset.tooltipBaseZh = hintZh ?? zh;
  element.dataset.tooltipBaseEn = hintEn ?? en;
  return element;
}

function button({iconName,zh,en,hintZh,hintEn,action,disabled,sourceAction,large,text,className=''}) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = `${large ? 'rb-large' : 'rb-small'} ${className}`.trim();
  describe(control,{zh,en,hintZh,hintEn});
  if (sourceAction) control.dataset.sourceAction = sourceAction;
  if (!action || disabled) control.disabled = true;
  control.addEventListener('mousedown',event => event.preventDefault());
  if (action) control.addEventListener('click',event => { event.preventDefault(); action(event); });
  control.append(icon(iconName));
  if (large || text) {
    const label = document.createElement('span');
    label.className = large ? 'rb-label' : 'rb-text';
    localizedLabel(label,zh,en);
    control.append(label);
  }
  return control;
}

function menuItem({zh,en,action,disabled,shortcut,preview}) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'rb-menu-item';
  control.setAttribute('role','menuitem');
  describe(control,{zh,en});
  if (!action || disabled) control.disabled = true;
  control.addEventListener('mousedown',event => event.preventDefault());
  if (preview) {
    control.dataset.preview = 'true';
    const glyph = document.createElement('span');
    glyph.className = 'rb-menu-preview';
    glyph.textContent = preview;
    glyph.setAttribute('aria-hidden','true');
    control.append(glyph);
  }
  const label = document.createElement('span');
  label.className = preview ? 'rb-menu-label' : '';
  localizedLabel(label,zh,en);
  control.append(label);
  if (shortcut) {
    const hint = document.createElement('kbd');
    hint.textContent = shortcut;
    control.append(hint);
  }
  return control;
}

function attachMenu(wrapper, caret, items, {align='start'} = {}) {
  const menu = document.createElement('div');
  menu.className = 'ribbon-menu';
  menu.setAttribute('role','menu');
  menu.hidden = true;
  if (align === 'end') menu.dataset.align = 'end';
  if (items.some(item => item.preview)) menu.dataset.layout = 'icons';
  const entry = {wrapper,menu,caret};
  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement('hr');
      separator.className = 'rb-menu-separator';
      menu.append(separator);
      continue;
    }
    const control = menuItem(item);
    const action = control.disabled ? null : item.action;
    control.addEventListener('click',event => {
      event.preventDefault();
      closeMenu(entry);
      action?.();
    });
    menu.append(control);
  }
  caret.setAttribute('aria-haspopup','true');
  caret.setAttribute('aria-expanded','false');
  caret.addEventListener('mousedown',event => event.preventDefault());
  caret.addEventListener('click',event => {
    event.preventDefault();
    event.stopPropagation();
    const open = menu.hidden;
    closeMenus(entry);
    menu.hidden = !open;
    caret.setAttribute('aria-expanded',String(open));
    if (open) openMenus.add(entry);
    else openMenus.delete(entry);
  });
  wrapper.append(menu);
  return menu;
}

function caretButton(className='rb-caret') {
  const caret = document.createElement('button');
  caret.type = 'button';
  caret.className = className;
  caret.dataset.zhTitle = '更多选项';
  caret.dataset.enTitle = 'More options';
  caret.dataset.tooltipZh = '更多选项';
  caret.dataset.tooltipEn = 'More options';
  caret.setAttribute('aria-label',t('更多选项','More options'));
  caret.append(icon('chevronDown'));
  return caret;
}

function splitControl(parent, main, items) {
  const wrapper = document.createElement('span');
  wrapper.className = 'rb-split';
  const caret = caretButton();
  wrapper.append(main,caret);
  parent.append(wrapper);
  attachMenu(wrapper,caret,items,{align:'start'});
  return main;
}

function largeSplitControl(parent, main, items) {
  const wrapper = document.createElement('span');
  wrapper.className = 'rb-large-wrap';
  const caret = caretButton('rb-caret rb-caret-corner');
  wrapper.append(main,caret);
  parent.append(wrapper);
  attachMenu(wrapper,caret,items,{align:'start'});
  return main;
}

function row(parent) {
  const element = document.createElement('div');
  element.className = 'rb-row';
  parent.append(element);
  return element;
}

function stack(parent) {
  const element = document.createElement('div');
  element.className = 'rb-stack';
  parent.append(element);
  return element;
}

const groupStates = [];
let openFlyout = null;
let panelElement = null;

function closeGroupFlyout({focus = false} = {}) {
  if (!openFlyout) return;
  const {state,flyout} = openFlyout;
  openFlyout = null;
  flyout.remove();
  state.section.insertBefore(state.body,state.label);
  state.body.inert = state.section.classList.contains('is-collapsed');
  state.body.setAttribute('aria-hidden',String(state.body.inert));
  state.toggle.setAttribute('aria-expanded','false');
  if (focus) state.toggle.focus();
}

function openGroupFlyout(state) {
  if (!panelElement) return;
  if (openFlyout?.state === state) { closeGroupFlyout(); return; }
  closeGroupFlyout();
  const flyout = document.createElement('div');
  flyout.className = 'home-ribbon ribbon-flyout';
  flyout.setAttribute('role','dialog');
  flyout.setAttribute('aria-label',t(state.zh,state.en));
  const title = document.createElement('div');
  title.className = 'ribbon-flyout-title';
  title.textContent = state.label.textContent;
  flyout.append(title,state.body);
  state.body.inert = false;
  state.body.removeAttribute('aria-hidden');
  document.body.append(flyout);
  flyout.style.width = Math.min(320,window.innerWidth - 16) + 'px';
  const anchor = state.toggle.getBoundingClientRect();
  const groupBounds = state.section.getBoundingClientRect();
  const size = flyout.getBoundingClientRect();
  const left = Math.min(Math.max(8,anchor.left),Math.max(8,window.innerWidth - size.width - 8));
  let top = groupBounds.bottom + 4;
  if (top + size.height > window.innerHeight - 8) top = Math.max(8,groupBounds.top - size.height - 4);
  flyout.style.left = left + 'px';
  flyout.style.top = top + 'px';
  openFlyout = {state,flyout};
  state.toggle.setAttribute('aria-expanded','true');
  requestAnimationFrame(() => flyout.classList.add('is-open'));
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown',event => {
    if (!openFlyout) return;
    if (openFlyout.flyout.contains(event.target) || openFlyout.state.toggle.contains(event.target)) return;
    closeGroupFlyout();
  },true);
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && openFlyout) {
      event.preventDefault();
      closeGroupFlyout({focus:true});
    }
  },true);
  document.addEventListener('focusin',event => {
    if (event.target.closest?.('.tex-code')) closeGroupFlyout();
  },true);
  window.addEventListener('resize',() => closeGroupFlyout());
  window.addEventListener('scroll',() => closeGroupFlyout(),true);
}

function group(panel,id,zh,en,iconName) {
  const section = document.createElement('section');
  section.className = 'ribbon-group';
  section.dataset.ribbonGroup = id;
  const body = document.createElement('div');
  body.className = 'ribbon-group-body';
  const label = document.createElement('div');
  label.className = 'ribbon-group-label';
  localizedLabel(label,zh,en);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ribbon-group-toggle';
  toggle.dataset.ribbonGroupToggle = id;
  describe(toggle,{zh,en,hintZh:t('展开分组','Expand group')+'：'+zh,hintEn:'Expand group: '+en});
  toggle.append(icon(iconName));
  const chevron = icon('chevronDown');
  chevron.classList.add('ribbon-group-chevron');
  toggle.append(chevron);
  toggle.addEventListener('mousedown',event => event.preventDefault());
  toggle.addEventListener('click',event => {
    event.preventDefault();
    event.stopPropagation();
    openGroupFlyout(state);
  });
  section.append(body,label,toggle);
  panel.append(section);
  const state = {
    id,zh,en,section,body,label,toggle,
    row: () => row(body),
    stack: () => stack(body),
  };
  groupStates.push(state);
  return state;
}

function styleGallery(parent,onStyle) {
  const gallery = document.createElement('div');
  gallery.className = 'style-gallery';
  gallery.setAttribute('role','group');
  gallery.setAttribute('aria-label',t('样式库','Style gallery'));
  const definitions = [
    {level:0,zh:'正文',en:'Normal',align:'left'},
    {level:1,zh:'标题1',en:'section',align:'left'},
    {level:2,zh:'标题2',en:'subsect',align:'left'},
    {level:3,zh:'标题3',en:'subsub',align:'left'},
  ];
  const controls = new Map();
  for (const definition of definitions) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'style-card';
    card.dataset.styleLevel = definition.level === null ? 'none' : String(definition.level);
    if (definition.style) card.dataset.style = definition.style;
    describe(card,{zh:definition.zh,en:definition.en,hintZh:t('应用样式','Apply style')+'：'+definition.zh,hintEn:'Apply style: '+definition.en});
    card.setAttribute('aria-pressed','false');
    card.disabled = Boolean(definition.disabled) || !onStyle;
    card.addEventListener('mousedown',event => event.preventDefault());
    if (!card.disabled) card.addEventListener('click',event => { event.preventDefault(); onStyle(definition.level); });
    const preview = document.createElement('span');
    preview.className = 'style-preview';
    localizedLabel(preview,definition.zh,definition.en);
    card.append(preview);
    gallery.append(card);
    if (definition.level !== null) controls.set(definition.level,card);
  }
  parent.append(gallery);
  return controls;
}

function installResponsiveGroups(panel,states) {
  const priority = ['editing','styles','paragraph','font','clipboard'];
  let fullWidths = null;
  let frame = 0;
  let observer = null;

  function availableWidth() {
    const width = window.innerWidth;
    const sidebar = Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--sidebar-width')) || 0;
    const max = Math.min(
      1320,
      Math.max(300,width - sidebar - 160),
      width - sidebar - 24,
    );
    // Ribbon padding/border and the group panel's own horizontal padding.
    return Math.max(0,max - 32);
  }

  function measure() {
    if (!panel.isConnected || panel.getBoundingClientRect().width < 2) return false;
    closeGroupFlyout();
    for (const state of states) state.section.classList.remove('is-collapsed','is-compact');
    fullWidths = new Map(states.map(state => [state.id,state.section.getBoundingClientRect().width]));
    return true;
  }

  function apply() {
    frame = 0;
    if (!fullWidths) {
      if (!measure()) { schedule(); return; }
    }
    closeGroupFlyout();
    const available = availableWidth();
    const collapsed = new Set();
    let total = [...fullWidths.values()].reduce((sum,value) => sum + value,0);
    for (const id of priority) {
      if (total <= available) break;
      total -= (fullWidths.get(id) ?? 0) - 84;
      collapsed.add(id);
    }
    let compact = false;
    if (total > available && collapsed.size === states.length) {
      compact = true;
      total -= collapsed.size * (84 - 40);
    }
    for (const state of states) {
      const isCollapsed = collapsed.has(state.id);
      state.section.classList.toggle('is-collapsed',isCollapsed);
      state.section.classList.toggle('is-compact',isCollapsed && compact);
      state.body.inert = isCollapsed;
      state.body.setAttribute('aria-hidden',String(isCollapsed));
      state.toggle.setAttribute('aria-expanded',String(openFlyout?.state === state));
      if (isCollapsed && compact) state.label.setAttribute('aria-hidden','true');
      else state.label.removeAttribute('aria-hidden');
    }
    panel.dataset.collapsedGroups = String(collapsed.size);
    panel.dataset.compactGroups = String(compact);
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(apply);
  }

  observer = new ResizeObserver(schedule);
  observer.observe(panel);
  window.addEventListener('resize',schedule);
  document.fonts?.ready.then(schedule);
  schedule();
  return {
    refresh: schedule,
    disconnect() { observer?.disconnect(); window.removeEventListener('resize',schedule); },
  };
}

export function buildHomeRibbon(panel,{actions = {}} = {}) {
  const run = name => (typeof actions[name] === 'function' ? actions[name] : undefined);
  const refs = {align:{},styles:new Map()};
  panelElement = panel;
  groupStates.length = 0;
  panel.replaceChildren();
  panel.classList.add('home-ribbon');
  panel.dataset.ribbonPage = 'home';

  const clipboard = group(panel,'clipboard','剪贴板','Clipboard','paste');
  const clipboardRow = clipboard.row();
  const pasteStack = stack(clipboardRow);
  const pasteAction = run('paste');
  const paste = button({
    iconName:'paste',zh:'粘贴',en:'Paste',
    hintZh:'粘贴剪贴板中的内容；可选保留源格式或只保留文本',
    hintEn:'Paste clipboard content; optionally keep source formatting or text only',
    large:true,
    action:pasteAction ? () => pasteAction('keep') : undefined,
  });
  refs.paste = paste;
  pasteStack.append(paste);
  largeSplitControl(pasteStack,paste,[
    {zh:'保留源格式',en:'Keep source formatting',action:pasteAction ? () => pasteAction('keep') : undefined},
    {zh:'合并格式',en:'Merge formatting',action:pasteAction ? () => pasteAction('merge') : undefined},
    {zh:'只保留文本',en:'Keep text only',action:pasteAction ? () => pasteAction('text') : undefined},
    {separator:true},
    {zh:'选择性粘贴…',en:'Paste special…',disabled:true},
  ]);
  const clipboardActions = stack(clipboardRow);
  const clipboardTools = row(clipboardActions);
  refs.cut = button({iconName:'cut',zh:'剪切',en:'Cut',hintZh:'剪切选区并放入剪贴板',hintEn:'Cut the selection to the clipboard',action:run('cut')});
  refs.copy = button({iconName:'copy',zh:'复制',en:'Copy',hintZh:'复制选区到剪贴板',hintEn:'Copy the selection to the clipboard',action:run('copy')});
  refs.formatPainter = button({iconName:'formatPainter',zh:'格式刷',en:'Format painter',hintZh:'单击应用一次格式，双击连续应用；Esc 取消',hintEn:'Click to apply formatting once, double-click to keep applying; Esc cancels',action:event => run('formatPainter')?.(event)});
  clipboardTools.append(refs.cut,refs.copy,refs.formatPainter);
  const historyTools = row(clipboardActions);
  refs.undo = button({iconName:'undo',zh:'撤销',en:'Undo',hintZh:'撤销上一步操作',hintEn:'Undo the last action',action:run('undo'),sourceAction:'↶'});
  refs.redo = button({iconName:'redo',zh:'重做',en:'Redo',hintZh:'重做已撤销的操作',hintEn:'Redo the last undone action',action:run('redo'),sourceAction:'↷'});
  for (const [control,symbol] of [[refs.undo,'↶'],[refs.redo,'↷']]) {
    control.removeAttribute('data-zh-title');
    control.removeAttribute('data-en-title');
    control.setAttribute('aria-label',symbol);
  }
  historyTools.append(refs.undo,refs.redo);

  const font = group(panel,'font','字体','Font','font');
  const fontControlsRow = font.row();
  fontControlsRow.classList.add('rb-font-controls');
  const fontActions = font.row();
  refs.bold = button({iconName:'bold',zh:'加粗',en:'Bold',hintZh:'将选区设为粗体（\\textbf）',hintEn:'Make the selection bold (\\textbf)',action:run('bold'),sourceAction:'B'});
  refs.italic = button({iconName:'italic',zh:'倾斜',en:'Italic',hintZh:'将选区设为斜体（\\textit）',hintEn:'Make the selection italic (\\textit)',action:run('italic'),sourceAction:'I'});
  fontActions.append(refs.bold,refs.italic);
  const underline = button({iconName:'underline',zh:'下划线',en:'Underline',hintZh:'给选区加下划线（\\underline）',hintEn:'Underline the selection (\\underline)',action:run('underline'),sourceAction:'U'});
  refs.underline = splitControl(fontActions,underline,[
    {zh:'单下划线',en:'Single underline',action:run('underlineStyle') ? () => run('underlineStyle')('single') : undefined},
    {zh:'双下划线',en:'Double underline',action:run('underlineStyle') ? () => run('underlineStyle')('double') : undefined},
    {zh:'波浪下划线',en:'Wavy underline',action:run('underlineStyle') ? () => run('underlineStyle')('wavy') : undefined},
  ]);
  const strike = button({iconName:'strike',zh:'删除线',en:'Strikethrough',hintZh:'给选区加删除线（\\sout）',hintEn:'Strike through the selection (\\sout)',action:run('strike'),sourceAction:'S'});
  refs.strike = splitControl(fontActions,strike,[
    {zh:'单删除线',en:'Single strikethrough',action:run('strike')},
    {zh:'双删除线',en:'Double strikethrough',disabled:true},
  ]);
  refs.subscript = button({iconName:'subscript',zh:'下标',en:'Subscript',hintZh:'将选区设为下标',hintEn:'Make the selection subscript',action:run('subscript'),sourceAction:'x₂'});
  refs.superscript = button({iconName:'superscript',zh:'上标',en:'Superscript',hintZh:'将选区设为上标',hintEn:'Make the selection superscript',action:run('superscript'),sourceAction:'x²'});
  fontActions.append(refs.subscript,refs.superscript);
  refs.clearFormatting = button({iconName:'clearFormat',zh:'清除格式',en:'Clear formatting',hintZh:'清除选区上的字符格式',hintEn:'Clear character formatting from the selection',action:run('clearFormatting')});
  fontActions.append(refs.clearFormatting);
  const highlight = button({iconName:'highlight',zh:'文本突出显示',en:'Text highlight',hintZh:'给选区添加荧光笔底色',hintEn:'Apply a highlighter colour to the selection',action:run('highlight') ? () => run('highlight')('yellow') : undefined});
  refs.highlight = splitControl(fontActions,highlight,[
    {zh:'无突出显示',en:'No highlight',action:run('highlight') ? () => run('highlight')(null) : undefined},
    {zh:'黄色',en:'Yellow',action:run('highlight') ? () => run('highlight')('#fff3a3') : undefined},
    {zh:'浅绿',en:'Light green',action:run('highlight') ? () => run('highlight')('#b8f2c9') : undefined},
    {zh:'浅蓝',en:'Light blue',action:run('highlight') ? () => run('highlight')('#bfe4ff') : undefined},
    {zh:'浅粉',en:'Light pink',action:run('highlight') ? () => run('highlight')('#ffd1dc') : undefined},
  ]);
  const colorSlot = document.createElement('span');
  colorSlot.className = 'rb-color-slot';
  fontActions.append(colorSlot);
  refs.circled = button({iconName:'circledChar',zh:'带圈字符',en:'Enclosed character',hintZh:'给字符添加圆圈',hintEn:'Enclose the character in a circle',action:run('circled')});
  refs.characterBorder = button({iconName:'charBorder',zh:'字符边框',en:'Character border',hintZh:'给选区文字加边框（\\fbox）',hintEn:'Put a border around the selected text (\\fbox)',action:run('characterBorder'),sourceAction:'box'});
  fontActions.append(refs.characterBorder,refs.circled);
  const sizeTools = fontControlsRow;
  sizeTools.classList.add('rb-size-tools');
  refs.fontGrow = button({iconName:'fontGrow',zh:'增大字号',en:'Increase font size',hintZh:'按步长增大字号',hintEn:'Increase the font size by one step',action:run('fontGrow')});
  refs.fontShrink = button({iconName:'fontShrink',zh:'减小字号',en:'Decrease font size',hintZh:'按步长减小字号',hintEn:'Decrease the font size by one step',action:run('fontShrink')});
  sizeTools.append(refs.fontGrow,refs.fontShrink);

  const paragraph = group(panel,'paragraph','段落','Paragraph','paragraph');
  const paragraphLists = paragraph.row();
  const bullets = button({iconName:'list',zh:'项目符号',en:'Bullets',hintZh:'创建无序列表（itemize）',hintEn:'Create an unordered list (itemize)',action:run('bullets'),sourceAction:'itemize'});
  refs.bullets = splitControl(paragraphLists,bullets,[
    {zh:'实心圆点',en:'Filled bullet',preview:'•',action:run('bulletStyle') ? () => run('bulletStyle')('•') : undefined},
    {zh:'空心圆点',en:'Hollow bullet',preview:'◦',action:run('bulletStyle') ? () => run('bulletStyle')('◦') : undefined},
    {zh:'方块',en:'Square bullet',preview:'▪',action:run('bulletStyle') ? () => run('bulletStyle')('▪') : undefined},
    {zh:'短横线',en:'Dash bullet',preview:'–',action:run('bulletStyle') ? () => run('bulletStyle')('–') : undefined},
    {zh:'星号',en:'Asterisk bullet',preview:'*',action:run('bulletStyle') ? () => run('bulletStyle')('*') : undefined},
  ]);
  const numbering = button({iconName:'numberedList',zh:'编号',en:'Numbering',hintZh:'创建有序列表（enumerate）',hintEn:'Create an ordered list (enumerate)',action:run('numbering'),sourceAction:'enumerate'});
  refs.numbering = splitControl(paragraphLists,numbering,[
    {zh:'阿拉伯数字',en:'Arabic numerals',preview:'1.',action:run('numberStyle') ? () => run('numberStyle')('decimal') : undefined},
    {zh:'小写字母',en:'Lowercase letters',preview:'a.',action:run('numberStyle') ? () => run('numberStyle')('lower-alpha') : undefined},
    {zh:'大写字母',en:'Uppercase letters',preview:'A.',action:run('numberStyle') ? () => run('numberStyle')('upper-alpha') : undefined},
    {zh:'小写罗马数字',en:'Lowercase Roman numerals',preview:'i.',action:run('numberStyle') ? () => run('numberStyle')('lower-roman') : undefined},
    {zh:'大写罗马数字',en:'Uppercase Roman numerals',preview:'I.',action:run('numberStyle') ? () => run('numberStyle')('upper-roman') : undefined},
    {zh:'天干',en:'Heavenly stems',preview:'甲',action:run('numberStyle') ? () => run('numberStyle')('cjk-heavenly-stem-bare') : undefined},
    {zh:'中文数字',en:'Chinese numerals',preview:'一、',action:run('numberStyle') ? () => run('numberStyle')('cjk-ideographic-comma') : undefined},
    {zh:'带圈数字',en:'Circled numbers',preview:'①',action:run('numberStyle') ? () => run('numberStyle')('circled-decimal-bare') : undefined},
  ]);
  paragraphLists.append(
    button({iconName:'indentDecrease',zh:'减少缩进',en:'Decrease indent',hintZh:'减少段落或列表的缩进',hintEn:'Decrease the paragraph or list indent',action:run('indentDecrease')}),
    button({iconName:'indentIncrease',zh:'增加缩进',en:'Increase indent',hintZh:'增加段落或列表的缩进',hintEn:'Increase the paragraph or list indent',action:run('indentIncrease')}),
  );
  const spacing = button({iconName:'lineSpacing',zh:'行距',en:'Line spacing',hintZh:'设置行距',hintEn:'Set the line spacing',action:run('lineSpacing') ? () => run('lineSpacing')(1.5) : undefined});
  splitControl(paragraphLists,spacing,[
    {zh:'单倍行距',en:'Single',action:run('lineSpacing') ? () => run('lineSpacing')(1) : undefined},
    {zh:'1.15 倍行距',en:'1.15 lines',action:run('lineSpacing') ? () => run('lineSpacing')(1.15) : undefined},
    {zh:'1.5 倍行距',en:'1.5 lines',action:run('lineSpacing') ? () => run('lineSpacing')(1.5) : undefined},
    {zh:'双倍行距',en:'Double',action:run('lineSpacing') ? () => run('lineSpacing')(2) : undefined},
    {separator:true},
    {zh:'清除行距',en:'Clear line spacing',action:run('lineSpacing') ? () => run('lineSpacing')(null) : undefined},
  ]);
  const paragraphSpacing = button({iconName:'paragraphSpacing',zh:'段前段后间距',en:'Paragraph spacing',hintZh:'设置段前和段后间距',hintEn:'Set space before and after paragraphs',action:run('paragraphSpacing') ? () => run('paragraphSpacing')('6pt','6pt') : undefined});
  splitControl(paragraphLists,paragraphSpacing,[
    {zh:'无段间距',en:'No paragraph spacing',action:run('paragraphSpacing') ? () => run('paragraphSpacing')(null,null) : undefined},
    {zh:'段前 6pt',en:'6pt before',action:run('paragraphSpacing') ? () => run('paragraphSpacing')('6pt',null) : undefined},
    {zh:'段后 6pt',en:'6pt after',action:run('paragraphSpacing') ? () => run('paragraphSpacing')(null,'6pt') : undefined},
    {zh:'段前段后各 6pt',en:'6pt before and after',action:run('paragraphSpacing') ? () => run('paragraphSpacing')('6pt','6pt') : undefined},
    {zh:'段前段后各 12pt',en:'12pt before and after',action:run('paragraphSpacing') ? () => run('paragraphSpacing')('12pt','12pt') : undefined},
  ]);
  const sort = button({iconName:'sortAZ',zh:'排序',en:'Sort',hintZh:'按拼音、笔画或字母排序选中的段落',hintEn:'Sort the selected paragraphs by pinyin, stroke count or alphabet',action:run('sort') ? () => run('sort')('pinyin') : undefined});
  splitControl(paragraphLists,sort,[
    {zh:'按拼音排序',en:'Sort by pinyin',action:run('sort') ? () => run('sort')('pinyin') : undefined},
    {zh:'按笔画排序',en:'Sort by stroke count',action:run('sort') ? () => run('sort')('stroke') : undefined},
    {zh:'按字母排序',en:'Sort alphabetically',action:run('sort') ? () => run('sort')('alphabet') : undefined},
  ]);
  const paragraphAlign = paragraph.row();
  for (const [key,iconName,zh,en,hintZh,hintEn] of [
    ['left','left','左对齐','Align left','段落左对齐','Align the paragraph left'],
    ['center','center','居中','Center','段落居中','Center the paragraph'],
    ['right','right','右对齐','Align right','段落右对齐','Align the paragraph right'],
    ['justify','justify','两端对齐','Justify','两端对齐段落','Justify the paragraph'],
  ]) {
    refs.align[key] = button({iconName,zh,en,hintZh,hintEn,action:run('align'+key[0].toUpperCase()+key.slice(1))});
    paragraphAlign.append(refs.align[key]);
  }
  const paragraphMarks = paragraphAlign;
  const shading = button({iconName:'shading',zh:'段落底纹',en:'Paragraph shading',hintZh:'给整个段落添加背景色',hintEn:'Add a background colour to the paragraph',action:run('paragraphShading') ? () => run('paragraphShading')('yellow') : undefined});
  refs.shading = splitControl(paragraphMarks,shading,[
    {zh:'无底纹',en:'No shading',action:run('paragraphShading') ? () => run('paragraphShading')(null) : undefined},
    {zh:'黄色',en:'Yellow',action:run('paragraphShading') ? () => run('paragraphShading')('yellow') : undefined},
    {zh:'浅灰',en:'Light gray',action:run('paragraphShading') ? () => run('paragraphShading')('lightgray') : undefined},
    {zh:'青色',en:'Cyan',action:run('paragraphShading') ? () => run('paragraphShading')('cyan') : undefined},
    {zh:'浅绿',en:'Light green',action:run('paragraphShading') ? () => run('paragraphShading')('green') : undefined},
  ]);
  refs.border = button({iconName:'paragraphBorders',zh:'段落边框',en:'Paragraph borders',hintZh:'给段落添加或取消边框',hintEn:'Add or remove a border around the paragraph',action:run('paragraphBorder')});
  paragraphMarks.append(refs.border);
  refs.formattingMarks = button({iconName:'pilcrow',zh:'编辑标记',en:'Formatting marks',hintZh:'显示或隐藏空格、换行等编辑标记',hintEn:'Show or hide spaces, line breaks and other formatting marks',action:run('formattingMarks'),sourceAction:'¶'});
  refs.formattingMarks.classList.add('rb-marks');
  paragraphMarks.append(refs.formattingMarks);

  const styles = group(panel,'styles','样式','Styles','styles');
  const galleryRow = styles.row();
  refs.styles = styleGallery(galleryRow,(level) => run('style')?.(level));

  const editing = group(panel,'editing','编辑','Editing','find');
  const editingRow = editing.row();
  refs.find = button({iconName:'find',zh:'查找',en:'Find',hintZh:'在文档中查找文本',hintEn:'Find text in the document',large:true,action:run('find'),sourceAction:'Find'});
  editingRow.append(refs.find);

  const responsive = installResponsiveGroups(panel,groupStates);
  return {panel,refs,groups:groupStates,refreshLayout:responsive.refresh,slots:{font:fontControlsRow,color:colorSlot}};
}
