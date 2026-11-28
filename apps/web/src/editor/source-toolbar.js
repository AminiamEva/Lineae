import { ribbonFlyoutFor } from '../ui/ribbon-groups.js';
import { toolbarSnippets, commandSnippets, environmentSnippet } from './latex-snippets.js';

export function installSourceToolbar({groups, source, rich, heading}) {
  let target = 'source';
  const disabled = new Map();
  const templates = {...toolbarSnippets,
    '▦':environmentSnippet('table'), figure:environmentSnippet('figure'),
    Image:environmentSnippet('figure'), '图片':environmentSnippet('figure'),
    code:'\\texttt{${1}}', quote:environmentSnippet('quote'), hr:'\\hrule',
    toc:'\\tableofcontents', 'equation label':'\\label{eq:${1}}',
    'align*':environmentSnippet('align*'),
    'Code block':environmentSnippet('verbatim'), '代码块':environmentSnippet('verbatim'),
  };
  for (const [name,[template]] of Object.entries(commandSnippets)) templates[name] = template;
  const key = control => control.dataset.sourceAction;
  const isSource = () => !source.hidden && (!source.split || target === 'source');
  function refresh() {
    const active = isSource();
    for (const [name, group] of Object.entries(groups)) {
      if (name === 'files') continue;
      group.inert = false;
      const controls = [...group.querySelectorAll('button,input,select')];
      const flyout = ribbonFlyoutFor(group);
      if (flyout) controls.push(...flyout.querySelectorAll('button,input,select'));
      for (const control of controls) {
        if (control.classList.contains('ribbon-group-toggle')) continue;
        const supported = name === 'layout' || control === heading || ['↶','↷','Find','查找'].includes(key(control)) || Object.hasOwn(templates,key(control));
        const preambleControl = ['title','author','short','cite'].includes(key(control));
        if ((active && !supported) || (!source.hidden && !active && preambleControl)) {
          if (!disabled.has(control)) disabled.set(control,control.disabled);
          control.disabled = true;
          control.dataset.sourceUnavailable = 'true';
        } else if (disabled.has(control)) {
          control.disabled = disabled.get(control); disabled.delete(control);
          delete control.dataset.sourceUnavailable;
        }
      }
    }
  }
  document.addEventListener('click', event => {
    const control = event.target.closest?.('button');
    if (!control || control.classList.contains('ribbon-group-toggle')) return;
    const owner = Object.entries(groups).find(([,panel]) =>
      panel.contains(control) || ribbonFlyoutFor(panel)?.contains(control));
    if (!owner) return;
    if (!source.hidden && ['↶','↷'].includes(key(control))) {
      event.preventDefault(); event.stopImmediatePropagation();
      key(control) === '↶' ? source.undo() : source.redo(); source.flush(); return;
    }
    if (!isSource()) return;
    if (owner[0] === 'files' || owner[0] === 'layout') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action = key(control);
    if (action === '↶') source.undo();
    else if (action === '↷') source.redo();
    else if (action === 'Find' || action === '查找') source.find();
    else if (Object.hasOwn(templates,action)) source.insertLatexSnippet({text:templates[action]});
  }, true);
  heading.addEventListener('change', event => {
    if (!isSource()) return;
    event.stopImmediatePropagation();
    const name = ['','section','subsection','subsubsection'][Number(heading.value)];
    if (name) source.insertLatexSnippet({text:commandSnippets[name][0]});
  }, true);
  document.addEventListener('focusin', event => {
    if (event.target.closest?.('.tex-code')) target = 'source';
    else if (rich.contains(event.target)) target = 'rich';
    refresh();
  });
  return {refresh, sourceTarget() {target='source';refresh();}};
}
