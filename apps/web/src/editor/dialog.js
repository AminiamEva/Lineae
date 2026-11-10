import { popIn } from '../ui/motion.mjs';

export function promptDialog({ title, value = '', confirm = '确定 / OK', cancel = '取消 / Cancel' }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'editor-dialog';
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = cancel;
    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.textContent = confirm;
    actions.append(cancelButton, confirmButton);
    form.append(label, input, actions);
    backdrop.append(form);

    const close = result => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(result);
    };
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(null); }
    };
    form.addEventListener('submit', event => { event.preventDefault(); close(input.value); });
    cancelButton.addEventListener('click', () => close(null));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(backdrop);
    popIn(form, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    input.focus();
    input.select();
  });
}

export async function askText(title, value = '') {
  const result = await promptDialog({ title, value });
  return result === null ? null : result.trim();
}
