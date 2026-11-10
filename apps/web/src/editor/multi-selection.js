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

function browserRange(view) {
  const selection=window.getSelection();
  if (!selection?.rangeCount || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return null;
  const range=selection.getRangeAt(0);
  return {from:view.posAtDOM(range.startContainer,range.startOffset),to:view.posAtDOM(range.endContainer,range.endOffset)};
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
            const {from,to}=browserRange(view) ?? view.state.selection;
            const ranges=mergeRanges([...previous,{from,to}]);
            const hit=view.posAtCoords({left:event.clientX,top:event.clientY});
            if (!event.ctrlKey || !ranges.length || !hit) {
              if(previous.length)view.dispatch(view.state.tr.setMeta(key,[]));
              return false;
            }
            // Chromium can extend the native Ctrl-drag to the entire paragraph.
            // Own the second drag so the two ranges remain separate.
            event.preventDefault();
            const start={doc:view.state.doc,ranges,anchor:hit.pos};
            dragging=start;
            function track(pointer, finish) {
              if(view.isDestroyed || dragging!==start || view.state.doc!==start.doc)return;
              const end=view.posAtCoords({left:pointer.clientX,top:pointer.clientY});
              if(!end)return;
              const doc=view.state.doc;
              const selection=TextSelection.between(doc.resolve(start.anchor),doc.resolve(end.pos));
              const next=mergeRanges([...start.ranges,{from:selection.from,to:selection.to}]);
              if(finish)dragging=null;
              view.dispatch(view.state.tr.setSelection(selection).setMeta(key,next));
            }
            const move=pointer=>track(pointer,false);
            document.addEventListener('mousemove',move,true);
            document.addEventListener('mouseup',pointer=>{
              document.removeEventListener('mousemove',move,true);
              track(pointer,true);
              dragging=null;
            },{once:true,capture:true});
            return true;
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
