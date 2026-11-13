import { t } from '../ui/i18n.mjs';

export function installTableHoverAddRow(editor, paper) {
  const rowButton = document.createElement('button');
  rowButton.type = 'button';
  rowButton.className = 'table-insert-row';
  rowButton.textContent = '+';
  rowButton.dataset.tooltipZh = '在下方插入行';
  rowButton.dataset.tooltipEn = 'Insert row below';
  rowButton.setAttribute('aria-label', t('在下方插入行','Insert row below'));
  rowButton.hidden = true;
  document.body.append(rowButton);

  const columnButton = document.createElement('button');
  columnButton.type = 'button';
  columnButton.className = 'table-insert-column';
  columnButton.textContent = '+';
  columnButton.dataset.tooltipZh = '在右侧插入列';
  columnButton.dataset.tooltipEn = 'Insert column right';
  columnButton.setAttribute('aria-label', t('在右侧插入列','Insert column right'));
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
  const positionIn = cell => {
    try { return editor.view.posAtDOM(cell, 0); }
    catch { return null; }
  };

  paper.addEventListener('mousemove', event => {
    const cell = event.target.closest?.('td,th');
    if (!cell || !paper.contains(cell)) { scheduleHide(); return; }
    clearTimeout(hideTimer);
    const rect = cell.getBoundingClientRect();
    const row = cell.parentElement;
    // Hit testing can round a pointer at the last 2 CSS px of a row into the
    // next row. Treat that top edge as the bottom edge of the previous row.
    let target = cell;
    let rowBottom = rect.bottom;
    if (row.rowIndex > 0 && event.clientY <= rect.top + 7) {
      target = row.previousElementSibling.cells[cell.cellIndex];
      rowBottom = rect.top;
    }

    if (event.clientY >= rowBottom - 7 && event.clientY <= rowBottom + 3) {
      const position = positionIn(target);
      if (position !== null) {
        rowPosition = position;
        const table = cell.closest('table').getBoundingClientRect();
        rowButton.hidden = false;
        rowButton.style.left = (table.left + table.width / 2) + 'px';
        rowButton.style.top = (rowBottom + 2) + 'px';
      }
    }

    if (event.clientX >= rect.right - 7 && event.clientX <= rect.right + 3) {
      const position = positionIn(cell);
      if (position !== null) {
        columnPosition = position;
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
