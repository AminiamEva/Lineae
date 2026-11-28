import { t } from './i18n.mjs';
import { buildRibbonGroups } from './ribbon-groups.js';

export function installSubfigurePanel({ onUpdate, onUngroup }) {
  const panel = document.createElement('div');
  panel.className = 'tools home-ribbon subfigure-tools';
  panel.hidden = true;
  const fields = document.createElement('div');
  fields.className = 'ribbon-command-grid';

  const row = (labelText, control) => {
    const label = document.createElement('label');
    label.className = 'subfigure-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(span, control);
    fields.append(label);
    return control;
  };

  const width = document.createElement('input');
  width.type = 'text';
  width.placeholder = '0.48\\textwidth';
  width.setAttribute('aria-label', t('子图宽度','Subfigure width'));

  const pos = document.createElement('select');
  pos.setAttribute('aria-label', t('垂直对齐','Vertical alignment'));
  for (const [value,zh,en] of [['c','居中','Center'],['t','顶部','Top'],['b','底部','Bottom']]) {
    pos.append(new Option(t(zh,en),value));
  }

  const captionEnabled = document.createElement('input');
  captionEnabled.type = 'checkbox';
  captionEnabled.setAttribute('aria-label', t('启用子图题注','Enable subfigure caption'));

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.placeholder = 'Caption';
  caption.setAttribute('aria-label', t('子图题注','Subfigure caption'));

  const label = document.createElement('input');
  label.type = 'text';
  label.placeholder = 'fig:name';
  label.setAttribute('aria-label', t('子图标签','Subfigure label'));

  row(t('宽度','Width'), width);
  row(t('垂直对齐','Vertical alignment'), pos);
  row(t('题注','Caption'), captionEnabled);
  row(t('子图题注','Subfigure caption'), caption);
  row(t('标签','Label'), label);

  const ungroup = document.createElement('button');
  ungroup.type = 'button';
  ungroup.className = 'subfigure-ungroup';
  ungroup.dataset.zh = '解除组合';
  ungroup.dataset.en = 'Ungroup';
  ungroup.textContent = t('解除组合','Ungroup');
  ungroup.disabled = true;
  ungroup.addEventListener('click', () => onUngroup?.());
  buildRibbonGroups(panel,[
    {id:'subfigure-fields',zh:'子图与题注',en:'Subfigure & caption',iconName:'image',body:fields},
    {id:'subfigure-grouping',zh:'组合',en:'Grouping',iconName:'selectObjects',body:ungroup},
  ]);

  let syncing = false;
  function setValues(attrs) {
    syncing = true;
    const enabled = Boolean(attrs);
    width.value = attrs?.width ?? '0.48\\textwidth';
    width.disabled = !enabled;
    pos.value = /^[tcb]$/.test(attrs?.pos ?? '') ? attrs.pos : 'c';
    pos.disabled = !enabled;
    captionEnabled.checked = Boolean(attrs?.captionEnabled);
    captionEnabled.disabled = !enabled;
    caption.value = attrs?.caption ?? '';
    caption.disabled = !enabled || !captionEnabled.checked;
    label.value = attrs?.label ?? '';
    label.disabled = !enabled;
    ungroup.disabled = !enabled;
    syncing = false;
  }

  width.addEventListener('change', () => { if (!syncing && width.value.trim()) onUpdate({ width: width.value.trim() }); });
  pos.addEventListener('change', () => { if (!syncing) onUpdate({ pos: pos.value }); });
  captionEnabled.addEventListener('change', () => {
    caption.disabled = !captionEnabled.checked;
    if (!syncing) onUpdate({ captionEnabled: captionEnabled.checked, caption: caption.value });
  });
  caption.addEventListener('change', () => { if (!syncing) onUpdate({ caption: caption.value, captionEnabled: true }); });
  label.addEventListener('change', () => { if (!syncing) onUpdate({ label: label.value || null }); });

  setValues(null);
  return { panel, setValues };
}
