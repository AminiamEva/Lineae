import {t} from './i18n.mjs';

export function latexCompletion() {
  const menu=document.createElement('div'),filter=document.createElement('input');
  const list=document.createElement('div');
  menu.className='command-menu';
  menu.hidden=true;
  menu.setAttribute('role','dialog');
  list.id='latex-candidates';
  list.className='command-candidates';
  list.setAttribute('role','listbox');
  filter.setAttribute('role','combobox');
  filter.setAttribute('aria-controls',list.id);
  filter.setAttribute('aria-autocomplete','list');
  filter.setAttribute('aria-expanded','false');
  menu.append(filter,list);
  document.body.append(menu);

  function localize() {
    menu.setAttribute('aria-label',t('LaTeX 补全','LaTeX completion'));
    filter.placeholder=t('LaTeX 命令','LaTeX command');
    filter.setAttribute('aria-label',filter.placeholder);
  }
  localize();

  // Hundreds of math command names fit in this list. Keep the full scroll
  // range and keyboard order while mounting only the surrounding options.
  const rowHeight=30, overscan=6;
  list.style.setProperty('--command-row-height',rowHeight+'px');
  let session=null,names=[],matches=[],selected=0,first=-1,last=-1,frame=0;
  function spacer(count) {
    const el=document.createElement('div');
    el.setAttribute('aria-hidden','true');
    el.style.height=count*rowHeight+'px';
    return el;
  }
  function render() {
    const from=Math.max(0,Math.floor(list.scrollTop/rowHeight)-overscan);
    const to=Math.min(matches.length,Math.ceil((list.scrollTop+list.clientHeight)/rowHeight)+overscan);
    if(from===first && to===last)return;
    first=from;last=to;
    const options=document.createDocumentFragment();
    if(from)options.append(spacer(from));
    for(let i=from;i<to;i++){
      const name=matches[i],button=document.createElement('button');
      button.type='button';button.tabIndex=-1;
      button.id='complete-'+name;
      button.dataset.index=i;
      button.textContent='\\'+name;
      button.setAttribute('role','option');
      button.setAttribute('aria-posinset',i+1);
      button.setAttribute('aria-setsize',matches.length);
      button.setAttribute('aria-selected',String(i===selected));
      options.append(button);
    }
    if(to<matches.length)options.append(spacer(matches.length-to));
    if(!matches.length){
      const empty=document.createElement('p');
      empty.textContent=t('无匹配命令','No matching command');
      options.append(empty);
    }
    list.replaceChildren(options);
  }
  function highlight(index) {
    if(!matches.length){filter.removeAttribute('aria-activedescendant');return;}
    const old=list.querySelector('[aria-selected=true]');
    selected=(index+matches.length)%matches.length;
    const top=selected*rowHeight,bottom=top+rowHeight;
    if(top<list.scrollTop)list.scrollTop=top;
    else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
    render();
    old?.setAttribute('aria-selected','false');
    const id='complete-'+matches[selected];
    document.getElementById(id)?.setAttribute('aria-selected','true');
    filter.setAttribute('aria-activedescendant',id);
  }
  function search() {
    const spelling=filter.value.replace(/^\\/,'').replace(/^begin\{([^{}]*)\}?$/,'$1');
    const lower=spelling.toLowerCase();
    matches=names.filter(name=>name.toLowerCase().startsWith(lower));
    if(spelling)matches.sort((a,b)=>Number(b===spelling)-Number(a===spelling) ||
      Number(b.startsWith(spelling))-Number(a.startsWith(spelling)) ||
      Number(b.toLowerCase()===lower)-Number(a.toLowerCase()===lower));
    selected=0;first=last=-1;list.scrollTop=0;
    render();highlight(0);
  }
  function close(restore=false) {
    if(!session)return;
    const owner=session;
    session=null;
    cancelAnimationFrame(frame);frame=0;
    menu.hidden=true;
    filter.setAttribute('aria-expanded','false');
    if(restore && owner.valid())owner.focus();
    owner.dismiss();
  }
  function choose(action) {
    if(!session || !action)return;
    const valid=session.valid();
    close(valid);
    if(valid)action();
  }
  function position() {
    if(!session)return;
    if(!session.valid()){close();return;}
    const anchor=session.anchor();
    const ribbon=document.querySelector('header .ribbon')?.getBoundingClientRect();
    const status=document.querySelector('.document-status')?.getBoundingClientRect();
    const top=Math.max(8,(ribbon?.bottom??0)+4);
    const bottom=Math.min(innerHeight-8,status?.height?status.top-4:innerHeight-8);
    const below=bottom-anchor.bottom-6,above=anchor.top-top-6;
    const goesBelow=below>=260 || below>=above;
    const height=Math.min(260,Math.max(68,goesBelow?below:above),Math.max(68,bottom-top));
    const width=Math.min(320,innerWidth-16);
    menu.style.width=width+'px';menu.style.height=height+'px';
    menu.style.left=Math.max(8,Math.min(anchor.left,innerWidth-width-8))+'px';
    menu.style.top=Math.max(top,Math.min(goesBelow?anchor.bottom+6:anchor.top-height-6,bottom-height))+'px';
  }
  function queuePosition(event) {
    if(!session || frame || (event.target instanceof Node && menu.contains(event.target)))return;
    frame=requestAnimationFrame(()=>{frame=0;position();if(session)render();});
  }
  document.addEventListener('scroll',queuePosition,true);
  window.addEventListener('resize',queuePosition);
  window.addEventListener('lineae-layout',queuePosition);
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();},true);
  document.addEventListener('focusin',event=>{
    if(!session || menu.contains(event.target))return;
    if(session.origin.contains(event.target)){
      const opened=session;
      queueMicrotask(()=>{if(session===opened)filter.focus({preventScroll:true});});
    }else close();
  },true);
  list.addEventListener('scroll',()=>{if(session)render();},{passive:true});
  list.addEventListener('mousedown',event=>event.preventDefault());
  list.addEventListener('click',event=>{
    const button=event.target.closest('button[data-index]');
    if(button && session)choose(session.actions[matches[Number(button.dataset.index)]]);
  });
  filter.addEventListener('input',search);
  filter.addEventListener('keydown',event=>{
    if(!session || event.isComposing || event.keyCode===229)return;
    switch(event.key){
      case '\\':
        if(filter.value || event.ctrlKey || event.altKey || event.metaKey)return;
        event.preventDefault();choose(session.literal);break;
      case 'Escape':
        event.preventDefault();close(true);break;
      case 'Enter':case 'Tab':
        event.preventDefault();choose(session.actions[matches[selected]]);break;
      case 'ArrowDown':case 'ArrowUp':
        event.preventDefault();highlight(selected+(event.key==='ArrowDown'?1:-1));break;
    }
  });
  return {localize,open(owner){
    close();
    session=owner;names=Object.keys(owner.actions);
    menu.hidden=false;
    filter.setAttribute('aria-expanded','true');
    filter.value='';
    position();search();filter.focus({preventScroll:true});
  }};
}
