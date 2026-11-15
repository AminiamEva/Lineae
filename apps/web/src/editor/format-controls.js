import {t} from '../ui/i18n.mjs';
import {FONT_FAMILIES,selectionTypography} from './selection-typography.js';

export function installFormatControls(editor, parent) {
  const color = document.createElement('label');
  color.className = 'color-control';
  color.dataset.home = '';
  color.dataset.tooltipZh = '文字颜色';
  color.dataset.tooltipEn = 'Text color';
  const glyph = document.createElement('span');
  glyph.textContent = 'A';
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.dataset.zhTitle = '文字颜色';
  picker.dataset.enTitle = 'Text color';
  picker.setAttribute('aria-label',t('文字颜色','Text color'));
  picker.addEventListener('input',() => editor.chain().focus().setMark('textStyle',{color:picker.value}).run());
  color.append(glyph,picker);
  parent.append(color);

  const menus = new Map();
  const definitions = [
    {attribute:'fontFamily',labels:['字体','Font'],values:FONT_FAMILIES},
    {attribute:'fontSize',labels:['字号','Size'],values:[8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72].map(size => size + 'pt')},
  ];
  function appendOption(menu, attribute, value) {
    const option = new Option(value,value);
    if (attribute === 'fontFamily') option.style.fontFamily = value;
    menu.append(option);
  }
  for (const definition of definitions) {
    const menu = document.createElement('select');
    menu.dataset.formatAttribute = definition.attribute;
    [menu.dataset.zhTitle,menu.dataset.enTitle] = definition.labels;
    [menu.dataset.tooltipZh,menu.dataset.tooltipEn] = definition.labels;
    menu.setAttribute('aria-label',t(...definition.labels));
    for (const value of definition.values) appendOption(menu,definition.attribute,value);
    menu.addEventListener('change',() => editor.chain().focus().setMark('textStyle',{[definition.attribute]:menu.value}).run());
    menus.set(definition.attribute,menu);
    parent.append(menu);
  }
  let disposed = false;
  let frame;
  function synchronize() {
    if (disposed) return;
    const format = selectionTypography(editor);
    picker.value = format.color;
    glyph.style.borderBottomColor = format.color;
    for (const [attribute,menu] of menus) {
      const value = format[attribute];
      if (!Array.from(menu.options).some(option => option.value === value)) appendOption(menu,attribute,value);
      menu.value = value;
    }
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(synchronize);
  }
  editor.on('transaction',() => { synchronize(); schedule(); });
  const observer = new MutationObserver(schedule);
  const page = editor.view.dom.closest('.document-page');
  if (page) observer.observe(page,{attributes:true,attributeFilter:['style']});
  editor.on('destroy',() => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); });
  synchronize();
  return {synchronize};
}
