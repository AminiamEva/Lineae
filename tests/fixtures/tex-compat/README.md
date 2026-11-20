# TeX compatibility corpus / TeX 兼容性样例库

40 份独立 UTF-8 文档，供未来解析、源码往返和排版验收。当前未执行 TeX 编译或渲染验证；样例不代表应用已有功能。
40 standalone UTF-8 documents for future parsing, source round-trip and layout acceptance. No TeX compilation or rendering validation has been performed; these are not claims of current application support.

## Manifest / 清单

- version: schema version / 接口版本，当前 1。
- fixtures: ordered examples / 按组排序的样例。
- id, file, category: unique ID, relative source path, group / 唯一标识、相对路径、分组。
- engine, passes: intended engine and compilation passes / 预期引擎及编译次数。
- packages: explicitly loaded packages only, not classes or transitive dependencies / 仅显式加载包，不含类和传递依赖。
- labels: short zh/en titles / 中英文短标题。
- expected: aligned zh/en lists of manual acceptance criteria / 对应的中英文人工验收条件。
- preserve: exact source fragments that must survive / 必须逐字保留的源码片段。

目录、引用和短标题目录例需两次编译以读取辅助文件；text-unicode 使用 XeLaTeX、ctexart 和发行版内 Fandol 字体，需环境已安装相应资源，不联网取字体。其余样例指定 pdfLaTeX。没有外部图片、输入文件或 shell-escape。
Contents, references and the short-title contents example need two passes to read auxiliary files. text-unicode uses XeLaTeX, ctexart and distribution-provided Fandol fonts, which must already be installed. Other examples specify pdfLaTeX. No external images, input files or shell-escape are needed.

未知语法也必须保留源码，不得为适配当前解析器删减或降低预期。
Unknown syntax must retain its source; do not weaken expectations to match current parser limitations.

## Inventory / 样例

- text-paragraphs: 段落与换行 / Paragraphs and line breaks
- text-escaped: 转义字符 / Escaped characters
- text-emphasis: 嵌套强调 / Nested emphasis
- text-comments: 注释 / Comments
- text-unicode: 中英文 / Chinese and English
- headings-levels: 标题层级 / Heading levels
- headings-starred: 无编号标题 / Starred headings
- headings-short-title: 短标题 / Short title
- headings-label-ref: 交叉引用 / Cross reference
- headings-toc: 目录 / Contents
- lists-itemize: 无序列表 / Bulleted list
- lists-enumerate: 有序列表 / Numbered list
- lists-nested: 嵌套列表 / Nested lists
- lists-description: 描述列表 / Description list
- lists-paragraphs: 列表项内段落 / Paragraphs in an item
- tables-basic: 基础表格 / Basic table
- tables-alignment: 列对齐 / Column alignment
- tables-multicolumn: 跨列 / Spanning columns
- tables-booktabs: 三线表 / Booktabs
- tables-paragraph-cell: 段落单元格 / Paragraph cell
- math-inline-display: 行内行间 / Inline and display
- math-displaystyle: 显示样式 / Display style
- math-scripts: 上下标 / Scripts
- math-relations: 集合关系 / Set relations
- math-operators: 算子界限 / Operator limits
- matrices-single: 单格矩阵 / Single matrix
- matrices-rectangular: 矩形矩阵 / Rectangular matrix
- matrices-empty-cells: 空格矩阵 / Empty cells
- matrices-delimiters: 矩阵括号 / Matrix delimiters
- matrices-nested: 嵌套矩阵 / Nested matrix
- environments-align: 编号对齐 / Numbered alignment
- environments-align-star: 无编号对齐 / Unnumbered alignment
- environments-cases: 分段函数 / Cases
- environments-theorem: 定理 / Theorem
- environments-proof: 证明 / Proof
- macros-newcommand: 单参数宏 / One-argument macro
- macros-optional: 可选参数 / Optional argument
- macros-renewcommand: 重定义 / Redefinition
- macros-local-scope: 局部作用域 / Local scope
- macros-preservation: 源码保真 / Source preservation

## Validation / 验证

Run: `node --test tests/tex-compat-fixtures.test.mjs`.
This verifies corpus integrity only, not compilation or rendering. 仅验证样例库数据完整性，不验证编译或渲染。

## Consulted references / 实际查阅资料

- https://ctan.org/pkg/amsmath
- https://ctan.org/pkg/amsthm
- https://ctan.org/pkg/booktabs
- https://ctan.org/pkg/ctex
- https://ctan.org/pkg/amsfonts
- https://tug.ctan.org/fonts/amsfonts/doc/amssymb.pdf
