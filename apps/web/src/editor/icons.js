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
  underline:'M6 4v7a6 6 0 0 0 12 0V4M4 20h16',
  strike:'M5 12h14M8 8a4 4 0 0 1 8 0M8 16a4 4 0 0 0 8 0',
  quote:'M5 7h5v5H5zM14 7h5v5h-5zM7 12v5M16 12v5',
  hr:'M4 12h16',
  desc:'M4 6h16M4 12h10M4 18h16M7 12v6',
  label:'M4 4h9l7 7-7 7H4zM7 11h.01',
  ref:'M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7.3M14 10a4 4 0 0 0-5.7 0L6 12.3A4 4 0 0 0 11.7 18l1.3-1.3',
  toc:'M4 6h16M4 12h16M4 18h10',
  title:'M4 6h16M12 6v14',
  author:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  frac:'M4 6h6l10 12M20 6H10',
  sqrt:'M4 12l3 6 4-12h9',
  sum:'M18 4H6l7 8-7 8h12',
  int:'M9 4c4 0 2 16 6 16',
  matrix:'M4 4h4v16H4M16 4h4v16h-4M8 8h8M8 12h8M8 16h8',
  cases:'M8 4H5v16h3M9 8h10M9 12h10M9 16h10',
  align:'M4 6h16M4 12h10M4 18h16',
  merge:'M4 4h16v16H4M4 12h16M12 4v16',
  split:'M4 4h16v16H4M12 4v16',
  booktabs:'M4 6h16M4 10h16M4 14h16M4 18h16',
  left:'M4 6h16M4 12h10M4 18h16',
  center:'M4 6h16M7 12h10M4 18h16',
  right:'M4 6h16M10 12h10M4 18h16',
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
    B:['bold','粗体 / Bold',false],I:['italic','斜体 / Italic',false],U:['underline','下划线 / Underline',false],S:['strike','删除线 / Strikethrough',false],
    itemize:['list','itemize',true],enumerate:['list','enumerate',true],
    code:['code','code',true],quote:['quote','quote',true],hr:['hr','hr',false],desc:['desc','desc',true],
    label:['label','label',true],ref:['ref','ref',true],toc:['toc','toc',true],short:['short','short',true],title:['title','title',true],author:['author','author',true],
    '▦':['table','▦',false],'＋ Row':['row','＋ Row',true],'＋ Column':['column','＋ Column',true],
    merge:['merge','merge',true],split:['split','split',true],booktabs:['booktabs','booktabs',true],
    '左':['left','左 / Left',false],'中':['center','中 / Center',false],'右':['right','右 / Right',false],
    frac:['frac','frac',true],sqrt:['sqrt','sqrt',true],sum:['sum','sum',true],int:['int','int',true],
    matrix:['matrix','matrix',true],cases:['cases','cases',true],align:['align','align',true],
    '$':['math','$',true],'$$':['math','$$',true],LaTeX:['code','LaTeX',true]};
  for(const control of root.querySelectorAll('button')) {
    const label=control.textContent, entry=map[label]; if(!entry)continue;
    control.setAttribute('aria-label',label);
    const [zh,en]=entry[1].split(' / ');
    control.dataset.tooltipZh=zh;control.dataset.tooltipEn=en??zh;
    control.classList.add('icon-button');
    control.replaceChildren(icon(entry[0]));
    if(entry[2])control.append(document.createTextNode(label));
  }
}
