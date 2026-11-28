import {buildRibbonGroups} from './ribbon-groups.js';

function commandBody(controls) {
  const body = document.createElement('div');
  body.className = 'ribbon-command-grid';
  body.append(...controls);
  return body;
}

function groupCommands(panel, definitions, primary, extra = []) {
  const groups = definitions.map(([id, zh, en, iconName, keys]) => ({
    id, zh, en, iconName, keys, controls: [],
  }));
  for (const control of [...panel.children]) {
    const key = control.dataset.en ?? control.dataset.sourceAction;
    (groups.find(group => group.keys.includes(key)) ?? groups[0]).controls.push(control);
  }
  const sections = [...groups.map(({controls, ...group}) => ({...group, body:commandBody(controls)})),...extra];
  const priority = sections.filter(group => group.id !== primary).reverse().map(group => group.id);
  return buildRibbonGroups(panel, sections, [...priority, primary]);
}

export function installCommandRibbons({insert, format, reference, math, table, tableStyles}) {
  groupCommands(insert, [
    ['insert-page','页面与文字','Pages & text','sourceFile',['New page','Code block','itemize','enumerate']],
    ['insert-table','表格','Tables','table',['▦','＋ Row','＋ Column']],
    ['insert-illustration','插图','Illustrations','image',['Image','Subfigure','figure','TikZ','CircuiTikZ']],
    ['insert-equation','公式','Equations','equation',['$','$$']],
  ], 'insert-page');

  groupCommands(format, [
    ['format-text','文字','Text','font',['B','I','U','S','Clear formatting','code','x²','x₂','sc','box','¶']],
    ['format-paragraph','段落','Paragraph','paragraph',['Align left','Center','Align right','Justify','quote','hr']],
    ['format-lists','列表','Lists','numberedList',['desc','1.','Cycle marker','Indent list item','Outdent list item','a.','A.','I.','甲','•']],
    ['format-marks','排版标志','Typesetting marks','title',['\\LaTeX','\\TeX']],
  ], 'format-text');

  groupCommands(reference, [
    ['reference-links','交叉引用','Cross-references','ref',['label','ref','refs','eqref']],
    ['reference-citations','引文与脚注','Citations & notes','citation',['cite','fn']],
    ['reference-navigation','目录与大纲','Contents & outline','toc',['toc','Outline','short']],
    ['reference-document','文档信息','Document details','sourceFile',['title','author','date']],
  ], 'reference-links');

  groupCommands(math, [
    ['math-equations','公式','Equations','equation',['$','$$','equation','equation label','Math line break','Exit formula']],
    ['math-structures','公式结构','Structures','frac',['frac','sqrt','ⁿ√','\\left','\\right','Literal fence','matrix','cases']],
    ['math-operators','运算符','Operators','sum',['sum','int','\\prod','\\iint','\\iiint','\\oint','\\oiint']],
    ['math-alignment','对齐环境','Alignment','align',['align','align*']],
  ], 'math-structures');

  groupCommands(table, [
    ['table-edit','表格与单元格','Table & cells','table',['▦','Continue','Delete table','Merge','Split','Left','Center','Right']],
    ['table-dimensions','行与列','Rows & columns','row',['＋ Row','＋ Column','－ Row','－ Column']],
    ['table-appearance','表格样式','Table appearance','booktabs',['booktabs','Caption','label','Borders','Rule width']],
  ], 'table-edit', tableStyles);
}

export function installFileRibbon(panel) {
  const definitions = [
    ['file-document','文档','Document','sourceFile','[data-tool="open"], [data-tool="saveAs"]'],
    ['file-project','项目','Project','folder','#project-new, #project-open'],
    ['file-resources','资源与下载','Assets & downloads','download','[data-tool="assets"], [data-tool="download"]'],
  ];
  const groups = definitions.map(([id,zh,en,iconName,selector]) => ({
    id, zh, en, iconName, body:commandBody(panel.querySelectorAll(selector)),
  }));
  panel.classList.add('file-ribbon');
  return buildRibbonGroups(panel, groups, () => [...groups].reverse()
    .filter(group => !group.body.closest('.ribbon-group')?.hidden)
    .map(group => group.id));
}
