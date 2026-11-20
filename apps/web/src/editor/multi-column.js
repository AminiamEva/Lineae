import { Node } from '@tiptap/core';

export const MultiColumn = Node.create({
  name: 'multiColumn',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes: () => ({
    count: {
      default: 2,
      parseHTML: element => Math.max(2, Math.min(4, Number(element.dataset.multicol) || 2)),
      renderHTML: attributes => ({'data-multicol': String(attributes.count)}),
    },
  }),
  parseHTML: () => [{tag:'div[data-multicol]'}],
  renderHTML: ({node}) => ['div', {
    'data-multicol': String(node.attrs.count),
    style: `column-count:${node.attrs.count};column-gap:2em;column-fill:auto`,
  }, 0],
});
