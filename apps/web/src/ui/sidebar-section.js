import {t} from './i18n.mjs';

export function sidebarSection(parent,key,labels,{getState,onToggle}) {
  const section = document.createElement('details');
  section.id = 'sidebar-' + key;
  section.className = 'sidebar-section';
  const summary = document.createElement('summary');
  const content = document.createElement('div');
  content.className = 'sidebar-section-content';
  section.append(summary,content);
  parent.append(section);

  function synchronize() {
    summary.textContent = t(...labels);
    const wanted = getState()[key] !== false;
    if (section.open !== wanted) section.open = wanted;
  }
  section.addEventListener('toggle',() => {
    if (section.isConnected && (getState()[key] !== false) !== section.open) onToggle(key,section.open);
  });
  synchronize();
  return {section,content,relocalize:synchronize};
}
