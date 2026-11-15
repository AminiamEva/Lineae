import {t} from './i18n.mjs';

export function installFloatingToolbar({header,ribbon,sourceView,getAutoHide}) {
  const holder = document.createElement('div');
  holder.className = 'floating-toolbar';
  const button = document.createElement('button');
  button.id = 'toolbar-collapse';
  button.type = 'button';
  button.textContent = 'v';
  holder.append(ribbon,button);
  header.append(holder);

  const lifetime = new AbortController();
  const options = {signal:lifetime.signal};
  let collapsed = false;
  let codeMode = !sourceView.hidden;
  let timer;
  let frame;

  function measure() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bottom = Math.ceil(holder.getBoundingClientRect().bottom) + 6;
      document.documentElement.style.setProperty('--tex-toolbar-bottom',bottom + 'px');
    });
  }
  function label() {
    button.title = collapsed ? t('展开功能区','Show toolbar') : t('折叠功能区','Hide toolbar');
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-expanded',String(!collapsed));
  }
  function collapse(value) {
    clearTimeout(timer);
    collapsed = Boolean(value);
    holder.classList.toggle('is-hidden',collapsed);
    document.body.classList.toggle('toolbar-collapsed',collapsed);
    for (const panel of ribbon.querySelectorAll(':scope > .tools')) panel.inert = collapsed;
    label();
    measure();
  }
  function show() { collapse(false); }
  function scheduleCollapse() {
    clearTimeout(timer);
    if (!getAutoHide()) return;
    timer = setTimeout(() => {
      if (!holder.matches(':hover') && !holder.contains(document.activeElement)) collapse(true);
    },900);
  }
  button.addEventListener('mousedown',event => event.preventDefault(),options);
  button.addEventListener('click',() => collapse(!collapsed),options);
  holder.addEventListener('pointerleave',scheduleCollapse,options);
  holder.addEventListener('pointerenter',() => clearTimeout(timer),options);
  document.addEventListener('focusin',event => {
    if (holder.contains(event.target)) clearTimeout(timer);
    else scheduleCollapse();
  },options);
  document.addEventListener('beforeinput',event => {
    if (getAutoHide() && !holder.contains(event.target)) collapse(true);
  },{...options,capture:true});
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && getAutoHide() && !holder.contains(event.target)) collapse(true);
  },options);

  const geometry = new ResizeObserver(measure);
  geometry.observe(holder);
  const mode = new MutationObserver(() => {
    const next = !sourceView.hidden;
    if (next !== codeMode) { codeMode = next; collapse(getAutoHide()); }
    else measure();
  });
  mode.observe(document.querySelector('.tex-workspace'),{attributes:true,attributeFilter:['hidden']});
  function destroy() {
    lifetime.abort();
    geometry.disconnect();
    mode.disconnect();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  }
  window.addEventListener('pagehide',event => { if (!event.persisted) destroy(); },options);
  collapse(getAutoHide());
  return {button,show,destroy,refresh:() => collapse(getAutoHide()),relocalize:label};
}
