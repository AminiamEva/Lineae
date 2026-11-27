import { t } from './i18n.mjs';
import { analyzeCtexSource } from '../../latex/ctex-source.mjs';

// Footer control that derives its state from the actual source on every
// refresh. It never keeps a separate boolean, so paste/undo/source edits and
// project switches cannot leave the button out of sync.
export function installEnableCtex({ host, before, getSource, hasHan, setEnabled }) {
  const button = document.createElement('button');
  button.id = 'enable-ctex';
  button.type = 'button';
  button.className = 'enable-ctex';
  button.setAttribute('aria-label', 'Enable ctex');
  host.insertBefore(button, before);

  let destroyed = false;
  const state = () => analyzeCtexSource(getSource() || '');

  function relocalize() {
    if (destroyed) return;
    button.textContent = t('启用 ctex', 'Enable ctex');
    button.title = t('启用或关闭 ctex 中文排版支持', 'Toggle ctex Chinese typesetting');
  }
  function refresh() {
    if (destroyed) return;
    const enabled = state().enabled;
    button.dataset.active = String(enabled);
    button.setAttribute('aria-pressed', String(enabled));
    relocalize();
  }
  function toggle() {
    if (destroyed) return;
    const enabled = state().enabled;
    // With any Han text present, disabling is a deliberate no-op: no source
    // change, no dialog and no aria-pressed change.
    if (enabled && hasHan()) return;
    setEnabled(!enabled);
    refresh();
  }
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', toggle);
  refresh();

  return {
    button,
    refresh,
    relocalize,
    destroy() {
      destroyed = true;
      button.remove();
    },
  };
}
