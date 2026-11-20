# XeLaTeX 排版特性说明（Lineae 渲染对齐基准）

本文档是 Lineae 前端渲染与标准 XeLaTeX 对齐的**基准规格**。所有数值均按
`article` 文档类、`10pt/11pt/12pt` 选项给出；涉及宏包处注明宏包名与版本行为。
模块 3 的渲染对齐与测试 .tex 以本文档为准。

约定：`pt` 为 TeX point（1in = 72.27pt）；CSS 侧按 `72/72.27` 换算。

---

## 1. 表格（tabular + booktabs + caption）

### 1.1 tabular 环境
- 语法：`\begin{tabular}[pos]{cols}`，`pos` ∈ `t`（顶行对齐）、`c`（居中，默认）、`b`（底行对齐）。
- 列格式符：
  - `l` / `c` / `r`：按内容宽度自然列；
  - `p{w}` / `m{w}` / `b{w}`（array 宏包）：定宽列，顶/中/底对齐，自动换行；
  - `|`：竖线（booktabs 下不与横线相交，官方不推荐混用）；
  - `@{decl}`：列间声明（如 `@{}` 消去边距、`@{\quad}` 自定义间距）；
  - `>{decl}` / `<{decl}`（array）：插入列前/后代码（常用于 `\raggedright\arraybackslash`）；
  - `*{n}{spec}`：重复列格式。
- 行距：`tabcolsep = 6pt`（列内容两侧各 6pt，相邻列间距 = 12pt）；
  `\arraystretch` 作用于行盒（默认 1），booktabs 推荐 1.2–1.3；
  `extrarowheight`（array）额外垫高每行（只垫顶部）。
- 横线（原生）：`\hline`、`\cline{m-n}`；竖线贯穿 `\hline`。

### 1.2 booktabs 横线
| 命令 | 线宽 | 上间距 | 下间距 |
|---|---|---|---|
| `\toprule` | `\heavyrulewidth = 0.08em`（10pt 下 ≈ 0.8pt） | `\aboverulesep = 0.4ex`（≈1.7pt） | `\belowrulesep = 0.65ex`（≈2.8pt） |
| `\midrule` | `\lightrulewidth = 0.05em`（≈ 0.5pt） | `\aboverulesep = 0.4ex`（≈1.7pt） | `\belowrulesep = 0.65ex`（≈2.8pt） |
| `\bottomrule` | `\heavyrulewidth = 0.08em` | `\aboverulesep = 0.4ex`（≈1.7pt） | `\belowrulesep = 0.65ex`（≈2.8pt） |
| `\cmidrule{a-b}` | `\lightrulewidth`，默认两端缩进 `\cmidrulekern = 0.25em`，`(lr)` 参数取消单侧缩进；多段 `\cmidrule` 间距 `\cmidrulesep = 0.31em` | 同 midrule | 同 midrule |
| `\addlinespace[dim]` | 无线，仅加垂直间距（默认 0.5em） | — | — |

要点：booktabs 横线是**表内行**，上下间距属于表格垂直结构的一部分；
与竖线混用时横线不与竖线相接（两端留空）。

### 1.3 表格浮动体与 caption
- `\begin{table}[htbp]`（默认 `tbp`），浮动参数与 figure 相同（见 §2.1）。
- `\caption{...}` 置于表**上方**；article 类格式：`Table 1: 标题文本`（编号与标题
  同字号同字体，标签 `Table N:` 后接标题，无加粗——英文实现固定为 `Table N`）。
- `\label` 须在 `\caption` 之后；交叉引用输出 `\thetable`（默认全文连续编号；
  book/report 中按章编号 `1.1`）。
- caption 宏包可改格式（labelfont、labelsep=colon/period 等），基准取 article 默认
  （`labelsep=colon`：美式冒号，实际输出 `Table 1: xxx`）。
- `threeparttable` 的表注（tablenotes）属于扩展，未纳入基准。

---

## 2. 插图：figure / wrapfigure / subfigure

### 2.1 figure 浮动体
- `\begin{figure}[placement]`，位置参数：`h`（此处）、`t`（页顶）、`b`（页底）、
  `p`（浮动页）、`!`（忽略参数限制）；默认 `tbp`（article）。
- 浮动阈值（article）：`\topfraction = 0.7`、`\bottomfraction = 0.3`、
  `\textfraction = 0.2`、`\floatpagefraction = 0.5`、`\topnumber = 3`、
  `\bottomnumber = 2`、`\totalnumber = 4`。
- `\centering`：图片与 caption 均水平居中。
- `\caption{...}` 置于图**下方**：`Figure 1: 标题`（article，colon 分隔）。
- 图片尺寸：`\includegraphics[width=\textwidth]` 等；无宽度时按自然尺寸。

### 2.2 wrapfigure 文字环绕
- 语法：`\begin{wrapfigure}[lines]{side}[overhang]{width}`。
  - `side`：`r`/`R`、`l`/`L`（大写允许浮动到次页列的顶部）、`i`（内侧）、`o`（外侧）；
  - `lines`：占用的**窄行行数**（缺省自动计数）；
  - `overhang`：突出至页边/栏间距的量（默认 0）；
  - `width`：环绕盒宽度（常用 `\columnwidth`、`0.5\textwidth` 等）。
- 间距参数：`\columnsep`（默认 10pt）在图文之间；
  `\intextsep = 12pt plus 2pt minus 2pt`（与正文的垂直间距）。
- 排布规则：影响其后段落（`\parshape` 逐段收窄）；出现在段首才生效；
  不得紧跟在列表、公式、脚注之后（已知缺陷）；`wrapfigure` 内的 caption
  用 `\caption`，编号同 figure。
- 多栏中 `r/l` 相对于**栏**。

### 2.3 subfigure（subcaption 宏包，现行标准）
- 语法：`\begin{subfigure}[pos]{width} ... \caption{} \label{} \end{subfigure}`，
  多个并排置于 figure 内；通常配 `\centering` 或 `\hfill` 控制间隔。
- 子编号：`(a)`、`(b)`…，子标题样式 `(a) 子标题`（默认字号同正文；可用
  `\captionsetup{font=small}` 调小，常见约定 `\small`）。
- 主 caption 编号 `Figure 1`；引用子图 `Figure 1a`（`\subref` 输出 `(a)`）。
- 旧 `subfigure` 宏包（已弃用）：`\subfigure[子标题]{\includegraphics...}`，
  每个子图独立 `(a)` 标签，排不下时自动换行堆叠。

---

## 3. 页面布局

### 3.1 文本块几何（无 geometry，article 原生，letterpaper）
- `\textwidth = 345pt`，`\textheight = 550pt`（10pt 类）。
- 左边距 = `1in + \oddsidemargin(62pt)`；上边距 = `1in + \topmargin(22pt) + \headheight(12pt) + \headsep(18pt)`。
- 底部 ≈ 118pt；`\footskip = 25pt`。
- a4paper 选项：`\textwidth = 345pt`？否——a4 时 `\textwidth` 随 `\hsize` 调整，
  准确值以 `\layout` 输出为准（A4 10pt：textwidth ≈ 345pt？**实测为准**）。

### 3.2 geometry 宏包（默认行为）
- 默认 `scale=0.7`：文本块宽 = 0.7 × 纸宽，高 = 0.7 × 纸高。
- 默认边距比 `marginratio=2:3`（水平、垂直）：剩余 30% 按 2:3 分配；
  默认居中（`hcentering`、`vcentering`）。
- 关键参数：`top/bottom/left/right`、`hmargin/vmargin`、`margin`、
  `headheight`、`headsep`、`footskip`、`includehead`、`includefoot`、
  `includeheadfoot`、`marginparwidth`、`marginparsep`、`ratio`、`scale`、
  `centering/marginratio`、`paperwidth/paperheight`。
- 含页眉/页脚时：`includeheadfoot` 将 head/foot 计入文本块计算。

### 3.3 行距与字号
- `\linespread{f}`：`\baselineskip × f`（10pt 类基础 `\baselineskip = 12pt`：
  1.3 倍 → 15.6pt；1.5 倍 → 18pt）。
- `\fontsize{字号}{行距}\selectfont` 显式指定。
- article 字号层级（10pt 类）：tiny 5 / scriptsize 7 / footnotesize 8 /
  small 9 / normalsize 10 / large 12 / Large 14.4 / LARGE 17.28 /
  huge 20.74 / Huge 24.88（行距对应 6/8/9.5/10/12/14/18/20/25/25? 见 ltfsstrc）。
- 行距生效规则：行距小于字体的最小行距（\lineskiplimit）时按 \lineskip(1pt) 叠加。

### 3.4 字体（fontspec）
- `\setmainfont[Options]{字体}`：正文字体；`\setsansfont`、`\setmonofont`。
- `\setCJKmainfont`（xeCJK）：中文字体；自动按 Unicode 分区选择字体。
- 选项：`Scale=MatchLowercase/MatchUppercase`、`\defaultfontfeatures`、
  `BoldFont`、`ItalicFont`、`\newfontfamily`。
- 中文与西文混排：xeCJK 按字符 Unicode 范围切换字体，间距自动调整。

### 3.5 颜色与高亮
- xcolor：`\color{名}`（声明式）、`\textcolor{名}{文本}`（命令式）、
  `\definecolor{name}{HTML}{RRGGBB}`、`\pagecolor`。
- 高亮背景：`\colorbox{色}{文本}`（不换行盒子，fcolorbox 带边框）；
  `soul` 宏包 `\hl{文本}`：跨行高亮（逐行绘制背景，类似荧光笔），
  与 `\colorbox` 的区别是可断行、逐行着色。

### 3.6 分栏
- 全文双栏：`\documentclass[twocolumn]`；栏间距 `\columnsep = 10pt`，
  栏间竖线 `\columnseprule = 0pt`（默认无线）。
- 分页规则：先填满左栏再填右栏；**文档末页两栏自动平衡**；
  `\flushcolumns`（默认）/ `\raggedcolumns`。
- 通栏元素：`\twocolumn[通栏文本]`、`figure*`/`table*` 通栏浮动。
- 切换：`\onecolumn` / `\twocolumn` 中途切换（新起一页）。
- 局部多栏：`multicol` 宏包 `\begin{multicols}{n}[通栏前置文本]`，
  栏内容**结束时平衡**；`\columnbreak` 强制换栏；支持至多 10 栏；
  跨过浮动体/脚注受限。

---

## 4. 列表：itemize / enumerate

### 4.1 标签样式（article 默认）
| 层级 | itemize | enumerate |
|---|---|---|
| 1 | `\textbullet`（•） | `1.`（`\theenumi` = `\arabic`） |
| 2 | `\textendash`（–） | `(a)`（括号包裹小写字母） |
| 3 | `\textasteriskcentered`（∗） | `i.`（小写罗马数字） |
| 4 | `\textperiodcentered`（·） | `A.`（大写字母） |

- 编号嵌套引用：`\theenumii = \theenumi(\alph{enumii})` → 交叉引用输出形如 `1(a)`。
- 最深 4 层；超出报 `Too deeply nested`。
- 标签后间距 `\labelsep = 0.5em`；标签盒宽 `\labelwidth`；悬挂缩进
  `\leftmargin`：level1 = 2.5em、level2 = 2.2em、level3 = 1.87em、level4 = 1.7em
  （article 10pt）。

### 4.2 间距（article 10pt）
- `\itemsep = 4pt plus 2pt minus 1pt`（项间，不含标签段）；
- `\parsep = 4pt plus 2pt minus 1pt`（项内段落间）；
- `\topsep = 8pt plus 2pt minus 4pt`（列表与上下正文间，含 `\partopsep`）；
- `\partopsep = 2pt plus 1pt minus 1pt`（列表独立成段时附加）；
- `\listparindent = 0pt`、`\itemindent = 0pt`、`\rightmargin = 0pt`。
- 列表字体 = `\normalsize`（不随上下文缩放，除非 `\small` 环境包裹）。

### 4.3 语法与扩展
- `\item[自定义标签]`；空项不产标签。
- enumitem 宏包（现行标准）：`\setlist{nosep}`、`\setlist[itemize,1]{label=–}`、
  `resume`、`inline` 模式、`shortlabels`、`\begin{enumerate}[a)]` 简写。
- 行间列表 `\begin{inparaenum}`（enumitem inline）。

---

## 5. 页眉页脚：fancyhdr

### 5.1 基本结构
- `\usepackage{fancyhdr}` + `\pagestyle{fancy}`：9 个槽位
  head/foot × left/center/right。
- `\fancyhead[L,C,R]{...}`、`\fancyfoot[L,C,R]{...}`、`\fancyhf{}`（清空）；
  支持 `E/O`（偶/奇页）与 `H/F` 组合：`\fancyhead[LE,RO]{\thepage}`。
- 默认值：`\headrulewidth = 0.4pt`、`\footrulewidth = 0pt`；
  `\headrule`（页眉下横线）、`\footrule`（页脚上横线，默认无）。
- 横线位置：headrule 紧贴页眉文字基线下方；footrule 紧贴页脚上方。
- 尺寸约束：`\headheight` 必须不小于页眉实际高度，否则报
  `headheight too small` 警告；geometry 下用 `head=\headheight` 协调。

### 5.2 oneside / twoside 差异
- article 默认 oneside：奇偶页同版式；`\documentclass[twoside]` 启用双面。
- twoside 下：纸张左右边距镜像（`\oddsidemargin` vs `\evensidemargin`；
  geometry 自动处理）；E/O 修饰符生效；页码通常在奇页右、偶页左。
- twoside 不影响 \fancyhead 默认值本身（仍为 L/C/R 三槽），只是
  单数页 = odd、双数页 = even。

### 5.3 与 \maketitle 的关系（关键事实）
- `\maketitle` 内部对首页执行 `\thispagestyle{plain}`：
  **标题页不显示页眉**，页脚居中页码。
- 若标题超过一页，后续页不受影响（恢复 \pagestyle）。
- 同理 book 类 `\chapter` 首页为 plain。
- 强制修改：`\thispagestyle{fancy}` 或
  `\fancypagestyle{plain}{...}` 重定义 plain。

### 5.4 其他
- `\fancyhfoffset[LE,RO]{dim}`：槽位水平外扩（伸入页边）。
- `\fancypagestyle{名}{...}`：自定义样式名，配合 `\thispagestyle`。
- article 原生 `headings` 样式：页眉显示 `1.2 SECTIONNAME`（左）与页码（右），
  页脚空——仅当 `\pagestyle{headings}`。
- `empty`：页眉页脚全空；`plain`：仅页脚居中页码。

---

## 附：本文档未覆盖（超出基准范围）
- 数学排版（amsmath 公式布局属独立模块）；
- 章节标题编号深度、目录、参考文献样式；
- TikZ/图片旋转裁剪、PDF 页面插入；
- ctex 文档类的中文排版细节（标点压缩、段落间距）；
- hyperref 链接框颜色。
