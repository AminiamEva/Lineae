// A single stroke-based icon family shared by toolbar and contextual actions.
const paths = {
  undo:'M8 4 3 9l5 5M3 9h10a6 6 0 0 1 0 12',
  redo:'m16 4 5 5-5 5m5-5H11a6 6 0 0 0 0 12',
  list:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  table:'M3 4h18v16H3zM3 10h18M10 4v16',
  row:'M3 4h18v16H3zM3 10h18M9 15h6m-3-3v6',
  column:'M3 4h18v16H3zM10 4v16M13 12h6m-3-3v6',
  math:'M19 4H5l7 8-7 8h14',
  code:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  cut:'m9 9 12 12M9 15 21 3M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  copy:'M8 8h13v13H8zM16 8V3H3v13h5',
  paste:'M8 5H4v16h16V5h-4M8 3h8v5H8z',
  delete:'M3 6h18M9 3h6M6 6l1 15h10l1-15M10 10v7m4-7v7',
  bold:'M6 3h7a5 5 0 0 1 0 9H6V3Zm0 9h8a4.5 4.5 0 0 1 0 9H6v-9',
  italic:'M11 3h9M4 21h9M15 3 9 21',
  'select-all':'M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z',
  'heading-number':'M4 4v16M14 4v16M4 12h10M18 12h3v8m-3 0h5',
};
export function icon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  svg.classList.add('ui-icon');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',paths[name] ?? paths.math);svg.append(path);return svg;
}
export function decorateToolbar(root) {
  const map={'↶':['undo','撤销 / Undo',false],'↷':['redo','重做 / Redo',false],
    itemize:['list','itemize',true],enumerate:['list','enumerate',true],
    '▦':['table','▦',false],'＋ Row':['row','＋ Row',true],'＋ Column':['column','＋ Column',true],
    '$':['math','$',true],'$$':['math','$$',true],LaTeX:['code','LaTeX',true]};
  for(const control of root.querySelectorAll('button')) {
    const label=control.textContent, entry=map[label]; if(!entry)continue;
    control.setAttribute('aria-label',label);control.title=entry[1];
    control.classList.add('icon-button');
    control.replaceChildren(icon(entry[0]));
    if(entry[2])control.append(document.createTextNode(label));
  }
}
