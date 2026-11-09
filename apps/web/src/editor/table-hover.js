export function installTableHoverAddRow(editor, paper) {
  const rowButton = document.createElement('button');
  rowButton.type = 'button';
  rowButton.className = 'table-insert-row';
  rowButton.textContent = '+';
  rowButton.title = '在下方插入行 / Insert row below';
  rowButton.hidden = true;
  document.body.append(rowButton);

  const columnButton = document.createElement('button');
  columnButton.type = 'button';
  columnButton.className = 'table-insert-column';
  columnButton.textContent = '+';
  columnButton.title = '在右侧插入列 / Insert column right';
  columnButton.hidden = true;
  document.body.append(columnButton);

  let rowPosition = null;
  let columnPosition = null;
  let hideTimer = 0;
  const hide = () => {
    clearTimeout(hideTimer);
    rowButton.hidden = true;
    columnButton.hidden = true;
    rowPosition = null;
    columnPosition = null;
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 160);
  };

  paper.addEventListener('mousemove', event => {
    const cell = event.target.closest?.('td,th');
    if (!cell || !paper.contains(cell)) { scheduleHide(); return; }
    clearTimeout(hideTimer);
    const rect = cell.getBoundingClientRect();

    if (event.clientY >= rect.bottom - 7 && event.clientY <= rect.bottom + 3) {
      const hit = editor.view.posAtCoords({ left: event.clientX, top: rect.bottom - 2 });
      if (hit) {
        rowPosition = hit.pos;
        const table = cell.closest('table').getBoundingClientRect();
        rowButton.hidden = false;
        rowButton.style.left = (table.left + table.width / 2) + 'px';
        rowButton.style.top = (rect.bottom + 2) + 'px';
      }
    }

    if (event.clientX >= rect.right - 7 && event.clientX <= rect.right + 3) {
      const hit = editor.view.posAtCoords({ left: rect.right - 2, top: event.clientY });
      if (hit) {
        columnPosition = hit.pos;
        columnButton.hidden = false;
        columnButton.style.left = (rect.right + 2) + 'px';
        columnButton.style.top = (rect.top + rect.height / 2 - 11) + 'px';
      }
    }

    if (rowButton.hidden && columnButton.hidden) scheduleHide();
  });
  paper.addEventListener('mouseleave', scheduleHide);
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
  for (const button of [rowButton, columnButton]) {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    button.addEventListener('mouseleave', scheduleHide);
  }
  rowButton.addEventListener('click', () => {
    if (rowPosition === null) return;
    editor.commands.setTextSelection(rowPosition);
    editor.chain().focus().addRowAfter().run();
    hide();
  });
  columnButton.addEventListener('click', () => {
    if (columnPosition === null) return;
    editor.commands.setTextSelection(columnPosition);
    editor.chain().focus().addColumnAfter().run();
    hide();
  });
  return hide;
}
