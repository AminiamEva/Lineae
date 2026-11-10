import { t } from '../ui/i18n.mjs';
import { popIn } from '../ui/motion.mjs';

export function chooseReference(labels) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'editor-dialog reference-dialog';
    const title = document.createElement('label');
    title.textContent = t('引用索引','Reference index');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = t('搜索或输入新标签键','Search or enter a new label key');
    const list = document.createElement('select');
    list.size = 9;
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('取消','Cancel');
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = t('插入引用','Insert reference');
    actions.append(cancel, confirm);
    form.append(title, search, list, actions);
    backdrop.append(form);

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const visible = labels.filter(label => !query || label.key.toLowerCase().includes(query) || label.title.toLowerCase().includes(query));
      list.replaceChildren(...visible.map(label => new Option(
        (label.number ? label.number + '  ' : '') + label.key + (label.title ? ' — ' + label.title : ''),
        label.key,
      )));
      confirm.disabled = visible.length === 0 && !search.value.trim();
    };
    const close = value => { backdrop.remove(); resolve(value); };
    search.addEventListener('input', render);
    cancel.addEventListener('click', () => close(null));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(null); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const key = list.value || search.value.trim();
      if (key) close(key);
    });
    document.body.append(backdrop);
    popIn(form, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    render();
    search.focus();
  });
}
