import {t} from '../ui/i18n.mjs';

export function installProjectContextMenu({contextMenu,panel,run}) {
  let opener = null;
  function close(restore = false) {
    contextMenu.hidden = true;
    contextMenu.replaceChildren();
    delete contextMenu.dataset.path;
    if (restore && opener?.isConnected) opener.focus?.({preventScroll:true});
    opener = null;
  }
  function action(labels, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role','menuitem');
    [button.dataset.zh,button.dataset.en] = labels;
    button.textContent = t(...labels);
    button.addEventListener('click',() => { close(); run(callback); });
    contextMenu.append(button);
    return button;
  }
  function separator() {
    const rule = document.createElement('hr');
    rule.setAttribute('role','separator');
    contextMenu.append(rule);
  }
  function position(event) {
    opener = event.target.closest?.('.project-file,summary') ?? event.target;
    const anchor = event.target.getBoundingClientRect();
    contextMenu.hidden = false;
    const size = contextMenu.getBoundingClientRect();
    const left = event.clientX || anchor.left + 12;
    const top = event.clientY || anchor.bottom;
    contextMenu.style.left = Math.max(6,Math.min(left,innerWidth - size.width - 6)) + 'px';
    contextMenu.style.top = Math.max(6,Math.min(top,innerHeight - size.height - 6)) + 'px';
    contextMenu.querySelector('button')?.focus({preventScroll:true});
  }
  contextMenu.addEventListener('contextmenu',event => event.preventDefault());
  contextMenu.addEventListener('keydown',event => {
    const keys = ['ArrowDown','ArrowUp','Home','End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(contextMenu.querySelectorAll('button'));
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
      (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  });
  document.addEventListener('pointerdown',event => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) close();
  });
  document.addEventListener('keydown',event => { if (event.key === 'Escape') close(true); });
  window.addEventListener('resize',() => close());
  panel.addEventListener('scroll',() => close());
  return {close,action,separator,position};
}
