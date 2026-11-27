import { popIn } from '../ui/motion.mjs';
import { t } from '../ui/i18n.mjs';

export function promptDialog({ title, value = '', confirm, cancel, multiline = false }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'editor-dialog';
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (multiline) {
      input.rows = 12;
      input.spellcheck = false;
      input.setAttribute('aria-label', title);
    } else input.type = 'text';
    input.value = value;
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = cancel ?? t('取消','Cancel');
    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.textContent = confirm ?? t('确定','OK');
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

// A single-button acknowledgement dialog. Enter, Escape and the confirm button
// all mean "acknowledged"; there is no cancel branch.
export function noticeDialog({ title, confirm }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'editor-dialog';
    const label = document.createElement('label');
    label.textContent = title;
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.textContent = confirm ?? t('确定','OK');
    actions.append(confirmButton);
    form.append(label, actions);
    backdrop.append(form);

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve();
    };
    const onKey = event => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    form.addEventListener('submit', event => { event.preventDefault(); close(); });
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(backdrop);
    popIn(form, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    confirmButton.focus();
  });
}

export function confirmDialog({ title, confirm, cancel }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'editor-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'editor-dialog';
    const label = document.createElement('label');
    label.textContent = title;
    const actions = document.createElement('div');
    actions.className = 'editor-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = cancel ?? t('取消','Cancel');
    const confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.textContent = confirm ?? t('确定','OK');
    actions.append(cancelButton, confirmButton);
    form.append(label, actions);
    backdrop.append(form);

    const close = result => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(result);
    };
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); }
    };
    form.addEventListener('submit', event => { event.preventDefault(); close(true); });
    cancelButton.addEventListener('click', () => close(false));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(backdrop);
    popIn(form, { prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
    cancelButton.focus();
  });
}
