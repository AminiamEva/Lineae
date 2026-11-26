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
      parseHTML: element => Math.max(2, Math.min(20, Number(element.dataset.multicol) || 2)),
      renderHTML: attributes => ({'data-multicol': String(attributes.count)}),
    },
    starred:{default:false,parseHTML:element=>element.hasAttribute('data-multicol-starred')},
  }),
  parseHTML: () => [{tag:'div[data-multicol]'}],
  renderHTML: ({node}) => ['div', {
    'data-multicol': String(node.attrs.count),
    ...(node.attrs.starred&&{'data-multicol-starred':''}),
    style: `column-count:${node.attrs.count};column-gap:2em;column-fill:auto`,
  }, 0],
});
