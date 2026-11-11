// A single stroke-based icon family shared by toolbar and contextual actions.
const paths = {
  sun:'M12 3v2M12 19v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon:'M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z',
  system:'M4 5h16v11H4zM9 20h6m-3-4v4',
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
  image:'M3 4h18v16H3zM5 17l4-5 3 3 3-4 4 6M15 8h.01',
  folder:'M3 6h7l2 2h9v11H3z',
  borders:'M4 4h16v16H4zM4 12h16M12 4v16',
  ruler:'M3 7h18v10H3zM7 7v4m4-4v3m4-3v4m4-4v3',
  citation:'M5 5h5v6H5zM14 5h5v6h-5zM8 11l-2 6m11-6-2 6',
  equation:'M5 6h14M5 12h14M5 18h14M8 3v6M16 15v6',
  short:'M4 6h16M4 12h10M4 18h7',
};
export function icon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  svg.classList.add('ui-icon');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',paths[name] ?? paths.math);svg.append(path);return svg;
}
const descriptions = {
  files:{zh:'文件与项目操作',en:'File and project actions'},
  home:{zh:'常用编辑操作',en:'Common editing tools'},
  insert:{zh:'插入内容',en:'Insert content'},
  layout:{zh:'页面布局与边距',en:'Page layout and margins'},
  table:{zh:'表格编辑',en:'Table editing'},
  format:{zh:'文本与列表格式',en:'Text and list formatting'},
  reference:{zh:'交叉引用与文献',en:'Cross references and citations'},
  math:{zh:'公式插入与编辑',en:'Insert and edit formulas'},
  download:{zh:'下载完整的 LaTeX 项目压缩包',en:'Download the complete LaTeX project'},
  'Download project .zip':{zh:'下载完整的 LaTeX 项目压缩包',en:'Download the complete LaTeX project'},
  '下载项目 .zip':{zh:'下载完整的 LaTeX 项目压缩包',en:'Download the complete LaTeX project'},
  'Attach asset folder':{zh:'关联图片等资源所在的目录',en:'Attach a folder containing images and assets'},
  '关联资源目录':{zh:'关联图片等资源所在的目录',en:'Attach a folder containing images and assets'},
  Config:{zh:'编辑器设置',en:'Editor settings'},
  '配置':{zh:'编辑器设置',en:'Editor settings'},
  '↶':{zh:'撤销上一步操作',en:'Undo the last action'},
  '↷':{zh:'重做已撤销的操作',en:'Redo the last undone action'},
  B:{zh:'粗体',en:'Bold'},
  I:{zh:'斜体',en:'Italic'},
  U:{zh:'下划线',en:'Underline'},
  S:{zh:'删除线',en:'Strikethrough'},
  'Clear formatting':{zh:'清除字符格式',en:'Clear character formatting'},
  '清除格式':{zh:'清除字符格式',en:'Clear character formatting'},
  code:{zh:'行内代码',en:'Inline code'},
  quote:{zh:'引用块',en:'Block quote'},
  hr:{zh:'水平分隔线',en:'Horizontal rule'},
  'x²':{zh:'上标',en:'Superscript'},
  'x₂':{zh:'下标',en:'Subscript'},
  sc:{zh:'小型大写字母',en:'Small caps'},
  box:{zh:'给文字加边框',en:'Put a box around text'},
  '\\LaTeX':{zh:'插入 LaTeX 标志',en:'Insert the LaTeX logo'},
  '\\TeX':{zh:'插入 TeX 标志',en:'Insert the TeX logo'},
  '¶':{zh:'显示或隐藏格式标记',en:'Show or hide formatting marks'},
  desc:{zh:'描述列表',en:'Description list'},
  '1.':{zh:'数字编号列表',en:'Numbered list (1, 2, 3)'},
  'a.':{zh:'小写字母编号列表',en:'Lowercase letter list'},
  'A.':{zh:'大写字母编号列表',en:'Uppercase letter list'},
  'I.':{zh:'罗马数字编号列表',en:'Roman numeral list'},
  '甲':{zh:'天干编号列表',en:'Heavenly stem numbering'},
  '•':{zh:'自定义项目符号',en:'Custom bullet marker'},
  Image:{zh:'插入本地图片',en:'Insert a local image'},
  '图片':{zh:'插入本地图片',en:'Insert a local image'},
  'Code block':{zh:'插入带语言标记的代码块',en:'Insert a fenced code block'},
  '代码块':{zh:'插入带语言标记的代码块',en:'Insert a fenced code block'},
  itemize:{zh:'项目符号列表',en:'Bullet list'},
  enumerate:{zh:'编号列表',en:'Numbered list'},
  '▦':{zh:'插入表格',en:'Insert a table'},
  '＋ Row':{zh:'在下方插入行',en:'Insert a row below'},
  '＋ Column':{zh:'在右侧插入列',en:'Insert a column to the right'},
  '－ Row':{zh:'删除当前行',en:'Delete the current row'},
  '－ Column':{zh:'删除当前列',en:'Delete the current column'},
  '删除表格':{zh:'删除整个表格',en:'Delete the whole table'},
  merge:{zh:'合并选中的单元格',en:'Merge selected cells'},
  split:{zh:'拆分当前单元格',en:'Split the current cell'},
  booktabs:{zh:'使用 booktabs 三线表样式',en:'Use booktabs-style rules'},
  Caption:{zh:'设置表格题注',en:'Set the table caption'},
  '题注':{zh:'设置表格题注',en:'Set the table caption'},
  label:{zh:'设置标签键',en:'Set a label key'},
  Borders:{zh:'选择表格边框样式',en:'Choose table border style'},
  '边框':{zh:'选择表格边框样式',en:'Choose table border style'},
  'Rule width':{zh:'设置表格线宽',en:'Set table rule width'},
  '线宽':{zh:'设置表格线宽',en:'Set table rule width'},
  '左':{zh:'单元格左对齐',en:'Align cell left'},
  '中':{zh:'单元格居中',en:'Center cell'},
  '右':{zh:'单元格右对齐',en:'Align cell right'},
  ref:{zh:'插入交叉引用',en:'Insert a cross-reference'},
  refs:{zh:'打开引用索引',en:'Open the reference index'},
  eqref:{zh:'插入公式引用',en:'Insert an equation reference'},
  fn:{zh:'插入脚注',en:'Insert a footnote'},
  cite:{zh:'插入文献引用',en:'Insert a citation'},
  toc:{zh:'插入目录',en:'Insert a table of contents'},
  short:{zh:'设置短标题',en:'Set a short title'},
  title:{zh:'设置文档标题',en:'Set the document title'},
  author:{zh:'设置文档作者',en:'Set the document author'},
  '$':{zh:'插入行内公式',en:'Insert an inline formula'},
  '$$':{zh:'插入独立公式',en:'Insert a display formula'},
  equation:{zh:'插入编号公式环境',en:'Insert a numbered equation'},
  'equation label':{zh:'给当前公式添加标签',en:'Add a label to the current equation'},
  frac:{zh:'插入分数',en:'Insert a fraction'},
  sqrt:{zh:'插入根号',en:'Insert a square root'},
  sum:{zh:'插入求和符号',en:'Insert a summation'},
  int:{zh:'插入积分符号',en:'Insert an integral'},
  '\\prod':{zh:'插入连乘符号',en:'Insert a product'},
  '\\iint':{zh:'插入二重积分',en:'Insert a double integral'},
  '\\iiint':{zh:'插入三重积分',en:'Insert a triple integral'},
  '\\oint':{zh:'插入环路积分',en:'Insert a contour integral'},
  '\\oiint':{zh:'插入闭合曲面积分',en:'Insert a closed surface integral'},
  '\\left':{zh:'插入自适应左括号',en:'Insert a scalable left delimiter'},
  '\\right':{zh:'插入自适应右括号',en:'Insert a scalable right delimiter'},
  '单括号 / Literal fence':{zh:'输入不与自动配对关联的括号',en:'Insert a literal fence without auto-pairing'},
  matrix:{zh:'插入矩阵',en:'Insert a matrix'},
  cases:{zh:'插入分段函数',en:'Insert a cases environment'},
  align:{zh:'插入对齐公式',en:'Insert an align environment'},
};

function setDescription(control, description) {
  if (!description) return;
  control.dataset.tooltipZh=description.zh;
  control.dataset.tooltipEn=description.en;
}

export function applyToolbarDescriptions(root) {
  for (const control of root.querySelectorAll('button')) {
    const label=control.textContent.trim();
    const key=control.dataset.group||control.dataset.tool||control.getAttribute('aria-label')||label;
    const description=descriptions[key]??descriptions[label];
    if (description) setDescription(control,description);
    else if (!control.dataset.tooltipZh&&!control.dataset.tooltip) {
      const fallback=label||control.getAttribute('aria-label')||'';
      if (fallback) setDescription(control,{zh:fallback,en:fallback});
    }
  }
}

export function decorateToolbar(root) {
  const map={'↶':['undo','撤销 / Undo',false],'↷':['redo','重做 / Redo',false],
    B:['bold','粗体 / Bold',false],I:['italic','斜体 / Italic',false],U:['underline','下划线 / Underline',false],S:['strike','删除线 / Strikethrough',false],
    itemize:['list','itemize',true],enumerate:['list','enumerate',true],
    code:['code','code',true],quote:['quote','quote',true],hr:['hr','hr',false],desc:['desc','desc',true],
    sc:['title','小型大写 / Small caps',true],box:['borders','文本框 / Boxed text',true],
    label:['label','label',true],ref:['ref','ref',true],eqref:['ref','eqref',true],refs:['ref','refs',true],cite:['citation','cite',true],toc:['toc','toc',true],short:['short','short',true],title:['title','title',true],author:['author','author',true],
    '▦':['table','▦',false],'＋ Row':['row','＋ Row',true],'＋ Column':['column','＋ Column',true],
    merge:['merge','merge',true],split:['split','split',true],booktabs:['booktabs','booktabs',true],
    '左':['left','左 / Left',false],'中':['center','中 / Center',false],'右':['right','右 / Right',false],
    frac:['frac','frac',true],sqrt:['sqrt','sqrt',true],sum:['sum','sum',true],int:['int','int',true],
    matrix:['matrix','matrix',true],cases:['cases','cases',true],align:['align','align',true],equation:['equation','equation',true],
    '图片':['image','图片 / Image',true],Image:['image','图片 / Image',true],
    '边框':['borders','边框 / Borders',true],Borders:['borders','边框 / Borders',true],
    '线宽':['ruler','线宽 / Rule width',true],'Rule width':['ruler','线宽 / Rule width',true],
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
  applyToolbarDescriptions(root);
}
