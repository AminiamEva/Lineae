import { createCaretMotion, measurePage } from './caret-motion.js';

const SVG = 'http://www.w3.org/2000/svg';
const TEXT_EDIT = new Set([
  'insertText', 'insertReplacementText', 'insertLineBreak', 'insertParagraph',
  'deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward',
  'deleteSoftLineBackward', 'deleteSoftLineForward', 'deleteHardLineBackward', 'deleteHardLineForward', 'deleteByCut',
]);

function shape(name, attributes = {}) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

export function installSpaceOverlay(editor, paper, { selectionFocus = null } = {}) {
  const page = paper.closest('.document-page') ?? paper;
  const overlay = shape('svg', { class:'space-overlay', 'aria-hidden':'true' });
  const activeBoxOverlay = shape('g');
  const marksOverlay = shape('g');
  const preeditCaret = shape('rect', {class:'preedit-caret', fill:'currentColor', visibility:'hidden'});
  overlay.append(activeBoxOverlay, marksOverlay, preeditCaret);
  page.append(overlay);
  const emptyBox=document.createElement('span');
  emptyBox.className='empty-box-preview';
  emptyBox.hidden=true;
  emptyBox.setAttribute('aria-hidden','true');
  page.append(emptyBox);
  const textCaret=createCaretMotion(editor.view,page);
  const listeners=new AbortController();
  const { signal }=listeners;
  let enabled = true;
  let composing = false;
  let compositionOrigin = null;
  let compositionFormula = null;
  let preeditText = '';
  let caretFrame = 0;
  let marksFrame = 0;
  let caretIntent = null;
  let caretOrigin = null;
  let caretActivity = false;
  let rowDirection;
  let pendingEdit = null;
  let lastEditTransactionAt = 0;
  let arrowOrigin = null;

  function boxEdge(preferNext=false) {
    const { selection }=editor.state;
    if (!selection.empty || !selection.$from.parent.isTextblock) return null;
    const { $from }=selection;
    const before=$from.nodeBefore?.marks ?? [];
    const after=$from.nodeAfter?.marks ?? [];
    const boxed=editor.schema.marks.boxed;
    const previous=boxed.isInSet(before);
    const next=boxed.isInSet(after);
    if ((!previous && !next) || (previous && next && previous.eq(next))) return null;
    const active=boxed.isInSet(editor.state.storedMarks ?? []);
    const end=Boolean(previous && (!next || (active ? previous.eq(active) : !preferNext)));
    const {node,offset}=editor.view.domAtPos($from.pos,end?-1:1);
    const adjacent=node.nodeType===Node.ELEMENT_NODE ? node.childNodes[end?offset-1:offset] : node;
    const element=adjacent?.nodeType===Node.ELEMENT_NODE ? adjacent : adjacent?.parentElement;
    const box=element?.closest('[data-boxed]');
    const rect=box && [...box.getClientRects()].at(end?-1:0);
    const outsideMarks=boxed.removeFromSet(end?after:before);
    return rect?.width ? {rect,end,box,mark:end?previous:next,insideMarks:end?before:after,outsideMarks} : null;
  }

  function insideBox(edge) {
    const {storedMarks,selection}=editor.state;
    if (storedMarks) return Boolean(edge.mark.isInSet(storedMarks));
    if (arrowOrigin && selection.from!==arrowOrigin.position)
      return edge.end===arrowOrigin.right;
    return edge.box.contains(window.getSelection()?.anchorNode);
  }

  function pendingBoxMark(selection, marks) {
    const mark=editor.schema.marks.boxed.isInSet(marks ?? []);
    return mark && !mark.isInSet(selection.$from.nodeBefore?.marks ?? []) &&
      !mark.isInSet(selection.$from.nodeAfter?.marks ?? []) ? mark : null;
  }

  function toggleBox() {
    if (composing || editor.view.composing) return false;
    if (!editor.view.hasFocus()) editor.view.focus();
    arrowOrigin=null;
    editor.view.domObserver.flush();
    const {selection,storedMarks}=editor.state;
    const edge=boxEdge();
    const inside=edge ? insideBox(edge) : editor.isActive('boxed');
    if (selection.empty && pendingBoxMark(selection,storedMarks)) {
      editor.commands.unsetMark('boxed');
    } else if (selection.empty && inside) {
      const boxed=editor.schema.marks.boxed;
      editor.chain().extendMarkRange('boxed').unsetMark('boxed').command(({tr})=>{
        tr.setSelection(selection.constructor.create(tr.doc,selection.from));
        tr.removeStoredMark(boxed);
        return true;
      }).run();
    } else if (selection.empty && edge) {
      const boxed=editor.schema.marks.boxed.create({boxId:crypto.randomUUID()});
      editor.view.dispatch(editor.state.tr.setStoredMarks(boxed.addToSet(storedMarks ?? edge.outsideMarks)));
    } else if (editor.isActive('boxed')) {
      editor.commands.unsetMark('boxed');
    } else {
      editor.commands.setMark('boxed',{boxId:crypto.randomUUID()});
    }
    return true;
  }

  paper.addEventListener('pointerdown',()=>{
    arrowOrigin=null;
    rowDirection=0;
    scheduleCaret('navigate',true);
  },{capture:true,signal});
  paper.addEventListener('pointermove',event=>{
    if ((event.buttons & 1) && editor.view.hasFocus()) {
      rowDirection=0;
      scheduleCaret('navigate',true);
    }
  },{capture:true,passive:true,signal});
  paper.addEventListener('keydown',event=>{
    if (composing || editor.view.composing || event.isComposing || event.keyCode===229) return;
    // A paint can run after the native move but before selectionchange.
    if (/^(Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key)) {
      rowDirection=event.altKey || event.ctrlKey || event.metaKey ? 0 :
        event.key==='ArrowUp' ? -1 : event.key==='ArrowDown' ? 1 : 0;
      scheduleCaret('navigate',true);
    }
    if (['Backspace','Delete','Enter'].includes(event.key) && editor.view.hasFocus()) {
      rememberEdit();
    } else {
      pendingEdit=null;
    }
    if ((event.key==='Backspace' || event.key==='Delete') && !event.ctrlKey && !event.shiftKey &&
        !event.metaKey && !event.altKey && editor.view.hasFocus()) {
      editor.view.domObserver.flush();
      const edge=boxEdge();
      const backward=event.key==='Backspace';
      if (edge && !insideBox(edge) && backward!==edge.end) {
        const {doc,selection}=editor.state;
        const { $from }=selection;
        const gap=backward?$from.nodeBefore:$from.nodeAfter;
        if (gap?.isText && /^[ \u00a0]+$/.test(gap.text)) {
          const other=doc.resolve($from.pos+(backward?-gap.nodeSize:gap.nodeSize));
          const neighbor=backward?other.nodeBefore:other.nodeAfter;
          if (editor.schema.marks.boxed.isInSet(neighbor?.marks ?? [])) {
            event.preventDefault();
            event.stopPropagation();
            arrowOrigin=null;
            const from=$from.pos-(backward?1:0);
            editor.view.dispatch(editor.state.tr.delete(from,from+1).setStoredMarks(edge.outsideMarks));
            return;
          }
        }
      }
    }
    const right=event.key==='ArrowRight';
    const horizontal=right || event.key==='ArrowLeft';
    if (!horizontal || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || !editor.view.hasFocus()) {
      arrowOrigin=null;
      return;
    }
    editor.view.domObserver.flush();
    const edge=boxEdge(right);
    if (edge) {
      const enter=right!==edge.end;
      if (insideBox(edge)!==enter) {
        event.preventDefault();
        event.stopPropagation();
        arrowOrigin=null;
        editor.view.dispatch(editor.state.tr.setStoredMarks(enter?edge.insideMarks:edge.outsideMarks));
        return;
      }
    }
    arrowOrigin={position:editor.state.selection.from,right};
  },{capture:true,signal});

  paper.addEventListener('click',event=>{
    if (event.button || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
        !window.getSelection()?.isCollapsed || composing) return;
    editor.view.domObserver.flush();
    const edge=boxEdge();
    if (!edge) return;
    const {rect,end}=edge;
    const border=end?rect.right:rect.left;
    const tolerance=Math.min(8,rect.height/2);
    if (event.clientY<rect.top || event.clientY>rect.bottom ||
        Math.abs(event.clientX-border)>tolerance) return;
    const inside=end?event.clientX<border:event.clientX>border;
    editor.view.dispatch(editor.state.tr.setStoredMarks(
      inside ? edge.insideMarks : edge.outsideMarks,
    ));
  },{signal});

  function drawCaret() {
    caretFrame=0;
    const intent=caretIntent, activity=caretActivity, origin=caretOrigin, direction=rowDirection;
    caretIntent=null;
    caretOrigin=null;
    caretActivity=false;
    rowDirection=undefined;
    const {pageRect,zoom}=measurePage(page);
    if (composing) {
      // Save the native caret from the last displayed preedit frame. A final
      // compositionupdate and compositionend can arrive before the next paint.
      if (editor.view.hasFocus()) compositionOrigin=textCaret.captureNativeCaret({pageRect,zoom}) ?? compositionOrigin;
      drawFirstPreeditCaret(pageRect, zoom);
      emptyBox.hidden=true;
      activeBoxOverlay.replaceChildren();
      return;
    }
    const edge=editor.view.hasFocus() ? boxEdge() : null;
    const marks=editor.state.storedMarks;
    const {selection}=editor.state;
    const pendingBox=editor.view.hasFocus() && selection.empty &&
      pendingBoxMark(selection,marks);
    emptyBox.hidden=!pendingBox;
    if (pendingBox) {
      const caret=editor.view.coordsAtPos(selection.from);
      const x=edge?.end ? edge.rect.right+2*zoom : caret.left-2*zoom;
      emptyBox.style.left=((x-pageRect.left)/zoom)+'px';
      emptyBox.style.top=((caret.top-pageRect.top)/zoom)+'px';
      emptyBox.style.height=Math.max(1,(caret.bottom-caret.top)/zoom)+'px';
    }
    let boxCursor = null;
    if (!pendingBox && edge && (marks || (arrowOrigin && selection.from!==arrowOrigin.position))) {
      const inside=insideBox(edge);
      const border=edge.end?edge.rect.right:edge.rect.left;
      const left=border+(inside===edge.end?-3:2)*zoom;
      const top=edge.rect.top+2*zoom;
      boxCursor={
        side:inside?'inside':'outside', edge:edge.end?'right':'left',
        rect:{left,top,right:left+zoom,bottom:Math.max(top+zoom,edge.rect.bottom-2*zoom)},
      };
    }
    textCaret.update({pageRect,zoom,intent,activity,origin,rowDirection:direction,boxEdge:boxCursor,
      retainSelection:document.activeElement===selectionFocus});
    activeBoxOverlay.replaceChildren();
    if (!enabled || !pageRect.width || !pageRect.height) return;
    // A boxed mark and the surrounding text can share the same document
    // position at its edge. Indicate the actual DOM caret side without
    // modifying the selection or intercepting editing gestures.
    const domSelection=window.getSelection();
    const anchor=domSelection?.isCollapsed && editor.view.hasFocus() ? domSelection.anchorNode : null;
    const anchorElement=anchor?.nodeType===Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const explicitMarks=editor.state.storedMarks;
    const activeBox=(!explicitMarks || explicitMarks.some(mark=>mark.type.name==='boxed'))
      ? anchorElement?.closest?.('[data-boxed]') : null;
    if (activeBox && paper.contains(activeBox)) {
      for (const rect of activeBox.getClientRects()) {
        if (rect.width>0 && rect.height>0) activeBoxOverlay.append(shape('rect',{
          'data-active-box':'',x:(rect.left-pageRect.left)/zoom,y:(rect.top-pageRect.top)/zoom,
          width:rect.width/zoom,height:rect.height/zoom,
          rx:2,fill:'rgba(80,135,210,.12)',stroke:'rgba(80,135,210,.45)','stroke-width':1,
        }));
      }
    }
  }

  function hidePreeditCaret() {
    if (preeditCaret.getAttribute('visibility')==='hidden') return;
    preeditCaret.setAttribute('visibility','hidden');
    editor.view.dom.classList.remove('has-preedit-caret');
  }

  function drawFirstPreeditCaret(pageRect, zoom) {
    const formula = compositionFormula;
    const selection = paper.ownerDocument.getSelection();
    if (!formula?.isConnected || !/^[a-z]$/i.test(preeditText) ||
        !editor.view.hasFocus() || !selection?.isCollapsed || !selection.focusNode) {
      hidePreeditCaret();
      return;
    }
    // During the first native update the caret can still report the boundary
    // before the newly inserted text. Measure the text without changing the
    // Selection, which would interrupt the IME session.
    let text = formula.nextSibling;
    while (text?.nodeName === 'IMG' && text.classList.contains('ProseMirror-separator')) {
      text = text.nextSibling;
    }
    while (text?.nodeType === Node.ELEMENT_NODE && text.contentEditable !== 'false') {
      text = text.firstChild;
    }
    if (text?.nodeType !== Node.TEXT_NODE || !text.data.startsWith(preeditText)) {
      hidePreeditCaret();
      return;
    }
    const end = paper.ownerDocument.createRange();
    end.setStart(text, preeditText.length);
    end.collapse(true);
    const target = end.getBoundingClientRect();
    const native = selection.getRangeAt(0).getBoundingClientRect();
    if (!target.height || (Math.abs(target.left-native.left)<1 && Math.abs(target.top-native.top)<1)) {
      hidePreeditCaret();
      return;
    }
    preeditCaret.setAttribute('x',(target.left-pageRect.left)/zoom);
    preeditCaret.setAttribute('y',(target.top-pageRect.top)/zoom);
    preeditCaret.setAttribute('width',1.5/zoom);
    preeditCaret.setAttribute('height',target.height/zoom);
    preeditCaret.setAttribute('visibility','visible');
    editor.view.dom.classList.add('has-preedit-caret');
  }

  function drawMarks() {
    marksFrame=0;
    const {pageRect,zoom}=measurePage(page);
    overlay.hidden=!enabled || !pageRect.width || !pageRect.height;
    if (overlay.hidden) return;
    const width=page.clientWidth;
    const height=page.clientHeight;
    overlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
    marksOverlay.replaceChildren();
    const color='rgba(128,128,128,.58)';
    const range=document.createRange();
    const local=rect=>({
      left:(rect.left-pageRect.left)/zoom,
      right:(rect.right-pageRect.left)/zoom,
      top:(rect.top-pageRect.top)/zoom,
      bottom:(rect.bottom-pageRect.top)/zoom,
      width:rect.width/zoom,
      height:rect.height/zoom,
    });
    for (const block of editor.view.dom.querySelectorAll('p,h1,h2,h3,pre')) {
      const bounds=local(block.getBoundingClientRect());
      if(bounds.bottom<0 || bounds.top>height || bounds.right<0 || bounds.left>width)continue;
      if (block.tagName==='P') {
        const style=getComputedStyle(block);
        const lineHeight=Number.parseFloat(style.lineHeight)||20;
        const indent=Number.parseFloat(style.textIndent)||0;
        const rects=[];
        for(const child of block.childNodes) {
          if(child.matches?.('.label-node,.ProseMirror-trailingBreak'))continue;
          if(child.nodeType===Node.TEXT_NODE)range.selectNodeContents(child);else range.selectNode(child);
          rects.push(...Array.from(range.getClientRects()).map(local)
            .filter(rect=>rect.width>0 && rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1));
        }
        for (const atom of block.querySelectorAll('math-field,.ref-node,.cite-node,img')) {
          if (atom.closest('.label-node')) continue;
          const rect=local(atom.getBoundingClientRect());
          if (rect.width>0 && rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1) rects.push(rect);
        }
        const rect=rects.reduce((last, rect) => !last || rect.top>last.top+lineHeight/2 || (Math.abs(rect.top-last.top)<lineHeight/2 && rect.right>last.right) ? rect : last, null);
        const y=bounds.top+lineHeight/2;
        const mark=shape('text',{
          x:(rect?.right??bounds.left+indent)+3,
          y:rect?(rect.top+rect.bottom)/2:y,
          'font-size':lineHeight*.55,
          'font-family':'sans-serif',
          'text-anchor':'start',
          'dominant-baseline':'middle',
          fill:color,
        });
        mark.textContent='¶';
        marksOverlay.append(mark);
        if(indent>0) {
          const end=bounds.left+indent-4;
          marksOverlay.append(shape('line',{x1:bounds.left+2,y1:y,x2:end,y2:y,stroke:color,'stroke-width':1}));
          marksOverlay.append(shape('line',{x1:end,y1:y-3,x2:end,y2:y+3,stroke:color,'stroke-width':1}));
        }
      }
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{
        acceptNode:node=>node.parentElement.closest('[contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      for(let node=walker.nextNode();node;node=walker.nextNode()) {
        for(const match of node.data.matchAll(/[ \u00a0\t]/g)) {
          range.setStart(node,match.index);
          range.setEnd(node,match.index+1);
          const rect=local(range.getBoundingClientRect());
          if(rect.width<1 || rect.bottom<0 || rect.top>height || rect.right<0 || rect.left>width)continue;
          const x=(rect.left+rect.right)/2;
          const y=(rect.top+rect.bottom)/2;
          if(match[0]==='\t') {
            const end=rect.right-2;
            marksOverlay.append(shape('path',{
              d:`M ${rect.left+2} ${y} L ${end} ${y} L ${end-3} ${y-3} M ${end} ${y} L ${end-3} ${y+3}`,
              fill:'none',stroke:color,'stroke-width':1,
            }));
          } else {
            marksOverlay.append(shape('circle',{
              cx:x,cy:y,r:Math.max(.8,Math.min(2,rect.height*.057)),
              fill:match[0]==='\u00a0'?'none':color,
              stroke:match[0]==='\u00a0'?color:'none','stroke-width':1,
            }));
          }
        }
      }
    }
  }
  function scheduleCaret(intent=null,activity=false) {
    if (intent==='edit' || intent==='edit-rapid' || intent==='composition' || !caretIntent) caretIntent=intent;
    caretActivity ||= activity;
    if (!caretFrame) caretFrame=requestAnimationFrame(drawCaret);
  }
  function rememberEdit() {
    rowDirection=0;
    const doc=editor.state.doc;
    if (pendingEdit?.doc===doc && performance.now()<pendingEdit.expires) return;
    pendingEdit={doc,expires:performance.now()+150,origin:textCaret.prepareEdit()};
  }
  function scheduleMarks() {
    if (!marksFrame) marksFrame=requestAnimationFrame(drawMarks);
  }
  function scheduleLayout() {
    scheduleCaret();
    scheduleMarks();
  }
  function yieldCaret() {
    caretIntent=null;
    caretOrigin=null;
    rowDirection=undefined;
    pendingEdit=null;
    lastEditTransactionAt=0;
    textCaret.hide();
    hidePreeditCaret();
  }
  editor.on('transaction',({transaction})=>{
    if (transaction.docChanged) {
      const edit=pendingEdit;
      pendingEdit=null;
      if (!composing && !editor.view.composing && caretIntent!=='composition') {
        if (edit?.doc===transaction.before && performance.now()<edit.expires) {
          caretOrigin=edit.origin ?? caretOrigin;
          const now=performance.now();
          const rapid=now-lastEditTransactionAt<120;
          lastEditTransactionAt=now;
          scheduleCaret(rapid?'edit-rapid':'edit',true);
        } else yieldCaret();
      }
      scheduleMarks();
    }
    scheduleCaret(transaction.selectionSet && !transaction.docChanged ? 'navigate' : null,
      transaction.docChanged || transaction.selectionSet);
    if (!transaction.selectionSet || !arrowOrigin || editor.state.storedMarks) return;
    const state=editor.state;
    const origin=arrowOrigin;
    queueMicrotask(()=>{
      if (editor.state!==state || arrowOrigin!==origin || !editor.view.hasFocus()) return;
      const edge=boxEdge();
      if (!edge || state.selection.from===origin.position) return;
      arrowOrigin=null;
      editor.view.dispatch(state.tr.setStoredMarks(edge.end===origin.right?edge.insideMarks:edge.outsideMarks));
    });
  });
  paper.addEventListener('focusin',()=>{scheduleCaret(null,true);scheduleMarks();},{signal});
  paper.addEventListener('focusout',event=>{
    if (event.target===editor.view.dom) {
      composing=false;
      compositionOrigin=null;
      compositionFormula=null;
      preeditText='';
      hidePreeditCaret();
    }
    if (!selectionFocus || event.relatedTarget!==selectionFocus) yieldCaret();
    scheduleCaret();
  },{signal});
  selectionFocus?.addEventListener('blur',()=>scheduleCaret(),{signal});
  paper.addEventListener('beforeinput',event=>{
    if (event.target!==editor.view.dom || composing || event.isComposing ||
        event.inputType==='insertCompositionText' || event.inputType==='insertFromComposition') return;
    if (TEXT_EDIT.has(event.inputType)) {
      rememberEdit();
    } else {
      yieldCaret();
      scheduleCaret(null,true);
    }
  },{capture:true,signal});
  paper.addEventListener('compositionstart',event=>{
    if (event.target!==editor.view.dom) return;
    compositionOrigin=textCaret.captureNativeCaret();
    const { $from, empty } = editor.state.selection;
    const previous = $from.nodeBefore;
    compositionFormula = empty && previous?.type.name==='math'
      ? editor.view.nodeDOM($from.pos-previous.nodeSize) : null;
    preeditText='';
    composing=true;
    arrowOrigin=null;
    yieldCaret();
    scheduleLayout();
  },{capture:true,signal});
  paper.addEventListener('compositionupdate',event=>{
    if (event.target!==editor.view.dom) return;
    preeditText=event.data;
    scheduleLayout();
  },{signal});
  paper.addEventListener('compositionend',event=>{
    if (event.target!==editor.view.dom || !composing) return;
    composing=false;
    compositionFormula=null;
    preeditText='';
    hidePreeditCaret();
    if (event.data && editor.view.hasFocus()) {
      caretOrigin=compositionOrigin;
      scheduleCaret('composition',true);
    }
    compositionOrigin=null;
    scheduleLayout();
  },{capture:true,signal});
  document.addEventListener('selectionchange',()=>scheduleCaret('navigate',true),{signal});
  document.addEventListener('pointerdown',()=>{pendingEdit=null;},{capture:true,signal});
  document.addEventListener('visibilitychange',()=>{yieldCaret();scheduleCaret();},{signal});
  window.addEventListener('blur',yieldCaret,{signal});
  window.addEventListener('focus',()=>scheduleCaret(null,true),{signal});
  window.addEventListener('scroll',scheduleLayout,{capture:true,passive:true,signal});
  window.addEventListener('resize',scheduleLayout,{signal});
  paper.addEventListener('load',scheduleLayout,{capture:true,signal});
  document.fonts?.addEventListener('loadingdone',scheduleLayout,{signal});
  textCaret.watchPreferences(()=>scheduleCaret(),signal);
  const observer=new ResizeObserver(scheduleLayout);
  observer.observe(page);
  observer.observe(editor.view.dom);
  // The browser can change the editable DOM during composition before a
  // ProseMirror transaction is emitted. Refresh the visual layer in either case.
  const contentObserver=new MutationObserver(scheduleLayout);
  contentObserver.observe(paper,{subtree:true,childList:true,characterData:true});
  contentObserver.observe(page,{attributes:true,attributeFilter:['style','hidden','data-caret-motion'],childList:true});
  editor.on('destroy',()=>{
    listeners.abort();
    observer.disconnect();
    contentObserver.disconnect();
    cancelAnimationFrame(caretFrame);
    cancelAnimationFrame(marksFrame);
    textCaret.destroy();
    overlay.remove();
    emptyBox.remove();
  });
  scheduleLayout();
  return { toggleBox, setFormattingMarks(value) { enabled=value;scheduleLayout(); } };
}
