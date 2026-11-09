// Formatting controls mirror the current selection; they never reset after applying a mark.
export function installFormatControls(editor, tools) {
  const color = document.createElement('label');
  color.className = 'color-control';
  color.dataset.home = '';
  color.title = '文字颜色 / Text color';
  const glyph = document.createElement('span'); glyph.textContent = 'A';
  const picker = document.createElement('input');
  picker.type = 'color'; picker.setAttribute('aria-label', color.title);
  picker.addEventListener('input', () => editor.chain().focus().setMark('textStyle', { color: picker.value }).run());
  color.append(glyph, picker); tools.append(color);
  const menus = {};
  for (const [attribute, values] of Object.entries({
    fontFamily: ['Georgia', 'Arial', 'monospace'],
    fontSize: [8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72].map(size => size + 'pt'),
  })) {
    const menu = document.createElement('select');
    menu.setAttribute('aria-label', attribute);
    menu.title = attribute === 'fontFamily' ? '字体 / Font' : '字号 / Size';
    for (const value of values) menu.append(new Option(value, value));
    menu.addEventListener('change', () => editor.chain().focus().setMark('textStyle', { [attribute]: menu.value }).run());
    menus[attribute] = menu; tools.append(menu);
  }
  function sync() {
    const attrs = editor.getAttributes('textStyle');
    picker.value = attrs.color ?? '#000000';
    glyph.style.borderBottomColor = picker.value;
    for (const [attribute, menu] of Object.entries(menus)) {
      const value = attrs[attribute] ?? (attribute === 'fontFamily' ? 'Georgia' : '10pt');
      if (![...menu.options].some(option => option.value === value)) menu.append(new Option(value, value));
      menu.value = value;
    }
  }
  editor.on('transaction', sync); sync();
}
