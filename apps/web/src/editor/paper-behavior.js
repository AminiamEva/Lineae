import {documentNumbers} from '../../latex/document-numbering.mjs';
import {headingOutline} from '../../latex/heading-numbering.mjs';
import {resolveChineseProfile} from '../../latex/chinese-profile.mjs';
import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { listMarkerCSS } from '../../latex/list-numbering.mjs';
import { t } from '../ui/i18n.mjs';
import { generalTikzPreviewWidget, openTikzStudio, tikzStagingFromPreamble, setTikzPreamble } from '../ui/tikz-studio.js';
import { TikzEditor } from '../tikz/controllers/tikzEditor.js';

function captionNameForPage(){
  const page=document.querySelector('.document-page');
  return page?.dataset.tableName||(page?.dataset.captionLanguage==='zh'?t('表','Table'):'Table');
}

// One caption widget instance per semantic key. The DOM is created once and
// only its text/number/data attributes are updated; async measurement is
// epoch-guarded so stale frames cannot touch a replaced widget.
function createCaptionWidget(caption,number) {
  const element=document.createElement('div');
  element.className='table-caption-widget';
  element.dataset.captionNumbered='true';
  const label=document.createElement('span');
  label.className='table-caption-label';
  const text=document.createElement('span');
  text.className='table-caption-text';
  element.append(label,text);
  let frame=0,epoch=0,currentCaption='',currentSignature='';
  const measure=()=>{
    if(frame)cancelAnimationFrame(frame);
    const token=++epoch,signature=currentSignature;
    frame=requestAnimationFrame(()=>{
      frame=0;
      if(!element.isConnected||token!==epoch||signature!==currentSignature)return;
      const style=getComputedStyle(text);
      const context=document.createElement('canvas').getContext('2d');
      if(!context)return;
      context.font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');
      const labelWidth=label.getBoundingClientRect().width;
      const gap=Number.parseFloat(getComputedStyle(element).columnGap)||0;
      element.dataset.captionStyle=!currentCaption||labelWidth+gap+context.measureText(currentCaption).width<=element.clientWidth+0.5?'single':'multi';
    });
  };
  const update=(nextCaption,nextNumber,signature)=>{
    const numberText=nextNumber==null?'':String(nextNumber);
    if(numberText)label.dataset.captionValue=numberText;else delete label.dataset.captionValue;
    label.dataset.captionName=captionNameForPage();
    if(text.textContent!==nextCaption)text.textContent=nextCaption;
    currentCaption=nextCaption;currentSignature=signature;
    measure();
  };
  update(caption,number,'init');
  return {
    dom:element,
    update,
    destroy(){epoch++;if(frame)cancelAnimationFrame(frame);frame=0;},
  };
}

// Rebuilds the caption decoration set from the current doc while reusing the
// stable-key widget DOM. Only the decoration position is recomputed; the
// signature decides whether the cached widget's text/number must be updated.
function captionState(doc,widgets){
  const decorations=[],seen=new Map(),used=new Set();
  const numbers=documentNumbers(doc).objects;
  const language=typeof document==='undefined'?'':(document.querySelector('.document-page')?.dataset.captionLanguage||'');
  doc.descendants((node,position)=>{
    if(node.type.name!=='table'||!(node.attrs.captionEnabled||node.attrs.caption))return;
    const number=numbers.get(position)?.number;
    const numberText=number==null?'':String(number);
    const captionText=node.attrs.caption??'';
    // The key is semantic and stable across content/language changes: table
    // number, or an occurrence index for repeated unnumbered tables.
    const identity=numberText?`numbered:${numberText}`:'unnumbered';
    const signature=JSON.stringify([numberText,captionText,Boolean(node.attrs.captionEnabled),Boolean(node.attrs.captionNumbered),language]);
    const base=`table-caption:${identity}`;
    const occurrence=seen.get(base)||0;seen.set(base,occurrence+1);
    const key=`${base}:${occurrence}`;used.add(key);
    let widget=widgets.get(key);
    if(!widget){widget=createCaptionWidget(captionText,numberText);widgets.set(key,widget);}
    widget.update(captionText,numberText,signature);
    decorations.push(Decoration.widget(position,()=>widget.dom,{side:-1,key}));
  });
  for(const [key,widget] of widgets)if(!used.has(key)){widget.destroy();widgets.delete(key);}
  return {set:decorations.length?DecorationSet.create(doc,decorations):null};
}

const tableRulePattern=/^\\(?:toprule|midrule|bottomrule|hline|cmidrule)/;
function tableRowEntries(view,position){
  const table=view.state.doc.nodeAt(position),rows=[];
  let offset=1;
  table?.forEach(row=>{rows.push({node:row,pos:position+offset});offset+=row.nodeSize;});
  return rows;
}
function tableCellEntries(row){
  const cells=[];let offset=1;
  row.node.forEach(cell=>{cells.push({node:cell,pos:row.pos+offset});offset+=cell.nodeSize;});
  return cells;
}
function skipColumnGroup(columns,start){
  let depth=0;
  for(let index=start;index<columns.length;index++){
    if(columns[index]==='\\'){index++;continue;}
    if(columns[index]==='{')depth++;
    else if(columns[index]==='}'&&--depth===0)return index+1;
  }
  return columns.length;
}
function columnBoundaries(columns){
  const boundaries=[];let depth=0,rules=0,pending=null,index=0,i=0;
  while(i<columns.length){
    const char=columns[i];
    if(char==='\\'){i+=2;continue;}
    if(char==='{'){depth++;i++;continue;}
    if(char==='}'){depth--;i++;continue;}
    if(depth>0){i++;continue;}
    if(char==='|'){rules++;i++;continue;}
    if(('@!<>'.includes(char))&&columns[i+1]==='{'){if(pending===null)pending=i;i=skipColumnGroup(columns,i+1);continue;}
    if(char==='*'&&columns[i+1]==='{'){if(pending===null)pending=i;boundaries.push({position:pending,rules,index});rules=0;pending=null;index++;i=skipColumnGroup(columns,i+1);if(columns[i]==='{')i=skipColumnGroup(columns,i);continue;}
    boundaries.push({position:pending??i,rules,index});rules=0;pending=null;index++;
    if('pmb'.includes(char)&&columns[i+1]==='{')i=skipColumnGroup(columns,i+1);
    else i++;
  }
  boundaries.push({position:columns.length,rules,index});
  return boundaries;
}
function hasLineRule(rules){
  return rules.some(rule=>tableRulePattern.test(String(rule)));
}
function ruleForBoundary(boundary,count){
  return boundary===0?'\\toprule':boundary===count?'\\bottomrule':'\\midrule';
}
function setColumnRule(columns,boundary,on){
  const entry=columnBoundaries(columns)[boundary];
  if(!entry)return columns;
  if(on)return entry.rules>0?columns:columns.slice(0,entry.position)+'|'+columns.slice(entry.position);
  return columns.slice(0,entry.position).replace(/\|+\s*$/,'')+columns.slice(entry.position);
}
function effectiveHorizontalRules(table,rows){
  const result=rows.map(row=>[...(row.node.attrs.rules??[])]);
  result.push([...(table.attrs.trailingRules??[])]);
  const add=(index,rule)=>{if(!hasLineRule(result[index]))result[index].push(rule);};
  const attrs=table.attrs;
  if(attrs.topRule)add(0,'\\toprule');
  if(attrs.bottomRule)add(result.length-1,'\\bottomrule');
  if(attrs.midRuleMode==='all')for(let index=1;index<result.length-1;index++)add(index,'\\midrule');
  if(attrs.midRuleMode==='first'&&result.length>2)add(1,'\\midrule');
  if(attrs.borderMode==='grid'||attrs.borderMode==='horizontal'){
    add(0,'\\toprule');add(result.length-1,'\\bottomrule');
    for(let index=1;index<result.length-1;index++)add(index,'\\midrule');
  }else if(attrs.borderMode==='outer'){
    add(0,'\\toprule');add(result.length-1,'\\bottomrule');
  }
  if(attrs.horizontalRuleMode!=='explicit'&&attrs.booktabs&&!attrs.borderMode&&
      !attrs.topRule&&!attrs.bottomRule&&attrs.midRuleMode==='none'){
    const stored=result.some(hasLineRule);
    add(0,'\\toprule');add(result.length-1,'\\bottomrule');
    if(!stored&&result.length>2)add(1,'\\midrule');
  }
  return result;
}
function effectiveVerticalRules(table,rows){
  const columns=table.attrs.columns||'l'.repeat(rows[0]?.node.childCount??1);
  const boundaries=columnBoundaries(columns);
  const rules=boundaries.map(entry=>entry.rules>0);
  if(table.attrs.leftRule)rules[0]=true;
  if(table.attrs.rightRule)rules[rules.length-1]=true;
  if(table.attrs.middleVerticalRule)for(let index=1;index<rules.length-1;index++)rules[index]=true;
  if(table.attrs.borderMode==='grid'||table.attrs.borderMode==='outer'){
    rules[0]=true;rules[rules.length-1]=true;
    if(table.attrs.borderMode==='grid')for(let index=1;index<rules.length-1;index++)rules[index]=true;
  }
  return {columns,boundaries,rules};
}
function applyVerticalCells(tr,rows,rules){
  const count=rules.length-1;
  for(const row of rows){
    let column=0;
    for(const cell of tableCellEntries(row)){
      const start=column,span=cell.node.attrs.colspan??1,end=start+span;
      column=end;
      const attrs={...cell.node.attrs};
      if(rules[start])attrs.ruleLeft=true;else delete attrs.ruleLeft;
      if(end===count&&rules[count])attrs.ruleRight=true;else delete attrs.ruleRight;
      tr=tr.setNodeMarkup(cell.pos,undefined,attrs);
    }
  }
  return tr;
}
function updateColumnLayout(table,columns,attrs){
  try {
    const layout=JSON.parse(table.attrs.columnLayout||'[]');
    if(!Array.isArray(layout))return;
    const boundaries=columnBoundaries(columns);
    if(layout.length!==boundaries.length)return;
    attrs.columnLayout=JSON.stringify(boundaries.map((entry,index)=>({...layout[index],rules:entry.rules})));
  } catch {}
}
function toggleHorizontalRule(view,position,boundary){
  const table=view.state.doc.nodeAt(position);
  if(table?.type.name!=='table')return;
  const rows=tableRowEntries(view,position),count=rows.length;
  const horizontal=effectiveHorizontalRules(table,rows),current=horizontal[boundary]??[];
  horizontal[boundary]=hasLineRule(current)
    ? current.filter(rule=>!tableRulePattern.test(String(rule)))
    : [...current,ruleForBoundary(boundary,count)];
  const base=rows.map(row=>[...(row.node.attrs.rules??[])]);
  base.push([...(table.attrs.trailingRules??[])]);
  const materialize=horizontal.some((rules,index)=>rules.some(rule=>!base[index].includes(rule)));
  const attrs={...table.attrs,horizontalRuleMode:'explicit',booktabs:true,topRule:false,bottomRule:false,midRuleMode:'none',borderMode:null};
  let tr=view.state.tr;
  if(materialize){
    rows.forEach((row,index)=>tr=tr.setNodeMarkup(row.pos,undefined,{...row.node.attrs,rules:horizontal[index]}));
    attrs.trailingRules=horizontal[count];
  }else if(boundary<count){
    tr=tr.setNodeMarkup(rows[boundary].pos,undefined,{...rows[boundary].node.attrs,rules:horizontal[boundary]});
  }else{
    attrs.trailingRules=horizontal[count];
  }
  if(table.attrs.borderMode==='grid'||table.attrs.borderMode==='outer'){
    const vertical=effectiveVerticalRules(table,rows);
    let columns=vertical.columns;
    vertical.rules.forEach((on,index)=>{columns=setColumnRule(columns,index,on);});
    tr=applyVerticalCells(tr,rows,vertical.rules);
    attrs.columns=columns;attrs.columnRules=vertical.rules.some(Boolean);
    attrs.leftRule=false;attrs.rightRule=false;attrs.middleVerticalRule=false;
    updateColumnLayout(table,columns,attrs);
  }
  tr.setNodeMarkup(position,undefined,attrs);
  view.dispatch(tr);
}
function toggleVerticalRule(view,position,boundary){
  const table=view.state.doc.nodeAt(position);
  if(table?.type.name!=='table')return;
  const rows=tableRowEntries(view,position);
  const vertical=effectiveVerticalRules(table,rows);
  vertical.rules[boundary]=!vertical.rules[boundary];
  let columns=vertical.columns;
  vertical.rules.forEach((on,index)=>{columns=setColumnRule(columns,index,on);});
  const base=columnBoundaries(table.attrs.columns||'l'.repeat(rows[0]?.node.childCount??1)).map(entry=>entry.rules>0);
  const materialize=vertical.rules.some((on,index)=>on&&!base[index]);
  const attrs={...table.attrs,columns,columnRules:vertical.rules.some(Boolean),leftRule:false,rightRule:false,middleVerticalRule:false};
  let tr=view.state.tr;
  if(materialize){
    tr=applyVerticalCells(tr,rows,vertical.rules);
  }else{
    for(const row of rows){
      let column=0;
      for(const cell of tableCellEntries(row)){
        const start=column,span=cell.node.attrs.colspan??1,end=start+span;
        column=end;
        const key=boundary===vertical.rules.length-1&&end===vertical.rules.length-1?'ruleRight':boundary===start?'ruleLeft':null;
        if(!key)continue;
        const cellAttrs={...cell.node.attrs};
        if(vertical.rules[boundary])cellAttrs[key]=true;else delete cellAttrs[key];
        tr=tr.setNodeMarkup(cell.pos,undefined,cellAttrs);
      }
    }
  }
  if(table.attrs.borderMode){
    const horizontal=effectiveHorizontalRules(table,rows);
    rows.forEach((row,index)=>tr=tr.setNodeMarkup(row.pos,undefined,{...row.node.attrs,rules:horizontal[index]}));
    attrs.trailingRules=horizontal[rows.length];
    attrs.horizontalRuleMode='explicit';attrs.booktabs=true;attrs.topRule=false;attrs.bottomRule=false;attrs.midRuleMode='none';
  }
  attrs.borderMode=null;
  updateColumnLayout(table,columns,attrs);
  tr.setNodeMarkup(position,undefined,attrs);
  view.dispatch(tr);
}
function tableLineControlsPlugin() {
  let overlay=null,current=null,position=null,hideTimer=0;
  function hide(){clearTimeout(hideTimer);hideTimer=0;overlay?.remove();overlay=null;current=null;position=null;}
  function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(hide,260);}
  function keepVisible(){clearTimeout(hideTimer);hideTimer=0;}
  function show(view,table){
    hide();
    let pos=view.posAtDOM(table,0);
    let node=view.state.doc.nodeAt(pos);
    if(node?.type.name!=='table'){pos=Math.max(0,pos-1);node=view.state.doc.nodeAt(pos);}
    if(node?.type.name!=='table')return;
    current=table;position=pos;
    const element=document.createElement('div');
    element.className='table-line-controls';
    const bounds=table.getBoundingClientRect();
    element.style.left=bounds.left+'px';element.style.top=bounds.top+'px';element.style.width=bounds.width+'px';element.style.height=bounds.height+'px';
    const rows=[...table.querySelectorAll('tr')];
    const rowBoundaries=rows.map(row=>row.getBoundingClientRect().top);
    rowBoundaries.push(rows.at(-1)?.getBoundingClientRect().bottom??bounds.bottom);
    const tableNode=view.state.doc.nodeAt(position);
    const rowEntries=tableRowEntries(view,position);
    const horizontal=effectiveHorizontalRules(tableNode,rowEntries);
    const vertical=effectiveVerticalRules(tableNode,rowEntries);
    for(let index=0;index<rowBoundaries.length;index++){
      const active=hasLineRule(horizontal[index]??[]);
      const button=document.createElement('button');
      button.type='button';button.className='table-line-toggle table-line-horizontal';button.textContent=active?'-':'+';
      button.title=t(active?'隐藏该横向分割线':'显示该横向分割线',active?'Hide this horizontal rule':'Show this horizontal rule');
      button.style.left=(bounds.width+5)+'px';
      button.style.top=( rowBoundaries[index]-bounds.top-7.5)+'px';
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleHorizontalRule(view,position,index);hide();});
      element.append(button);
    }
    const cells=[...rows[0]?.children??[]];
    const columnBoundariesX=[];
    cells.forEach((cell,index)=>{const rect=cell.getBoundingClientRect();if(index===0)columnBoundariesX.push(rect.left);columnBoundariesX.push(rect.right);});
    for(let index=0;index<columnBoundariesX.length;index++){
      const active=Boolean(vertical.rules[index]);
      const button=document.createElement('button');
      button.type='button';button.className='table-line-toggle table-line-vertical';button.textContent=active?'-':'+';
      button.title=t(active?'隐藏该纵向分割线':'显示该纵向分割线',active?'Hide this vertical rule':'Show this vertical rule');
      button.style.left=(columnBoundariesX[index]-bounds.left-7.5)+'px';
      button.style.top=(bounds.height+5)+'px';
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleVerticalRule(view,position,index);hide();});
      element.append(button);
    }
    document.body.append(element);overlay=element;
    element.addEventListener('mouseenter',keepVisible);
    element.addEventListener('mouseleave',scheduleHide);
  }
  return new Plugin({props:{handleDOMEvents:{
    mouseover(view,event){const table=event.target.closest?.('table');if(!table||table.closest('.ProseMirror')!==view.dom)return false;if(current===table){keepVisible();return false;}show(view,table);return false;},
    mouseout(view,event){if(!current)return false;if(current.contains(event.relatedTarget)||overlay?.contains(event.relatedTarget)){keepVisible();return false;}scheduleHide();return false;},
  }}});
}
let paperEditor = null;

function replaceTikzCode(editor, position, body) {
  if (!editor) return;
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== 'codeBlock') return;
  const text = body.trim();
  const transaction = editor.state.tr.replaceWith(position + 1, position + node.nodeSize - 1, editor.state.schema.text(text));
  editor.view.dispatch(transaction);
}

function tikzBackspaceSelectionPlugin() {
  const isTikz = node => node?.type.name === 'codeBlock' &&
    ['tikz-general', 'tikz', 'circuitikz'].includes(node.attrs.language);
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        const selection = view.state.selection;
        if (!selection.empty) return false;
        const {$from} = selection;
        let position = null;
        if (isTikz($from.parent) &&
            ($from.parentOffset === 0 || $from.parentOffset === $from.parent.content.size)) {
          position = $from.before();
        } else if ($from.parentOffset === 0) {
          const blockStart = $from.before();
          const previous = $from.doc.resolve(blockStart).nodeBefore;
          if (isTikz(previous)) position = blockStart - previous.nodeSize;
        }
        if (position === null) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)).scrollIntoView());
        return true;
      },
    },
  });
}

function paperFormatting(editor = null) {
  paperEditor = editor;
  let session = null;
  let composing = false;
  let preeditDOM = null;
  function compositionAnchor(view) {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection) || !selection.empty) return null;
    const native = view.dom.ownerDocument.getSelection();
    const position = native?.isCollapsed && view.dom.contains(native.anchorNode)
      ? view.posAtDOM(native.anchorNode, native.anchorOffset)
      : selection.from;
    if (position < 0 || position > view.state.doc.content.size) return null;
    const boundary = view.state.doc.resolve(position);
    return !boundary.textOffset && boundary.nodeBefore?.type.name === 'math' ? position : null;
  }

  function holdPreeditDOM(view) {
    // A browser can create a new text node after the math atom for the first
    // syllable. If ProseMirror reparses the paragraph before the next syllable,
    // the IME can lose that node. Give the native input session exclusive
    // ownership of the DOM until it commits, then replay its mutation records.
    const records = [];
    const observer = new MutationObserver(changes => records.push(...changes));
    view.domObserver.stop();
    observer.observe(view.dom, {subtree:true, childList:true, characterData:true, characterDataOldValue:true});
    preeditDOM = {observer, records};
  }

  function releasePreeditDOM(view) {
    if (!preeditDOM) return;
    const {observer, records} = preeditDOM;
    preeditDOM = null;
    records.push(...observer.takeRecords());
    observer.disconnect();
    if (view.isDestroyed) return;
    view.domObserver.start();
    view.domObserver.queue.push(...records);
    view.domObserver.flush();
  }

  function recoverCommit(view, committed) {
    const pending=session;
    if (!pending?.preedit || typeof committed!=='string' || !/\p{Script=Han}/u.test(committed)) return;
    queueMicrotask(()=>{
      if (composing || preeditDOM || session!==pending || view.isDestroyed || !view.hasFocus()) return;
      view.domObserver.flush();
      const {doc}=view.state, {from,preedit}=pending;
      const end=from+preedit.length+committed.length;
      if(from>doc.content.size || doc.resolve(from).nodeBefore?.type.name!=='math') {
        session=null;
        return;
      }
      if(end>doc.content.size || doc.textBetween(from,end,'\0','\0')!==preedit+committed) {
        if (doc.textBetween(from,Math.min(from+committed.length,doc.content.size),'\0','\0')===committed) session=null;
        return;
      }
      session=null;
      const tr=view.state.tr.delete(from,from+preedit.length);
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc,from+committed.length)));
    });
  }
  function finishComposition(view) {
    composing = false;
    queueMicrotask(() => {
      if (composing || view.isDestroyed) return;
      releasePreeditDOM(view);
      view.dispatch(view.state.tr.setMeta(plugin, true));
    });
  }
  const plugin = new Plugin({
    view: () => ({ destroy() {
      preeditDOM?.observer.disconnect();
      preeditDOM = null;
    } }),
    state: {
      init: (_, state) => formattingMarks(state.doc, state.doc.attrs.layoutPreamble || ''),
      apply(transaction, previous) {
        // Preserve the browser's text node and its neighbors during preedit.
        if (composing) return transaction.docChanged ? previous.map(transaction.mapping, transaction.doc) : previous;
        return transaction.docChanged || transaction.getMeta(plugin) ? formattingMarks(transaction.doc, transaction.doc.attrs.layoutPreamble || '') : previous;
      },
    },
    props:{
      decorations(state) { return plugin.getState(state); },
      handleDOMEvents:{
        compositionstart(view, event) {
          if (event.target !== view.dom) return false;
          composing = true;
          const from = compositionAnchor(view);
          if (from !== null && !preeditDOM) {
            session = {from, preedit:''};
            // Ask ProseMirror for its native cursor wrapper once, before its
            // compositionstart handler runs. No selection transaction during
            // preedit should create another wrapper.
            if (!view.composing && !view.state.storedMarks) {
              view.dispatch(view.state.tr.setStoredMarks(view.state.selection.$from.marks()));
            }
          }
          else if (session && view.state.selection.from !== session.from + session.preedit.length) session=null;
          return false;
        },
        beforeinput(view,event) {
          if (composing && session && !preeditDOM && event.inputType==='insertCompositionText') holdPreeditDOM(view);
          return false;
        },
        compositionupdate(_view,event) {
          if(session && event.data && !/\p{Script=Han}/u.test(event.data)) {
            session.preedit=event.data;
          }
          return false;
        },
        input(view,event) {
          recoverCommit(view,event.data);
          return false;
        },
        compositionend(view,event) {
          if (event.target !== view.dom) return false;
          finishComposition(view);
          recoverCommit(view,event.data);
          return false;
        },
        pointerdown() {session=null;return false;},
        blur(view) {
          session=null;
          if (composing) finishComposition(view);
          return false;
        },
        keydown(_view,event) {
          if (!event.isComposing && event.keyCode!==229 &&
              /^(?:Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown|Tab|Escape)$/.test(event.key)) session=null;
          return false;
        },
      },
    },
  });
  return plugin;
}

function namedEnvironments(doc) {
  const chinese = resolveChineseProfile({ preamble: doc.attrs?.layoutPreamble ?? '' });
  const decorations = [];
  doc.descendants((node, position) => {
    if (node.type.name === 'theoremBlock' && node.attrs.kind === 'proof' && chinese.names.proofname && chinese.names.proofname !== 'Proof') {
      decorations.push(Decoration.node(position, position + node.nodeSize, { 'data-theorem-heading': chinese.names.proofname.replace(/\.$/, '') + '.' }));
    }
    if (node.type.name === 'blockquote' && node.attrs.latexEnvironment === 'abstract') {
      decorations.push(Decoration.node(position, position + node.nodeSize, { 'data-abstract-name': chinese.names.abstractname || 'Abstract' }));
    }
  });
  return decorations;
}

function numberedHeadings(doc){
 const preamble=doc.attrs?.layoutPreamble??'';
 const chinese=resolveChineseProfile({preamble});
 const styles=chinese.headingStyles;
 const headingDecorations=headingOutline(doc).map(item=>{
  const node=doc.nodeAt(item.position);
  const style=styles?.[item.command]??null;
  const attrs={
    'data-heading-position':String(item.position),
    'data-heading-numbered':String(item.numbered),
  };
  if(item.number||item.displayLabel)attrs['data-section-number']=item.command==='part'?item.displayLabel:item.number;
  if(item.chapterLabel)attrs['data-chapter-label']=item.chapterLabel;
  if(item.appendix)attrs['data-appendix-heading']='true';
  if(item.matter)attrs['data-matter']=item.matter;
  if(item.afterIndent!=null)attrs['data-after-indent']=String(item.afterIndent);
  if(style){
    attrs['data-heading-style']='true';
    if(item.afterIndent==null)attrs['data-after-indent']=String(style.afterIndent);
    attrs.style=[
      '--tex-heading-align:'+style.align,
      '--tex-heading-size:'+style.size,
      '--tex-heading-weight:'+style.weight,
      '--tex-heading-font-style:'+style.style,
      '--tex-heading-before:'+style.before,
      '--tex-heading-after:'+style.after,
      '--tex-heading-indent:'+style.indent,
      '--tex-heading-aftername:'+style.afterName,
    ].join(';');
    if(style.runin)attrs['data-heading-runin']='true';
  }
  return Decoration.node(item.position,item.position+node.nodeSize,attrs);
 });
 return DecorationSet.create(doc,[...headingDecorations,...namedEnvironments(doc)]);
}

const clikeKeywords = 'abstract|as|async|await|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extends|final|finally|for|from|function|goto|if|implements|import|in|instanceof|interface|let|namespace|new|package|private|protected|public|return|sealed|static|super|switch|this|throw|throws|try|type|typeof|var|void|while|with|yield|true|false|null|None|True|False|undefined|nil';
function codeFamily(language) {
  const name = String(language ?? '').trim().toLowerCase();
  if (!name) return 'clike';
  if (['yaml','yml'].includes(name)) return 'yaml';
  if (['py','python'].includes(name)) return 'python';
  if (['tex','latex'].includes(name)) return 'latex';
  if (['html','xml','svg','markup','vue'].includes(name)) return 'markup';
  if (['css','scss','less','sass'].includes(name)) return 'css';
  if (['sql','mysql','postgresql','postgres','psql','sqlite'].includes(name)) return 'sql';
  if (['json','jsonc'].includes(name)) return 'json';
  if (['sh','bash','shell','zsh','fish','console'].includes(name)) return 'shell';
  return 'clike';
}
function codeTokenRegex(family) {
  switch (family) {
    case 'yaml':
      return /(?<comment>#[^\n]*)|(?<string>"(?:\\.|[^"\\])*"|'(?:''|[^'])*')|(?<property>[\w.$/-]+(?=\s*:))|(?<keyword>\b(?:true|false|null|yes|no|on|off)\b)|(?<number>-?\b\d+(?:\.\d+)?\b)/gim;
    case 'python':
      return /(?<comment>#[^\n]*)|(?<string>"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(?<keyword>\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b)|(?<number>\b\d+(?:\.\d+)?\b)|(?<function>\b[A-Za-z_]\w*(?=\s*\())/g;
    case 'latex':
      return /(?<comment>(?<!\\)%[^\n]*)|(?<string>\$[^$]*\$)|(?<keyword>\\[A-Za-z@]+\*?)|(?<number>\b\d+(?:\.\d+)?\b)/g;
    case 'markup':
      return /(?<comment><!--[\s\S]*?-->)|(?<string>"[^"]*"|'[^']*')|(?<tag><\/?[\w:-]+|\/?>)|(?<attr>[\w:-]+(?=\s*=))/g;
    case 'css':
      return /(?<comment>\/\*[\s\S]*?\*\/)|(?<string>"[^"]*"|'[^']*')|(?<property>[-\w]+(?=\s*:))|(?<keyword>@[\w-]+|!important)|(?<number>-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b|#[\da-f]{3,8}\b)/gi;
    case 'json':
      return /(?<property>"(?:\\.|[^"\\])*"(?=\s*:))|(?<string>"(?:\\.|[^"\\])*")|(?<keyword>\b(?:true|false|null)\b)|(?<number>-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi;
    case 'sql':
      return /(?<comment>--[^\n]*|\/\*[\s\S]*?\*\/)|(?<string>'(?:''|[^'])*')|(?<keyword>\b(?:select|from|where|insert|into|values|update|set|delete|create|table|alter|drop|join|left|right|inner|outer|group|order|by|having|limit|offset|as|and|or|not|null|is|in|distinct|union|case|when|then|else|end|primary|key|foreign|references|index|view)\b)|(?<number>\b\d+(?:\.\d+)?\b)/gi;
    case 'shell':
      return /(?<comment>#[^\n]*)|(?<string>"(?:\\.|[^"\\])*"|'[^']*')|(?<keyword>\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|local|readonly|source|alias|echo|cd)\b)|(?<property>\$\{?[\w@#?*!-]+\}?)|(?<number>\b\d+(?:\.\d+)?\b)/g;
    default:
      return new RegExp(
        '(?<comment>\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)'
        + '|(?<string>"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)'
        + '|(?<keyword>\\b(?:' + clikeKeywords + ')\\b)'
        + '|(?<type>\\b(?:int|long|short|float|double|char|bool|boolean|string|str|void|byte|number|any|unknown|never|object)\\b)'
        + '|(?<number>\\b\\d+(?:\\.\\d+)?\\b)'
        + '|(?<function>\\b[A-Za-z_$][\\w$]*(?=\\s*\\())', 'g');
  }
}
function formattingMarks(doc, preamble = '') {
  setTikzPreamble(preamble);
  const decorations = [];
  doc.descendants((node, position, parent, index) => {
    if (node.isText) {
      const logo = node.marks.find(mark=>mark.type.name==='textCommand')?.attrs.name;
      if (logo === 'LaTeX' || logo === 'TeX') {
        const count=node.text.length/logo.length;
        if (Number.isInteger(count) && node.text===logo.repeat(count)) {
          for (let index=0;index<count;index++) {
            const start=position+index*logo.length;
            if (logo==='LaTeX') decorations.push(Decoration.inline(start+1,start+2,{class:'tex-logo-a'}));
            const e=start+logo.indexOf('e');
            if(e>=start)decorations.push(Decoration.inline(e,e+1,{class:'tex-logo-e'}));
          }
        }
      }
    }
    if (node.type.name === 'codeBlock') {
      if (node.attrs.language === 'tikz-general') {
        decorations.push(Decoration.widget(position, () => generalTikzPreviewWidget(node.textContent, preamble, () => openTikzStudio({
          initialLibraries: tikzStagingFromPreamble(preamble),
          initialBody: node.textContent,
          onInsert: ({ body }) => replaceTikzCode(paperEditor, position, body),
        })), { side: -1, key:JSON.stringify([position,node.textContent,preamble]) }));
      } else if (node.attrs.language === 'tikz' || node.attrs.language === 'circuitikz') {
        const circuitPreamble = `${tikzStagingFromPreamble(preamble)}\n\\usepackage{circuitikz}`.trim();
        const openCircuitEditor = () => {
          const width = paperEditor?.view?.dom?.clientWidth || 600;
          const tikz = new TikzEditor({ getTextwidthCm: () => width * 2.54 / 96 });
          tikz.open(code => {
            if (code) replaceTikzCode(paperEditor, position, code);
          }, node.textContent);
        };
        decorations.push(Decoration.widget(position, () => generalTikzPreviewWidget(node.textContent, circuitPreamble, openCircuitEditor), { side: -1, key:JSON.stringify([position,node.textContent,circuitPreamble]) }));
      }
      const tokenPattern = codeTokenRegex(codeFamily(node.attrs.language));
      for (const match of node.textContent.matchAll(tokenPattern)) {
        const kind = match.groups && Object.keys(match.groups).find(key => match.groups[key] !== undefined);
        if (!kind || !match[0]) continue;
        const from=position+1+match.index;
        decorations.push(Decoration.inline(from,from+match[0].length,{class:`code-token-${kind}`}));
      }
      return false;
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const PaperBehavior = Extension.create({
  name: 'paperBehavior',
  addGlobalAttributes() {
    return [{
      types:['blockquote'],
      attributes:{
        latexEnvironment:{
          default:null,
          parseHTML:element=>['abstract','center'].includes(element.dataset.latexEnvironment)?element.dataset.latexEnvironment:null,
          renderHTML:({latexEnvironment})=>latexEnvironment?{'data-latex-environment':latexEnvironment}:{},
        },
        environmentSource:{
          default:null,
          parseHTML:element=>{
            try{const saved=JSON.parse(element.dataset.environmentSource??'null');return saved&&typeof saved.source==='string'&&Array.isArray(saved.parts)&&Number.isInteger(saved.count)?saved:null;}catch{return null;}
          },
          renderHTML:({environmentSource})=>environmentSource?{'data-environment-source':JSON.stringify(environmentSource)}:{},
        },
      },
    },{
      types: ['paragraph'],
      attributes: {
        align: {
          default: null,
          parseHTML: element => ['left','center','right','justify'].includes(element.dataset.align) ? element.dataset.align : null,
          renderHTML: ({align}) => ['left','center','right','justify'].includes(align)
            ? { 'data-align':align, style:'text-align:'+align } : {},
        },
        indent: {
          default: true,
          keepOnSplit: true,
          parseHTML: element => element.dataset.indent !== 'false',
          renderHTML: attributes => ({ 'data-indent': String(attributes.indent) }),
        },
        explicitIndent: {default:false,keepOnSplit:false,parseHTML:element=>element.dataset.explicitIndent==='true',renderHTML:({explicitIndent})=>explicitIndent?{'data-explicit-indent':'true'}:{}},
        indentLevel: {
          default: 0,
          parseHTML: element => Number(element.dataset.indentLevel) || 0,
          renderHTML: attributes => attributes.indentLevel
            ? { 'data-indent-level': String(attributes.indentLevel), style: `margin-left:${attributes.indentLevel * 2}em` }
            : {},
        },
        lineSpacing: {
          default: null,
          parseHTML: element => Number(element.dataset.lineSpacing) || null,
          renderHTML: ({lineSpacing}) => lineSpacing && lineSpacing !== 1
            ? { 'data-line-spacing': String(lineSpacing), style: `line-height:${lineSpacing}` } : {},
        },
        spaceBefore: {
          default: null,
          parseHTML: element => element.dataset.spaceBefore ?? null,
          renderHTML: ({spaceBefore}) => spaceBefore
            ? { 'data-space-before': spaceBefore, style: `margin-top:${spaceBefore}` } : {},
        },
        spaceAfter: {
          default: null,
          parseHTML: element => element.dataset.spaceAfter ?? null,
          renderHTML: ({spaceAfter}) => spaceAfter
            ? { 'data-space-after': spaceAfter, style: `margin-bottom:${spaceAfter}` } : {},
        },
        shading: {
          default: null,
          parseHTML: element => element.dataset.shading ?? null,
          renderHTML: ({shading}) => shading
            ? { 'data-shading': shading, style: `background-color:${shading}` } : {},
        },
        border: {
          default: false,
          parseHTML: element => element.dataset.paragraphBorder === 'true',
          renderHTML: ({border}) => border
            ? { 'data-paragraph-border': 'true', style: 'border:1px solid currentColor;padding:.15em .3em' } : {},
        },
      },
    }, {
      types: ['heading'],
      attributes: {
        command:{default:null,parseHTML:element=>element.dataset.headingCommand??null,renderHTML:({command})=>command?{'data-heading-command':command}:{}},
        numbered: {
          default: true,
          parseHTML: element => element.dataset.numbered !== 'false',
          renderHTML: attributes => ({ 'data-numbered': String(attributes.numbered) }),
        },
        shortTitle: {
          default: null,
          parseHTML: element => element.dataset.shortTitle ?? null,
          renderHTML: attributes => attributes.shortTitle ? { 'data-short-title': attributes.shortTitle } : {},
        },
        labelSource: {
          default:null,
          parseHTML:element=>{try{return JSON.parse(element.dataset.labelSource??'null');}catch{return null;}},
          renderHTML:attributes=>attributes.labelSource?{'data-label-source':JSON.stringify(attributes.labelSource)}:{},
        },
        label: {
          default: null,
          parseHTML: element => element.dataset.label ?? null,
          renderHTML: attributes => attributes.label ? { 'data-label': attributes.label } : {},
        },
      },
    }, {
      types: ['table'],
      attributes: {
        borderMode: { default:null },
        borderWidth: { default:null },
        columns: {
          default: null,
          parseHTML: element => element.dataset.columns ?? null,
          renderHTML: attributes => attributes.columns ? { 'data-columns': attributes.columns } : {},
        },
        columnLayout: {
          default: null,
          parseHTML: element => element.dataset.columnLayout ?? null,
          renderHTML: attributes => attributes.columnLayout ? { 'data-column-layout': attributes.columnLayout } : {},
        },
        columnRules: {
          default: false,
          parseHTML: element => element.dataset.columnRules === 'true',
          renderHTML: attributes => attributes.columnRules ? { 'data-column-rules': 'true' } : {},
        },
        trailingRules: {
          default: null,
          parseHTML: element => {
            try { return element.dataset.trailingRules ? JSON.parse(element.dataset.trailingRules) : null; }
            catch { return null; }
          },
          renderHTML: attributes => {
            if (!attributes.trailingRules?.length) return {};
            const rule=(attributes.trailingRules??[]).find(value=>/^\\?(toprule|midrule|bottomrule|hline)$/.test(String(value)));
            return {
              'data-trailing-rules': JSON.stringify(attributes.trailingRules),
              ...(rule ? {'data-trailing-rule':String(rule).replace(/^\\/,'')} : {}),
            };
          },
        },
        horizontalRuleMode: {
          default: null,
          parseHTML: element => element.dataset.horizontalRuleMode ?? null,
          renderHTML: attributes => attributes.horizontalRuleMode
            ? { 'data-horizontal-rule-mode': attributes.horizontalRuleMode } : {},
        },
        booktabs: {
          default: false,
          parseHTML: element => element.dataset.booktabs === 'true',
          renderHTML: attributes => attributes.booktabs ? { 'data-booktabs': 'true' } : {},
        },
        caption: {
          default: null,
          parseHTML: element => element.dataset.caption ?? null,
          renderHTML: attributes => attributes.caption ? { 'data-caption': attributes.caption } : {},
        },
        label: {
          default: null,
          parseHTML: element => element.dataset.label ?? null,
          renderHTML: attributes => attributes.label ? { 'data-label': attributes.label } : {},
        },
        placement: {
          default: null,
          parseHTML: element => element.dataset.placement ?? null,
          renderHTML: attributes => attributes.placement ? { 'data-placement': attributes.placement } : {},
        },
        centered: {
          default: false,
          parseHTML: element => element.dataset.centered === 'true',
          renderHTML: attributes => attributes.centered ? { 'data-centered': 'true' } : {},
        },
        leftRule: {
          default: false,
          parseHTML: element => element.dataset.leftRule === 'true',
          renderHTML: attributes => attributes.leftRule ? { 'data-left-rule': 'true' } : {},
        },
        rightRule: {
          default: false,
          parseHTML: element => element.dataset.rightRule === 'true',
          renderHTML: attributes => attributes.rightRule ? { 'data-right-rule': 'true' } : {},
        },
        middleVerticalRule: {
          default: false,
          parseHTML: element => element.dataset.middleVerticalRule === 'true',
          renderHTML: attributes => attributes.middleVerticalRule ? { 'data-middle-vertical-rule': 'true' } : {},
        },
        verticalFirstRow: {
          default: true,
          parseHTML: element => element.dataset.verticalFirstRow !== 'false',
          renderHTML: attributes => attributes.verticalFirstRow === false ? { 'data-vertical-first-row': 'false' } : {},
        },
        topRule: {
          default: false,
          parseHTML: element => element.dataset.topRule === 'true',
          renderHTML: attributes => attributes.topRule ? { 'data-top-rule': 'true' } : {},
        },
        bottomRule: {
          default: false,
          parseHTML: element => element.dataset.bottomRule === 'true',
          renderHTML: attributes => attributes.bottomRule ? { 'data-bottom-rule': 'true' } : {},
        },
        midRuleMode: {
          default: 'none',
          parseHTML: element => element.dataset.midRuleMode ?? 'none',
          renderHTML: attributes => attributes.midRuleMode && attributes.midRuleMode !== 'none' ? { 'data-mid-rule-mode': attributes.midRuleMode } : {},
        },
        ruleStyle: {
          default: 'solid',
          parseHTML: element => element.dataset.ruleStyle ?? 'solid',
          renderHTML: attributes => ({ 'data-rule-style': attributes.ruleStyle ?? 'solid' }),
        },
        ruleWidth: {
          default: null,
          parseHTML: element => element.dataset.ruleWidth ?? null,
          renderHTML: attributes => attributes.ruleWidth ? { 'data-rule-width': attributes.ruleWidth } : {},
        },
        arrayStretch: {
          default: 1,
          parseHTML: element => Number(element.dataset.arrayStretch) || 1,
          renderHTML: attributes => ({ 'data-array-stretch': String(attributes.arrayStretch ?? 1) }),
        },
        fontSize: {
          default: null,
          parseHTML: element => element.dataset.tableFontSize ?? null,
          renderHTML: attributes => attributes.fontSize ? { 'data-table-font-size': attributes.fontSize } : {},
        },
        tableScale: {
          default: 1,
          parseHTML: element => Number(element.dataset.tableScale) || 1,
          renderHTML: attributes => ({ 'data-table-scale': String(attributes.tableScale ?? 1) }),
        },
        captionEnabled: {
          default: false,
          parseHTML: element => element.dataset.captionEnabled === 'true',
          renderHTML: attributes => attributes.captionEnabled ? { 'data-caption-enabled': 'true' } : {},
        },
        align: {
          default: null,
          parseHTML: element => element.dataset.tableAlign ?? null,
          renderHTML: attributes => attributes.align ? { 'data-table-align': attributes.align } : {},
        },
      },
    }, {
      types: ['tableRow'],
      attributes: {
        rules: {
          default: null,
          parseHTML: element => {
            try { return element.dataset.rules ? JSON.parse(element.dataset.rules) : null; }
            catch { return null; }
          },
          renderHTML: attributes => {
            const rule = (attributes.rules ?? []).find(value => /^\\?(toprule|midrule|bottomrule)$/.test(String(value)));
            const data = attributes.rules?.length ? { 'data-rules': JSON.stringify(attributes.rules) } : {};
            if (rule) data['data-booktabs-rule'] = String(rule).replace(/^\\/,'');
            return data;
          },
        },
      },
    }, {
      types: ['tableCell', 'tableHeader'],
      attributes: {
        align: {
          default: null,
          parseHTML: element => element.dataset.align ?? null,
          renderHTML: attributes => attributes.align ? { 'data-align': attributes.align, style: 'text-align:' + attributes.align } : {},
        },
        paddingLeft: {
          default: null,
          parseHTML: element => element.dataset.paddingLeft ?? null,
          renderHTML: attributes => attributes.paddingLeft ? { 'data-padding-left': attributes.paddingLeft, style: 'padding-left:' + attributes.paddingLeft } : {},
        },
        paddingRight: {
          default: null,
          parseHTML: element => element.dataset.paddingRight ?? null,
          renderHTML: attributes => attributes.paddingRight ? { 'data-padding-right': attributes.paddingRight, style: 'padding-right:' + attributes.paddingRight } : {},
        },
        ruleLeft: {
          default: false,
          parseHTML: element => element.dataset.ruleLeft === 'true',
          renderHTML: attributes => attributes.ruleLeft ? { 'data-rule-left': 'true' } : {},
        },
        ruleRight: {
          default: false,
          parseHTML: element => element.dataset.ruleRight === 'true',
          renderHTML: attributes => attributes.ruleRight ? { 'data-rule-right': 'true' } : {},
        },
      },
    }, {
      types: ['orderedList'],
      attributes: {
        labelStyle: {
          default: null,
          parseHTML: element => element.dataset.labelStyle ?? null,
          renderHTML: attributes => attributes.labelStyle ? { 'data-label-style': attributes.labelStyle, style: listMarkerCSS(attributes.labelStyle) } : {},
        },
      },
    }, {
      types: ['bulletList'],
      attributes: {
        marker: {
          default: null,
          parseHTML: element => element.dataset.marker ?? null,
          renderHTML: attributes => attributes.marker
            ? { 'data-marker': attributes.marker, style: "list-style-type: '" + String(attributes.marker).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" }
            : {},
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    const captionWidgets = new Map();
    return [
      paperFormatting(this.editor),
      tikzBackspaceSelectionPlugin(),
      new Plugin({
        state: {
          init: (_, state) => captionState(state.doc, captionWidgets),
          apply: (transaction, previous, _oldState, newState) => transaction.docChanged ? captionState(newState.doc, captionWidgets) : previous,
        },
        props: { decorations(state) { return this.getState(state).set; } },
        view() {
          return {
            destroy() {
              for (const widget of captionWidgets.values()) widget.destroy();
              captionWidgets.clear();
            },
          };
        },
      }),
      new Plugin({
        state: {
          init: (_, state) => numberedHeadings(state.doc),
          apply: (transaction, previous) => transaction.docChanged ? numberedHeadings(transaction.doc) : previous,
        },
        props: { decorations(state) { return this.getState(state); } },
      }),
      new Plugin({
        props: {
          decorations(state) {
            const { from, to } = state.selection;
            if (from === to) return null;
            const decorations = [];
            state.doc.nodesBetween(from, to, (node, position) => {
              if (node.type.name !== 'listItem') return;
              // Only the item's own paragraph participates in the marker
              // highlight, so selecting a nested item does not light up every
              // ancestor list marker.
              const ownEnd = position + 1 + (node.firstChild?.nodeSize ?? 0);
              if (to <= position + 1 || from >= ownEnd) return;
              const parent = state.doc.resolve(position).parent;
              const attrs = { class: 'list-item-selected' };
              if (parent.type.name === 'bulletList') attrs['data-selected-marker'] = parent.attrs.marker ?? '•';
              decorations.push(Decoration.node(position, position + node.nodeSize, attrs));
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
      new Plugin({
        appendTransaction(transactions, oldState, state) {
          if (!transactions.some(transaction => transaction.docChanged)) return null;
          if (!['table', 'mathBlock'].includes(state.doc.lastChild?.type.name)) return null;
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
        },
        props: {
          handleDOMEvents: {
            dblclick(view, event) {
              if (event.target !== view.dom) return false;
              let previous = null;
              view.state.doc.forEach((node, position) => {
                const element = view.nodeDOM(position);
                if (element?.getBoundingClientRect().bottom <= event.clientY) previous = { node, position };
              });
              if (!previous) return false;
              const end = previous.position + previous.node.nodeSize;
              let transaction = view.state.tr;
              const next = transaction.doc.nodeAt(end);
              if (next?.type.name !== 'paragraph') transaction.insert(end, view.state.schema.nodes.paragraph.create());
              transaction.setSelection(TextSelection.create(transaction.doc, end + 1));
              view.dispatch(transaction);
              view.focus();
              event.preventDefault();
              return true;
            },
          },
        },
      }),
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
                !['PageUp', 'PageDown'].includes(event.key)) return false;
            const { doc, selection } = view.state;
            const direction = event.key === 'PageUp' ? -1 : 1;
            const caret = view.coordsAtPos(selection.head, direction);
            const bounds = view.dom.getBoundingClientRect();
            const height = view.dom.ownerDocument.defaultView.innerHeight;
            const y = (caret.top + caret.bottom) / 2 + direction * Math.max(1, height - 48);
            const x = Math.max(bounds.left + 1, Math.min(bounds.right - 1, caret.left));
            const hit = view.posAtCoords({ left: x, top: y });
            let head = y <= bounds.top ? 0 : y >= bounds.bottom ? doc.content.size : hit?.pos;
            if (head === undefined) {
              // Offscreen points have no browser hit target. Use document
              // geometry so a page move remains a page move while scrolling.
              doc.forEach((node, position) => {
                if (head !== undefined) return;
                const rect = view.nodeDOM(position)?.getBoundingClientRect();
                if (!rect || rect.bottom < y) return;
                if (!node.isTextblock) {
                  head = position + (direction > 0 ? node.nodeSize : 0);
                  return;
                }
                let low = position + 1, high = low + node.content.size;
                while (low < high) {
                  const middle = Math.floor((low + high) / 2);
                  const line = view.coordsAtPos(middle, direction);
                  if (line.bottom < y || (line.top <= y && line.left < x)) low = middle + 1;
                  else high = middle;
                }
                head = low;
              });
              if (head === undefined) return false;
            }
            if (hit?.inside >= 0 && doc.nodeAt(hit.inside)?.type.name === 'mathBlock') {
              head = hit.inside + (direction > 0 ? doc.nodeAt(hit.inside).nodeSize : 0);
            }
            view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, selection.anchor, head)).scrollIntoView());
            return true;
          },
          decorations(state) {
            const { from, to } = state.selection;
            if (from === to) return null;
            const decorations = [];
            state.doc.nodesBetween(from, to, (node, position) => {
              if (node.type.name === 'math' || node.type.name === 'mathBlock')
                decorations.push(Decoration.node(position, position + node.nodeSize, { class: 'math-selected' }));
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
      new Plugin({
        props: {
          // Turn a whole copied formula (MathLive writes "$$ … $$") into a
          // real node. Mixed clipboard text is left untouched so source
          // fidelity does not depend on guessing where math starts.
          handlePaste(view, event) {
            const data = event.clipboardData;
            if (!data || Array.from(data.types ?? []).includes('text/html')) return false;
            const text = (data.getData('text/plain') ?? '').trim();
            const match = text.match(/^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\r\n]+?)\$)$/);
            if (!match) return false;
            const latex = (match[1] ?? match[2] ?? match[3] ?? match[4]).trim();
            if (!latex) return false;
            const display = match[1] !== undefined || match[2] !== undefined;
            const type = view.state.schema.nodes[display ? 'mathBlock' : 'math'];
            if (!type) return false;
            view.dispatch(view.state.tr
              .replaceSelection(new Slice(Fragment.from(type.create({ latex, display })), 0, 0))
              .scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
