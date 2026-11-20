# Lineae Parser 开发文档

核验日期：2026-11-17。适用对象：`AminiamEva/Lineae` 的 `feat/academic-latex-parser` 工作区，基于 `de51911f02812b9a2f895df3409010577a342d39`，**包含尚未提交的适配器改动**。这不是该提交本身或已发布版本的功能清单。

Lineae 把可识别的 LaTeX 子集投影为 Tiptap / ProseMirror 文档节点，保留原始源码作为安全回写的依据。Parser 不执行 TeX，不展开宏，也不是 LaTeX 编译器。识别结构、浏览器预览、富文本编辑和原文保留是不同能力；下文分别说明边界。

本文使用独立合成样例说明源码保真机制和语法支持范围。回归夹具覆盖标题、图、引用、表格和文本容器。

## 1. 导入流程

入口见 [main.js](../apps/web/src/main.js) 的 `load()`，文档切分见 [document.mjs](../apps/web/latex/document.mjs)。

```text
LaTeX 字符串
  → parseDocument(source, {fragment})
  → {start, end, blocks, eol}（保留文档外壳及正文分隔符）
  → blocks.flatMap(importBlocks)
  → 现有编辑器 JSON 节点（不支持的源块为 raw）
  → editor.setContent + importedSource / importedSnapshot
  → sourceProjection（原始区间与节点快照）
  → 安全富文本事务 → richSourceChanges → 源码局部补丁
```

- 完整文档匹配独立行上的 `\begin{document}` 和 `\end{document}`；开头标记之后需要换行。返回的 `start` 包含导言区与开始标记，`end` 包含结束标记及尾随内容。不能把任意排列的 TeX 都当作已支持的完整文档输入。
- `fragment: true` 允许项目子文件片段，通过临时文档外壳调用解析后去掉外壳；保留片段末尾换行，不把包装写入子文件。默认模式没有匹配外壳时返回 `null`，由 UI 报告无法识别文档。
- 正文只按顶层空行切块；分隔符本身也存入 `blocks`。`start + blocks.join('') + end` 可以恢复被解析的输入字符串。`eol` 只是默认换行提示，不能代表原文件所有换行都相同。
- `load()` 保留原始字符串与编辑器快照，恢复文献库元数据并刷新引用。已有标题元数据时，对开头 `\maketitle` 有专门处理；导入不只是把 `importBlocks()` 的结果拼接起来。
- 多文件包含关系及文件归属由项目层处理，不能由单文件 `parseDocument()` 推断整个工程。[片段测试](../tests/project-fragments.test.mjs) 与 [项目组合测试](../tests/project-composition.test.mjs) 分别覆盖这两层。

### 词法边界

[source-structure.mjs](../apps/web/latex/source-structure.mjs) 的 `sourceStructure()` 跟踪环境栈、花括号、注释、转义、数学区间、字面环境与 `newcommand / renewcommand / providecommand` 的参数。token 带有 `index / end / kind / topLevel`。它防止宏定义、未知环境或注释中的标题、空行、公式定界符被当成顶层结构。

扫描器保护 `verbatim`、`verbatim*`、`lstlisting`、`minted` 和 `\verb` 的字面内容，但这不表示它们都能成为可视化代码节点。未闭合、错配或孤立结束符产生 `invalid`；`importBlocks()` 对相应源块整体回退 Raw，不补全标签，不修复拼写。它不实现 catcode、条件执行或动态环境名的 TeX 语义。

## 2. Block / Inline Parser

[blocks.mjs](../apps/web/latex/blocks.mjs) 提供两个入口：

- `importBlocks(source, options)` 是文档导入和源码投影使用的入口：先检查异常结构，再处理文本容器、定理、特定代码环境，最后按顶层 `\par`、标题、目录和显示公式拆分。一个输入块可产生多个节点。
- `importBlock(source, options)` 识别单个候选块，如图片、标题、数学、列表、表格及段落；失败后返回 `{type: 'raw', attrs: {source}}`。不要绕过 `importBlocks()` 的结构检查，把单块识别当成完整文档校验器。

标题由 [headings.mjs](../apps/web/latex/headings.mjs) 读取平衡参数，支持三级 section、星号、短标题和跟随 label。只有标题内容能被行内解析器表示时才生成 `heading`；未知命令及不能表示的分组仍保留 Raw。

[inline.mjs](../apps/web/latex/inline.mjs) 的 `parseInline()` 返回文本与行内描述对象，再由 `inlineContent()` 转成 text/marks、math、ref、cite、label、footnote、hardBreak 等已有节点。遇到未知控制序列或无法解析的参数返回 `null`，由调用方保护整个相关片段。递归深度上限为 40；文本环境导入另有 32 层限制。

注意行内解析存在有意的显示归一化：注释不进入可见文本，物理换行变为空格，`\emph` / `\textsl` 映射为 italic，部分文本盒命令去掉外壳，`\\[6pt]` 变为 hardBreak。`ignoredPattern` 中的分页、间距等命令不产生节点。**这些内容不等于未知语法被 Raw 化，也不等于 AST 能还原原拼写**；含这些内容的安全保留依赖原始源码和投影保护，直接重新序列化 AST 会有差异。

`abstract / center` 由 [text-environments.mjs](../apps/web/latex/text-environments.mjs) 复用 `blockquote`，通过 `latexEnvironment` 区分身份。`environmentSource` 保存完整原文、分片范围和独立快照；内部继续使用 paragraph/math/Raw 等节点。段首 `zihao`、`setlength`、字号声明等保留在源码映射中，不宣称具有精确 CSS 等价物。子节点数量变化、移除容器或无法安全回写的非规范片段需要在 Source 模式处理。

## 3. Math

[math-delimiters.mjs](../apps/web/latex/math-delimiters.mjs) 负责词法区间；[blocks.mjs](../apps/web/latex/blocks.mjs) 与 [inline.mjs](../apps/web/latex/inline.mjs) 负责节点转换；[math-node.js](../apps/web/src/editor/math-node.js) 对接 MathLive。

```text
行内：math      attrs: {latex, display: false, delimiter}
块级：mathBlock attrs: {latex, display: true, delimiter?, label?}
```

- `$...$`、`\(...\)` 的常见单行形式导入为行内 math。行内解析仍有单行正则限制；词法扫描器识别一个区间，不意味着所有区间都能转成可编辑行内节点。
- `$$...$$`、`\[...\]` 可从前后文字中拆出 mathBlock，保留内部换行；连续公式、公式内部空行、注释与转义边界已有测试。`Before.$$x$$After.` 产生 paragraph / mathBlock / paragraph。
- `equation / equation*` 使用 delimiter 属性记录环境；普通 equation 开头或末尾的受支持 label 可提取到属性。其他被 Block Parser 列出的数学环境保存整个 LaTeX 字符串，例如 align、alignat、flalign、gather、multline、eqnarray 及其星号形式，以及 cases、aligned、matrix、array 家族；不是逐运算符构建数学 AST。
- [math-environments.mjs](../apps/web/latex/math-environments.mjs) 的 `mathEditorSource / mathDocumentSource` 在编辑视图中适配对齐环境，并恢复部分 label、tag、notag、nonumber 信息。不能把该文件的 `displayEnvironment()` 名单直接当作 Block Parser 的导入支持名单。
- 序列化移除 MathLive 的 `\placeholder{...}` 编辑辅助符；独立的 cases、aligned、matrix 等内部数学环境会被包装在 `\[...\]` 中。原样导出的例外必须结合第 7 节判断。
- 未知 `+cases` 不会自动改名为 cases；无法识别的环境仍走 Raw。已识别公式内部的命令保存在 `attrs.latex` 中，MathLive 是否能显示、编辑它们是另一层能力。测试证明节点与字符串行为，不证明任意宏包数学命令的渲染或编辑保真。

## 4. Table AST 与适配器

所有结构化表格沿用已有树形：`table → tableRow → tableCell / tableHeader → paragraph → inline nodes`。不存在替换整个编辑器的第二套表格 AST。

| 层 | 数据与职责 | 回写边界 |
| --- | --- | --- |
| 普通 tabular | [tables.mjs](../apps/web/latex/tables.mjs) 返回 columns/specs/rows/trailing；[table-spans.mjs](../apps/web/latex/table-spans.mjs) 处理跨度；Block Parser 映射到 Table 节点 | 仍按物理行解析表格行，要求环境正文前后换行；规则与样式经 AST 归一化，不能假定任意 TeX 行列写法或逐字往返 |
| table / table* 外壳 | [table-floats.mjs](../apps/web/latex/table-floats.mjs) 返回完整 source/open/body/close、placement、caption、shortCaption、captionStarred、label、centered | 描述符识别成功不等于内表已经结构化；复杂浮动体可以继续是 Raw。普通 tabular 路径只接纳受限的外层命令，不能保证所有描述符字段都进入普通 Table AST |
| tblr | [tblr.mjs](../apps/web/latex/tblr.mjs) 识别部分 colspec、行列线、样式与 SetCell 跨列；`attrs.tblr` 保存原文、内容范围、快照及结构基线 | 未编辑返回原文；只对允许的单元格内容范围打补丁。未知配置记录在 `unsupported`，保留不等于执行 |
| tabularx | [tabularx.mjs](../apps/web/latex/tabularx.mjs) 识别 X/l/c/r/p 列、部分列前声明、booktabs 与 multicolumn；`attrs.tabularx` 保存原文及元数据 | 复用 tblr 的 `importSourceTable / serializeSourceTable`；宽度表达式保留不等于精确求值；不能安全映射的修改拒绝回写 |

tblr / tabularx 按顶层 `&` 与 `\\` 划分单元格和表格行，跳过分组、公式、注释及环境内部的分隔符；物理换行不等于行界。这一规则不要套用到旧的 `parseTable()`。

tblr 的 `\SetCell[c=2]{c}` 使用 colspan，但覆盖位置仍有原始源码槽位；tabularx 的 `\multicolumn{2}{c}{...}` 消耗列数而不要求相同的占位槽。二者不能互换解析策略。tblr 的 SetCell 跨行、tabularx 的 multirow 等未适配情况保守保留 Raw；普通 tabular 的既有 multirow 支持不能推导出这些适配器同样支持。

`serializeSourceTable()` 比较表属性、行单元格数量和各单元格 shape，仅修改已存范围。带注释或特定被忽略排版命令的单元格受保护；可以编辑其他安全单元格。结构、跨度、列宽或样式变化无法证明安全时返回 `null`。Codec 单独调用会回退原文，UI 投影还会拒绝该事务；因此不能把 Codec 返回字符串当作编辑已成功。

Schema / HTML 元数据接入见 [tblr-extension.js](../apps/web/src/editor/tblr-extension.js)、[tabularx-extension.js](../apps/web/src/editor/tabularx-extension.js)。这些属性使源码映射随现有节点传递，不提供完整 tabularray/tabularx 排版引擎。

## 5. Figure 与资源

[images.mjs](../apps/web/latex/images.mjs) 将单图 `figure / figure*` 和受支持的独立 `\includegraphics` 映射为 `documentImage`。属性包括 path、width、figure、placement、align/centered、caption、label，以及浮动图的 `figureSource`。

- 单图支持部分位置、对齐、嵌套花括号图注、可选短图注和星号图注的源码保留。宽度接受可选数字倍数的 linewidth/textwidth，或 cm/mm/pt；不接受任意尺寸宏、height、裁剪或旋转选项。
- `serializeSourceFigure()` 只替换已知参数区间，并重新解析核对结果。未涉及的注释、缩进、短图注及环境原文不重新生成。复杂多图、subfigure/minipage、未知外层命令或不完整结构整体保留 Raw。
- [project-assets.js](../apps/web/src/editor/project-assets.js) 按已附加资源路径查找图片，省略扩展名时要求唯一匹配；不会凭空生成缺失资源，也不解释完整 TeX 图片搜索规则。
- [image-node.js](../apps/web/src/editor/image-node.js) 处理资源缺失/无法预览状态和 HTML 属性。预览支持既有栅格图片类型；PDF/EPS 图片、graphicspath、宏尺寸、单双栏浮动分页等不能由节点识别推导为已实现。caption 保存为 LaTeX 字符串，不是完整富文本图注编辑器。

## 6. Raw Node

```js
{ type: 'raw', attrs: { source: '\\unknown{example}\r\n' } }
```

[Raw schema](../apps/web/src/main.js) 使用 `pre[data-raw]`、较高 HTML 解析优先级和 JSON 编码的 `data-raw-source` 保存原字符串；旧格式回退读取文本内容。Raw 是不透明节点，源码修改通过 Source 模式进行。

[Codec](../apps/web/src/editor/latex-codec.js) 的 `serialize(raw)` 直接返回 `attrs.source`，不 trim、不转义、不规范化换行。组合节点时，父层可能在 Raw 后补必要空行，所以 `serialize(doc)` 与“单独序列化一个 Raw”不是同一个保真承诺。

未知命令、未知环境、宏定义、minipage、dirtree 等保留原文。不能安全识别的已知容器也可能整体退回 Raw；abstract/center 则可以在容器内保留 Raw 子节点。环境异常保护的是相关源块，不一定是整个文件；前面独立的安全段落仍可编辑。Raw 原文保留不保证其本身是合法或可编译的 LaTeX。

## 7. 序列化与源码保真

必须区分以下路径：

1. **纯切分重组**：`parseDocument()` 保留外壳与分隔符；不经过 AST 重新生成正文。
2. **AST 序列化**：[latex-codec.js](../apps/web/src/editor/latex-codec.js) 的 `serialize()` 为普通节点生成规范 LaTeX，如统一段落分隔、转义文本和输出 marks。它不是无损 CST 打印器。带 source 元数据的适配器优先保留原文或定点修改。
3. **富文本到源码补丁**：[source-sync.js](../apps/web/src/editor/source-sync.js) 的 `sourceProjection / richSourceChanges` 建立源块区间、节点快照和 editable 标记。仅当原块规范串等价或存在明确拼写映射时允许修改；节点数量变化需由同一个安全块拥有编辑范围；Raw、保护区替换及不安全适配器修改返回 `null`。补丁还需经再次导入验证，并通过公共前后缀缩小替换区间。
4. **整文档导出**：[main.js](../apps/web/src/main.js) 的 source() 在节点快照未变时返回原始草稿。显式保存时的缩进是单独的格式化步骤。回到既有整文档生成路径时，[packages.mjs](../apps/web/latex/packages.mjs) 可能补充宏包、定理声明或标题命令。

Source/Split、项目 tex，以及有特定源码属性或 Raw 的文档沿用源码投影。独立 Document 的普通顶层段内修改也在确认原始区间后局部回写。无法验证的段内修改应在 Source 处理。跨段和显式新格式命令仍沿用既有路径。Split 的 Document 预览为只读。

相关映射辅助见 [source-spelling.mjs](../apps/web/src/editor/source-spelling.mjs)、[source-boundaries.mjs](../apps/web/src/editor/source-boundaries.mjs)；混合换行处理另由 [source-eol.test.mjs](../tests/source-eol.test.mjs)、[source-eol-codemirror.test.mjs](../tests/source-eol-codemirror.test.mjs) 覆盖。这里的范围偏移是 JavaScript 字符串索引；所谓逐字保留针对已解码源码及其换行，不是对任意原始文件编码的通用二进制保真保证。

维护原则：未知语法保留原始源码；新增适配器必须有失败回退、精确往返、相邻安全编辑及拒绝危险回写的测试，不能为了得到“结构化节点”而丢弃未知内容。测试用最小合成样例，不将用户完整文档写入公开仓库。

## 8. 语法支持矩阵

状态只针对“语法 / 范围”一列所限定的子集：

- **完整支持**：列出的有限子集有导入与对应结构化输出证据，不表示支持整个宏包或精确 TeX 排版。
- **部分支持**：已识别一部分属性或可编辑内容，存在语法、显示、回写或规范化限制。
- **Raw 保留**：该范围不结构化编辑，相关源块保留原文；不是可视化支持。
- **暂不支持**：所列语义能力未实现；相关源码仍可能经 Raw 或源码属性保留，不代表丢弃源码。

每行链接给出实现位置与已运行的测试证据。负向/保真测试证明拒绝或保留边界；不代表对所有未支持语法做过穷举测试。

<!-- support-matrix:start -->
| 语法 / 范围 | 状态 | 边界与回退 | 源码 | 测试证据 |
| --- | --- | --- | --- | --- |
| 普通中英文段落与规范段落分隔 | 完整支持 | paragraph/text；规范输出不承诺原空白拼写 | [Block](../apps/web/latex/blocks.mjs) | [基础](../tests/tex-compat-parse.test.mjs)、[补丁](../tests/source-v2.test.mjs) |
| `\% \& \_ \# \$ \{ \}` 文本转义 | 完整支持 | 转为字符并在序列化时转义；不扩大到任意控制序列 | [Inline](../apps/web/latex/inline.mjs)、[Codec](../apps/web/src/editor/latex-codec.js) | [转义](../tests/tex-compat-parse.test.mjs)、[连续编辑](../tests/project-fragments.test.mjs) |
| 规范 `\textbf{...}` / `\textit{...}` 及可解析嵌套 | 完整支持 | bold/italic marks；内含未知命令则相关块 Raw | [Inline](../apps/web/latex/inline.mjs) | [格式](../tests/tex-compat-parse.test.mjs)、[Raw](../tests/raw-source.test.mjs) |
| `emph / textsl / texttt / textsc / fbox`、上下标与字体颜色 | 部分支持 | 部分命令映射 marks；同义写法、字号、盒子语义不全部等价 | [Inline](../apps/web/latex/inline.mjs) | [文本结构](../tests/latex.test.mjs) |
| 注释、物理换行、间距及分页命令 | 部分支持 | 仅部分显示归一化或忽略；保真依赖源码投影，直接 AST 输出不能恢复全部内容 | [Inline](../apps/web/latex/inline.mjs)、[投影](../apps/web/src/editor/source-sync.js) | [注释](../tests/tex-compat-parse.test.mjs)、[保护](../tests/source-v2.test.mjs) |
| `\\`、`\\[6pt]`、`newline / linebreak` | 部分支持 | hardBreak；可选间距没有完整节点语义 | [Inline](../apps/web/latex/inline.mjs) | [换行](../tests/tex-compat-parse.test.mjs)、[定界符](../tests/display-math-blocks.test.mjs) |
| `section / subsection / subsubsection`、星号、短标题、label | 部分支持 | 平衡嵌套标题可识别；未知标题内容或非规范可回写范围受保护；不含 chapter/part | [标题](../apps/web/latex/headings.mjs) | [标题](../tests/heading-nesting.test.mjs)、[引用](../tests/references.test.mjs) |
| `tableofcontents` | 部分支持 | 独立结构节点；不是编译器生成的分页目录 | [Block](../apps/web/latex/blocks.mjs) | [结构](../tests/tex-compat-parse.test.mjs) |
| `itemize / enumerate / description` | 部分支持 | 基本嵌套、部分 label/start；不实现任意 enumitem 配置；未知正文可使列表整体 Raw | [Block](../apps/web/latex/blocks.mjs) | [列表](../tests/latex.test.mjs)、[容器回退](../tests/raw-source.test.mjs) |
| `quote`、内置 theorem/lemma/proposition/corollary/definition/remark/proof | 部分支持 | quote 支持简单段落；定理支持已列环境和可解析内容，不执行用户定理宏定义 | [定理](../apps/web/latex/theorem.mjs)、[Block](../apps/web/latex/blocks.mjs) | [定理](../tests/latex.test.mjs)、[未知内容](../tests/raw-source.test.mjs) |
| `abstract / center` | 部分支持 | blockquote 加原环境身份；支持安全内部编辑，复杂片段为 Raw 或受保护源码 | [文本环境](../apps/web/latex/text-environments.mjs) | [环境](../tests/text-environments.test.mjs) |
| `zihao / setlength` 等文本环境段首声明 | 部分支持 | 原始映射保留，不求精确排版值；不推导为全局声明支持 | [文本环境](../apps/web/latex/text-environments.mjs) | [声明保留](../tests/text-environments.test.mjs) |
| 单行 `$...$` / `\(...\)` | 部分支持 | math 字符串；不是完整数学命令解析，复杂或多行输入可能 Raw | [Inline](../apps/web/latex/inline.mjs) | [公式](../tests/latex.test.mjs)、[边界](../tests/display-math-blocks.test.mjs) |
| `$$...$$` / `\[...\]` | 部分支持 | 顶层拆块与多行内容保留；公式内部功能受 MathLive 限制，异常定界符 Raw | [数学区间](../apps/web/latex/math-delimiters.mjs) | [显示公式](../tests/display-math-blocks.test.mjs) |
| `equation / equation*` 及已列对齐环境 | 部分支持 | mathBlock；部分 label/tag 恢复，不提供 TeX 计数器或全部环境语义 | [Block](../apps/web/latex/blocks.mjs)、[数学适配](../apps/web/latex/math-environments.mjs) | [数学环境](../tests/latex.test.mjs) |
| `cases / aligned / matrix / array` 等内部数学环境 | 部分支持 | 保存数学字符串；裸环境输出时可补显示定界符，不承诺原文恒等 | [Block](../apps/web/latex/blocks.mjs)、[Codec](../apps/web/src/editor/latex-codec.js) | [外层包装](../tests/latex.test.mjs) |
| 普通 `tabular`、受支持列说明、multicolumn/multirow | 部分支持 | 物理行解析及有限跨度支持；不能等同 tblr 扫描器；编辑后规则可能规范化 | [表格](../apps/web/latex/tables.mjs)、[跨度](../apps/web/latex/table-spans.mjs) | [表格](../tests/latex.test.mjs) |
| `table / table*` 浮动体元数据 | 部分支持 | 描述符可识别位置、图注、label；内表不受支持时仍 Raw；普通 Table 属性不覆盖所有外壳语义 | [浮动表](../apps/web/latex/table-floats.mjs) | [浮动体](../tests/table-floats.test.mjs) |
| `tblr` 的 X/l/c/r、部分样式及 SetCell 跨列 | 部分支持 | 既有 Table AST 与源码补丁；未知配置保留；未支持跨行或未知单元格可使整体 Raw | [tblr](../apps/web/latex/tblr.mjs) | [tblr](../tests/tblr.test.mjs) |
| `tabularx` 的 X/l/c/r/p、部分声明及 multicolumn | 部分支持 | 内容安全编辑；不完整求值列宽；未知列类型、multirow 等保留 Raw | [tabularx](../apps/web/latex/tabularx.mjs) | [tabularx](../tests/tabularx.test.mjs) |
| `tblr / tabularx` 未知配置与已保存排版信息 | 部分支持 | 能保留且可编辑其他安全内容，不表示应用未知样式；结构修改受保护 | [源码表格](../apps/web/latex/tblr.mjs) | [未知配置](../tests/tblr.test.mjs)、[列声明](../tests/tabularx.test.mjs) |
| 单图 `figure / figure*`、受支持 `includegraphics` | 部分支持 | documentImage；已列宽度和元数据定点回写；实际图片需项目资源 | [图片](../apps/web/latex/images.mjs) | [图片](../tests/figures.test.mjs) |
| 多图、subfigure/minipage 图布局、未适配图片选项 | Raw 保留 | 不扁平化嵌套图片，不丢弃未知选项 | [图片](../apps/web/latex/images.mjs) | [图片负向测试](../tests/figures.test.mjs) |
| `ref / eqref / autoref / pageref / cite / label` | 部分支持 | 静态 key；部分星号、cite 至多两可选参数；命令源码保留；动态 key/未知命令 Raw | [引用](../apps/web/latex/reference-commands.mjs) | [引用](../tests/references.test.mjs) |
| 引用最终页码、自定义计数器、文献最终排版 | 暂不支持 | pageref 保留目标但不提供编译页码；cite 使用 key 与文献库提示；测试验证预览和保留边界 | [引用视图](../apps/web/src/editor/references.js) | [引用边界](../tests/references.test.mjs) |
| `footnote` | 部分支持 | 简单无嵌套花括号的单行文本参数；不是任意脚注内容的结构化编辑 | [Inline](../apps/web/latex/inline.mjs) | [脚注](../tests/latex.test.mjs) |
| `lstlisting` 的无选项或单个 language 选项 | 部分支持 | codeBlock；要求特定环境换行形式，不代表全部 listings 配置 | [Block](../apps/web/latex/blocks.mjs) | [代码块](../tests/latex.test.mjs)、[字面边界](../tests/raw-source.test.mjs) |
| 未适配字面环境及 `\verb` 内容 | Raw 保留 | 扫描时保护内容；没有相应可视节点时保留整个片段 | [扫描器](../apps/web/latex/source-structure.mjs)、[Block](../apps/web/latex/blocks.mjs) | [字面环境](../tests/raw-source.test.mjs) |
| 未知命令、未知环境、宏定义、minipage、dirtree | Raw 保留 | 不展开、纠错或把反斜线当普通文本转义；相关源块精确保留 | [Block](../apps/web/latex/blocks.mjs) | [Raw](../tests/raw-source.test.mjs) |
| 未闭合或错配环境、异常数学定界符 | Raw 保留 | 不猜测结束位置、不补标签；保护受影响源块 | [扫描器](../apps/web/latex/source-structure.mjs) | [异常环境](../tests/raw-source.test.mjs)、[异常数学](../tests/display-math-blocks.test.mjs) |
| TeX 宏展开、catcode、条件执行、动态环境名 | 暂不支持 | 只有词法边界；原文保留不等于执行；测试覆盖宏定义不被误拆的边界 | [扫描器](../apps/web/latex/source-structure.mjs) | [宏保护](../tests/raw-source.test.mjs) |
| 精确 TeX 浮动分页、任意宏包与 PDF 排版等价 | 暂不支持 | 浏览器预览不执行 TeX；节点测试只证明结构、属性及保留，不证明 PDF 视觉效果 | [图片视图](../apps/web/src/editor/image-node.js)、[数学适配](../apps/web/latex/math-environments.mjs) | [图片结构](../tests/figures.test.mjs)、[数学结构](../tests/latex.test.mjs) |
<!-- support-matrix:end -->

## 9. 测试证据与复现

本轮对当前工作区运行原有全部 **56 个 Node 测试文件，769/769 通过，0 失败、0 跳过**。其中包括下列 Parser 专项，也包括项目、UI 数据与 Bib 模块测试；总数不能当作 Parser 专项数量或编译验收数量。

| 重点 | 对应测试 |
| --- | --- |
| 原始字符串、未知语法、异常环境、容器回退 | [raw-source.test.mjs](../tests/raw-source.test.mjs) |
| 标题嵌套、短标题、label 和未知内容 | [heading-nesting.test.mjs](../tests/heading-nesting.test.mjs) |
| 显示公式、相邻文字、定界符异常 | [display-math-blocks.test.mjs](../tests/display-math-blocks.test.mjs) |
| 浮动体与两类源码表格 | [table-floats.test.mjs](../tests/table-floats.test.mjs)、[tblr.test.mjs](../tests/tblr.test.mjs)、[tabularx.test.mjs](../tests/tabularx.test.mjs) |
| 图片参数补丁、引用命令与文本环境保护 | [figures.test.mjs](../tests/figures.test.mjs)、[references.test.mjs](../tests/references.test.mjs)、[text-environments.test.mjs](../tests/text-environments.test.mjs) |
| 回写拒绝、非规范拼写、混合换行及片段 | [source-v2.test.mjs](../tests/source-v2.test.mjs)、[source-v21.test.mjs](../tests/source-v21.test.mjs)、[project-fragments.test.mjs](../tests/project-fragments.test.mjs) |

[parser-docs.test.mjs](../tests/parser-docs.test.mjs) 检查文档入口、仓库内证据链接及矩阵行。单独运行这些检查只能验证结构，功能行为由矩阵所列测试验证。

在仓库根目录复跑：

```powershell
node --test --test-reporter=tap tests/parser-docs.test.mjs
node --test --test-reporter=tap tests/*.test.mjs tests/ui/*.test.mjs tests/bib/*.test.mjs tests/bib/*/*.test.mjs
```

浏览器专项入口为 [run-source-browser.cjs](../tests/run-source-browser.cjs)，例如构建并准备 Playwright Chromium 后运行：

```powershell
npm run build
node tests/run-source-browser.cjs source-raw source-headings source-display-math source-table-floats source-tblr source-tabularx source-figures source-references source-text-environments
node tests/editor.cjs
```

保存事务和独立段落编辑可通过 source-v21 和 source-standalone-paragraph 浏览器专项复验。
