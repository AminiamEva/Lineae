import {t} from './i18n.mjs';

const names={auto:'Auto',lualatex:'LuaLaTeX',xelatex:'XeLaTeX'};
export function createEnginePanel(change) {
  const panel=document.createElement('details');
  panel.className='engine-panel';
  const summary=document.createElement('summary');
  const body=document.createElement('div');
  const label=document.createElement('label');
  const select=document.createElement('select');
  select.id='engine-choice'; label.htmlFor=select.id;
  for (const [key,name] of Object.entries(names)) select.add(new Option(name,key));
  const status=document.createElement('output');status.id='engine-resolution';
  status.setAttribute('aria-live','polite');
  const issues=document.createElement('ul');
  body.append(label,select,status,issues); panel.append(summary,body);
  select.onchange=()=>change(select.value);
  function update(result,project,error='') {
    const {requestedChoice,resolvedEngine,reason,evidence,diagnostics}=result;
    const reasons={default:t('全局默认','Global default'),explicit:t('手动选择','Explicit choice'),
      dependency:t('检测到专属依赖','Engine-specific dependency'),magic:t('源文件声明','Source directive'),
      conflict:t('引擎声明冲突','Conflicting engine requirements')};
    label.textContent=project?t('工程排版引擎','Project typesetting engine'):t('文档排版引擎','Document typesetting engine');
    select.value=requestedChoice;
    const engine=names[resolvedEngine] ?? t('待选择','Unresolved');
    summary.textContent=t('引擎','Engine')+' · '+(requestedChoice==='auto'?'Auto → ':'')+engine;
    const deciding=evidence.find(e=>e.engine===resolvedEngine && e.kind===reason);
    const location=e=>e.file+':'+e.line+':'+e.column+' '+e.command+(e.detail?' '+e.detail:'');
    const message=reasons[reason]+(deciding?' · '+location(deciding):'')+(error?' · '+error:'');
    if(status.textContent!==message)status.textContent=message;
    summary.title=message;
    issues.replaceChildren(...diagnostics.map(d=>{
      const item=document.createElement('li');
      item.textContent=location(d)+' · '+t('需要','requires')+' '+names[d.engine];
      return item;
    }));
    issues.hidden=!diagnostics.length;
    if(diagnostics.length)summary.textContent+=' ⚠ '+diagnostics.length;
  }
  return {panel,update};
}
