import { parseDelimiterPair } from '../../latex/delimiters.mjs';
import { t } from '../ui/i18n.mjs';

const DELIMITER_KEY = /^[()[\]{}.|]$/;

function readInlineDelimiterPair(formulaView, rightFirst) {
  return new Promise(resolve => {
    const field = formulaView.querySelector('math-field');
    const root = field?.shadowRoot;
    const findCaret = () => root?.querySelector('.ML__caret, .ML__text-caret, .ML__latex-caret');
    const caret = findCaret();
    if (!caret) { resolve(null); return; }
    const ghost = document.createElement('span');
    ghost.className = 'delimiter-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const slot = document.createElement('span');
    slot.className = 'delimiter-ghost-slot';
    const other = document.createElement('span');
    other.className = 'delimiter-ghost-slot';
    ghost.append(slot, other);
    // Place the preview in the MathLive row so the matrix measures its width.
    caret.before(ghost);

    const values = ['', ''];
    const order = rightFirst ? [1, 0] : [0, 1];
    let filled = 0;
    const controllers = new AbortController();
    const { signal } = controllers;
    const slots = [slot, other];
    const paint = () => {
      slots.forEach((element, index) => {
        element.textContent = values[index];
        element.classList.toggle('is-active', order[filled] === index);
      });
    };
    const close = pair => {
      controllers.abort();
      observer.disconnect();
      ghost.remove();
      resolve(pair);
    };
    const submit = () => {
      const pair = parseDelimiterPair(`${values[0]} ${values[1]}`);
      if (!pair) return false;
      close(pair);
      return true;
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(null);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (filled > 0) {
          values[order[filled - 1]] = '';
          filled--;
          paint();
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        submit();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      if (!DELIMITER_KEY.test(event.key)) {
        close(null);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (filled >= order.length) return;
      values[order[filled]] = event.key;
      filled++;
      paint();
      if (filled === order.length) submit();
    };
    window.addEventListener('keydown', onKeyDown, { capture:true, signal });
    document.addEventListener('pointerdown', event => {
      if (!ghost.contains(event.target)) close(null);
    }, { capture:true, signal });
    field.addEventListener('blur', () => close(null), { signal });
    // MathLive can replace the entire rendered row after focusing the field.
    const observer = new MutationObserver(() => {
      if (!root.contains(ghost)) findCaret()?.before(ghost);
    });
    observer.observe(root, { subtree:true, childList:true });
    paint();
  });
}

export function readDelimiterPair(anchor, rightFirst, formulaView) {
  if (formulaView) return readInlineDelimiterPair(formulaView, rightFirst);
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
