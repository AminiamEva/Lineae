import {t} from '../ui/i18n.mjs';
export function installProjectContextMenu({contextMenu,panel,run}){
  function closeContextMenu() { contextMenu.hidden=true;contextMenu.replaceChildren();delete contextMenu.dataset.path; }
  function contextAction(label,action) {
    const [zh,en]=label;
    const control=document.createElement('button');control.type='button';control.setAttribute('role','menuitem');
    control.dataset.zh=zh;control.dataset.en=en;control.textContent=t(zh,en);
    control.addEventListener('click',()=>{closeContextMenu();run(action);});
    contextMenu.append(control);return control;
  }
  function contextSeparator() {
    const separator=document.createElement('hr');separator.setAttribute('role','separator');contextMenu.append(separator);
  }

  function position(event){
    contextMenu.hidden=false;const target=event.target.getBoundingClientRect(),x=event.clientX||target.left+12,y=event.clientY||target.bottom,bounds=contextMenu.getBoundingClientRect();
    contextMenu.style.left=Math.max(6,Math.min(x,innerWidth-bounds.width-6))+'px';contextMenu.style.top=Math.max(6,Math.min(y,innerHeight-bounds.height-6))+'px';contextMenu.querySelector('button')?.focus({preventScroll:true});
  }
  contextMenu.addEventListener('contextmenu',event=>event.preventDefault());
  contextMenu.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const items=[...contextMenu.querySelectorAll('button')],current=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:items.length-1))%items.length;items[next]?.focus();
  });
  document.addEventListener('pointerdown',event=>{if(!contextMenu.hidden&&!contextMenu.contains(event.target))closeContextMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeContextMenu();});window.addEventListener('resize',closeContextMenu);panel.addEventListener('scroll',closeContextMenu);
  return {close:closeContextMenu,action:contextAction,separator:contextSeparator,position};
}
