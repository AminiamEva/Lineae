import {stagedRaster} from '../typesetting/rtex/raster-assets.mjs';
import {desktopEngineToggle,nativeWorkspaceRequested,selectDesktopEngine} from '../editor/native-surface/acceptance-mode.mjs';
import {DEFAULT_DOCUMENT_SOURCE} from '../editor/default-document.mjs';
import {t} from './i18n.mjs';
import {installNativePages} from '../typesetting/rtex/pages.mjs';
import {installNativePdf} from '../typesetting/rtex/pdf.mjs';
import {matchesRichFormula,nativeCaretTargets} from '../editor/native-math/rich-slot.mjs';
import {sameFormula,surfaceCaretRect} from '../editor/native-surface/math-surface.mjs';
import {createNativeDocumentSession,sameTable} from '../editor/native-surface/document-session.mjs';
import {canBeginProseFormula,projectMixedDocument,projectMixedSnapshot,textTarget} from '../editor/native-text/projection.mjs';
import {nativeTarget} from '../editor/native-math/resolve.mjs';
import {parseDocument} from '../../latex/document.mjs';
import {resolvePackages} from '../../latex/packages.mjs';
import {readDelimiterPair} from '../editor/delimiter-input.js';
import {separateRepeatedOwners} from '../editor/native-surface/repeated-owners.mjs';

// Native LaTeX output is the primary page. The opt-in native input mode sends
// supported keys, caret and IME through this surface into ProseMirror; the old
// JS-formatted page and MathLive inputs stay available as the migration fallback.
export function installNativeTexPreview({host,before,primary=false,documentZoom=100,isDocumentMode,splitHost,getSource,getSnapshot,isComposing,focusMathSlot,focusImage,listTikzDrawings,editTikzDrawing,openMeasuredDrawing,navigateReference,listSourceBlocks,openSourceBlock,continuationRegion,nativeTextEnvironment,continueNativeTextEnvironment,selectionRegions,foldedFiles,selectText,serializeTextSelection,commitMath,commitText,commitTextLines,commitInlinePaste,commitProjectRange,commitMixedSelection,canStartText,commitInitialText,commitInitialMath,commitParagraphBreak,commitParagraphJoin,commitHardBreak,commitNewMath,commitAfterFormulaText,onEnvironmentChange,showTextCommands,history}) {
  const invoke=window.__TAURI__?.core?.invoke;
  if(!invoke) return {refresh(){},documentChanged(){},relocalize(){}};
  const button=document.createElement('button');
  button.id='native-tex-toggle';button.type='button';button.setAttribute('aria-pressed','false');
  const panel=document.createElement('aside');
  panel.id='native-tex-preview';panel.hidden=true;
  panel.setAttribute('aria-label','LuaLaTeX');
  const heading=document.createElement('h2');
  const notice=document.createElement('p');
  const controls=document.createElement('div');controls.className='native-tex-controls';
  const status=document.createElement('p');status.setAttribute('role','status');
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.id='native-tex-export';
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.id='native-tex-close';
  const targetButton=document.createElement('button');targetButton.type='button';targetButton.id='native-tex-target';
  const editButton=document.createElement('button');editButton.type='button';editButton.id='native-tex-edit';
  editButton.setAttribute('aria-pressed','false');
  const tikzSelect=document.createElement('select');tikzSelect.hidden=true;
  const tikzEdit=document.createElement('button');tikzEdit.id='native-tex-edit-tikz';tikzEdit.type='button';tikzEdit.hidden=true;
  let lastDrawings='';
  const sourceBlock=document.createElement('select');sourceBlock.hidden=true;
  const sourceBlockEdit=document.createElement('button');
  sourceBlockEdit.id='native-tex-edit-source-block';sourceBlockEdit.type='button';sourceBlockEdit.hidden=true;
  let availableBlocks=[],lastSourceBlocks='';
  const labelSourceBlockEdit=()=>{
    const kind=availableBlocks[sourceBlock.selectedIndex]?.edit?.kind;
    sourceBlockEdit.textContent=kind==='code'?t('编辑代码块','Edit code block'):
      kind==='command'?t('编辑 LaTeX 命令','Edit LaTeX command'):t('编辑源码块','Edit source block');
  };
  sourceBlock.addEventListener('change',labelSourceBlockEdit);
  const targetStatus=document.createElement('p');targetStatus.setAttribute('role','status');
  const startText=document.createElement('button');
  startText.id='native-tex-start-text';startText.type='button';startText.hidden=true;
  const zoom=document.createElement('select');zoom.id='native-tex-zoom';
  for(const value of [50,75,100,125,150,200]) zoom.append(new Option(value+'%',String(value)));
  zoom.value='75';zoom.setAttribute('aria-label',t('原生预览缩放','Native preview zoom'));
  let zoomPercent=primary?documentZoom:75;
  controls.append(zoom,editButton,tikzSelect,tikzEdit,sourceBlock,sourceBlockEdit,exportButton,targetButton,closeButton);
  if(primary){
    panel.dataset.primary='true';
    panel.dataset.pagePresentation='pages';
    targetButton.hidden=true;editButton.hidden=true;zoom.hidden=true;
  }
  const pages=document.createElement('div');pages.className='native-tex-pages';
  const input=document.createElement('textarea');
  input.id='native-tex-input';input.className='native-tex-input';input.rows=1;input.wrap='off';
  input.spellcheck=false;input.autocapitalize='off';input.autocomplete='off';
  input.setAttribute('aria-label',t('原生公式输入','Native formula input'));
  panel.append(heading,notice,controls,status,targetStatus,startText,pages);
  panel.append(input);
  document.body.append(panel);host.insertBefore(button,before);
  let session=null,sourceRevision=0,sentSource='',wantedSource='',generation=0;
  let timer=null,pollTimer=null,updating=null,exporting=null,opening=false;
  let sentSnapshot=null,wantedSnapshot=null,captureId=0,capturing=null,pdfRendered=-1;
  let renderedRevision=-1,error='',active=false,terminal=false;
  let mode='canvas',pdfWanted=-1,pdfAttempt=null,pdfLayout=null;
  let pdfGeometryAvailable=false;
  const recordedPages=new Map();
  const hasGeometry=()=>mode==='canvas'||pdfGeometryAvailable;
  let pollEpoch=0;
  let targeting=null,observation=null,targetArmed=false,lastTarget=null,targetTimer=null;
  let previousProjection=null;
  let foldsDirty=false;
  let mirror=null;
  const engineToggle=desktopEngineToggle();
  if(engineToggle){
    heading.hidden=true;
    notice.hidden=true;
    closeButton.hidden=true;
    document.querySelector('header .tools').append(exportButton);
  }
  let primaryRequested=engineToggle&&nativeWorkspaceRequested();
  let mountedSplit=null;
  const acceptsInput=()=>!primary||isDocumentMode?.();
  let draftInput=null;
  let compositionField=null;
  const composing=()=>isComposing()||Boolean(compositionField?.isConnected);
  const nativeDocument=createNativeDocumentSession(endpoint=>{
    const target=resolveEndpoint(endpoint);
    return target?.kind==='math'?target:null;
  });
  let nativeEditing=false;
  let pendingLatency=null;
  let inputStart=0;
  let pendingEdit=null;
  let outlineTarget=null;
  const queuedInput=[];
  const latency=[];
  const eventApi=window.__TAURI__?.event;
  function resolveEndpoint(endpoint) {
    const owned=observation?.projection?.owners.get(endpoint?.owner);
    if(owned?.paragraph)
      return textTarget(observation.projection, endpoint.owner, Boolean(endpoint.after));
    return nativeTarget(observation?.projection, endpoint);
  }
  function useTextSelection(requireRange=false){
    const {caret,anchor}=nativeDocument.surface;
    return Boolean(current()&&observation&&!pendingEdit&&caret?.kind==='text'&&
      (!requireRange||anchor!==caret)&&selectText?.(anchor,caret));
  }
  function paintSurfaceSelection(reflect=false) {
    const caret = nativeDocument.surface.caret, anchor = nativeDocument.surface.anchor;
    if (!caret) return;
    if (anchor && anchor!==caret) renderer.showSelection(anchor.hit,caret.hit,
      anchor.kind!==caret.kind||anchor.kind==='math'&&!sameFormula(anchor,caret)?
        nativeDocument.proseRanges(anchor,caret):undefined);
    else renderer.showCaret(caret.hit);
    if(reflect)useTextSelection();
    onEnvironmentChange?.();
  }
  function positionInput(reveal=false) {
    if(inputComposition&&!inputComposition.ended)return;
    const stop = nativeDocument.surface.caret;
    if (!stop) return;
    const canvas = pages.querySelector(`[data-native-page="${stop.page}"] canvas`);
    if (!canvas) return;
    let box=canvas.getBoundingClientRect();
    const scale = zoomPercent / 100 * (96 / 72) / 65781.76;
    let rect=surfaceCaretRect(stop,scale,box.left,box.top);
    if (!rect) return;
    if(reveal){
      const viewport=panel.getBoundingClientRect();
      const vertical=rect.y<viewport.top?rect.y-viewport.top-12:
        rect.y+rect.height>viewport.bottom?rect.y+rect.height-viewport.bottom+12:0;
      if(vertical){
        panel.scrollTop+=vertical;
        box=canvas.getBoundingClientRect();
        rect=surfaceCaretRect(stop,scale,box.left,box.top);
      }
    }
    input.style.left = rect.x + 'px';
    input.style.top = rect.y + 'px';
    input.style.height = Math.max(14, rect.height) + 'px';
  }
  function selectNavigationTarget(address){
    if(!nativeEditing||!acceptsInput()||!current()||!observation||pendingEdit)return false;
    const containing=new Set([...(address.trail??[]),address.path]);
    for(const path of foldedFiles?.()??[]){
      if(containing.has(path))document.dispatchEvent(new CustomEvent('lineae-toggle-project-file',{detail:{path}}));
    }
    if(!(address.range?nativeDocument.selectTextRange(address):nativeDocument.selectRegion(address)))return false;
    cancelDraftInput();
    paintSurfaceSelection(true);
    positionInput(true);
    if(!address.range)input.focus({preventScroll:true});
    return true;
  }
  function commitSurface(edit) {
    if (!edit) return;
    const started=inputStart || performance.now();
    inputStart=0;
    const needsAmsmath=edit.requiresAmsmath&&resolvePackages(parseDocument(sentSource)?.start??'',edit.text)
      .some(({name})=>name==='amsmath');
    const applied=edit.kind==='project-range'?commitProjectRange?.(edit.edits):edit.kind==='text'
      ? commitText?.({ paragraph: edit.paragraph, patch: edit.patch, text: edit.text })
      : commitMath?.({ formula: edit.formula, patch: edit.patch, text: edit.text, structure:edit.structure,
        needsAmsmath,cursor:nativeDocument.surface.pendingOffset });
    input.value = '';
    if(applied&&typeof applied==='object')return awaitSourcePosition(applied,started,edit.kind!=='text');
    if (!applied) {
      nativeDocument.surface.clearPending();
      queuedInput.length=0;
      targetStatus.textContent=needsAmsmath
        ?t('公式换行需要在主文档导言区加载 amsmath。','Load amsmath in the main document preamble to insert a display line.')
        :t('原生编辑未能写入文档。','The native edit could not be written to the document.');
      return;
    }
    pendingEdit=edit;
    pendingLatency={started,committed:performance.now()};
    return true;
  }
  function editSelection(action){
    const {surface}=nativeDocument;
    const [first,last]=surface.range;
    if(first?.kind!==last?.kind)return null;
    if(first?.kind==='text'&&last?.kind==='text'&&first.paragraph!==last.paragraph){
      const crossed=nativeDocument.editAcrossFiles(action.insert??'');
      if(crossed)return crossed;
    }
    return action.insert?surface.insert(action.insert,{paste:action.paste}):surface.erase(action.backward);
  }
  function replaceParagraphSelection(action){
    const [first,last]=nativeDocument.surface.range;
    if(first?.kind!=='text'||last?.kind!=='text'||first.paragraph===last.paragraph||
      first.paragraph.filePath!==last.paragraph.filePath||
      first.paragraph.occurrence!==last.paragraph.occurrence)return false;
    const applied=commitParagraphJoin?.(first,last,action.insert??'');
    return applied?awaitSourcePosition(applied,action.started):false;
  }
  function replaceMixedSelection(action){
    const [first,last]=nativeDocument.surface.range;
    if(!first||!last||first===last)return false;
    const spans=nativeDocument.structuralRanges(first,last);
    if(first.kind===last.kind&&!spans.some(span=>span.table||first.kind==='math'&&span.formula))return false;
    const applied=commitMixedSelection?.(spans,action.insert??'');
    if(!applied)return false;
    if(applied.offset!==null)return awaitSourcePosition(applied,action.started);
    renderer.clearCaret();
    return true;
  }
  function awaitSourcePosition(edit,started,math=false){
    pendingEdit={source:edit.source,[math?'formula':'paragraph']:{filePath:edit.path}};
    if(math)nativeDocument.expectInitialMath(pendingEdit,edit.offset,edit.path);
    else nativeDocument.expectInitialText(pendingEdit,edit.offset,edit.path);
    pendingLatency={started,committed:performance.now()};
    return true;
  }
  function cancelDraftInput(){
    delete input.dataset.initial;
    draftInput=null;
    paintSurfaceSelection(true);
    positionInput();
  }
  function finishFormula(){
    if(nativeDocument.leaveFormula()){
      cancelDraftInput();
      targetStatus.textContent='';
      return true;
    }
    const caret=nativeDocument.surface.caret;
    if(caret?.kind!=='math'||!commitAfterFormulaText)return false;
    draftInput={kind:'after-formula',formula:caret.formula};
    renderer.clearCaret();
    targetStatus.textContent=t('继续输入正文','Type text after the formula');
    return true;
  }
  const startingText=()=>draftInput?.kind==='initial'&&!draftInput.region;
  function hasNativeTextFocus(){
    return document.activeElement===input&&nativeEditing&&acceptsInput()&&
      (startingText()||nativeDocument.surface.caret?.kind==='text');
  }
  function startFormula(display,delimiter,template=''){
    if(!current()||pendingEdit)return false;
    if(startingText())draftInput={kind:'formula',initial:true,display,delimiter};
    else {
      if(!observation||draftInput)return false;
      const [first,last]=nativeDocument.surface.range;
      if(!canBeginProseFormula(first,last,display))return false;
      draftInput={kind:'formula',first,last,display,delimiter};
    }
    targetStatus.textContent=display?t('输入行间公式','Type a display formula'):t('输入行内公式','Type an inline formula');
    if(template){
      const committed=commitDraftInput({insert:template,started:performance.now()},nativeDocument.surface);
      if(!committed)cancelDraftInput();
      return committed;
    }
    return true;
  }
  function commitDraftInput(action,surface){
    if(!current())return false;
    if(!action.insert){cancelDraftInput();return true;}
    const draft=draftInput;
    let edit;
    switch(draft.kind){
      case 'paragraph':
        edit=commitParagraphBreak?.(draft.paragraph,draft.from,draft.to,action.insert);
        break;
      case 'hard-break':
        edit=commitHardBreak?.(draft.first,draft.last,action.insert);
        break;
      case 'script':
        edit=surface.singleCharacterScript?.(draft.marker,action.insert);
        if(!edit)return false;
        draftInput=null;
        inputStart=action.started;
        return commitSurface(edit);
      case 'formula':
        if(action.insert==='$'&&!draft.display){
          if(!draft.initial&&!canBeginProseFormula(draft.first,draft.last,true))return false;
          draft.display=true;
          targetStatus.textContent=t('输入行间公式','Type a display formula');
          return true;
        }
        edit=draft.initial?commitInitialMath?.(action.insert,draft.display,draft.delimiter):
          commitNewMath?.(draft.first,draft.last,action.insert,draft.display,draft.delimiter);
        break;
      case 'close-display':
        cancelDraftInput();
        targetStatus.textContent='';
        return action.insert==='$'&&!action.paste?finishFormula():submitInput(action);
      case 'after-formula':
        edit=commitAfterFormulaText?.(draft.formula,action.insert);
        break;
      case 'after-container':
        edit=continueNativeTextEnvironment?.(draft.caret,draft.outermost,action.insert);
        break;
      default:
        if(['$','$$'].includes(action.insert)&&!action.paste&&startFormula(action.insert==='$$'))return true;
        edit=commitInitialText?.(action.insert,draft.region);
    }
    if(!edit)return false;
    delete input.dataset.initial;
    draftInput=null;
    return awaitSourcePosition(edit,action.started,draft.kind==='formula');
  }
  function submitLineBreak(action){
    if(!current()||!observation||draftInput)return false;
    const {surface}=nativeDocument;
    const [first,last]=surface.range;
    if(action.lineBreak==='formula'){
      if(first?.kind!=='math')return false;
      inputStart=action.started;
      return commitSurface(surface.command('enterLine'));
    }
    if(first?.kind!=='text'||first.paragraph!==last?.paragraph)return false;
    const hard=action.lineBreak==='hard';
    const edit=hard?commitHardBreak?.(first,last,''):
      commitParagraphBreak?.(first.paragraph,first.local,last.local,'');
    if(edit?.awaitingText){
      if(hard){
        draftInput={kind:'hard-break',first,last};
        targetStatus.textContent=t('在换行后继续输入','Type after the line break');
      }else draftInput={kind:'paragraph',paragraph:first.paragraph,from:first.local,to:last.local};
      return true;
    }
    return edit?awaitSourcePosition(edit,action.started):false;
  }
  function submitInput(action) {
    const {surface}=nativeDocument;
    if(!nativeEditing||!acceptsInput())return false;
    if(pendingEdit){
      const last=queuedInput.at(-1);
      // Formula delimiters and script keys are interpreted individually. Even
      // plain text after a queued delimiter can arrive at a math caret.
      const changesMode=entry=>entry.paste||/[$\\^_]/.test(entry.insert??'');
      if(surface.caret?.kind==='text'&&action.insert&&last?.insert&&!changesMode(action)&&
        !queuedInput.some(changesMode))last.insert+=action.insert;
      else queuedInput.push(action);
      return true;
    }
    if(action.lineBreak)return submitLineBreak(action);
    if(startingText()&&action.insert==='\\'&&!action.paste){
      showTextCommands?.(input);
      return true;
    }
    if(draftInput)return commitDraftInput(action,surface);
    if(!surface.caret)return false;
    if(!current()||!observation)return false;
    if(replaceMixedSelection(action))return true;
    if(action.insert==='\\'&&!action.paste&&surface.caret.kind==='text'){
      showTextCommands?.(input);
      return true;
    }
    if(action.paste&&action.html&&surface.caret.kind==='text'){
      const edit=commitInlinePaste?.(...surface.range,action.html,action.mode);
      if(edit)return awaitSourcePosition(edit,action.started);
    }
    if(action.paste&&!action.insert)return false;
    if(action.paste&&/[\r\n]/.test(action.insert)&&surface.caret.kind==='text'){
      const edit=commitTextLines?.(...surface.range,action.insert);
      return edit?awaitSourcePosition(edit,action.started):false;
    }
    if(['$','$$'].includes(action.insert)&&!action.paste){
      if(surface.caret.kind==='math'){
        if(surface.caret.formula.kind==='displayMath'&&action.insert==='$'){
          draftInput={kind:'close-display'};
          targetStatus.textContent=t('再输入一个 $ 退出行间公式','Type another $ to close the display formula');
          return true;
        }
        return finishFormula();
      }
      if(startFormula(action.insert==='$$'))return true;
    }
    if(!action.paste&&surface.caret.kind==='math'&&surface.caret===surface.anchor&&['^','_'].includes(action.insert)){
      draftInput={kind:'script',marker:action.insert};
      targetStatus.textContent=action.insert==='^'?t('输入一个上标字符','Type one superscript character'):
        t('输入一个下标字符','Type one subscript character');
      return true;
    }
    const edit=editSelection(action);
    if(!edit&&replaceParagraphSelection(action))return true;
    if(!edit&&!action.insert&&surface.caret===surface.anchor&&surface.caret.kind==='text'){
      const {stops,index,caret}=surface;
      const pair=action.backward?[stops[index-1],caret]:[caret,stops[index+1]];
      const joined=commitParagraphJoin?.(...pair);
      if(joined)return awaitSourcePosition(joined,action.started);
    }
    inputStart=action.started;
    return commitSurface(edit);
  }
  function clearQueuedInput() {
    pendingEdit=null;
    pendingLatency=null;
    queuedInput.length=0;
  }
  function selectedSource() {
    const [from,to]=nativeDocument.surface.range;
    if(!from||from===to)return null;
    if(from.kind==='text'||to.kind==='text'||!sameFormula(from,to)){
      const ranges=nativeDocument.structuralRanges(from,to);
      return ranges.length?ranges.map(({paragraph,formula,table,from,to})=>table?
        table.owner.source.slice(table.from16,table.to16):formula?
        formula.source.slice(formula.outerFrom16,formula.outerTo16):paragraph.parts.map(part=>{
        const start=Math.max(part.from16,from),end=Math.min(part.to16,to);
        if(end<=start)return '';
        if(part.kind==='break')return '\n';
        if(part.offsets)return part.text.slice(part.offsets.indexOf(start-part.from16),part.offsets.indexOf(end-part.from16));
        return paragraph.text.slice(start,end);
      }).join('')).join('\n\n'):null;
    }
    if(from.kind==='math'&&from.formula===to.formula&&from.slot.id===to.slot.id)
      return from.slot.raw.slice(from.local,to.local);
    return null;
  }
  function cutSelection(){
    const action={backward:true,started:performance.now()};
    if(replaceMixedSelection(action))return true;
    const edit=editSelection(action);
    return edit?commitSurface(edit):replaceParagraphSelection(action);
  }
  function clipboardSelection(){
    if(!active||!nativeEditing||!isDocumentMode?.()||!primary&&document.activeElement!==input)return null;
    const {caret,anchor}=nativeDocument.surface,frame=observation;
    const valid=()=>current()&&frame&&observation===frame&&!pendingEdit&&
      nativeDocument.surface.caret===caret&&nativeDocument.surface.anchor===anchor;
    const text=valid()?selectedSource():null;
    return {
      text,
      html:text!==null&&useTextSelection(true)?serializeTextSelection?.():null,
      cut:()=>valid()&&cutSelection(),
      paste:({text,html,mode})=>{
        if(!valid()||!text&&!html)return false;
        input.focus({preventScroll:true});
        return submitInput({insert:text,html,mode,paste:true,started:performance.now()});
      },
    };
  }
  function leaveFile(){
    if(!current()||!observation||pendingEdit)return false;
    const target=continuationRegion?.(nativeDocument.surface.caret);
    if(!target)return false;
    if(!nativeDocument.selectRegion(target)){
      if(!target.empty)return false;
      draftInput={kind:'initial',region:target};
      renderer.clearCaret();
      targetStatus.textContent=t('继续编辑 ','Continue editing ')+target.path;
      return true;
    }
    draftInput=null;
    paintSurfaceSelection(true);
    positionInput();
    return true;
  }
  function chooseNativeDelimiters(rightFirst){
    const {surface}=nativeDocument;
    const caret=surface.caret,anchor=surface.anchor,snapshot=observation;
    input.focus({preventScroll:true});
    void readDelimiterPair(input.getBoundingClientRect(),rightFirst,null,input).then(pair=>{
      if(!pair||!current()||observation!==snapshot||surface.caret!==caret||surface.anchor!==anchor)return;
      inputStart=performance.now();
      commitSurface(surface.wrapFence?.(pair));
    });
    return true;
  }
  for(const type of ['copy','cut']){
    input.addEventListener(type,event=>{
      const selection=clipboardSelection(),text=selection?.text??null;
      if(text===null||!event.clipboardData)return;
      if(type==='cut'){
        if(!selection.cut())return;
      }
      event.clipboardData.setData('text/plain',text);
      if(selection.html)event.clipboardData.setData('text/html',selection.html);
      event.preventDefault();
    });
  }
  input.addEventListener('paste',event=>{
    if(!nativeEditing||!event.clipboardData)return;
    event.preventDefault();
    const text=event.clipboardData.getData('text/plain'),html=event.clipboardData.getData('text/html');
    if(text||html)submitInput({insert:text,html,paste:true,started:performance.now()});
  });
  let inputComposition=null;
  function commitComposition(composition){
    if(composition.committed||!composition.text)return;
    composition.committed=true;
    submitInput({insert:composition.text,started:performance.now()});
  }
  input.addEventListener('compositionstart', () => {
    inputStart=0;
    input.scrollLeft=0;
    inputComposition={text:'',ended:false,committed:false};
    compositionField=input;
    input.dataset.composing='true';
    renderer.clearCaret();
  });
  input.addEventListener('compositionend', event => {
    compositionField=null;
    const composition=inputComposition??{committed:false};
    composition.text=event.data||'';
    composition.ended=true;
    inputComposition=composition;
    delete input.dataset.composing;
    input.value='';
    if(!composition.text)paintSurfaceSelection();
    queueMicrotask(()=>{if(inputComposition===composition)commitComposition(composition);});
    setTimeout(refresh,0);
  });
  input.addEventListener('input', event => {
    const composition=inputComposition;
    if(event.isComposing||event.inputType==='insertCompositionText'||(composition&&!composition.ended))return;
    const insert=event.data??input.value;
    input.value='';
    if(composition){
      const replay=insert===composition.text||event.inputType==='insertFromComposition';
      if(replay){
        composition.text||=insert;
        commitComposition(composition);
        return;
      }
      commitComposition(composition);
      inputComposition=null;
    }
    if(insert&&!composing())submitInput({insert,started:inputStart||performance.now()});
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || (inputComposition&&!inputComposition.ended))return;
    if (!nativeEditing || !acceptsInput()) return;
    const {surface}=nativeDocument;
    if (!event.metaKey && !event.ctrlKey && !event.altKey && [...event.key].length===1){
      if(inputComposition?.ended)commitComposition(inputComposition);
      inputComposition=null;
      inputStart=performance.now();
    }
    const mod = event.metaKey || event.ctrlKey;
    if(draftInput&&(['Escape','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)||
      (mod&&['z','y'].includes(event.key.toLowerCase())))){
      if(!startingText()||event.key==='Escape')cancelDraftInput();
      event.preventDefault();
      return;
    }
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      clearQueuedInput();
      surface.clearPending();
      history?.(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      clearQueuedInput();
      surface.clearPending();
      history?.('redo');
      return;
    }
    if(event.key==='Tab'&&!mod&&!event.altKey&&surface.caret?.kind==='text'){
      event.preventDefault();
      if(surface.caret.paragraph.tableCell){
        if(current()&&observation&&!pendingEdit&&nativeDocument.moveTableCell(event.shiftKey)){
          paintSurfaceSelection(true);
          positionInput(true);
        }
      }else if(event.shiftKey){
        if(current()&&observation&&!pendingEdit){
          const edit=surface.erase(true,{indent:true});
          if(edit){inputStart=performance.now();commitSurface(edit);}
        }
      }else {
        submitInput({insert:'    ',started:performance.now()});
      }
      return;
    }
    if(!event.shiftKey&&!pendingEdit&&current()&&observation&&
        ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(event.key)){
      const script=surface.clearEmptyScript?.();
      if(script){event.preventDefault();commitSurface(script);return;}
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (!pendingEdit&&nativeDocument.move(event.key==='ArrowLeft'?-1:1,event.shiftKey)) {
        paintSurfaceSelection(true);
        positionInput();
      }
      return;
    }
    if(['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)){
      event.preventDefault();
      const jumpPage=event.key.startsWith('Page'),pageTops=new Map();
      const scale=zoomPercent/100*(96/72)/65781.76;
      const positions=jumpPage?{height:Math.max(1,panel.clientHeight-24),position:stop=>{
        if(!pageTops.has(stop.page))pageTops.set(stop.page,
          pages.querySelector(`[data-native-page="${stop.page}"] canvas`)?.getBoundingClientRect().top);
        return pageTops.get(stop.page)+(stop.top+stop.bottom)/2*scale;
      }}:undefined;
      if(!pendingEdit&&nativeDocument.moveVertical(
        event.key.endsWith('Up')?-1:1,event.shiftKey,jumpPage,positions)){
        paintSurfaceSelection(true);
        positionInput(true);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if(!pendingEdit&&nativeDocument.move(event.key==='Home'?-1e6:1e6,event.shiftKey)){
        paintSurfaceSelection(true);
        positionInput();
      }
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      submitInput({backward:event.key==='Backspace',started:performance.now()});
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearQueuedInput();
      draftInput=null;
      input.blur();
      return;
    }
    if(event.key==='Enter'&&!mod&&!event.altKey){
      event.preventDefault();
      const kind=pendingEdit?(pendingEdit.formula?'math':'text'):surface.caret?.kind;
      if(kind)submitInput({lineBreak:kind==='math'?'formula':'paragraph',started:performance.now()});
    }
  });
  let unlisten=null;
  let eventsLive=false;
  if(eventApi?.listen){
    eventApi.listen('lineae-native-tex',({payload})=>{
      if(!active||!payload||payload.sessionId!==session)return;
      handleEvent(payload.event);
      renderStatus();
    }).then(fn=>{unlisten=fn;eventsLive=true;}).catch(()=>{});
  }
  const pdf=installNativePdf({host:pages,onPaint:revision=>{
    if(!active||mode!=='pdf')return;
    renderedRevision=revision;pdfRendered=revision;if(!terminal&&revision>=sourceRevision)error='';renderStatus();
  },onError:failure=>{if(active&&mode==='pdf')fail(failure);}});
  const renderer=installNativePages({host:pages,
    foldLabel:(path,skipped)=>path+' · '+t('已折叠，点击展开','Folded; click to expand')+
      (skipped.length?' · '+t('隐藏页 ','Hidden pages ')+skipped.join(', '):''),
    onExpandFile:path=>document.dispatchEvent(new CustomEvent('lineae-toggle-project-file',{detail:{path}})),
    getFont:key=>invoke('native_tex_font',{sessionId:session,key}),
    getTypeOneFont:key=>invoke('native_tex_type_one_font',{sessionId:session,key}),
    getRaster:file=>sentSnapshot?.dependencySignature===wantedSnapshot?.dependencySignature
      ? stagedRaster(sentSnapshot,file) : null,
    onPaint:revision=>{
      if(!active||mode!=='canvas')return;
      renderedRevision=revision;if(!terminal&&revision>=sourceRevision)error='';renderStatus();
      syncCaret();
    },
    onError:(failure,revision)=>{if(active&&mode==='canvas')void fallback(failure,revision);},
    onImageHit:(path,revision)=>{
      if(acceptsInput()&&current()&&hasGeometry()&&revision===sourceRevision)focusImage?.(path);
    },
    onDrawingHit:(drawing,stamp)=>{
      if(acceptsInput()&&current()&&hasGeometry()&&observation?.stamp.sessionId===stamp.sessionId&&
         observation.stamp.sourceRevision===stamp.sourceRevision)openMeasuredDrawing?.(drawing);
    },
    onReferenceHit:(reference,stamp,event)=>{
      if(nativeEditing&&acceptsInput()&&current()&&hasGeometry()&&!pendingEdit&&observation?.stamp.sessionId===stamp.sessionId&&
        observation.stamp.sourceRevision===stamp.sourceRevision&&navigateReference?.(reference))event.preventDefault();
    },
    proseRanges:(from,to)=>nativeDocument.proseRanges(resolveEndpoint(from),resolveEndpoint(to)),
    onMathHit:async(hit,stamp,origin,sameGesture)=>{
      if(!acceptsInput()||!current()||!hasGeometry()||!observation||
          stamp.sessionId!==observation.stamp.sessionId||
          stamp.sourceRevision!==observation.stamp.sourceRevision)return;
      const head=resolveEndpoint(hit),anchor=origin?resolveEndpoint(origin):head;
      if(!head||!anchor||head.kind!==anchor.kind)return false;
      if((anchor.kind==='text'||head.kind==='text')&&!nativeEditing)return false;
      if(nativeEditing){
        if(pendingEdit)return false;
        if(!nativeDocument.select(anchor,head))return false;
        draftInput=null;
        inputStart=performance.now();
        positionInput();
        input.focus({preventScroll:true});
        paintSurfaceSelection(true);
        return true;
      }
      const focused=await focusMathSlot?.(anchor,head,()=>
        sameGesture()&&active&&session===stamp.sessionId&&sourceRevision===stamp.sourceRevision&&
        wantedSnapshot?.signature===sentSnapshot?.signature);
      if(focused?.field&&sameGesture())bindCaret(focused.field,head.formula);
      return Boolean(focused);
    },
  });
  function syncCaret() {
    if(!observation||observation.kind==='text'||!mirror||!current()||document.activeElement!==mirror.field)return;
    const formula=[...observation.projection.owners.values()].find(({formula})=>
      formula&&formula.kind===mirror.kind&&formula.ordinal===mirror.ordinal&&
      formula.filePath===mirror.filePath)?.formula;
    if(!formula||formula.math.atoms.length>200||!matchesRichFormula(mirror.field,formula))return;
    const range=mirror.field.selection.ranges[0];
    if(!range)return;
    const model=mirror.field._mathfield?.model;
    if(!model)return;
    if(mirror.formula!==formula||mirror.model!==model){
      mirror.formula=formula;mirror.model=model;mirror.targets=nativeCaretTargets(model,formula);
    }
    if(range[0]!==range[1]){
      renderer.showSelection(mirror.targets.get(range[0]),mirror.targets.get(range[1]));
      return;
    }
    const target=mirror.targets.get(mirror.field.position);
    if(target)renderer.showCaret(target);
  }
  function bindCaret(field,formula){
    mirror?.lifetime.abort();
    const lifetime=new AbortController();
    mirror={field,lifetime,kind:formula.kind,ordinal:formula.ordinal,filePath:formula.filePath};
    field.addEventListener('selection-change',()=>requestAnimationFrame(syncCaret),{signal:lifetime.signal});
  }
  function current() {
    return active && session!==null && !opening && !composing() && updating!==generation && exporting!==generation &&
      capturing!==generation && !terminal && !error && wantedSnapshot?.signature===sentSnapshot?.signature &&
      wantedSource===sentSource && renderedRevision===sourceRevision;
  }
  function renderStatus() {
    // Changing the preview controls can move the page and its IME anchor.
    if(inputComposition&&!inputComposition.ended)return;
    if(foldsDirty&&nativeEditing&&acceptsInput()&&current()&&observation)refreshFoldView();
    exportButton.disabled=!current();
    targetButton.disabled=!acceptsInput()||!current()||!hasGeometry()||targeting===generation;
    editButton.disabled=!current()||!hasGeometry()||!observation;
    const drawings=current()&&isDocumentMode?.()?listTikzDrawings?.()??[]:[];
    const drawingKey=JSON.stringify(drawings);
    if(drawingKey!==lastDrawings){
      const selected=tikzSelect.value;
      tikzSelect.replaceChildren(...drawings.map(({position,label},index)=>
        new Option(drawings.length>1?`${index+1}. ${label}`:label,String(position))));
      if(drawings.some(drawing=>String(drawing.position)===selected))tikzSelect.value=selected;
      lastDrawings=drawingKey;
    }
    tikzSelect.hidden=drawings.length<2;
    tikzEdit.hidden=drawings.length===0;
    availableBlocks=current()&&isDocumentMode?.()?listSourceBlocks?.()??[]:[];
    const sourceBlocksKey=JSON.stringify(availableBlocks.map(({path,from,to,label})=>[path,from,to,label]));
    if(sourceBlocksKey!==lastSourceBlocks){
      const selected=sourceBlock.value;
      sourceBlock.replaceChildren(...availableBlocks.map(({path,from,label})=>new Option(`${path} · ${label}`,`${path}:${from}`)));
      if([...sourceBlock.options].some(option=>option.value===selected))sourceBlock.value=selected;
      lastSourceBlocks=sourceBlocksKey;
    }
    labelSourceBlockEdit();
    sourceBlock.hidden=availableBlocks.length<2;
    sourceBlockEdit.hidden=availableBlocks.length===0;
    startText.hidden=engineToggle||!primary||!acceptsInput()||!current()||Boolean(observation)||!canStartText?.();
    if(engineToggle){
      exportButton.hidden=!active;
      controls.hidden=[...controls.children].every(control=>control.hidden);
      status.hidden=!error;
      targetStatus.hidden=true;
    }
    editButton.setAttribute('aria-pressed',String(nativeEditing));
    const canRefreshTargets=nativeEditing||(!sentSnapshot?.files?.length&&sentSource.length<=32*1024);
    if(targetArmed&&!targetButton.disabled&&canRefreshTargets&&targetTimer===null&&
        (lastTarget?.sessionId!==session||lastTarget?.sourceRevision!==sourceRevision||
         lastTarget?.signature!==sentSnapshot?.signature)){
      targetTimer=setTimeout(()=>{
        targetTimer=null;
        if(targetArmed&&!targetButton.disabled)void observe();
      },nativeEditing?0:350);
    }
    button.setAttribute('aria-pressed',String(active));
    if(engineToggle){
      button.disabled=Boolean(inputComposition&&!inputComposition.ended||pendingEdit||queuedInput.length);
      button.textContent=primaryRequested?'LuaLaTeX':'XeLaTeX';
      button.setAttribute('aria-label',primaryRequested?t('切换到 XeLaTeX','Switch to XeLaTeX'):t('切换到 LuaLaTeX','Switch to LuaLaTeX'));
    }else if(primary)button.textContent=active?t('退出原生文档','Leave native document'):t('原生文档','Native document');
    else button.textContent=active?t('关闭 LuaLaTeX 预览','Close LuaLaTeX preview'):t('LuaLaTeX 预览（实验）','LuaLaTeX preview (experimental)');
    panel.dataset.state=error?'error':current()?'current':active?'stale':'off';
    panel.dataset.renderer=mode;
    panel.dataset.editing=String(nativeEditing&&acceptsInput());
    status.textContent=error?t('原生预览不可用：','Native preview unavailable: ')+error:
      opening?t('正在启动 LuaLaTeX…','Starting LuaLaTeX…'):
      exporting===generation?t('正在导出已确认版本的 PDF…','Exporting the confirmed PDF revision…'):
      current()?t('已显示源码修订 ','Showing source revision ')+sourceRevision+(mode==='pdf'?' · PDF':''):
      t('排版中；现有画面可能过期。编辑可以继续。','Typesetting; the last frame may be stale. Editing can continue.');
  }
  function relocalize() {
    heading.textContent=t('LuaLaTeX 原生排版预览','Native LuaLaTeX preview');
    notice.textContent=t('此处显示 LuaLaTeX 输出。已核对位置的文字和公式可直接编辑。',
      'This view shows LuaLaTeX output. Text and formulas with verified positions can be edited here.');
    exportButton.textContent=engineToggle?t('导出 PDF','Export PDF'):t('导出干净 PDF','Export clean PDF');
    tikzSelect.setAttribute('aria-label',t('TikZ 图形','TikZ drawing'));
    tikzEdit.textContent=t('编辑 TikZ','Edit TikZ');
    sourceBlock.setAttribute('aria-label',t('LaTeX 源码块','LaTeX source block'));
    labelSourceBlockEdit();
    closeButton.textContent=t('关闭','Close');
    targetButton.textContent=t('定位公式光标（实验）','Target formula caret (experimental)');
    editButton.textContent=nativeEditing?t('退出原生输入','Leave native input'):t('原生输入（实验）','Native input (experimental)');
    startText.textContent=t('开始输入','Start typing');
    editButton.title=t('在原生排版页面上直接输入；ProseMirror 继续保存历史。','Type directly on native pages; ProseMirror keeps the history.');
    renderStatus();
  }
  async function stop() {
    generation++;captureId++;pollEpoch++;active=false;opening=false;error='';capturing=null;terminal=false;
    clearTimeout(timer);clearTimeout(pollTimer);
    syncPresentation();
    const previous=session;session=null;
    wantedSnapshot=null;sentSnapshot=null;wantedSource='';sentSource='';
    observation=null;targetStatus.textContent='';
    outlineTarget=null;
    previousProjection=null;foldsDirty=false;
    nativeEditing=false;draftInput=null;nativeDocument.reset();
    input.blur();input.value='';
    delete input.dataset.composing;
    clearQueuedInput();
    pendingLatency=null;inputStart=0;latency.length=0;delete panel.dataset.latencySamples;
    delete panel.dataset.latencyP50;delete panel.dataset.latencyP95;delete panel.dataset.latencyP99;
    delete panel.dataset.latencyLastTransaction;
    delete panel.dataset.latencyLastGeometry;
    delete panel.dataset.latencyLastRepaint;
    delete panel.dataset.latencySegments;
    delete panel.dataset.latencyRoutes;
    compositionField=null;
    inputComposition=null;
    mirror?.lifetime.abort();mirror=null;
    targetArmed=false;lastTarget=null;clearTimeout(targetTimer);targetTimer=null;
    renderer.reset();pdf.reset();mode='canvas';pdfWanted=-1;pdfLayout=null;pdfRendered=-1;renderedRevision=-1;renderStatus();
    pdfGeometryAvailable=false;recordedPages.clear();
    delete panel.dataset.fallbackReason;
    if(previous!==null) {
      try {await invoke('native_tex_close',{sessionId:previous});}
      catch(failure) {console.warn('Native TeX close:',failure);}
    }
  }
  function fail(failure) {
    if(['engine_exit','engine_io','timeout','session_closed','stale_session','event_overflow','protocol'].includes(failure?.code))
      terminal=true;
    error=String(failure?.message??failure);
    clearQueuedInput();
    renderStatus();
  }
  async function fallback(failure,revision) {
    if(mode==='canvas'){
      clearQueuedInput();
      panel.dataset.fallbackReason=String(failure?.message??failure).slice(0,300);
      mode='pdf';renderer.reset({clear:false});
    }
    if(!Number.isSafeInteger(revision)||revision<0){fail(failure);return;}
    if(pdfRendered===revision)return;
    pdfWanted=Math.max(pdfWanted,revision);
    if(pdfAttempt?.generation===generation&&pdfAttempt?.sessionId===session)return;
    const attempt=generation;
    const flight={generation:attempt,sessionId:session};
    pdfAttempt=flight;renderStatus();
    try {
      let finished=-1;
      while(active&&attempt===generation&&flight.sessionId===session&&pdfWanted>finished) {
        const target=pdfWanted;
        try {
          const args={sessionId:flight.sessionId,sourceRevision:target};
          let bytes,registeredLayout;
          if(pdfLayout?.source_revision===target){
            // The host checks both revisions and retains the only permitted
            // path. Frontend never requests a file by name.
            const layout=pdfLayout,geometry=new Map(recordedPages);
            try {
              bytes=await invoke('native_tex_pdf',{...args,layoutVersion:layout.layout_version});
              registeredLayout={layout,geometry};
            }
            catch {/* The captured PDF may have expired; compile a clean copy. */}
          }
          if(attempt!==generation||flight.sessionId!==session)return;
          bytes??=await invoke('native_tex_render_pdf',args);
          if(attempt!==generation||flight.sessionId!==session)return;
          if(target===pdfWanted){
            pdfGeometryAvailable=false;
            observation=null;
            const views=await pdf.show(bytes,target);
            if(attempt!==generation||flight.sessionId!==session)return;
            if(target===pdfWanted&&registeredLayout?.layout===pdfLayout&&views)
              pdfGeometryAvailable=renderer.bindPdfLayout(pdfLayout,registeredLayout.geometry,views);
            renderStatus();
          }
        }catch(problem){
          if(attempt!==generation||flight.sessionId!==session)return;
          if(problem?.code!=='revision_mismatch'&&target===pdfWanted){fail(problem);return;}
        }
        finished=target;
      }
    }finally{if(pdfAttempt===flight)pdfAttempt=null;}
  }
  async function flush() {
    if(!active || terminal || session===null || updating===generation || exporting===generation ||
      capturing===generation || composing())return;
    const attempt=generation;
    updating=attempt;renderStatus();
    try {
      while(active && attempt===generation && wantedSnapshot?.signature!==sentSnapshot?.signature) {
        const snapshot=wantedSnapshot;
        const changedEntry=snapshot.mainFile!==sentSnapshot.mainFile;
        const files=!changedEntry&&snapshot.dependencySignature===sentSnapshot.dependencySignature?undefined:snapshot.files;
        const sample=pendingLatency;
        const result=await invoke('native_tex_update',{sessionId:session,source:snapshot.source,files,
          mainFile:changedEntry?snapshot.mainFile:undefined});
        if(attempt!==generation){
          if(result.sessionId)await invoke('native_tex_close',{sessionId:result.sessionId}).catch(()=>{});
          return;
        }
        const restarted=result.sessionId&&result.sessionId!==session;
        if(sample&&sample===pendingLatency){
          sample.signature=snapshot.signature;
          sample.revision=result.sourceRevision;
          sample.route=restarted?'restart':files?'project':result.routed??'unknown';
        }
        if(restarted){
          session=result.sessionId;pollEpoch++;renderedRevision=-1;pdfRendered=-1;pdfWanted=-1;pdfLayout=null;
          pdfGeometryAvailable=false;recordedPages.clear();
          renderer.reset({clear:false});pdf.reset({clear:false});
          void poll(attempt,pollEpoch);
        }
        if(observation&&snapshot.signature!==sentSnapshot.signature){
          observation=null;targetStatus.textContent='';
        }
        sentSource=snapshot.source;sentSnapshot=snapshot;sourceRevision=result.sourceRevision;error='';
        if(composing())break;
      }
    } catch(failure) {if(attempt===generation)fail(failure);}
    finally {if(updating===attempt)updating=null;if(attempt===generation)renderStatus();}
  }
  async function readSnapshot() {
    if(getSnapshot){
      const snapshot=await getSnapshot();
      // A blank LaTeX document otherwise ships no page. Keep the synthetic
      // page out of the editor's source, history, and files on disk.
      if(engineToggle&&snapshot.mainFile==='main.tex'&&!snapshot.files?.length&&
        snapshot.source.replace(/\s*\\end\{document\}\s*$/,'\\end{document}')===
          DEFAULT_DOCUMENT_SOURCE.replace(/\s*\\end\{document\}\s*$/,'\\end{document}')){
        const source=DEFAULT_DOCUMENT_SOURCE.replace('\\end{document}','\\thispagestyle{empty}\\null\n\\end{document}');
        return {...snapshot,source,signature:source};
      }
      return snapshot;
    }
    const source=getSource();
    return {source,mainFile:'main.tex',signature:source};
  }
  async function refresh() {
    if(!active)return;
    if(composing()) {renderStatus();return;}
    const attempt=generation,request=++captureId;
    capturing=attempt;renderStatus();
    try {
      const snapshot=await readSnapshot();
      if(attempt!==generation||request!==captureId)return;
      wantedSnapshot=snapshot;wantedSource=snapshot.source;
    }catch(failure) {if(attempt===generation&&request===captureId)fail(failure);return;}
    finally {if(attempt===generation&&request===captureId)capturing=null;}
    if(attempt!==generation||request!==captureId)return;
    renderStatus();
    void flush();
  }
  async function poll(attempt,epoch=pollEpoch) {
    if(!active || attempt!==generation || epoch!==pollEpoch || session===null)return;
    try {
      const events=await invoke('native_tex_poll',{sessionId:session});
      if(attempt!==generation||epoch!==pollEpoch)return;
      for(const event of events)handleEvent(event);
      renderStatus();
    } catch(failure) {
      if(attempt===generation&&epoch===pollEpoch&&!eventsLive)fail(failure);
    }
    finally {
      if(!eventsLive&&active && !terminal && attempt===generation&&epoch===pollEpoch)
        pollTimer=setTimeout(()=>poll(attempt,epoch),100);
    }
  }
  // Protocol events are pushed from the Rust reader. Polling is only a
  // compatibility fallback for hosts without a Tauri event bridge.
  function handleEvent(event) {
    if(!event)return;
    if(event.event==='ParagraphUpdate'&&event.status==='error'){
      error=event.diagnostics?.map(item=>item.message??String(item)).join('\n').slice(0,2400)||
        t('LuaLaTeX 增量排版失败；修正源码后重试。','LuaLaTeX incremental compilation failed; correct the source and retry.');
    } else if(event.event==='LayoutUpdate' || event.event==='ParagraphUpdate') {
      if(event.event==='LayoutUpdate'&&event.compile?.state==='Ok'){
        for(const page of event.pages_changed??[])recordedPages.set(page.page,page);
        for(const page of recordedPages.keys())if(page>event.pages_total)recordedPages.delete(page);
        pdfLayout=event.pdf_fallback_registered&&event.convergence?.state==='Converged'?event.versions:null;
      }
      if(event.event==='LayoutUpdate' && event.compile?.state!=='Ok') {
        const detail=event.compile?.message??event.diagnostics?.map(item=>item.message).filter(Boolean).join('\n');
        error=detail||error||t('LuaLaTeX 编译失败。请查看源码或检查 TeX 宏包。','LuaLaTeX compilation failed. Check the source and installed TeX packages.');
      } else {
        if(mode==='pdf'&&event.event==='LayoutUpdate')void fallback(null,event.versions.source_revision);
        else renderer.accept(event);
      }
    } else if(event.event==='Diagnostics' && event.items?.length) {
      error=event.items.map(item=>item.message??String(item)).join('\n').slice(0,2400);
    }
  }
  async function start() {
    if(active)return;
    const attempt=++generation;
    active=true;opening=true;error='';terminal=false;renderedRevision=-1;mode='canvas';pdfWanted=-1;pdfRendered=-1;
    if(primary){nativeEditing=true;targetArmed=true;}
    syncPresentation();renderStatus();
    try {
      const initial=await readSnapshot();
      if(attempt!==generation)return;
      wantedSource=initial.source;wantedSnapshot=initial;
      const opened=await invoke('native_tex_open',{source:initial.source,mainFile:initial.mainFile,files:initial.files});
      if(attempt!==generation) {
        if(opened)await invoke('native_tex_close',{sessionId:opened.sessionId});
        return;
      }
      if(!opened) {
        primaryRequested=false;
        if(engineToggle)selectDesktopEngine(false,{remember:false});
        await stop();
        return;
      }
      session=opened.sessionId;sourceRevision=opened.sourceRevision;sentSource=initial.source;sentSnapshot=initial;opening=false;
      renderer.reset();pdf.reset();void poll(attempt);
      refresh();renderStatus();
    } catch(failure) {
      if(attempt!==generation)return;
      opening=false;
      if(!engineToggle){fail(failure);return;}
      primaryRequested=false;
      selectDesktopEngine(false,{remember:false});
      await stop();
      const message=document.querySelector('#status');
      if(message){
        message.hidden=false;
        message.textContent=t('LuaLaTeX 无法启动：','Could not start LuaLaTeX: ')+String(failure?.message??failure);
      }
    }
  }
  async function exportPdf() {
    if(!current())return;
    const attempt=generation,revision=sourceRevision;
    exporting=attempt;renderStatus();
    try {
      const result=await invoke('native_tex_export',{sessionId:session,sourceRevision:revision});
      if(attempt!==generation)return;
      if(result)status.textContent=t('已导出源码修订 ','Exported source revision ')+result.sourceRevision+' — '+result.path;
    } catch(failure) {if(attempt===generation)fail(failure);}
    finally {if(exporting===attempt)exporting=null;if(attempt===generation){void flush();exportButton.disabled=!current();}}
  }
  async function observe() {
    if(targetButton.disabled)return;
    const stamp={sessionId:session,sourceRevision};
    const signature=sentSnapshot.signature;
    lastTarget={...stamp,signature};
    const pending=pendingEdit?.paragraph&&nativeDocument.surface.pendingOffset!==null
      ?{path:pendingEdit.paragraph.filePath,offset:nativeDocument.surface.pendingOffset}:undefined;
    const markers={measureDrawings:Boolean(openMeasuredDrawing),terminalCarets:true};
    const project=()=>sentSnapshot?.files?.length
      ?projectMixedSnapshot(sentSnapshot,previousProjection,pending,markers)
      :projectMixedDocument(sentSource,{previous:previousProjection??[],keepThrough:pending?.offset,...markers});
    let projection=project();
    if(!projection||!projection.owners.size){
      targetStatus.textContent=primary&&canStartText?.()?'':t('当前文档没有可定位的公式或纯文本段落。','No supported formula or plain paragraph in this document snapshot.');
      return;
    }
    if(projection.kind==='math'&&![...projection.owners.values()].some(({atom,drawing})=>
      drawing||atom&&['frac','sqrt','token','cell'].includes(atom.kind))){
      targetStatus.textContent=t('当前文档没有可定位的公式或纯文本段落。','No supported formula or plain paragraph in this document snapshot.');
      return;
    }
    const attempt=generation;
    const currentStamp=()=>attempt===generation&&acceptsInput()&&stamp.sessionId===session&&stamp.sourceRevision===sourceRevision&&
      sentSnapshot?.signature===signature&&wantedSnapshot?.signature===signature&&sentSource===projection?.source&&wantedSource===projection?.source;
    const regions=selectionRegions?.();
    async function observeProjection(){
      const frames=await invoke('native_tex_observe_formula',{...stamp,projection:projection.projection,files:projection.files});
      if(!currentStamp())return null;
      const observed=separateRepeatedOwners(frames,projection,regions);
      if(!renderer.attachOwners(observed.pages,stamp,observed.projection.owners))throw new Error(t('标记版排版与当前页面不一致，未启用命中。','Projected geometry differs from the displayed page; targeting remains disabled.'));
      return observed;
    }
    targeting=attempt;observation=null;renderStatus();
    targetStatus.textContent=t('正在核对源码标记及实际排版…','Checking projected source against the visible layout…');
    try {
      let output;
      for(;;){
        try {output=await observeProjection();break;}
        catch(failure){
          if(!currentStamp())throw failure;
          const owners=[...projection.owners.values()];
          if(markers.measureDrawings&&owners.some(({drawing})=>drawing))markers.measureDrawings=false;
          else if(markers.terminalCarets&&owners.some(({glyph})=>glyph?.terminal))markers.terminalCarets=false;
          else throw failure;
          projection=project();
          if(!projection?.owners.size)throw failure;
        }
      }
      if(!output)return;
      const {pages:observed,projection:visibleProjection}=output;
      const kind=projection.kind;
      previousProjection=projection;
      observation={kind,projection:visibleProjection,stamp,observed};
      if(nativeEditing){
        const expectedOffset=nativeDocument.surface.pendingOffset;
        const applied=nativeDocument.setObservation(observed,visibleProjection,pdfGeometryAvailable,regions);
        paintFilePresentation();
        let editRestored=false;
        if(pendingEdit){
          const stop=nativeDocument.surface.caret;
          const previous=pendingEdit.paragraph??pendingEdit.formula;
          const next=stop?.paragraph??stop?.formula;
          const expected=pendingEdit.source??(previous.source.slice(0,previous.from16)+
            pendingEdit.text+previous.source.slice(previous.to16));
          editRestored=expectedOffset===stop?.docOffset&&next?.filePath===previous.filePath&&next?.source===expected;
          if(!editRestored)queuedInput.length=0;
          pendingEdit=null;
        }
        const sample=pendingLatency;
        pendingLatency=null;
        if(applied){
          paintSurfaceSelection();
          positionInput();
          if(editRestored&&sample?.signature===signature&&sample.revision===stamp.sourceRevision){
            const geometry=performance.now();
            // The next animation frame after the caret update bounds browser
            // repaint. It does not measure device input or display scan-out.
            requestAnimationFrame(()=>requestAnimationFrame(()=>{
              if(!currentStamp()||observation?.stamp!==stamp)return;
              const repaint=performance.now();
              const last={transaction:sample.committed-sample.started,geometry:geometry-sample.committed,
                repaint:repaint-geometry,total:repaint-sample.started};
              latency.push({...last,route:sample.route});
              if(latency.length>1024)latency.shift();
              const percentiles=Object.fromEntries(Object.keys(last).map(segment=>{
                const ordered=latency.map(entry=>entry[segment]).sort((left,right)=>left-right);
                const at=percent=>Number(ordered[Math.ceil(ordered.length*percent)-1].toFixed(1));
                return [segment,{p50:at(.50),p95:at(.95),p99:at(.99)}];
              }));
              panel.dataset.latencySamples=String(latency.length);
              panel.dataset.latencyP50=String(percentiles.total.p50);
              panel.dataset.latencyP95=String(percentiles.total.p95);
              panel.dataset.latencyP99=String(percentiles.total.p99);
              panel.dataset.latencyLastTransaction=last.transaction.toFixed(1);
              panel.dataset.latencyLastGeometry=last.geometry.toFixed(1);
              panel.dataset.latencyLastRepaint=last.repaint.toFixed(1);
              panel.dataset.latencySegments=JSON.stringify(percentiles);
              const routes={};
              for(const {route} of latency)routes[route]=(routes[route]??0)+1;
              panel.dataset.latencyRoutes=JSON.stringify(routes);
            }));
          }
        }
      }
      if(outlineTarget){
        const address=outlineTarget;
        outlineTarget=null;
        selectNavigationTarget(address);
      }
      requestAnimationFrame(syncCaret);
      targetStatus.textContent=!projection.paragraphs.length&&!projection.formulas.length
        ?t('点击已定位的图形进行编辑。','Click a verified drawing to edit it.')
        :kind==='text'
        ?t('点击原生页面中的文字定位光标，输入会写入原文。','Click text on the native page to place the caret; typing edits the source.')
        :kind==='mixed'
        ?t('点击原生页面中的文字或空槽定位光标，输入会写入原文。','Click prose on the native page, or click the empty numerator or denominator, another supported empty slot, or a glyph edge to continue typing.')
        :t('点击预览中的空槽或字符边缘，继续在编辑器输入。','Click the empty numerator or denominator, another supported empty slot, or a glyph edge to continue typing in the editor.');
    } catch(failure) {
      if(attempt===generation){
        clearQueuedInput();
        targetStatus.textContent=String(failure?.message??failure);
      }
    } finally {
      if(targeting===attempt)targeting=null;
      if(attempt===generation){
        renderStatus();
        while(queuedInput.length&&!pendingEdit&&current()&&observation)
          submitInput(queuedInput.shift());
      }
    }
  }
  function toggle(){
    if(engineToggle){
      if(inputComposition&&!inputComposition.ended||pendingEdit||queuedInput.length)return;
      primaryRequested=!primaryRequested;
      selectDesktopEngine(primaryRequested);
      if(!primaryRequested)void stop();
      else if(isDocumentMode?.()||splitHost?.())void start();
      else renderStatus();
      return;
    }
    if(primary){
      if(!isDocumentMode?.())return;
      primaryRequested=!active;
    }
    void(active?stop():start());
  }
  function redrawPresentation(){
    if(mode==='pdf')pdf.redraw();
    else renderer.redraw();
  }
  function syncPresentation(){
    const nextSplit=active&&primary?splitHost?.()??null:null;
    if(mountedSplit!==nextSplit){
      if(mountedSplit){
        delete mountedSplit.dataset.native;
        mountedSplit.removeEventListener('scroll',redrawPresentation);
      }
      mountedSplit=nextSplit;
      if(mountedSplit){
        mountedSplit.dataset.native='true';
        mountedSplit.addEventListener('scroll',redrawPresentation,{passive:true});
        mountedSplit.append(panel);
      }else document.body.append(panel);
    }
    panel.toggleAttribute('data-split',Boolean(nextSplit));
    panel.hidden=!active||!acceptsInput()&&!nextSplit;
    document.body.classList.toggle('native-tex-open',active&&!primary);
    document.body.classList.toggle('native-tex-primary-open',active&&primary&&acceptsInput());
    if(!acceptsInput()){
      input.blur();draftInput=null;queuedInput.length=0;
      if(!observation)lastTarget=null;
      renderer.clearCaret();renderer.showFileBoundaries([]);renderer.showFoldedFiles([]);
    }else if(active&&observation&&current())refreshFoldView();
    if(active&&!panel.hidden)redrawPresentation();
  }
  function documentChanged(){
    const afterStop=stop(),stamp=generation;
    const shouldStart=()=>primaryRequested&&(isDocumentMode?.()||splitHost?.());
    if(shouldStart())void afterStop.then(()=>{
      if(stamp===generation&&shouldStart())void start();
    });
  }
  button.addEventListener('click',toggle);
  function focusInitialText(x,y){
    if(!nativeEditing||!acceptsInput()||!current()||pendingEdit||composing()||!canStartText?.())return;
    nativeDocument.reset();
    renderer.clearCaret();
    draftInput={kind:'initial'};
    input.style.left=x+'px';input.style.top=y+'px';
    input.toggleAttribute('data-initial',engineToggle);
    input.focus({preventScroll:true});
  }
  pages.addEventListener('click',event=>{
    if(engineToggle&&event.button===0&&event.target.closest?.('canvas'))
      focusInitialText(event.clientX,event.clientY);
  });
  startText.addEventListener('click',()=>{
    if(startText.hidden)return;
    const rect=startText.getBoundingClientRect();
    focusInitialText(rect.left,rect.top);
  });
  button.addEventListener('mousedown',event=>event.preventDefault());
  tikzEdit.addEventListener('click',()=>{
    if(current()&&tikzSelect.value!=='')editTikzDrawing?.(Number(tikzSelect.value));
  });
  sourceBlockEdit.addEventListener('click',()=>{
    if(!current()||sourceBlock.selectedIndex<0)return;
    void openSourceBlock?.(availableBlocks[sourceBlock.selectedIndex]);
  });
  closeButton.addEventListener('click',()=>{
    if(engineToggle){toggle();return;}
    primaryRequested=false;
    void stop();
  });
  exportButton.addEventListener('click',()=>{void exportPdf();});
  targetButton.addEventListener('click',()=>{
    targetArmed=true;clearTimeout(targetTimer);targetTimer=null;void observe();
  });
  function paintFilePresentation(){
    foldsDirty=false;
    const folded=nativeDocument.foldFiles(foldedFiles?.()??[]);
    renderer.showFoldedFiles(folded);
    renderer.showFileBoundaries(nativeDocument.fileBoundaries());
  }
  function refreshFoldView(){
    paintFilePresentation();
    renderer.clearCaret();
    paintSurfaceSelection(true);
    positionInput();
  }
  document.addEventListener('lineae-project-fold-state',()=>{
    if(!nativeEditing)return;
    foldsDirty=true;
    if(acceptsInput()&&current()&&observation)refreshFoldView();
  });
  editButton.addEventListener('mousedown',event=>event.preventDefault());
  editButton.addEventListener('click',()=>{
    if(nativeEditing){
      nativeEditing=false;draftInput=null;clearQueuedInput();nativeDocument.surface.clearPending();
      renderer.showFileBoundaries([]);renderer.showFoldedFiles([]);input.blur();renderStatus();return;
    }
    if(!observation)return;
    nativeEditing=true;targetArmed=true;
    const applied=nativeDocument.setObservation(observation.observed,observation.projection,pdfGeometryAvailable,selectionRegions?.());
    if(!applied){
      nativeEditing=false;renderStatus();return;
    }
    if(nativeDocument.surface.caret){
      paintSurfaceSelection();positionInput();input.focus({preventScroll:true});
    }
    paintFilePresentation();
    renderStatus();
  });
  function setNativeZoom(value){
    if(zoomPercent===value)return;
    zoomPercent=value;
    renderer.setZoom(value/100);pdf.setZoom(value/100);
    if(nativeEditing&&acceptsInput()){paintSurfaceSelection();positionInput();}
  }
  zoom.addEventListener('change',()=>setNativeZoom(Number(zoom.value)));
  window.addEventListener('resize',()=>{if(nativeEditing)positionInput();});
  panel.addEventListener('scroll',()=>{if(nativeEditing)positionInput();},{passive:true});
  window.addEventListener('pagehide',()=>{void stop();});
  input.addEventListener('blur',()=>{
    delete input.dataset.initial;
    queueMicrotask(()=>onEnvironmentChange?.());
  });
  document.addEventListener('compositionstart',event=>{
    if(event.target===input)return;
    if(event.target?.tagName==='MATH-FIELD')compositionField=event.target;
    if(active){renderer.clearCaret();renderStatus();}
  },true);
  document.addEventListener('compositionend',event=>{
    if(event.target===compositionField)compositionField=null;
    setTimeout(refresh,0);
  },true);
  relocalize();renderer.setZoom(zoomPercent/100);pdf.setZoom(zoomPercent/100);
  return {
    refresh,documentChanged,relocalize,
    documentModeChanged(){
      if(!primaryRequested)return;
      if(active){syncPresentation();refresh();return;}
      if(isDocumentMode?.()||splitHost?.())void start();
    },
    setDocumentZoom:value=>{if(primary)setNativeZoom(value);},
    navigate(address){
      if(!acceptsInput()||!nativeEditing||pendingEdit)return false;
      if(observation&&current())return selectNavigationTarget(address);
      outlineTarget=address;
      targetArmed=true;
      renderStatus();
      return true;
    },
    pagePresentation:()=>panel.dataset.pagePresentation,
    togglePagePresentation(){
      if(!primary)return false;
      panel.dataset.pagePresentation=panel.dataset.pagePresentation==='pages'?'flow':'pages';
      if(active&&!panel.hidden){
        redrawPresentation();
        if(acceptsInput()&&nativeEditing)positionInput();
      }
      return true;
    },
    hasTextInput:event=>event.target===input&&hasNativeTextFocus(),
    hasNativeTextFocus,
    refocusTextInput(){
      if(nativeEditing&&acceptsInput())input.focus({preventScroll:true});
    },
    focusInput(){
      if(!nativeEditing||!acceptsInput())return false;
      input.focus({preventScroll:true});return true;
    },
    nativeParagraphs:()=>current()?observation?.projection.paragraphs:undefined,
    startFormula,
    startHardBreak(){
      return submitInput({lineBreak:'hard',started:performance.now()});
    },
    inTableCell:()=>Boolean(nativeDocument.surface.caret?.paragraph?.tableCell),
    hasMathInput: event => event.target===input && nativeEditing && acceptsInput() && nativeDocument.surface.caret?.kind==='math',
    hasNativeMathFocus:()=>document.activeElement===input&&nativeEditing&&acceptsInput()&&nativeDocument.surface.caret?.kind==='math',
    focusedCaret:()=>document.activeElement===input&&nativeEditing&&acceptsInput()?nativeDocument.surface.caret:null,
    verifiedCaret:(allowUnfocused=false)=>(allowUnfocused||document.activeElement===input)&&nativeEditing&&acceptsInput()&&current()&&observation&&!pendingEdit
      ?nativeDocument.surface.caret:null,
    preserveSourceCaret(position,started,kind){
      draftInput=null;
      return awaitSourcePosition(position,started,kind==='math');
    },
    verifiedTextRange(){
      if(!acceptsInput()||!nativeEditing||!current()||!observation||pendingEdit)return null;
      const [from,to]=nativeDocument.surface.range;
      return from?.kind==='text'&&from.paragraph===to?.paragraph?[from,to]:null;
    },
    verifiedProseSpan(){
      if(!acceptsInput()||!nativeEditing||!current()||!observation||pendingEdit)return [];
      const [from,to]=nativeDocument.surface.range;
      return nativeDocument.proseRanges(from,to);
    },
    verifiedTableRange(){
      if(!acceptsInput()||!nativeEditing||!current()||!observation||pendingEdit)return null;
      const [from,to]=nativeDocument.surface.range;
      if(from?.kind!=='text'||to?.kind!=='text'||from===to)return null;
      const a=from.paragraph.tableCell,b=to.paragraph.tableCell;
      return sameTable(from,to)&&(a.row!==b.row||a.column!==b.column)?[from,to]:null;
    },
    insertLiteralText:text=>(startingText()||nativeDocument.surface.caret?.kind==='text')&&
      submitInput({insert:text,paste:true,started:performance.now()}),
    clipboardSelection,
    selectAll(){
      if(!current()||!observation||pendingEdit)return true;
      if(nativeDocument.selectAll()){
        paintSurfaceSelection(true);
        positionInput();
      }
      return true;
    },
    useTextSelection,
    leaveFile,
    leaveTextEnvironment(outermost){
      if(!acceptsInput()||!current()||!observation||pendingEdit||draftInput)return false;
      const caret=nativeDocument.surface.caret;
      const target=nativeTextEnvironment?.(caret,outermost);
      if(!target)return false;
      if(nativeDocument.selectRegion(target)){
        paintSurfaceSelection(true);
        positionInput(true);
        return true;
      }
      if(target.source.slice(target.from,target.to).trim())return false;
      draftInput={kind:'after-container',caret,outermost};
      renderer.clearCaret();
      targetStatus.textContent=t('在环境结束后继续输入','Type after the environment');
      return true;
    },
    editAdjacentFormula(){
      if(!acceptsInput()||!current()||!observation||pendingEdit||draftInput||!nativeDocument.editAdjacentFormula())return false;
      paintSurfaceSelection(true);
      positionInput(true);
      return true;
    },
    runMathCommand(command) {
      if(!acceptsInput())return false;
      const {surface}=nativeDocument;
      if(command==='leaveFile')return leaveFile();
      if(command==='enterLine')return submitInput({lineBreak:'formula',started:performance.now()});
      if(command==='undo'||command==='redo'){
        if(draftInput){cancelDraftInput();return true;}
        clearQueuedInput();
        surface.clearPending();
        history?.(command);
        return true;
      }
      if(command==='nextSlot'||command==='previousSlot'){
        if(draftInput)cancelDraftInput();
        if(current()&&observation&&!pendingEdit&&surface.moveEmptySlot?.(command==='previousSlot')){
          paintSurfaceSelection();
          positionInput();
        }
        return true;
      }
      if(!current()||!observation||pendingEdit||surface.caret?.kind!=='math')return false;
      if(command==='left'||command==='right')return chooseNativeDelimiters(command==='right');
      if(command==='leaveEnvironment'){
        const cleanup=surface.clearEmptyScript?.();
        if(cleanup){inputStart=performance.now();return commitSurface(cleanup);}
        if(!surface.leaveStructure())return false;
        paintSurfaceSelection(true);positionInput();
        return true;
      }
      if(command==='leaveFormula'){
        return finishFormula();
      }
      const edit=surface.command(command);
      if(!edit)return false;
      inputStart=performance.now();
      commitSurface(edit);
      return true;
    },
  };
}
