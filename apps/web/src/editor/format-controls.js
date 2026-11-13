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
  picker.type = 'color'; picker.setAttribute('aria-label', t('文字颜色','Text color'));
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
    menu.setAttribute('aria-label', attribute);
    menu.dataset.tooltipZh = attribute === 'fontFamily' ? '字体' : '字号';
    menu.dataset.tooltipEn = attribute === 'fontFamily' ? 'Font' : 'Size';
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
    picker.value = attrs.color ?? '#000000';
    glyph.style.borderBottomColor = picker.value;
    for (const [attribute, menu] of Object.entries(menus)) {
      const value = attrs[attribute] ?? (attribute === 'fontFamily' ? 'Latin Modern Roman' : '10pt');
      if (![...menu.options].some(option => option.value === value)) {
        const option = new Option(value, value);
        if (attribute === 'fontFamily') option.style.fontFamily = value;
        menu.append(option);
      }
      menu.value = value;
    }
  }
  editor.on('transaction', sync); sync();
}
