import {t} from './i18n.mjs';

const names = {auto:'Auto', lualatex:'LuaLaTeX', xelatex:'XeLaTeX'};
const location = e => e.file+':'+e.line+':'+e.column+' '+e.command+(e.detail?' '+e.detail:'');

// The draft belongs to this rendering of Settings. Only Apply persists it.
export function engineFields(group, defaultControl, getState) {
  const select = document.createElement('select');
  select.id = 'engine-choice';
  for (const [value,name] of Object.entries(names)) select.add(new Option(name,value));
  const label = document.createElement('label');
  label.className = 'setting-row';
  label.htmlFor = select.id;
  const title = document.createElement('span');
  label.append(title,select);
  const status = document.createElement('output');
  status.id = 'engine-resolution';
  status.setAttribute('aria-live','polite');
  const issues = document.createElement('ul');
  issues.id = 'engine-diagnostics';
  select.setAttribute('aria-describedby',status.id+' '+issues.id);
  const hint = document.createElement('p');
  hint.textContent = t('Auto 未检测到明确引擎时使用。','Used when Auto finds no engine requirement.');
  hint.id = 'default-engine-help';
  defaultControl.setAttribute('aria-describedby',hint.id);
  group.querySelector('.setting-row').before(label,status,issues);
  group.append(hint);

  let draft;
  function update() {
    const {result,project,error,choice,globalDefault} = getState(draft,defaultControl.value);
    const {resolvedEngine,reason,evidence,diagnostics} = result;
    title.textContent = project?t('当前工程引擎','Current project engine'):t('当前文档引擎','Current document engine');
    select.value = draft ?? choice;
    const reasons = {default:t('全局默认','Global default'),explicit:t('手动选择','Explicit choice'),
      dependency:t('检测到专属依赖','Engine-specific dependency'),magic:t('源文件声明','Source directive'),
      conflict:t('引擎声明冲突','Conflicting engine requirements')};
    const deciding = evidence.find(e=>e.engine===resolvedEngine && e.kind===reason);
    const pending = select.value!==choice || (select.value==='auto' && defaultControl.value!==globalDefault);
    const prefix = pending?t('应用后','After Apply'):t('当前使用','Currently using');
    status.textContent = prefix+' '+(names[resolvedEngine] ?? t('待选择','Unresolved'))+' · '+reasons[reason]+
      (deciding?' · '+location(deciding):'')+(error?' · '+error:'');
    issues.replaceChildren(...diagnostics.map(d=>{
      const item = document.createElement('li');
      item.textContent = location(d)+' · '+t('需要','requires')+' '+names[d.engine];
      return item;
    }));
    issues.hidden = !diagnostics.length;
  }
  select.addEventListener('change',()=>{ draft=select.value; update(); });
  defaultControl.addEventListener('change',update);
  update();
  return {update, get choice(){return draft;}};
}
