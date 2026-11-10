# 阶段 A 调研报告：Lineae 现有架构

> 调研对象：`https://github.com/AminiamEva/Lineae`，`main` 分支，commit
> `a79a8b9ca0f836eb241a75703ec0d3cac2a8c11e`（2026-11-09T15:34:59Z）。
> 调研方式：下载官方归档，逐文件阅读 50 个文件中的源码、测试、夹具、CI 与文档；
> 未按文件名推测模块职责。

## 1. 结论摘要

1. Lineae 是**纯浏览器端静态应用**：Tiptap/ProseMirror 富文本编辑器 + 自研 LaTeX
   子集导入/导出，esbuild 打包，GitHub Pages 部署。**没有服务端、数据库或本地
   TeX 编译管线**。因此本任务的"Bib 后端"只能实现为不依赖 UI 的数据引擎。
2. 项目**完全没有 BibTeX/BibLaTeX/Biber/文献管理代码**。全仓库检索
   `bib(tex|latex|liography)?|\cite|citation|biber` 零命中。
3. 现有 [references.js](../../apps/web/src/editor/references.js) 仅实现标题
   `\ref`/`\label` 交叉引用与目录，属于**交叉引用**，与文献库无关。
4. 现有 LaTeX 管线有"未修改即原样输出"的保真机制：导入时保存 `importedSource`
   与编辑器快照，未编辑时直接返回原文（[main.js](../../apps/web/src/main.js#L306-L311)）。
   这与本任务的无损要求方向一致，但导出器会主动转义特殊字符，不能复用于 Bib 值。
5. 项目模板（`\documentclass{article}` + `amsmath`）**没有声明任何文献后端**；
   XeLaTeX 本身也不处理 `.bib`。因此不能按任务书要求"根据现有模板确定编译流程"，
   必须同时兼容 BibTeX 与 Biber，把选择权留给主程序。
6. 本机没有 XeLaTeX/BibTeX/Biber/latexmk，也没有 git。编译验证只能提供脚本与夹具，
   并如实标注"未验证"；文件变更用上游 blob SHA-1 清单核验。

## 2. 技术栈与构建

| 项目 | 内容 |
|---|---|
| 运行形态 | 单页静态站点，`apps/web/index.html` 加载 `editor.mjs` 与 MathLive |
| 编辑器 | Tiptap 2.11.5（ProseMirror），StarterKit + 自定义节点 |
| 构建 | esbuild 0.25.0，`apps/web/src/main.js` → `apps/web/editor.mjs` |
| 测试 | 原生 `node:test`（`.mjs`）+ Playwright 1.56.1 浏览器回归 |
| 部署 | GitHub Actions `npm ci` → build → `node --test tests/latex.test.mjs` → 打包 MathLive → Playwright → Pages |
| 依赖 | 无框架、无 TypeScript、无 Lint、无测试框架依赖 |

## 3. 十个问题的回答

### 3.1 整体架构

四层，全部运行在浏览器：

1. **LaTeX 识别层**（`apps/web/latex/`，纯函数、无 DOM）：
   - [document.mjs](../../apps/web/latex/document.mjs#L1-L27)：把 `.tex` 分成
     `start`（`\begin{document}` 前）、`blocks`（正文分块）、`end`；跟踪环境配对。
   - [blocks.mjs](../../apps/web/latex/blocks.mjs#L140-L220)：识别标题、列表、表格、
     公式、引用块；无法识别时保留为 `raw` 节点（[L178](../../apps/web/latex/blocks.mjs#L178)）。
   - [inline.mjs](../../apps/web/latex/inline.mjs#L19-L99)：行内命令、数学、转义、嵌套花括号。
   - [tables.mjs](../../apps/web/latex/tables.mjs#L51-L105)、
     [packages.mjs](../../apps/web/latex/packages.mjs#L27-L48)、
     [math-symbols.mjs](../../apps/web/latex/math-symbols.mjs)。
2. **编辑器模型层**：Tiptap 扩展与自定义节点。数学节点
   [math-node.js](../../apps/web/src/editor/math-node.js#L52-L202)；引用节点
   [references.js](../../apps/web/src/editor/references.js#L25-L141)；表格/列表行为
   [paper-behavior.js](../../apps/web/src/editor/paper-behavior.js#L21-L142)。
3. **序列化层**：[latex-codec.js](../../apps/web/src/editor/latex-codec.js#L12-L91)
   把 ProseMirror JSON 转为 LaTeX；[packages.mjs](../../apps/web/latex/packages.mjs#L37-L48)
   按正文特征补齐宏包。
4. **外壳层**：[main.js](../../apps/web/src/main.js) 负责编辑器装配、工具栏、
   文件打开/保存、源码模式、命令补全、缩放与配置持久化。

没有服务端、API 层、插件注册表或依赖注入容器。

### 3.2 主程序如何初始化编辑器

[main.js](../../apps/web/src/main.js#L112-L118) 顶层直接执行：
取 `#editor` 容器 → `new Editor({ element, extensions, content:'<p></p>' })`。
扩展包括 StarterKit（标题 1–3 级）、`PaperBehavior`、`TextStyle`、`Underline`、
`Raw`、`DescriptionList`/`DescriptionItem`、表格四件套、`MathNode`/`MathBlock`、
`Ref`/`Label`/`TableOfContents`、快捷键扩展。配置来自
[config.yaml](../../apps/web/config.yaml) + `localStorage`（[L54-L63](../../apps/web/src/main.js#L54-L63)）。
初始文档骨架是固定的空 `.tex`（[L250](../../apps/web/src/main.js#L250)）。

### 3.3 文档数据结构

双结构：

- **编辑态**：ProseMirror JSON，节点类型见上；数学节点保存 `latex` 字符串，
  引用节点保存 `key`。
- **源文档态**：`documentParts = { start, end, blocks, eol }`
  （[document.mjs](../../apps/web/latex/document.mjs#L4-L26)）。
- **保真态**：`importedSource`（原始全文）+ `importedSnapshot`
  （导入时的编辑器 JSON 字符串）（[L253-L255](../../apps/web/src/main.js#L253-L255)、
  [L320](../../apps/web/src/main.js#L320)）。两者相等即"未修改"，直接输出原文。
- 标题/作者从前言区的 `\title{}`/`\author{}` 文本读写
  （[L256-L305](../../apps/web/src/main.js#L256-L305)），不进入编辑器树。

### 3.4 LaTeX 源码如何进入编辑器

三条入口，最终都汇入 `load()`（[L312-L321](../../apps/web/src/main.js#L312-L321)）：

1. `<input type="file">`：`TextDecoder('utf-8', {fatal:true, ignoreBOM:true})`
   严格解码 → `load()`（[L386-L390](../../apps/web/src/main.js#L386-L390)）。
2. File System Access API：打开文件并保留句柄（[L357-L369](../../apps/web/src/main.js#L357-L369)）。
3. 源码模式 textarea：切回可视化时 `load(sourceView.value)`（[L322-L329](../../apps/web/src/main.js#L322-L329)）。

`load()` 要求文档包含 `\begin{document}`/`\end{document}`，否则报"无法识别文档"；
随后 `parsed.blocks.flatMap(importBlocks)` → `editor.commands.setContent(...)`。
不支持的块成为 `raw` 节点，仍可在源码模式编辑。

### 3.5 编辑器数据如何转换为 LaTeX

`source()`（[L306-L311](../../apps/web/src/main.js#L306-L311)）：

```text
current JSON == importedSnapshot ? importedSource（逐字节原样）
                                 : exportDocument(documentParts, serialize(doc))
```

`serialize()` 递归输出节点（[latex-codec.js](../../apps/web/src/editor/latex-codec.js#L12-L91)），
`exportDocument()` 依据正文特征注入缺失宏包
（[packages.mjs](../../apps/web/latex/packages.mjs#L37-L48)），保持原 EOL。
保存走 File System Access 或 Blob 下载（[L331-L356](../../apps/web/src/main.js#L331-L356)）。

### 3.6 是否存在 BibTeX/BibLaTeX/引用管理

不存在。证据：

- 全仓库检索 `bib(tex|latex|liography)?|\cite|citation|biber`：0 处匹配。
- [references.js](../../apps/web/src/editor/references.js) 只有 `\ref` 原子、
  `\label` 原子与目录节点；编号由 `outline()` 实时计算（[L3-L19](../../apps/web/src/editor/references.js#L3-L19)）。
- 命令菜单、插入工具、宏包规则、测试夹具中均无文献项。
- `\cite` 不被行内解析器识别；遇到会回退为 `raw` 块或纯文本。

### 3.7 当前如何处理引用、交叉引用和文献数据

- 交叉引用：`\ref`/`\label` 原子节点；标题上的 `label` 在序列化时放在标题命令之后
  （[latex-codec.js](../../apps/web/src/editor/latex-codec.js#L34-L39)）；编号由文档顺序推导。
- 目录：`\tableofcontents` 对应只读视图节点。
- 文献数据：无 `.bib` 输入、无 `\bibliography`/`\addbibresource`、无 `.bbl` 处理、
  无文献条目模型。

### 3.8 新 Bib 模块的位置

新增 `apps/web/bib/`，唯一公共入口 `apps/web/bib/index.mjs`：

- 与 `apps/web/latex/` 平级，符合"文档处理模块放在 `apps/web/` 下、纯 `.mjs`"的惯例；
- 可被主程序以 `import ... from '../bib/index.mjs'` 使用，也可被 esbuild 打包；
- 同时是合法 Node ESM 路径，测试无需构建；
- 不放进 `src/editor/`（Tiptap/DOM 层），也不放进 `latex/`（职责不同）。

测试放 `tests/bib/`，文档放 `docs/bib-engine/`。

### 3.9 如何避免依赖冲突

1. **零导入**：`apps/web/bib/**` 不 import 任何现有文件；现有文件也不 import 它。
2. **零依赖**：只用 ECMAScript 标准库；不 import `node:*`，不碰 DOM/`window`/
   `localStorage`/`fetch`。
3. **无副作用**：模块顶层只定义函数/常量。
4. **无构建耦合**：不改 `package.json`、脚本、CI。
5. **命名隔离**：导出统一 `bib*`/`Bib*` 前缀；入口唯一。

### 3.10 如何保证不影响其他开发者

- 只新增文件；现有 50 个文件保持逐字节不变（blob 核验）。
- 不修改 `main.js`、`references.js`、`latex-codec.js`、`latex/*`、`package.json`、
  `package-lock.json`、CI、README、现有测试。
- 新测试不与现有测试共享夹具，不改变 `node --test tests/*.test.mjs` 的语义。
- 主程序若暂不接入，新模块不参与构建产物，部署体积与行为不变。
- 需要主程序配合的点只写在 `INTEGRATION.md`，等待负责人批准。

## 4. 与任务书假设的差异（必须先报告）

| 编号 | 发现 | 处理方式（不改需求） |
|---|---|---|
| D1 | 项目没有服务端；"Bib 后端"只能是浏览器/Node 通用数据层。 | 交付框架无关、零依赖 ESM；文档明确运行环境。 |
| D2 | 模板未声明任何文献后端（无 `natbib`/`biblatex`/`\bibliography`），XeLaTeX 自身不处理 `.bib`。 | **不假设**：核心同时兼容 BibTeX 与 Biber；校验器提供 `generic`/`bibtex`/`biblatex` 三种 profile；集成文档列出两种接入方案。 |
| D3 | 本机无 TeX 发行版、无 BibTeX/Biber，CI 也不编译 TeX。 | 提供 `.tex`+`.bib` 夹具、可执行验证脚本；测试报告明确写"**未执行编译验证**"。 |
| D4 | 无 git，无法执行 `git status`。 | 用上游 commit 的 blob SHA-1 清单做基线，交付核验脚本。 |
| D5 | 现有导出器 `escape()` 会改写特殊字符与 Unicode；Bib 值若复用会被二次转义。 | Bib 模块完全独立序列化；值按 LaTeX 原文保存，只校验括号/控制字符。 |
| D6 | `packages.mjs` 只认识编辑器自身产生的宏包特征，不会为 `biblatex`/`natbib` 注入依赖。 | 文献模块不依赖它；集成指南给出独立的序言注入建议。 |
| D7 | BibTeX 与 Biber 对重复 key、重复字段、未定义宏的严格程度不同。 | 引擎从不覆盖重复条目：全部保留 + 诊断；Editor 拒绝新增重复 key；profile 决定严重程度。 |

没有需要中止开发的冲突；D1、D2 需要在集成阶段由主程序负责人确认。

## 5. 对实现的约束

1. 原生 ESM `.mjs` + JSDoc，零依赖，浏览器/Node 双端可用。
2. 模块位置 `apps/web/bib/`；唯一公共入口 `index.mjs`。
3. 数据模型纯 JSON 可序列化；源文本 + 偏移量作为无损基础。
4. 词法/语法分离；错误恢复；绝不静默丢弃无法识别的内容。
5. 未修改内容逐字节原样输出；修改只重写受影响条目/字段。
6. Editor 变更事务式；重复 key 拒绝覆盖；未知字段保留；重命名同步库内引用。
7. 测试独立于 UI；覆盖正常/异常/边界；真实样例；`parse → serialize → parse` 稳定。
8. 文档：架构、API、数据模型、测试报告、集成指南、文件变更报告。
