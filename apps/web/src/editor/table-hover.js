export function installTableHoverAddRow(editor, paper) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'table-insert-row';
  button.textContent = '+';
  button.title = '在下方插入行 / Insert row below';
  button.hidden = true;
  document.body.append(button);

  let activePosition = null;
  let hideTimer = 0;
  const hide = () => {
    clearTimeout(hideTimer);
    button.hidden = true;
    activePosition = null;
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 160);
  };

  paper.addEventListener('mousemove', event => {
    const cell = event.target.closest?.('td,th');
    if (!cell || !paper.contains(cell)) { scheduleHide(); return; }
    const rect = cell.getBoundingClientRect();
    if (event.clientY < rect.bottom - 7 || event.clientY > rect.bottom + 3) { scheduleHide(); return; }
    const hit = editor.view.posAtCoords({ left: event.clientX, top: rect.bottom - 2 });
    if (!hit) { scheduleHide(); return; }
    clearTimeout(hideTimer);
    activePosition = hit.pos;
    const table = cell.closest('table').getBoundingClientRect();
    button.hidden = false;
    button.style.left = (table.left + table.width / 2) + 'px';
    button.style.top = (rect.bottom + 2) + 'px';
  });
  paper.addEventListener('mouseleave', scheduleHide);
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  button.addEventListener('mouseleave', scheduleHide);
  button.addEventListener('click', () => {
    if (activePosition === null) return;
    editor.commands.setTextSelection(activePosition);
    editor.chain().focus().addRowAfter().run();
    hide();
  });
  return hide;
}
