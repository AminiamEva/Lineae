import { Extension } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey('lineaeMultiSelection');

function mergeRanges(ranges) {
  const merged = [];
  for (const range of ranges.filter(({from,to})=>from<to).sort((a,b)=>a.from-b.from)) {
    const last=merged.at(-1);
    if (last && range.from<=last.to) last.to=Math.max(last.to,range.to);
    else merged.push({...range});
  }
  return merged;
}

function replaceRanges(view, ranges, text='') {
  const transaction=view.state.tr;
  for (const {from,to} of [...ranges].reverse()) transaction.delete(from,to);
  const position=ranges[0].from;
  if(text)transaction.insertText(text,position);
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(position+text.length)));
  view.dispatch(transaction.scrollIntoView());
}

export const MultiSelection = Extension.create({
  name:'lineaeMultiSelection',
  addProseMirrorPlugins() {
    let dragging=null;
    return [new Plugin({
      key,
      state:{
        init:()=>[],
        apply:(transaction,previous)=>transaction.getMeta(key) ?? (transaction.docChanged ? [] : previous),
      },
      props:{
        decorations(state) {
          return DecorationSet.create(state.doc,key.getState(state).map(({from,to})=>Decoration.inline(from,to,{class:'lineae-multi-selected'})));
        },
        handleTextInput(view,_from,_to,text) {
          const ranges=key.getState(view.state);
          if(ranges.length<2)return false;
          replaceRanges(view,ranges,text);
          return true;
        },
        handleKeyDown(view,event) {
          const ranges=key.getState(view.state);
          if(ranges.length<2)return false;
          if(['Backspace','Delete'].includes(event.key)) {replaceRanges(view,ranges);return true;}
          if(event.key==='Escape' || event.key.startsWith('Arrow')) view.dispatch(view.state.tr.setMeta(key,[]));
          return false;
        },
        handleDOMEvents:{
          compositionstart(view) {
            dragging=null;
            if(key.getState(view.state).length)view.dispatch(view.state.tr.setMeta(key,[]));
            return false;
          },
          mousedown(view,event) {
            if(event.button!==0)return false;
            const previous=key.getState(view.state);
            const {from,to}=view.state.selection;
            dragging=event.ctrlKey ? {doc:view.state.doc,ranges:mergeRanges([...previous,{from,to}])} : null;
            if(!dragging && previous.length)view.dispatch(view.state.tr.setMeta(key,[]));
            return false;
          },
          mouseup(view) {
            const start=dragging;
            dragging=null;
            if(!start?.ranges.length)return false;
            requestAnimationFrame(()=>{
              if(view.isDestroyed || view.state.doc!==start.doc)return;
              const selection=window.getSelection();
              if(!selection?.rangeCount || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode))return;
              const range=selection.getRangeAt(0);
              const from=view.posAtDOM(range.startContainer,range.startOffset);
              const to=view.posAtDOM(range.endContainer,range.endOffset);
              const ranges=mergeRanges([...start.ranges,{from,to}]);
              view.dispatch(view.state.tr.setMeta(key,ranges.length>1?ranges:[]));
            });
            return false;
          },
          copy(view,event) {return copyRanges(view,event,false);},
          cut(view,event) {return copyRanges(view,event,true);},
          paste(view,event) {
            const ranges=key.getState(view.state);
            if(ranges.length<2 || !event.clipboardData)return false;
            event.preventDefault();
            replaceRanges(view,ranges,event.clipboardData.getData('text/plain'));
            return true;
          },
        },
      },
    })];
  },
});

function copyRanges(view,event,cut) {
  const ranges=key.getState(view.state);
  if(ranges.length<2 || !event.clipboardData)return false;
  const {doc,schema}=view.state;
  const serializer=DOMSerializer.fromSchema(schema);
  const container=document.createElement('div');
  for(const {from,to} of ranges) {
    const part=document.createElement('div');
    part.append(serializer.serializeFragment(doc.slice(from,to).content));
    container.append(part);
  }
  event.clipboardData.setData('text/html',container.innerHTML);
  event.clipboardData.setData('text/plain',ranges.map(({from,to})=>doc.textBetween(from,to,'\n',node=>node.attrs.latex??'')).join('\n'));
  event.preventDefault();
  if(cut)replaceRanges(view,ranges);
  return true;
}
