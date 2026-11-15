// Formatting controls mirror the current selection; they never reset after applying a mark.
import { t } from '../ui/i18n.mjs';

export function installFormatControls(editor, tools) {
  const color = document.createElement('label');
  color.className = 'color-control';
  color.dataset.home = '';
  color.dataset.tooltipZh = '文字颜色';
  color.dataset.tooltipEn = 'Text color';
  const glyph = document.createElement('span'); glyph.textContent = 'A';
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.dataset.zhTitle = '文字颜色'; picker.dataset.enTitle = 'Text color';
  picker.setAttribute('aria-label', t('文字颜色','Text color'));
  picker.addEventListener('input', () => editor.chain().focus().setMark('textStyle', { color: picker.value }).run());
  color.append(glyph, picker); tools.append(color);
  const menus = {};
  const families = [
    'Latin Modern Roman', 'Georgia', 'Times New Roman', 'Cambria', 'Palatino Linotype',
    'SimSun', 'Songti SC', 'Arial', 'Segoe UI', 'Microsoft YaHei', 'Helvetica Neue',
    'Verdana', 'Calibri', 'Latin Modern Mono', 'Consolas', 'Courier New', 'monospace',
  ];
  for (const [attribute, values] of Object.entries({
    fontFamily: families,
    fontSize: [8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72].map(size => size + 'pt'),
  })) {
    const menu = document.createElement('select');
    const [zh,en] = attribute === 'fontFamily' ? ['字体','Font'] : ['字号','Size'];
    menu.dataset.formatAttribute = attribute;
    menu.dataset.zhTitle = zh; menu.dataset.enTitle = en;
    menu.setAttribute('aria-label', t(zh,en));
    menu.dataset.tooltipZh = zh;
    menu.dataset.tooltipEn = en;
    for (const value of values) {
      const option = new Option(value, value);
      if (attribute === 'fontFamily') option.style.fontFamily = value;
      menu.append(option);
    }
    menu.addEventListener('change', () => editor.chain().focus().setMark('textStyle', { [attribute]: menu.value }).run());
    menus[attribute] = menu; tools.append(menu);
  }
  function sync() {
    const attrs = editor.getAttributes('textStyle');
    const {$from}=editor.state.selection;
    const block=$from.depth?editor.view.nodeDOM($from.before()):editor.view.dom;
    const style=getComputedStyle(block?.nodeType===1?block:editor.view.dom);
    const family=style.fontFamily.split(',')[0].trim().replace(/["']/g,'');
    const points=Number((Number.parseFloat(style.fontSize)*72/96).toFixed(2));
    picker.value = attrs.color ?? '#000000';
    glyph.style.borderBottomColor = picker.value;
    for (const [attribute, menu] of Object.entries(menus)) {
      const value = attrs[attribute] ?? (attribute === 'fontFamily' ? family : points+'pt');
      if (![...menu.options].some(option => option.value === value)) {
        const option = new Option(value, value);
        if (attribute === 'fontFamily') option.style.fontFamily = value;
        menu.append(option);
      }
      menu.value = value;
    }
  }
  editor.on('transaction',()=>{sync();requestAnimationFrame(sync);});
  const observer=new MutationObserver(()=>requestAnimationFrame(sync));observer.observe(editor.view.dom.closest('.document-page'),{attributes:true,attributeFilter:['style']});
  editor.on('destroy',()=>observer.disconnect());sync();
}
