import {t} from '../ui/i18n.mjs';
export function promptTreeEntry({parent,folder,submit}){
  return new Promise(resolve=>{
    const row=document.createElement('form');row.className='project-inline-entry';
    const input=document.createElement('input');input.dataset.projectName='';input.value=folder?'new-folder':'new.tex';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label',folder?t('新建目录名称','New folder name'):t('新建文件名称','New file name'));
    const error=document.createElement('small');error.setAttribute('role','alert');row.append(input,error);parent.append(row);let done=false;
    function cancel(){if(done)return;done=true;row.remove();resolve();}
    row.onsubmit=async event=>{event.preventDefault();if(done||input.disabled)return;input.disabled=true;try{await submit(input.value.trim());cancel();}catch(e){input.disabled=false;error.textContent=e.message;input.focus();}};
    input.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cancel();}};input.focus();input.select();
  });
}
