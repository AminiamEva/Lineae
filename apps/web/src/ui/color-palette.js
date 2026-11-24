import { t } from './i18n.mjs';

// xcolor's base colors, with the RGB values defined by xcolor.sty (not the CSS
// names, which differ for green, gray, brown, orange, purple, violet, ...).
export const LATEX_COLOR_SWATCHES = [
  { name: 'red', hex: '#FF0000' },
  { name: 'orange', hex: '#FF8000' },
  { name: 'brown', hex: '#BF8040' },
  { name: 'yellow', hex: '#FFFF00' },
  { name: 'olive', hex: '#808000' },
  { name: 'lime', hex: '#BFFF00' },
  { name: 'green', hex: '#00FF00' },
  { name: 'teal', hex: '#008080' },
  { name: 'cyan', hex: '#00FFFF' },
  { name: 'blue', hex: '#0000FF' },
  { name: 'violet', hex: '#800080' },
  { name: 'purple', hex: '#BF0040' },
  { name: 'magenta', hex: '#FF00FF' },
  { name: 'pink', hex: '#FFBFBF' },
  { name: 'black', hex: '#000000' },
  { name: 'darkgray', hex: '#404040' },
  { name: 'gray', hex: '#808080' },
  { name: 'lightgray', hex: '#BFBFBF' },
  { name: 'white', hex: '#FFFFFF' },
];

export const LATEX_COLOR_NAMES = LATEX_COLOR_SWATCHES.map(color => color.name);

export function latexColorHex(name) {
  return LATEX_COLOR_SWATCHES.find(color => color.name === name)?.hex ?? null;
}

export function openColorPalette({ anchor, value = '', allowAuto = false, onPick, onAuto } = {}) {
  const popover = document.createElement('div');
  popover.className = 'color-popover';
  popover.setAttribute('role', 'dialog');

  const close = () => {
    if (!popover.isConnected) return;
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    popover.remove();
  };
  const onDown = event => { if (!popover.contains(event.target) && event.target !== anchor) close(); };
  const onKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  };

  if (allowAuto) {
    const auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'color-popover-auto';
    const chip = document.createElement('span');
    chip.className = 'color-auto-chip';
    const label = document.createElement('span');
    label.textContent = t('自动', 'Auto');
    auto.append(chip, label);
    auto.title = t('自动（跟随主题）', 'Auto (follows the theme)');
    auto.addEventListener('click', () => { onAuto?.(); close(); });
    popover.append(auto);
  }

  const grid = document.createElement('div');
  grid.className = 'color-popover-grid';
  const current = String(value || '').toLowerCase();
  for (const { name, hex } of LATEX_COLOR_SWATCHES) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.dataset.color = name;
    swatch.dataset.hex = hex;
    swatch.style.background = hex;
    swatch.title = `${name} ${hex}`;
    swatch.setAttribute('aria-label', name);
    if (current === hex.toLowerCase()) swatch.classList.add('is-active');
    swatch.addEventListener('click', () => { onPick?.(hex, name); close(); });
    grid.append(swatch);
  }
  popover.append(grid);

  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 'color-popover-custom';
  custom.textContent = t('调色盘…', 'Custom…');
  const input = document.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  input.hidden = true;
  input.addEventListener('change', () => { onPick?.(input.value, null); close(); });
  custom.addEventListener('click', () => input.click());
  popover.append(custom, input);

  document.body.append(popover);
  const rect = anchor?.getBoundingClientRect?.();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let left = rect?.left ?? 8;
  let top = (rect?.bottom ?? 0) + 6;
  if (top + height > window.innerHeight - 8) top = Math.max(8, (rect?.top ?? 0) - height - 6);
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
  return { close, element: popover };
}
