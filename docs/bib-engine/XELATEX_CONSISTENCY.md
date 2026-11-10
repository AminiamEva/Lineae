# XeLaTeX 渲染一致性说明

> **权威标准**：XeLaTeX 的实际编译结果是最终排版结果的唯一权威。
> 本引擎不渲染、不排版；它保证的是交给 TeX 工具链的 `.bib` 数据在语法与语义上
> 不被破坏。**本环境未安装 TeX，L3/L4 编译验证未执行**（见第 6 节）。

## 1. 权威边界

```text
.bib 数据 ──BibTeX 或 Biber──> .bbl ──XeLaTeX──> PDF
     ▲             ▲                ▲              ▲
     │             │                │              │
  本引擎负责     由主程序选择      由工具链生成   最终权威
```

- XeLaTeX 只负责排版，不读取 `.bib`。
- `.bib` 由 BibTeX（`xelatex → bibtex → xelatex ×2`）或 Biber
  （`xelatex → biber → xelatex ×2`）处理。
- 引擎**不能**保证 PDF 排版效果、样式文件映射、排序规则；这些由 `.bst`/`.bbx`/
  `.cbx` 与后端决定。

## 2. 项目实际采用的文献体系

调研结论（见 [PHASE_A_RESEARCH.md](PHASE_A_RESEARCH.md)）：

- 项目模板是 `\documentclass{article}` + `amsmath`，**没有声明任何文献后端**；
- 没有 `\bibliography`、`\addbibresource`、`natbib`、`biblatex`，也没有 `.bib`
  输入；
- README 明确本地 TeX 编译与 PDF 生成尚未集成。

因此**不能假设** BibTeX 或 Biber。引擎同时兼容两者：

| profile | 用途 | 重复 key | 未知类型 | 必需字段 |
|---|---|---|---|---|
| `generic` | 默认，仅语法与完整性 | warning | 不报 | warning |
| `bibtex` | 经典 BibTeX / BibTeX8 | warning | warning | warning |
| `biblatex` | BibLaTeX + Biber（`biber` 为别名） | **error** | warning | warning |
| `strict: true` | 任一 profile 上加强 | — | — | error |

选择建议：主程序根据模板中的 `\usepackage{biblatex}` / `\bibliography` /
`\addbibresource` 自动检测，或让用户显式选择。集成方式见
[INTEGRATION.md](INTEGRATION.md#7-选择文献后端bibtex-还是-biber)。

## 3. 引擎保证什么

1. **被重写条目的语法有效**：新建/修改的条目与字段可被本引擎重新解析；序列化
   `dirty` 文档默认回读校验（`verify: 'auto'`）。**原始文件中已经损坏的条目/结构
   不会被修复**，它们逐字节保留并由 `preflightBib`/诊断报告暴露；含 error 诊断的
   文档不保证可编译。
2. **语义不变**：`semanticSnapshot(parse(s))` 与 `semanticSnapshot(parse(serialize(parse(s))))`
   相等；夹具覆盖宏、拼接、嵌套括号、Unicode、转义。
3. **字节保真**：未修改文档 `serializeBib(doc) === source`，含 CRLF、BOM、注释、
   空行、未知命令与损坏条目。
4. **最小改动**：修改一个字段只重写该字段；其他字段保持原始切片（含 `=` 对齐空白）。
5. **特殊字符不二次转义**：`\&`、`\%`、`\_`、`{\"o}`、`{\TeX}`、Unicode 原样保留。
6. **key 与引用关系**：重命名同步 `.bib` 内 `crossref`/`xdata`/`entryset`/`related`；
   `.tex` 引用的影响以报告形式返回，不擅自改写。
7. **未知内容保留**：未知类型、未知字段、自定义命令、`@comment`、`@preamble`、
   无法解析的条目都逐字节保留，并给出诊断。保留不等于可编译：未知命令/损坏结构
   需要调用方在编译前用 `preflightBib` 拦截。

## 4. 引擎不保证什么

- 具体 `.bst`/`.bbx` 样式是否接受某个字段或类型（`@online` 在经典 BibTeX 样式下
  可能被忽略）。
- BibTeX 的 8 位编码限制：经典 BibTeX 对 UTF-8 的支持取决于实现（BibTeX8 或
  发行版配置）；Biber 原生支持 UTF-8。引擎不做转码，输入是 UTF-8 就输出 UTF-8。
- 缺失字段在特定样式下的排版结果（引擎只按 profile 给出 warning）。
- 用户字段值中的 LaTeX 语法是否最终可编译：引擎只校验括号/控制字符，**不做
  LaTeX 语法或宏展开验证**。
- 重复 key 在具体后端下的最终行为：引擎保留全部条目并报告，BibTeX 取第一个、
  Biber 通常拒绝；这与真实工具行为一致，但需要用户修复。
- 多文件项目、`\input`、`\include` 的引用：`.tex` 扫描只处理传入的单个文本。

## 5. 转义责任

`.bib` 字段内容是 LaTeX 源码。引擎**不会**把 `&` 改成 `\&`，因为：

- URL 字段的 `&` 可能不应转义（取决于 `url`/`hyperref` 处理）；
- 数学模式、宏、重音命令的转义规则不同；
- 自动改写会违反"不擅自替换用户 LaTeX 命令"。

主程序在接收用户输入时，应根据字段类型决定是否提供转义辅助；引擎只拒绝
不平衡花括号与控制字符（`BIB301`/`BIB405`）。

## 6. 验证矩阵与当前状态

| 层级 | 内容 | 方法 | 当前状态 |
|---|---|---|---|
| L1 语法 | lexer/parser/serializer/validator/editor 单元测试、错误恢复 | `node --test` | **通过**（182 项） |
| L2 语义 | `parse→serialize→parse` 语义快照相等；未修改字节相等；最小 diff | 单元测试 + 300 条合成库 | **通过** |
| L3 后端兼容 | 同一 `.bib` 经 BibTeX 与 Biber 生成 `.bbl`，比较原文/往返 | `tests/bib/verify-xelatex.mjs` + `run-editor-compile.mjs` | **通过**：2/2 往返；19/19 编辑组合 |
| L4 排版一致 | 页数/文本/字体/行距/缩进/页面图像比较 | `run-editor-compile.mjs` + Poppler | **通过**：往返 0 像素差异；编辑差异 0.019%–1.579% |

验证环境（临时目录中的便携工具链，不写入仓库）：

```text
XeTeX 3.141592653-2.6-0.999998 (TeX Live 2026)
BibTeX 0.99e (TeX Live 2026)
biber 2.22
pdfinfo/pdftotext/pdffonts/pdftoppm 26.09.0
```

实际结果：

```text
node tests/bib/verify-xelatex.mjs
PASS: .bbl and PDF text are identical.   (BibTeX)
PASS: .bbl and PDF text are identical.   (Biber)
exit 0

node tests/bib/compile/run-editor-compile.mjs ...
L3 PASS, L4 PASS, 19/19 edits, 2/2 round-trips
```

## 7. 执行方式

```bash
# 需要：xelatex、bibtex、biber；可选 pdftotext
node tests/bib/verify-xelatex.mjs

# 完整 L4（页数/文本/字体/行距/缩进/图像）
node tests/bib/compile/run-editor-compile.mjs \
  --tex-bin=<xelatex/bibtex/biber dir> \
  --poppler-bin=<poppler dir> \
  --out=compile-report.json
```

脚本会：

1. 对 `tests/bib/xelatex/bibtex/refs.bib` 与 `biblatex/refs.bib` 做
   `parse → serialize`，确认字节不变；
2. 在临时目录分别用**原始**与**往返后**的 `.bib` 编译两个项目；
3. 比较 `main.bbl`（归一化行尾/尾随空白后逐字符相等）；
4. 若存在 `pdftotext`，再比较两个 PDF 的文本；
5. 全部通过退出 0，任一不一致退出 1，缺工具退出 2。

夹具：

- `tests/bib/xelatex/bibtex/main.tex`：`\bibliographystyle{plain}` +
  `\bibliography{refs}`，引用 3 条经典条目；
- `tests/bib/xelatex/biblatex/main.tex`：`biblatex` + `backend=biber` +
  `\addbibresource{refs.bib}` + `\printbibliography`，引用 `@online`/`@dataset`/
  `@software`。

两者都包含 `\&`、`\%`、`\em`、嵌套花括号、`@string`、`#` 拼接、`jan` 月宏。

## 8. 任务书验收标准对照

| 验收项（任务书 §3.3） | 对应实现/测试 | 状态 |
|---|---|---|
| 1. 原始 `.bib` 导入再导出，语义一致 | `roundtrip.test.mjs`：全部夹具语义快照相等；未修改字节相等 | 通过 |
| 2. 修改一个字段，其他字段不变 | `serializer.test.mjs`：行级 diff 只变一行；未知字段保留 | 通过 |
| 3. 修改 key 后引用关系不丢失 | `editor.test.mjs`：crossref/xdata/entryset/related 同步；`.tex` 影响报告 | 通过（`.bib` 内）；`.tex` 需主程序应用重命名计划 |
| 4. 未知字段不被静默删除 | parser/serializer/editor 测试 | 通过 |
| 5. 特殊字符、嵌套大括号、字符串宏 | lexer/parser/serializer 测试；`classic.bib` | 通过 |
| 6. 生成数据能被项目对应的编译流程处理 | 两套夹具 + `verify-xelatex.mjs` | **通过**（L3：2/2 往返；19/19 编辑组合） |
| 7. 代表性文档修改前后编译结果无差异 | `verify-xelatex.mjs` 的 `.bbl`/PDF 文本；`run-editor-compile` 的页数/字体/布局/图像 | **通过**（往返 0 像素差异；编辑差异符合独立预期） |

## 9. 已知后端差异

| 主题 | BibTeX | Biber/BibLaTeX | 引擎处理 |
|---|---|---|---|
| UTF-8 | 取决于实现（BibTeX8/发行版） | 原生支持 | 不转码，UTF-8 进 UTF-8 出 |
| 重复 key | 警告，保留第一个 | 通常报错 | 保留全部 + profile 分级诊断 |
| 未定义宏 | 报错 | 报错 | error 诊断 |
| `month = jan` | 样式定义月份名 | 接受三字母月份 | 内建解析为月份名，原文保留 |
| crossref 继承 | 支持（booktitle ← parent title 等） | `xdata` 继承 | 校验必需字段时模拟继承；序列化不改字段 |
| 字段大小写 | 不敏感 | 不敏感 | 查询不敏感，原样保留 |
| key 大小写 | 敏感 | 敏感 | 敏感 |

## 10. 建议

1. 主程序在接入时**明确选择**后端，并在 UI 中显示当前 profile。
2. 对用户输入的字段值提供字段类型感知的转义助手，而不是依赖引擎自动转义。
3. 导出后若用户要求"编译验证"，调用 `verify-xelatex.mjs` 的同类流程；引擎本身
   不执行编译。
4. 在 CI 中若安装 TeX，可把 `node tests/bib/verify-xelatex.mjs` 作为独立步骤，
   失败退出码 1；缺工具退出码 2 应被视为"未验证"而非失败。
