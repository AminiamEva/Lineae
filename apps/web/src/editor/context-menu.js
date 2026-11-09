import { DOMSerializer } from '@tiptap/pm/model';

function selectedMath(context) {
  const ranges = context.field.selection.ranges;
  return ranges.map(range => context.field.getValue(range)).join('');
}

async function copySelection(context, cut) {
  const { editor, field } = context;
  if (field) {
    const selected = selectedMath(context);
    const value = field.value;
    const selection = structuredClone(field.selection);
    await navigator.clipboard.writeText(selected);
    if (cut && field.isConnected && field.value === value) {
      field.selection = selection;
      field.executeCommand(['insert', '']);
    }
    return;
  }
  const { state } = editor;
  const { from, to } = state.selection;
  const text = state.doc.textBetween(from, to, '\n', node => node.attrs.latex ?? '');
  const container = document.createElement('div');
  container.append(DOMSerializer.fromSchema(state.schema).serializeFragment(state.selection.content().content));
  if (navigator.clipboard.write && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([container.innerHTML], { type: 'text/html' }),
    })]);
  } else await navigator.clipboard.writeText(text);
  if (cut && editor.state.doc.eq(state.doc)) editor.chain().focus().deleteRange({ from, to }).run();
}

export function contextCommands(context) {
  const { editor, field } = context;
  const selectionEmpty = field ? field.selection.ranges.every(([from, to]) => from === to) : editor.state.selection.empty;
  return [
    { id: 'undo', labels: ['撤销', 'Undo'], enabled: editor.can().undo(), run: () => editor.chain().focus().undo().run() },
    { id: 'redo', labels: ['重做', 'Redo'], enabled: editor.can().redo(), run: () => editor.chain().focus().redo().run() },
    { id: 'cut', labels: ['剪切', 'Cut'], enabled: !selectionEmpty, run: () => copySelection(context, true) },
    { id: 'copy', labels: ['复制', 'Copy'], enabled: !selectionEmpty, run: () => copySelection(context, false) },
    {
      id: 'paste', labels: ['粘贴文本', 'Paste text'], enabled: Boolean(navigator.clipboard?.readText),
      run: async () => {
        const snapshot = editor.state.doc;
        const selection = editor.state.selection;
        const text = await navigator.clipboard.readText();
        if (field?.isConnected) {
          field.focus();
          field.executeCommand(['insert', text]);
        } else if (editor.state.doc.eq(snapshot)) {
          editor.view.dispatch(editor.state.tr.insertText(text, selection.from, selection.to));
          editor.view.focus();
        }
      },
    },
    { id: 'select-all', labels: ['全选', 'Select all'], run: () => {
      if (field) { field.focus(); field.executeCommand('selectAll'); }
      else editor.chain().focus().selectAll().run();
    }},
    { id: 'bold', labels: ['粗体', 'Bold'], visible: !field, run: () => editor.chain().focus().toggleBold().run() },
    { id: 'italic', labels: ['斜体', 'Italic'], visible: !field, run: () => editor.chain().focus().toggleItalic().run() },
    { id: 'heading-number', labels: ['切换标题编号', 'Toggle heading numbering'],
      visible: !field && editor.isActive('heading'),
      run: () => editor.chain().focus().updateAttributes('heading', { numbered: !editor.getAttributes('heading').numbered }).run(),
    },
    { id: 'row-after', labels: ['在下方插入行', 'Insert row below'], visible: !field && editor.isActive('table'),
      run: () => editor.chain().focus().addRowAfter().run() },
    { id: 'column-after', labels: ['在右侧插入列', 'Insert column right'], visible: !field && editor.isActive('table'),
      run: () => editor.chain().focus().addColumnAfter().run() },
    { id: 'delete-row', labels: ['删除行', 'Delete row'], visible: !field && editor.isActive('table'),
      run: () => editor.chain().focus().deleteRow().run() },
    { id: 'delete-column', labels: ['删除列', 'Delete column'], visible: !field && editor.isActive('table'),
      run: () => editor.chain().focus().deleteColumn().run() },
    { id: 'delete-table', labels: ['删除表格', 'Delete table'], visible: !field && editor.isActive('table'),
      run: () => editor.chain().focus().deleteTable().run() },
    { id: 'delete-formula', labels: ['删除公式', 'Delete formula'], visible: Boolean(field), run: () => {
      const position = field.closest('[data-math-view]')?.getMathPosition();
      if (typeof position !== 'number') return;
      const node = editor.state.doc.nodeAt(position);
      editor.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run();
    }},
  ];
}

export function installContextMenu(editor, paper, language, reportError) {
  const menu = document.createElement('div');
  menu.className = 'editor-context-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  let activeField = null;

  function close(restoreFocus = false) {
    menu.hidden = true;
    if (restoreFocus) {
      if (activeField?.isConnected) activeField.focus();
      else editor.view.focus();
    }
  }
  paper.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    activeField = event.composedPath().find(element => element?.tagName === 'MATH-FIELD') ?? null;
    if (!activeField) {
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      const { from, to } = editor.state.selection;
      if (hit && (hit.pos < from || hit.pos > to)) editor.commands.setTextSelection(hit.pos);
    }
    menu.replaceChildren();
    const commands = contextCommands({ editor, field: activeField });
    for (const command of commands.filter(command => command.visible !== false)) {
      const control = document.createElement('button');
      control.type = 'button';
      control.setAttribute('role', 'menuitem');
      control.dataset.command = command.id;
      control.textContent = command.labels[language.value === 'zh-CN' ? 0 : 1];
      control.disabled = command.enabled === false;
      control.addEventListener('mousedown', event => event.preventDefault());
      control.addEventListener('click', async () => {
        close();
        try { await command.run(); }
        catch (error) {
          reportError(language.value === 'zh-CN'
            ? '操作未完成。剪贴板操作也可使用 Ctrl+C、Ctrl+X 或 Ctrl+V。'
            : 'The action could not finish. You can also use Ctrl+C, Ctrl+X or Ctrl+V.');
        }
      });
      menu.append(control);
    }
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }, true);
  menu.addEventListener('keydown', event => {
    const controls = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = controls.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
      controls[next]?.focus();
    }
    if (event.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); }, true);
  window.addEventListener('resize', () => close());
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) close(); }, true);
}
