import {t} from '../ui/i18n.mjs';

export function promptTreeEntry({parent,folder,submit}) {
  return new Promise(resolve => {
    const row = document.createElement('form');
    row.className = 'project-inline-entry';
    const input = document.createElement('input');
    input.dataset.projectName = '';
    input.value = folder ? 'new-folder' : 'new.tex';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label',folder ? t('新建目录名称','New folder name') : t('新建文件名称','New file name'));
    const error = document.createElement('small');
    error.setAttribute('role','alert');
    row.append(input,error);
    parent.append(row);
    let pending = false;
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      row.remove();
      resolve(result);
    }
    row.addEventListener('submit',async event => {
      event.preventDefault();
      if (settled || pending) return;
      pending = true;
      input.disabled = true;
      error.textContent = '';
      try { finish(await submit(input.value.trim())); }
      catch (failure) {
        pending = false;
        input.disabled = false;
        error.textContent = failure.message;
        input.focus();
      }
    });
    input.addEventListener('keydown',event => {
      event.stopPropagation();
      if (event.key === 'Escape' && !pending) { event.preventDefault(); finish(); }
    });
    input.addEventListener('blur',event => {
      if (!pending && !row.contains(event.relatedTarget)) finish();
    });
    input.focus();
    input.select();
  });
}
