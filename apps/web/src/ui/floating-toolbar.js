import {icon} from '../editor/icons.js';
import {t} from './i18n.mjs';

export function installFloatingToolbar({header,ribbon,tabs,sourceView,getAutoHide}) {
  const holder = document.createElement('div');
  holder.className = 'floating-toolbar';
  const button = document.createElement('button');
  button.id = 'toolbar-collapse';
  button.type = 'button';
  button.append(icon('chevronDown'));
  button.dataset.icon='chevron-down';
  const tabRow = document.createElement('div');
  tabRow.className = 'ribbon-tab-row';
  function scrollControl(direction) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'ribbon-tab-scroll';
    control.dataset.direction = direction < 0 ? 'previous' : 'next';
    control.append(icon(direction < 0 ? 'chevronLeft' : 'chevronRight'));
    control.hidden = true;
    control.addEventListener('click',()=>tabs.scrollBy({left:direction*Math.max(60,tabs.clientWidth*.75)}));
    return control;
  }
  const previous = scrollControl(-1);
  const next = scrollControl(1);
  tabs.before(tabRow);
  tabRow.append(previous,tabs,next,button);
  holder.append(ribbon);
  header.append(holder);

  const lifetime = new AbortController();
  const options = {signal:lifetime.signal};
  let collapsed = false;
  const view = () => sourceView.hidden ? 'document' : sourceView.split ? 'split' : 'source';
  let currentView = view();
  const remembered = new Map();
  let timer;
  let frame;

  function measure() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bottom = Math.ceil(holder.getBoundingClientRect().bottom) + 6;
      document.documentElement.style.setProperty('--tex-toolbar-bottom',bottom + 'px');
    });
  }
  function updateTabOverflow() {
    const available = tabRow.clientWidth - button.offsetWidth - parseFloat(getComputedStyle(tabRow).columnGap);
    const overflow = tabs.scrollWidth > available + 1;
    previous.hidden = next.hidden = !overflow;
    previous.disabled = tabs.scrollLeft <= 1;
    next.disabled = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1;
  }
  function label() {
    previous.setAttribute('aria-label',t('向左浏览工具栏页签','Scroll toolbar tabs left'));
    next.setAttribute('aria-label',t('向右浏览工具栏页签','Scroll toolbar tabs right'));
    button.title = collapsed ? t('展开功能区','Show toolbar') : t('折叠功能区','Hide toolbar');
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-expanded',String(!collapsed));
  }
  function collapse(value) {
    clearTimeout(timer);
    collapsed = Boolean(value);
    remembered.set(currentView,collapsed);
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

  tabs.addEventListener('scroll',updateTabOverflow,options);
  const tabChanges = new MutationObserver(updateTabOverflow);
  tabChanges.observe(tabs,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  const geometry = new ResizeObserver(() => { measure(); updateTabOverflow(); });
  geometry.observe(holder);
  const mode = new MutationObserver(() => {
    const next = view();
    if (next !== currentView) {
      currentView = next;
      collapse(remembered.get(next) ?? getAutoHide());
    }
    else measure();
  });
  mode.observe(document.querySelector('.tex-workspace'),{attributes:true,attributeFilter:['hidden','class']});
  function destroy() {
    lifetime.abort();
    geometry.disconnect();
    tabChanges.disconnect();
    mode.disconnect();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  }
  window.addEventListener('pagehide',event => { if (!event.persisted) destroy(); },options);
  collapse(getAutoHide());
  // Importing preferences is an explicit reset, so the remembered choices go too.
  function refresh() { remembered.clear(); collapse(getAutoHide()); }
  return {button,show,destroy,refresh,relocalize:label};
}
