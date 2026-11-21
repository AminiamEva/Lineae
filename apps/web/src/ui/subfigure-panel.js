import { t } from './i18n.mjs';
import { createRibbonGroup } from './ribbon-groups.js';

export function installSubfigurePanel({ onUpdate, onUngroup }) {
  const panel = document.createElement('div');
  panel.className = 'tools home-ribbon subfigure-tools';
  panel.hidden = true;

  const row = (labelText, control) => {
    const label = document.createElement('label');
    label.className = 'subfigure-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(span, control);
    panel.append(label);
    return control;
  };

  const captionEnabled = document.createElement('input');
  captionEnabled.type = 'checkbox';
  captionEnabled.checked = false;

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.placeholder = 'Caption';

  const placement = document.createElement('select');
  for (const value of ['', 'h', 't', 'b', 'p', 'htbp', 'H']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value || 'none';
    placement.append(option);
  }

  const label = document.createElement('input');
  label.type = 'text';
  label.placeholder = 'Label';

  row('题注', captionEnabled);
  row('主图题注', caption);
  row('位置', placement);
  row('标签', label);

  const grouping = createRibbonGroup(panel,{id:'subfigure-grouping',zh:'子图',en:'Subfigure',iconName:'image',width:150});
  const ungroup = document.createElement('button');
  ungroup.type = 'button';
  ungroup.className = 'subfigure-ungroup';
  ungroup.dataset.zh = '解除组合';
  ungroup.dataset.en = 'Ungroup';
  ungroup.textContent = t('解除组合','Ungroup');
  ungroup.disabled = true;
  ungroup.addEventListener('click', () => onUngroup?.());
  grouping.body.append(ungroup);

  let syncing = false;
  function setValues(attrs) {
    syncing = true;
    captionEnabled.checked = Boolean(attrs?.captionEnabled);
    caption.value = attrs?.caption ?? '';
    placement.value = attrs?.placement ?? '';
    label.value = attrs?.label ?? '';
    caption.disabled = !captionEnabled.checked;
    ungroup.disabled = !attrs;
    syncing = false;
  }

  captionEnabled.addEventListener('change', () => {
    caption.disabled = !captionEnabled.checked;
    if (!syncing) onUpdate({ captionEnabled: captionEnabled.checked, caption: caption.value });
  });
  caption.addEventListener('change', () => { if (!syncing) onUpdate({ caption: caption.value, captionEnabled: true }); });
  placement.addEventListener('change', () => { if (!syncing) onUpdate({ placement: placement.value || null, fixed: placement.value === 'H' }); });
  label.addEventListener('change', () => { if (!syncing) onUpdate({ label: label.value || null }); });

  return { panel, setValues };
}
