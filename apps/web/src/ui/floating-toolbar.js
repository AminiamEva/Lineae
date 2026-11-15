import {t} from './i18n.mjs';
export function installFloatingToolbar({header,ribbon,sourceView,getAutoHide}){
  const holder=document.createElement('div');holder.className='floating-toolbar';
  const button=document.createElement('button');button.type='button';button.id='toolbar-collapse';
  holder.append(ribbon,button);header.append(holder);
  let hidden=false,timer,sourceActive=!sourceView.hidden;
  function measure(){document.documentElement.style.setProperty('--tex-toolbar-bottom',sourceView.hidden?Math.ceil(header.getBoundingClientRect().bottom)+'px':'0px');}
  function setHidden(value){
    hidden=Boolean(value);holder.classList.toggle('is-hidden',hidden);ribbon.inert=hidden;
    document.body.classList.toggle('toolbar-collapsed',hidden);
    button.textContent=hidden?'v':'⌃';button.title=hidden?t('显示工具栏','Show toolbar'):t('隐藏工具栏','Hide toolbar');
    button.setAttribute('aria-label',button.title);button.setAttribute('aria-expanded',String(!hidden));measure();
  }
  function show(){clearTimeout(timer);setHidden(false);}
  function hideLater(){clearTimeout(timer);if(getAutoHide())timer=setTimeout(()=>{if(!holder.matches(':hover')&&!holder.contains(document.activeElement))setHidden(true);},900);}
  button.addEventListener('mousedown',event=>event.preventDefault());button.onclick=()=>hidden?show():setHidden(true);
  holder.addEventListener('pointerenter',()=>{if(!hidden)show();});holder.addEventListener('pointerleave',hideLater);
  document.addEventListener('pointermove',event=>{if(event.clientY<=6)show();});
  document.addEventListener('focusin',event=>{if(holder.contains(event.target))show();else hideLater();});
  document.addEventListener('beforeinput',event=>{if(!holder.contains(event.target)&&getAutoHide())setHidden(true);},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!holder.contains(event.target)&&getAutoHide())setHidden(true);});
  const observer=new ResizeObserver(measure);observer.observe(holder);
  const modeObserver=new MutationObserver(()=>{const next=!sourceView.hidden;if(next!==sourceActive){sourceActive=next;clearTimeout(timer);setHidden(getAutoHide());}measure();});modeObserver.observe(document.querySelector('.tex-workspace'),{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pagehide',event=>{if(!event.persisted){observer.disconnect();modeObserver.disconnect();clearTimeout(timer);}});
  setHidden(getAutoHide());return {button,show,refresh(){clearTimeout(timer);setHidden(getAutoHide());},relocalize(){setHidden(hidden);}};
}
