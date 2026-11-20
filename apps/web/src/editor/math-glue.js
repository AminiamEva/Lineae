import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Punctuation that must not start a line. A displayed formula is an atomic
// inline box, and Chrome is free to break between that box and the character
// after it, which drops the punctuation onto the next line.
const NO_LINE_START = /[，。、；：！？）》」』’”…,.;:!?)\]]/;

const glue = new PluginKey('mathGlue');

function build(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'math' || node.isBlock) return;
    const after = pos + node.nodeSize;
    const $after = doc.resolve(after);
    const from = $after.parentOffset;
    const to = Math.min(from + 1, $after.parent.content.size);
    const next = $after.parent.textBetween(from, to, undefined, '');
    if (!NO_LINE_START.test(next)) return;
    decorations.push(Decoration.widget(after, () => {
      const span = document.createElement('span');
      span.className = 'math-glue';
      span.contentEditable = 'false';
      span.textContent = '\u2060';
      return span;
    }, { side: -1 }));
  });
  return DecorationSet.create(doc, decorations);
}

// Keeps a formula glued to punctuation that follows it. The word joiner lives
// in a decoration, so the document text and the LaTeX source stay untouched.
export const MathGlue = Extension.create({
  name: 'mathGlue',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: glue,
      state: {
        init: (_, state) => build(state.doc),
        apply: (tr, value) => (tr.docChanged ? build(tr.doc) : value),
      },
      props: { decorations: state => glue.getState(state) },
    })];
  },
});
