import { getEntryValue, parseBibFile } from '../../bib/index.mjs';
import { t } from '../ui/i18n.mjs';
import { popIn } from '../ui/motion.mjs';
import { rememberAsset } from './project-assets.js';

function pickBibFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bib,text/plain';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once:true });
    input.addEventListener('cancel', () => resolve(null), { once:true });
    input.click();
  });
}

function chooseCitation(entries) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'editor-dialog citation-dialog';
    const label = document.createElement('label');
    label.textContent = t('插入引用','Insert citation');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('搜索条目','Search entries');
    const list = document.createElement('select');
    list.size = 9;
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('取消','Cancel');
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = t('插入','Insert');
    actions.append(cancel, confirm);
    form.append(label, search, list, actions);
    backdrop.append(form);

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const visible = entries.filter(entry => !query || entry.key.toLowerCase().includes(query) || entry.title.toLowerCase().includes(query));
      list.replaceChildren(...visible.map(entry => new Option(entry.key + ' — ' + entry.title, entry.key)));
      confirm.disabled = visible.length === 0;
    };
    const close = value => { backdrop.remove(); resolve(value); };
    search.addEventListener('input', render);
    cancel.addEventListener('click', () => close(null));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(null); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!list.value) return;
      close(list.value);
    });
    document.body.append(backdrop);
    popIn(form, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    render();
    search.focus();
  });
}

export async function insertCitationDialog() {
  const file = await pickBibFile();
  if (!file) return null;
  const document = await parseBibFile(file);
  rememberAsset(file.name,file);
  const entries = document.entries.map(entry => ({
    key: entry.key,
    title: getEntryValue(entry, 'title', document) || entry.type,
  }));
  if (!entries.length) return null;
  return chooseCitation(entries);
}
