import {t} from './i18n.mjs';
export function sidebarSection(panel,key,labels,{getState,onToggle}){
  const section=document.createElement('details');section.className='sidebar-section';section.id='sidebar-'+key;
  const summary=document.createElement('summary');summary.textContent=t(...labels);section.append(summary);
  const content=document.createElement('div');content.className='sidebar-section-content';section.append(content);
  section.open=getState()[key]!==false;panel.append(section);
  section.addEventListener('toggle',()=>{if(section.isConnected && getState()[key]!==section.open)onToggle(key,section.open);});
  return {section,content,relocalize(){summary.textContent=t(...labels);section.open=getState()[key]!==false;}};
}
