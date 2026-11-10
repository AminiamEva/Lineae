import { parseDelimiterPair } from '../../latex/delimiters.mjs';
import { t } from '../ui/i18n.mjs';

export function readDelimiterPair(anchor, rightFirst) {
  return new Promise(resolve => {
    const form = document.createElement('form');
    form.className = 'delimiter-input';
    form.setAttribute('aria-label', t('公式定界符', 'Formula delimiters'));
    const makeInput = (label, hint) => {
      const input = document.createElement('input');
      input.placeholder = hint;
      input.setAttribute('aria-label', label);
      input.autocomplete = 'off';
      return input;
    };
    const left = makeInput(t('左定界符','Left delimiter'), '(');
    const right = makeInput(t('右定界符','Right delimiter'), ')');
    const first = rightFirst ? right : left;
    const second = rightFirst ? left : right;
    const tip = document.createElement('small');
    tip.textContent = t('输入两端，点表示隐藏', 'Type both sides. A dot hides one side.');
    form.append(left, right, tip);
    const controller = new AbortController();
    const options = { signal:controller.signal };
    function finish(pair) {
      controller.abort();
      form.remove();
      resolve(pair);
    }
    function submit() {
      const pair = parseDelimiterPair(`${left.value} ${right.value}`);
      if (pair) finish(pair);
    }
    first.addEventListener('input', () => {
      if (/^[()[\]{}.]$/.test(first.value)) second.focus();
    }, options);
    second.addEventListener('input', () => {
      if (/^[()[\]{}.]$/.test(second.value)) submit();
    }, options);
    form.addEventListener('submit', event => { event.preventDefault(); submit(); }, options);
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.target === first && !second.value) second.focus();
        else submit();
      }
    }, options);
    document.addEventListener('pointerdown', event => {
      if (!form.contains(event.target)) finish(null);
    }, { ...options, capture:true });
    window.addEventListener('resize', () => finish(null), options);
    document.body.append(form);
    const bounds = form.getBoundingClientRect();
    form.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
    form.style.top = `${anchor.bottom + bounds.height + 8 < innerHeight ? anchor.bottom + 4 : Math.max(8,anchor.top - bounds.height - 4)}px`;
    first.focus();
  });
}
