import { t } from './i18n.mjs';
import { PAGE_FIELD, LEFTMARK_FIELD, RIGHTMARK_FIELD } from '../../latex/page-furniture.mjs';

const SLOTS = ['left', 'center', 'right'];
const tokenPattern = {
  [PAGE_FIELD]: '\\thepage',
  [LEFTMARK_FIELD]: '\\leftmark',
  [RIGHTMARK_FIELD]: '\\rightmark',
};

function label(element, zh, en) {
  element.dataset.zh = zh;
  element.dataset.en = en;
  element.textContent = t(zh,en);
  return element;
}

function displayValue(value) {
  return String(value ?? '').replace(/@@lineae-(?:page|leftmark|rightmark)@@/g, token => tokenPattern[token] ?? '');
}

function stateValue(value) {
  return String(value ?? '')
    .replace(/\\thepage\b/g, PAGE_FIELD)
    .replace(/\\leftmark\b/g, LEFTMARK_FIELD)
    .replace(/\\rightmark\b/g, RIGHTMARK_FIELD);
}

export function installHeaderFooterPanel({readState, onChange}) {
  const panel = document.createElement('div');
  panel.className = 'tools header-footer-tools';
  panel.hidden = true;

  const intro = document.createElement('p');
  intro.className = 'hf-intro';
  label(intro,'页眉页脚编辑模式：正文作为上下文参考，修改会写成 fancyhdr 声明。','Header/footer mode: the body is context only; edits are written as fancyhdr declarations.');

  const switches = document.createElement('div');
  switches.className = 'hf-switches';
  const enable = document.createElement('button');
  enable.type = 'button';
  enable.className = 'hf-switch';
  enable.setAttribute('role','switch');
  label(enable,'启用页眉页脚','Enable header/footer');
  const oddEven = document.createElement('button');
  oddEven.type = 'button';
  oddEven.className = 'hf-switch';
  oddEven.setAttribute('role','switch');
  label(oddEven,'奇偶页不同','Different odd/even');
  switches.append(enable, oddEven);

  const grid = document.createElement('div');
  grid.className = 'hf-grid';
  const cells = new Map();
  for (const region of ['header','footer']) {
    const row = document.createElement('div');
    row.className = 'hf-row';
    const rowLabel = document.createElement('div');
    rowLabel.className = 'hf-row-label';
    label(rowLabel,region === 'header' ? '页眉' : '页脚',region === 'header' ? 'Header' : 'Footer');
    row.append(rowLabel);
    for (const slot of SLOTS) {
      const cell = document.createElement('label');
      cell.className = 'hf-cell';
      const title = document.createElement('span');
      title.className = 'hf-cell-label';
      label(title,{left:'左',center:'中',right:'右'}[slot],{left:'Left',center:'Center',right:'Right'}[slot]);
      const odd = document.createElement('input');
      odd.type = 'text';
      odd.dataset.region = region;
      odd.dataset.slot = slot;
      odd.dataset.parity = 'odd';
      odd.spellcheck = false;
      odd.placeholder = t('奇数页','Odd page');
      const even = document.createElement('input');
      even.type = 'text';
      even.dataset.region = region;
      even.dataset.slot = slot;
      even.dataset.parity = 'even';
      even.spellcheck = false;
      even.placeholder = t('偶数页','Even page');
      cell.append(title,odd,even);
      row.append(cell);
      cells.set(`${region}:${slot}`,{odd,even});
    }
    grid.append(row);
  }

  const fields = document.createElement('div');
  fields.className = 'hf-fields';
  const fieldsLabel = document.createElement('span');
  label(fieldsLabel,'插入动态字段：','Insert dynamic field:');
  const pageField = document.createElement('button');
  pageField.type='button';pageField.textContent='\\thepage';
  const leftField = document.createElement('button');
  leftField.type='button';leftField.textContent='\\leftmark';
  const rightField = document.createElement('button');
  rightField.type='button';rightField.textContent='\\rightmark';
  pageField.title = t('插入页码','Insert page number');
  pageField.setAttribute('aria-label',pageField.title);
  leftField.title = t('插入章节名','Insert section name');
  leftField.setAttribute('aria-label',leftField.title);
  rightField.title = t('插入书名','Insert book title');
  rightField.setAttribute('aria-label',rightField.title);
  fields.append(fieldsLabel,pageField,leftField,rightField);

  const rules = document.createElement('div');
  rules.className = 'hf-rules';
  function ruleControl(region,labelZh,labelEn) {
    const group = document.createElement('div');
    group.className = 'hf-rule';
    const title = document.createElement('span');
    label(title,labelZh,labelEn);
    const width = document.createElement('select');
    for (const value of ['0pt','0.2pt','0.4pt','0.8pt','1pt','1.5pt']) width.append(new Option(value,value));
    const color = document.createElement('input');
    color.type = 'color';
    color.value = '#000000';
    width.dataset.region = region;
    width.dataset.rule = 'width';
    color.dataset.region = region;
    color.dataset.rule = 'color';
    group.append(title,width,color);
    return group;
  }
  rules.append(ruleControl('header','页眉线','Header rule'),ruleControl('footer','页脚线','Footer rule'));

  const scope = document.createElement('label');
  scope.className = 'hf-scope';
  const scopeLabel = document.createElement('span');
  label(scopeLabel,'作用范围：','Scope:');
  const scopeSelect = document.createElement('select');
  scopeSelect.append(new Option(t('应用于全文','Apply to document'),'document'),new Option(t('应用于本节','Apply to section'),'section'));
  scope.append(scopeLabel,scopeSelect);

  panel.append(intro,switches,grid,fields,rules,scope);

  let state = null;
  let active = false;
  let lastInput = null;

  function emit() {
    if (!state) return;
    onChange?.(structuredClone(state));
  }

  function render() {
    if (!state) return;
    enable.setAttribute('aria-pressed',String(Boolean(state.enabled)));
    oddEven.setAttribute('aria-pressed',String(Boolean(state.oddEven)));
    for (const [key,cell] of cells) {
      const [region,slot] = key.split(':');
      const pair = state[region]?.[slot] ?? {odd:'',even:''};
      cell.odd.value = displayValue(pair.odd);
      cell.even.value = displayValue(pair.even);
      cell.even.hidden = !state.oddEven;
      cell.even.classList.toggle('is-hidden',!state.oddEven);
    }
    rules.querySelectorAll('select').forEach(select => {
      const value = state.rules?.[select.dataset.region === 'header' ? 'headWidth' : 'footWidth'] ?? '0pt';
      if (![...select.options].some(option => option.value === value)) select.append(new Option(value,value));
      select.value = value;
    });
    rules.querySelectorAll('input[type=color]').forEach(input => {
      input.value = state.rules?.[input.dataset.region === 'header' ? 'headColor' : 'footColor'] ?? '#000000';
    });
    scopeSelect.value = state.scope === 'section' ? 'section' : 'document';
  }

  function refresh() {
    state = readState();
    render();
  }

  function updateInput(input) {
    state[input.dataset.region][input.dataset.slot][input.dataset.parity] = stateValue(input.value);
    if (!state.oddEven) {
      const pair = state[input.dataset.region][input.dataset.slot];
      if (input.dataset.parity === 'odd') pair.even = pair.odd;
      else pair.odd = pair.even;
    }
    emit();
  }

  panel.addEventListener('input', event => {
    if (!event.target.matches('.hf-cell input')) return;
    updateInput(event.target);
  });
  panel.addEventListener('focusin', event => {
    if (event.target.matches('.hf-cell input')) lastInput = event.target;
  });
  enable.addEventListener('click', () => {
    state.enabled = !state.enabled;
    render();
    emit();
  });
  oddEven.addEventListener('click', () => {
    state.oddEven = !state.oddEven;
    if (!state.oddEven) {
      for (const region of ['header','footer']) for (const slot of SLOTS) {
        state[region][slot].even = state[region][slot].odd;
      }
    }
    render();
    emit();
  });
  function insert(text) {
    const input = lastInput ?? cells.values().next().value?.odd;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(text,start,end,'end');
    input.focus();
    updateInput(input);
  }
  pageField.addEventListener('click', () => insert('\\thepage'));
  leftField.addEventListener('click', () => insert('\\leftmark'));
  rightField.addEventListener('click', () => insert('\\rightmark'));
  rules.addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.region !== 'header' && target.dataset.region !== 'footer') return;
    if (target.dataset.rule === 'width') {
      if (target.dataset.region === 'header') state.rules.headWidth = target.value;
      else state.rules.footWidth = target.value;
    } else {
      if (target.dataset.region === 'header') state.rules.headColor = target.value;
      else state.rules.footColor = target.value;
    }
    emit();
  });
  scopeSelect.addEventListener('change', () => {
    state.scope = scopeSelect.value === 'section' ? 'section' : 'document';
    emit();
  });

  return {
    panel,
    refresh,
    get active() { return active; },
    enter() {
      active = true;
      refresh();
      requestAnimationFrame(() => cells.values().next().value?.odd.focus());
    },
    leave() {
      active = false;
      lastInput = null;
    },
  };
}
