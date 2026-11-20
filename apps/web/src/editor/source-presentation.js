import {t} from '../ui/i18n.mjs';

export function labelSourceZoom(button, size) {
  button.textContent = size + 'px';
  button.title = t('恢复源码默认字号：','Reset code font: ') + size + 'px';
  button.setAttribute('aria-label',button.title);
}
export function createPreviewControls({panel,head,preview,onChange,installWheel,signal}) {
  const element = document.createElement('div');
  element.className = 'tex-rich-actions';
  element.setAttribute('role','group');
  const title = document.createElement('span');
  title.className = 'tex-rich-title';
  element.append(title);
  let percentage = 100;
  const controls = [];
  function control(text, labels, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('mousedown',event => event.preventDefault(),{signal});
    button.addEventListener('click',action,{signal});
    controls.push({button,labels});
    element.append(button);
    return button;
  }
  const out = control('−',['缩小页面','Zoom page out'],() => onChange(percentage - 10));
  const reset = control('100%',['恢复页面默认大小','Reset page zoom'],() => onChange(100));
  reset.className = 'tex-rich-zoom-label';
  const more = control('+',['放大页面','Zoom page in'],() => onChange(percentage + 10));
  head.append(element);
  function setZoom(value) {
    percentage = Math.min(300,Math.max(50,Number(value) || 100));
    panel.style.setProperty('--preview-zoom',String(percentage / 100));
    reset.textContent = percentage + '%';
    out.disabled = percentage === 50;
    more.disabled = percentage === 300;
  }
  function relocalize() {
    title.textContent = t('预览','Preview');
    element.setAttribute('aria-label',t('页面缩放','Page zoom'));
    for (const {button,labels} of controls) {
      button.title = t(...labels);
      button.setAttribute('aria-label',button.title);
    }
  }
  installWheel(amount => onChange(percentage + amount * 5));
  preview.addEventListener('keydown',event => {
    if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing) return;
    if (!['+','=','-','0'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(event.key === '0' ? 100 : percentage + (event.key === '-' ? -10 : 10));
  },{signal,capture:true});
  setZoom(100);
  relocalize();
  return {element,setZoom,relocalize};
}
