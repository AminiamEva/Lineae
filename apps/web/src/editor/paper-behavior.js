import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { listMarkerCSS } from '../../latex/list-numbering.mjs';

function paperFormatting() {
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
      init: (_, state) => formattingMarks(state.doc),
      apply(transaction, previous) {
        // Preserve the browser's text node and its neighbors during preedit.
        if (composing) return transaction.docChanged ? previous.map(transaction.mapping, transaction.doc) : previous;
        return transaction.docChanged || transaction.getMeta(plugin) ? formattingMarks(transaction.doc) : previous;
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

function numberedHeadings(doc) {
  const counters = [0, 0, 0];
  const decorations = [];
  doc.descendants((node, position) => {
    if (node.type.name !== 'heading' || node.attrs.numbered === false) return;
    const level = node.attrs.level;
    if (level > counters.length) return;
    counters[level - 1]++;
    counters.fill(0, level);
    decorations.push(Decoration.node(position, position + node.nodeSize, {
      'data-section-number': counters.slice(0, level).join('.'),
    }));
  });
  return DecorationSet.create(doc, decorations);
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
function formattingMarks(doc) {
  const decorations = [];
  doc.descendants((node, position, parent, index) => {
    if (node.type.name==='math' && parent) {
      const before=parent.maybeChild(index-1);
      const after=parent.maybeChild(index+1);
      const classes=[];
      if (before?.isText && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(before.text)) classes.push('math-cjk-before');
      if (after?.isText && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(after.text)) classes.push('math-cjk-after');
      if (classes.length) decorations.push(Decoration.node(position,position+node.nodeSize,{class:classes.join(' ')}));
    }

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
      types: ['paragraph'],
      attributes: {
        align: {
          default: null,
          parseHTML: element => ['left','center','right'].includes(element.dataset.align) ? element.dataset.align : null,
          renderHTML: ({align}) => ['left','center','right'].includes(align)
            ? { 'data-align':align, style:'text-align:'+align } : {},
        },
        indent: {
          default: true,
          keepOnSplit: true,
          parseHTML: element => element.dataset.indent !== 'false',
          renderHTML: attributes => ({ 'data-indent': String(attributes.indent) }),
        },
        indentLevel: {
          default: 0,
          parseHTML: element => Number(element.dataset.indentLevel) || 0,
          renderHTML: attributes => attributes.indentLevel
            ? { 'data-indent-level': String(attributes.indentLevel), style: `margin-left:${attributes.indentLevel * 2}em` }
            : {},
        },
      },
    }, {
      types: ['heading'],
      attributes: {
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
      },
    }, {
      types: ['tableCell', 'tableHeader'],
      attributes: {
        align: {
          default: null,
          parseHTML: element => element.dataset.align ?? null,
          renderHTML: attributes => attributes.align ? { 'data-align': attributes.align, style: 'text-align:' + attributes.align } : {},
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
    return [
      paperFormatting(),
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
