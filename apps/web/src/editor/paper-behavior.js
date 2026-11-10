import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

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

function formattingMarks(doc) {
  const decorations = [];
  doc.descendants((node, position) => {
    if (node.type.name === 'codeBlock') {
        const tokens = /(?:#[^\n]*|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|class|return|if|else|for|while|import|from|def|print|int|float|bool|true|false|None|null|public|static)\b|\b\d+(?:\.\d+)?\b)/g;
        for (const match of node.textContent.matchAll(tokens)) {
          const from=position+1+match.index;
          const kind=/^(?:#|\/\/)/.test(match[0])?'comment':/^["']/.test(match[0])?'string':/^\d/.test(match[0])?'number':'keyword';
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
        indent: {
          default: true,
          keepOnSplit: true,
          parseHTML: element => element.dataset.indent !== 'false',
          renderHTML: attributes => ({ 'data-indent': String(attributes.indent) }),
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
          renderHTML: attributes => attributes.labelStyle ? { 'data-label-style': attributes.labelStyle, style: 'list-style-type:' + attributes.labelStyle } : {},
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
      new Plugin({
        state: {
          init:(_,state)=>formattingMarks(state.doc),
          apply:(transaction,previous)=>transaction.docChanged ? formattingMarks(transaction.doc) : previous,
        },
        props:{decorations(state){return this.getState(state);}},
      }),
      new Plugin({
        state: {
          init: (_, state) => numberedHeadings(state.doc),
          apply: (transaction, previous) => transaction.docChanged ? numberedHeadings(transaction.doc) : previous,
        },
        props: { decorations(state) { return this.getState(state); } },
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
