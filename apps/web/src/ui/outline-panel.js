import {t} from './i18n.mjs';

export function createOutlinePanel(editor,{readOutline,navigate}) {
  const panel = document.createElement('aside');
  panel.id = 'document-outline';
  panel.className = 'document-outline';
  panel.hidden = true;
  const header = document.createElement('div');
  header.className = 'document-outline-header';
  const title = document.createElement('strong');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  const list = document.createElement('div');
  list.className = 'document-outline-list';
  header.append(title,close);
  panel.append(header,list);
  document.body.append(panel);

  function headingButton(item, current) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.headingPosition = String(item.position);
    button.style.paddingInlineStart = (8 + (item.level - 1) * 14) + 'px';
    button.textContent = (item.number ? item.number + '  ' : '') + item.text;
    button.setAttribute('aria-current',String(item === current));
    button.addEventListener('click',() => {
      const request = new CustomEvent('lineae-outline-navigate',{cancelable:true,detail:item});
      if (panel.dispatchEvent(request)) navigate(editor,item);
    });
    return button;
  }
  function render() {
    if (panel.hidden) return;
    const headings = readOutline(editor.state.doc);
    const position = editor.state.selection.from;
    const current = headings.findLast(item => item.position < position) ?? null;
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.headingPosition : null;
    const nodes = [];
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'projectRegion') return;
      const file = document.createElement('button');
      file.type = 'button';
      file.className = 'outline-file';
      file.textContent = node.attrs.path;
      file.dataset.outlineFile = node.attrs.path;
      file.addEventListener('click',() => {
        editor.commands.setTextSelection(offset + 2);
        editor.commands.scrollIntoView();
      });
      nodes.push(file);
    });
    nodes.push(...headings.map(item => headingButton(item,current)));
    if (!nodes.length) {
      const empty = document.createElement('p');
      empty.textContent = t('文档中没有标题','No headings in this document');
      nodes.push(empty);
    }
    list.replaceChildren(...nodes);
    panel.dispatchEvent(new Event('lineae-outline-render'));
    if (focused) list.querySelector('[data-heading-position="' + focused + '"]')?.focus({preventScroll:true});
  }
  function relocalize() {
    const name = t('文档大纲','Document outline');
    panel.setAttribute('aria-label',name);
    title.textContent = name;
    close.setAttribute('aria-label',t('关闭大纲','Close outline'));
    render();
  }
  function hide() {
    const section = panel.closest('.sidebar-section');
    if (section) section.open = false;
    else panel.hidden = true;
    editor.view.focus();
  }
  function show() {
    panel.hidden = false;
    const section = panel.closest('.sidebar-section');
    if (section) {
      section.open = true;
      panel.dispatchEvent(new Event('lineae-show-sidebar',{bubbles:true}));
    }
    relocalize();
  }
  const onEscape = event => {
    if (event.key === 'Escape' && !panel.hidden && !panel.closest('.sidebar-section')) {
      event.preventDefault();
      hide();
    }
  };
  close.addEventListener('click',hide);
  document.addEventListener('keydown',onEscape,true);
  editor.on('transaction',render);
  editor.on('destroy',() => document.removeEventListener('keydown',onEscape,true));
  relocalize();
  return {panel,show,hide,relocalize};
}
