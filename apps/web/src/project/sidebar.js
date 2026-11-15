import {sidebarSection} from '../ui/sidebar-section.js';
import {localize} from '../ui/i18n.mjs';
import {installIncludePanel} from './include-panel.js';

export function createProjectSidebar({panel,title,actions,message,tree,diagnostics,sessions,getProject,openFile,show}) {
  panel.append(title,actions,message);
  const state = {
    getState:() => sessions.preferences().interface.sidebar,
    onToggle:(key,open) => sessions.sidebarChanged(key,open),
  };
  const labels = {
    files:['文件树','File tree'],includes:['文件引用','File includes'],
    outline:['大纲','Outline'],citations:['文献','Citations'],
  };
  const sections = Object.fromEntries(Object.entries(labels).map(([key,label]) => [key,sidebarSection(panel,key,label,state)]));
  sections.files.content.append(diagnostics,tree);
  sections.outline.content.append(sessions.outline.panel);
  sessions.outline.panel.hidden = false;
  const citation = document.createElement('button');
  citation.type = 'button';
  citation.dataset.zh = '管理参考文献';
  citation.dataset.en = 'Manage references';
  citation.addEventListener('click',sessions.citations);
  sections.citations.content.append(citation);
  const includes = installIncludePanel({container:sections.includes.content,getProject,edit:sessions.editIncludes,openFile});
  panel.addEventListener('lineae-show-sidebar',() => show(true));
  function render() {
    includes.render();
    for (const section of Object.values(sections)) section.relocalize();
    localize(sections.citations.content);
  }
  return {sections,includes,render};
}
