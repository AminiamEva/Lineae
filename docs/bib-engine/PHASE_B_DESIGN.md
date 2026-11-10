# 阶段 B 技术设计：Lineae Bib 后端引擎

> 本文件是阶段 B 的设计基线。实现完成后的实际偏差记录在 `FILE_CHANGES.md` 与 `TEST_REPORT.md`。
> 调研基线：Lineae `main` @ `a79a8b9ca0f836eb241a75703ec0d3cac2a8c11e`（50 个文件，逐字节与上游一致）。

## 1. 阶段目标与约束

| 约束 | 设计响应 |
|---|---|
| XeLaTeX 实际编译结果为权威 | 引擎不排版、不渲染；只保证 `.bib` 语法与语义在 BibTeX / Biber 两条流程下不变。无法在本机执行的编译验证必须标注"未验证"并提供脚本。 |
| 数据完整性优先 | 未修改内容逐字节原样输出；修改只重写受影响字段；未知类型/字段/注释/空白全部保留。 |
| 模块独立性优先 | 新增目录 `apps/web/bib/`，零依赖、零既有模块导入、无 DOM/Node API、无副作用。 |
| 稳定 API 优先 | 唯一公共入口 `index.mjs`；数据模型纯 JSON；内部文件不承诺稳定。 |
| 不得修改现有文件 | 仅新增 `apps/web/bib/**`、`tests/bib/**`、`docs/bib-engine/**`；主程序接入只写建议。 |

**非目标（明确不做）**：前端 UI、文献面板、PDF 渲染、`.bbl` 生成、完整 LaTeX 宏展开、`.tex` 引用的自动改写（只提供扫描与重命名计划）、undo/redo 栈。

## 2. 模块结构与依赖

```text
apps/web/bib/
  index.mjs           公共 API 唯一入口（re-export + JSDoc）
  diagnostics.mjs     诊断码、严重程度、BibError/BibParseError/BibEditorError、源码定位
  lexer.mjs           词法分析：token 流 + 词法诊断（不构造语法树）
  parser.mjs          语法分析：BibDocument 构造、错误恢复、格式模板提取
  model.mjs           数据模型工具：冻结、字段查询、宏解析、语义快照、键引用
  serializer.mjs      无损序列化 + 最小重写
  validator.mjs       语义校验（generic / bibtex / biblatex 三种 profile）
  editor.mjs          Editor Engine：事务式增删改查、搜索、批量操作、事件
  tex-citations.mjs   .tex 引用扫描、重命名计划、一致性检查（可选集成辅助）
```

依赖方向（严格单向，无环）：

```text
index ──> parser ──> lexer ──> diagnostics
  │          │          │
  │          └──> model ─┘
  ├──> serializer ──> diagnostics / model
  ├──> validator ───> diagnostics / model
  ├──> editor ──────> parser / model / serializer / validator
  └──> tex-citations（独立，仅依赖 diagnostics）
```

`model.mjs` 不导入 `parser.mjs`；`serializer.mjs` 不导入 `parser.mjs`（验证输出时通过动态传入的 reparse 函数或由 `index` 组合，避免环）。

## 3. 数据模型

### 3.1 顶层 `BibDocument`（纯 JSON 可序列化，解析后深度冻结）

```json
{
  "format": "bibtex",
  "modelVersion": 1,
  "source": {
    "text": "...",
    "eol": "\n",
    "hadBom": false,
    "bom": "",
    "filename": null
  },
  "blocks": [
    { "kind": "text", "start": 0, "end": 12 },
    { "kind": "entry", "entryId": "e1", "start": 12, "end": 240 },
    { "kind": "comment", "start": 240, "end": 270 }
  ],
  "entries": [ /* BibEntry */ ],
  "strings": [ /* StringDefinition */ ],
  "preambles": [ /* Preamble */ ],
  "diagnostics": [ /* Diagnostic */ ],
  "stats": {
    "entryCount": 1,
    "stringCount": 0,
    "preambleCount": 0,
    "errorCount": 0,
    "warningCount": 0,
    "infoCount": 0
  },
  "dirty": false,
  "revision": 0
}
```

**块分区不变量**：对解析产生的文档，`blocks` 按源码顺序无缝覆盖 `source.text`，即
`blocks.map(blockText).join('') === source.text`。`blockText` 对未修改块取源码切片。
`source.text` 始终是**解析时的原始输入**；编辑后的导出以 `serializeBib()` 为准。

### 3.2 `BibEntry`

```json
{
  "id": "e1",
  "type": "article",
  "typeRaw": "Article",
  "key": "knuth1984",
  "keyRaw": "knuth1984",
  "fields": [ /* Field，保持源码顺序 */ ],
  "raw": "@Article{knuth1984, ... }",
  "start": 12,
  "end": 240,
  "dirty": false,
  "format": {
    "delimiter": "{",
    "multiline": true,
    "indent": "  ",
    "equals": " = ",
    "trailingComma": true,
    "closeIndent": ""
  }
}
```

- `type`/`key` 是**语义值**；`typeRaw`/`keyRaw` 是**原始写法**，未修改时序列化保持原样。
- `start`/`end` 是原始源码偏移，仅作溯源；编辑后不再指向当前输出。
- `format` 由原始文本推断，用于重写时保持缩进、等号空白、条目定界符等风格。

### 3.3 `Field` 与 `Value`

```json
{
  "name": "author",
  "nameRaw": "Author",
  "value": {
    "kind": "braced",
    "parts": [
      { "kind": "braced", "raw": "{Knuth, Donald E.}", "value": "Knuth, Donald E." }
    ],
    "raw": "{Knuth, Donald E.}",
    "start": 30,
    "end": 52
  },
  "raw": "Author = {Knuth, Donald E.}",
  "start": 22,
  "end": 52,
  "dirty": false,
  "duplicate": false,
  "unparsed": false
}
```

`Value.kind`：

| kind | 含义 | 示例 |
|---|---|---|
| `braced` | 单个 `{...}` | `{Knuth}` |
| `quoted` | 单个 `"..."` | `"Knuth"` |
| `number` | 裸数字 | `2024` |
| `macro` | 裸宏引用（含 `jan` 等内建月宏） | `jan` |
| `concat` | 多个部分用 `#` 连接 | `"Jan " # jan` |
| `invalid` | 无法解析，保留原文（`field.unparsed`） | — |

**值内容一律按 LaTeX 原文保存**：不做转义、不做 Unicode 归一化、不做大小写转换。花括号按 BibTeX 规则计数（反斜杠不转义花括号），未配对的输入是语法错误。

### 3.4 `StringDefinition` / `Preamble`

```json
{ "id": "s1", "name": "acm", "nameRaw": "acm",
  "value": { "...": "Value" }, "raw": "@string{acm = \"ACM\"}", "start": 0, "end": 22 }
```

`@preamble` 同构，`parts` 为连接值。二者在 v1 中只读；编辑接口不修改它们，但完整保留并参与宏解析。

### 3.5 `Diagnostic`

```json
{
  "code": "BIB102",
  "severity": "error",
  "message": "Unterminated braced value.",
  "source": "lexer",
  "entryKey": "knuth1984",
  "fieldName": null,
  "location": {
    "start": { "offset": 31, "line": 2, "column": 14 },
    "end": { "offset": 66, "line": 2, "column": 49 }
  },
  "hint": "Add the missing '}'."
}
```

严重程度：`error`（数据不可靠/无法序列化）、`warning`（可疑但可继续）、`info`（可忽略的兼容性提示）。解析器从不因单条错误丢弃整个数据库；无法解析的命令整段保留为 `broken` 块并给出诊断。

### 3.6 编辑操作结果

所有写操作返回结果对象而非抛出（除编程错误/生命周期错误）：

```json
{ "ok": false,
  "error": { "code": "BIB401", "message": "Duplicate entry key: knuth1984", "details": { "key": "knuth1984" } },
  "diagnostics": [] }
```

## 4. 词法与语法

### 4.1 Token

| type | 说明 |
|---|---|
| `text` | 条目之外的普通文本（注释、空行、邮件地址等），原样保留 |
| `command` | `@` + 类型 + 开定界符，携带 `name`/`typeRaw`/`delimiter` |
| `comment` | 整个 `@comment{...}` / `@comment(...)` |
| `word` | 类型名、key、字段名、裸值、宏名、数字 |
| `braced` | 平衡花括号值，`value` 为内部原文 |
| `quoted` | 平衡引号值，内部 `{...}` 保护 `"` |
| `equals` / `hash` / `comma` | `=` `#` `,` |
| `close` | 与 `command.delimiter` 配对的闭定界符 |
| `eof` | 文件结束 |

词法规则与 BibTeX 对齐：

- `@command` 仅在 `@ + 标识符 + 定界符` 的形状下识别；否则 `@` 属于普通文本（保护注释中的邮箱）。
- 值内的花括号必须平衡，**反斜杠不是转义符**（`\{` 仍计入括号）；引号值中 `"` 在括号深度 0 才终止。
- 条目内 `%` 不是合法注释；遇到时给出警告并跳到行尾（宽容恢复，绝不静默改写）。
- `@string`/`@preamble` 支持 `{}` 与 `()` 两种定界符；条目 key 允许 `: - . _ / +` 等常见字符。

### 4.2 语法分析与恢复

- 顶层：`text` / `@comment` / `@string` / `@preamble` / 文献条目；其他命令（含 `@set`、`@xdata`、自定义类型）一律按条目解析。
- 字段解析：`name = value (# value)*`；缺 `=`、缺值、缺逗号、重复字段都记录诊断并继续。
- 恢复策略：字段级同步到下一个逗号/闭定界符；条目级在 EOF/闭定界符处收束；完全无法识别的命令生成 `broken` 块，原文一字不丢。
- 重复 key：**全部保留**；`document.entries` 按源码顺序包含所有条目，后续重复项带诊断；`getEntry` 返回首个（BibTeX 语义）；Editor 拒绝新增重复 key。
- 重复字段：保留全部，后者标记 `duplicate: true`；字段查询返回首个（BibTeX 语义）。

### 4.3 宏解析

- 内建月宏 `jan..dec`（BibTeX 标准样式提供的默认值）作为兜底；`@string` 按源码顺序生效（条目只看到它之前定义），后定义覆盖先定义。
- 支持递归展开（`@string` 引用其他宏），深度上限 32；循环与未定义宏返回 `unresolved` 并生成诊断，不阻塞解析。
- 解析结果只用于读取/校验；**不写回**，原始 `#` 连接与宏引用完整保留。

## 5. 序列化

### 5.1 三条不变量

1. **未修改文档**：`serializeBib(parseBib(s)) === s`（含 CRLF、BOM、注释、末尾空行），除非显式传入 `eol`/`finalNewline`/`bom` 选项。
2. **最小重写**：只有 `dirty` 的条目被重新生成；未修改的字段优先输出原始切片，只有被 `updateEntry` 修改的字段才重新格式化。
3. **可重解析**：输出必须能被本引擎重新解析；`dirty` 文档默认执行回读校验（`verify: 'auto'`），失败抛 `BibError('BIB131')`。

### 5.2 重写模板

- 条目定界符（`{}`/`()`）、类型写法、key 写法、缩进、`=` 两侧空白、尾逗号、闭定界符缩进均从原条目推断。
- 新增字段按插入顺序追加；删除字段直接省略；其余字段的原始切片不动。
- 新值默认 `{...}`；若原字段使用引号且新值不含深度 0 的 `"`，保持引号；原字段为裸数字且新值仍为数字时保持裸数字。
- **不做任何自动转义**：值按调用方提供的 LaTeX 原文写入；只校验括号平衡与控制字符。提供文档说明调用方需自行处理 `\&`、`\%` 等。

### 5.3 输出选项

`eol: 'preserve' | 'lf' | 'crlf'`、`bom: 'preserve' | 'never'`、`finalNewline: 'preserve' | 'ensure' | 'none'`、`preserveFormatting: true | false`、`verify: 'auto' | true | false`。

## 6. Editor Engine

### 6.1 事务模型

纯函数 `plan*`（add/update/remove/rename）在文档副本上完成全部校验与修改，成功后才 `commit`：

```text
操作 → plan(document, args) → { ok, document, entry, actions } | { ok:false, error }
     → commit(document) → 冻结快照、重建 key 索引、revision+1、通知订阅者
```

任何一步失败都不提交，因此不存在"改了一半"的状态。批量导入/批量修改在同一事务内顺序 plan，全部成功才 commit。

### 6.2 语义

- `addEntry`：校验 key/type/字段名/值括号；重复 key 拒绝；追加到文档末尾（不重排既有内容）。
- `updateEntry`：`fields` 中 `null` 表示删除字段，`undefined` 忽略；未提及字段（含未知字段）保持不变；`replaceFields` 可显式整体替换。
- `removeEntry`：返回被删条目与"库内悬空引用"（crossref/xdata/entryset/related）；不自动级联删除。
- `renameEntry`：校验新 key；同步改写库内引用字段中的旧 key；若传入 `texSource`，扫描 `.tex` 引用并报告受影响位置（**不修改 .tex**）。
- `searchEntries`：默认在 key/type/author/editor/title/year/date/journal/journaltitle/booktitle/publisher/school/institution 中做 NFC + 小写子串匹配；支持字段限定、大小写敏感、limit。
- 事件：单一 `change` 事件，携带 `{type, revision, actions, document}`；`subscribe` 返回取消函数；监听器异常交给 `onListenerError`（默认 `console.error`）。不实现 undo/redo：主程序已有 ProseMirror 历史；Bib 编辑属于小规模数据操作，引入历史栈成本高于收益（文档中说明）。
- `destroy()` 幂等；销毁后除 `destroy()` 外的方法抛出 `BibEditorError('BIB404')`。

## 7. 公共 API（唯一入口 `apps/web/bib/index.mjs`）

| 函数 | 说明 |
|---|---|
| `parseBib(source, options)` | 解析 `.bib` 文本为 `BibDocument`；默认不抛错，诊断随文档返回 |
| `parseBibFile(file, options)` | 异步解析浏览器 `File`/`Blob`；严格 UTF-8；Node 请用 `fs.readFile` + `parseBib` |
| `serializeBib(document, options)` | 无损/最小重写序列化；不安全值抛 `BibError` |
| `validateBib(sourceOrDocument, options)` | 语义校验；`profile: 'generic'|'bibtex'|'biblatex'` |
| `createBibEditor(documentOrSource, options)` | 创建 Editor Engine |
| `scanTexCitations(texSource)` | 扫描 `\cite` 家族、`\bibliography`、`\addbibresource` 等 |
| `checkTexCitations(texSource, bib)` | 缺失/未引用 key 检查 |
| `applyCitationRenames(texSource, renames)` | 生成重命名后的 `.tex` 文本（只替换 key token） |
| `resolveEntryValues(entry, document)` | 返回解析宏后的字段文本 |
| `getEntryValue(entry, name, document)` | 单字段解析值 |
| `formatDiagnostic(diag, source?)` | 人类可读诊断（含行列与源码行） |
| `BibError` / `BibParseError` / `BibEditorError` | 错误类型 |
| `DIAGNOSTIC_CODES` / `SEVERITY` / `MODEL_VERSION` | 常量 |

Editor 方法：`getDocument`、`getEntries`、`getEntry`、`addEntry`、`updateEntry`、`removeEntry`、`renameEntry`、`searchEntries`、`validate`、`importEntries`、`updateEntries`、`toBibTeX`、`subscribe`、`destroy`。

## 8. XeLaTeX 一致性方案

### 8.1 权威边界

- XeLaTeX 只负责排版；`.bib` 由 BibTeX（`.aux`/`.bbl`）或 Biber（`.bcf`/`.bbl`）处理。项目当前**未声明**使用哪一种，因此引擎不绑定后端。
- 引擎能保证的是：`.bib` 语法对两种后端均有效、值语义不变、key/引用关系不变、输出可被重新解析。
- 引擎**不能**保证：`.tex` 中 `\cite` 宏包行为、样式文件（`.bst`/`.bbx`）的字段映射、BibTeX 的 8 位编码限制、样式导致的排序差异。这些在集成文档中明确列出。

### 8.2 验证矩阵

| 层级 | 内容 | 本机可执行 |
|---|---|---|
| L1 语法 | Lexer/Parser/Serializer 单元测试、round-trip、错误恢复 | 是 |
| L2 语义 | 解析前后 `semanticSnapshot` 相等；未修改字节相等；单字段修改只影响该字段 | 是 |
| L3 后端兼容 | 同一 `.bib` 同时跑 BibTeX 与 Biber 的校验/编译脚本 | **否（无 TeX）** |
| L4 排版一致 | 修改前后 `xelatex` 编译，比较 `.bbl` 与 PDF 文本 | **否（无 TeX）** |

L3/L4 的夹具与脚本放在 `tests/bib/xelatex/`，脚本在缺少工具时以退出码 2 明确报告 `UNVERIFIED`，不伪装成通过。

### 8.3 代表性编译用例

1. `refs.bib`：中英文混排、`\&`、`\%`、`\_`、嵌套花括号、`@string`、`#` 连接、`jan` 宏、`crossref`。
2. `main-utf8.tex`：`\documentclass{article}` + `fontspec`？——不假设用户模板；提供两个变体：
   - `bibtex/article.tex`：`\documentclass{article}` + `\bibliographystyle{plain}` + `\bibliography{refs}`；
   - `biblatex/main.tex`：`\documentclass{article}` + `\usepackage[backend=biber]{biblatex}` + `\addbibresource{refs.bib}`。
3. 脚本流程：生成原文/往返两份 `.bib` → 分别编译 → 比较 `.bbl`（归一化后）与 `pdftotext` 输出（若可用）。

## 9. 测试矩阵

| 套件 | 覆盖 |
|---|---|
| `lexer.test.mjs` | token 形状、括号/引号、并发 `#`、`@string`/`@preamble`/`@comment`、未闭合、CRLF/BOM、行列 |
| `parser.test.mjs` | 18 种内置类型 + 自定义类型、全部字段形态、重复 key/字段、缺逗号/缺值恢复、括号定界符、注释与未知块保留、宏作用域 |
| `serializer.test.mjs` | 字节不变、最小改动、未知字段保留、引号/数字/连接保留、新增/删除、EOL/BOM、不可安全序列化时报错、回读校验 |
| `validator.test.mjs` | 三种 profile、重复 key、未定义宏、缺失 crossref、必需字段、strict |
| `editor.test.mjs` | 增删改查、重命名与库内引用、搜索、批量事务、事件/取消订阅/销毁、快照不可变 |
| `roundtrip.test.mjs` | 全部夹具 `parse→serialize→parse` 语义相等；二次序列化幂等；修改后 round-trip |
| `tex-citations.test.mjs` | `\cite` 家族、可选参数、多 key、注释、`\nocite{*}`、资源声明、重命名计划 |
| `browser-compat.test.mjs` | 源码无 `node:` 导入/DOM 全局；`Blob` 路径可用 |
| `verify-upstream.mjs` | 与上游 50 文件 blob 清单比对，证明现有文件零修改 |
| `verify-xelatex.mjs` | L3/L4 编译验证（无工具时明确 UNVERIFIED） |

## 10. 集成方案（仅建议，不修改现有文件）

1. 打开 `.bib`：在 `main.js` 文件输入处新增 `accept=".bib"` 分支，调用 `parseBibFile(file)`，把 `BibDocument` 交给 `createBibEditor`。
2. 文献 UI：新增独立面板/对话框，订阅 editor 的 `change` 事件；不触碰 `references.js`。
3. 插入引用：编辑 ProseMirror 文档时插入 `\cite{key}` 文本（可作为 `raw` 或新增 atom 节点，后者需改 `main.js`，须批准）。
4. 序言接入：主程序在导出时根据用户选择注入 `\bibliography{refs}` + `\bibliographystyle{...}` 或 `\addbibresource{refs.bib}`；不要修改 `packages.mjs` 的既有规则，新增独立函数即可。
5. 保存 `.bib`：调用 `serializeBib(editor.getDocument())`，沿用现有下载/文件句柄机制。
6. 重命名：`renameEntry(old,new,{texSource})`；根据返回的 `externalReferences` 决定是否用 `applyCitationRenames` 生成新的 `.tex`。

## 11. 决策记录

| 决策 | 理由 |
|---|---|
| 不做 undo/redo | 主程序已有编辑器历史；Bib 操作为小数据量，事务式提交已保证一致性；避免重复状态机。 |
| 编辑结果用 `{ok,error}` 而非抛异常 | 业务错误（key 不存在、重复）是预期分支，返回值比 try/catch 更清晰；编程错误仍抛 `BibError`。 |
| `source.text` 永远保留原始输入 | 无损的基础；避免把"当前导出"与"解析来源"混为一个字段。 |
| 不自动转义字段值 | 自动转义会改变语义（URL 的 `&`、数学模式、宏）；只校验括号并在文档中说明责任人。 |
| 重复 key 全部保留 | 不静默覆盖用户数据；Editor 层拒绝新增重复；校验层按 profile 报错。 |
| `.tex` 引用只扫描不改写 | 修改 `.tex` 超出后端职责且风险高；提供基于偏移的安全重命名计划供主程序调用。 |
| 同时支持 BibTeX/Biber | 项目未声明后端，不能假设；两套 profile + 两套编译夹具，集成时由负责人选择。 |

## 12. 阶段 C 实施顺序

1. `diagnostics.mjs` → `lexer.mjs` → `parser.mjs` → `model.mjs`（可先行 smoke test）。
2. `serializer.mjs` → `validator.mjs`。
3. `editor.mjs` → `tex-citations.mjs` → `index.mjs`。
4. 夹具与八个测试套件；`verify-upstream.mjs`。
5. `verify-xelatex.mjs` 与编译夹具。
6. 文档：架构、API、数据模型、测试报告、集成指南、XeLaTeX 一致性、文件变更报告。

## 13. 实现偏差记录（阶段 C 完成后补充）

| 设计 | 实际实现 | 原因 |
|---|---|---|
| 重复 key 诊断可由解析器给出 | 只由 `validateBib` 给出，严重程度随 profile | 避免"解析 warning + 校验 error"重复；BibTeX/Biber 严格程度不同，应由 profile 决定 |
| `source.text` 含 BOM | BOM 单独存于 `source.bom`，`source.text` 不含 BOM | 保证所有偏移与切片使用同一字符串；序列化时再拼回 |
| `updateEntry` 空 patch 未明确 | 空 patch 是无变化成功（不发事件） | 符合"无操作"直觉；修改 key 则明确拒绝并提示用 `renameEntry` |
| 设计未列出批量 API | 增加 `importEntries` / `updateEntries`（事务式） | 任务书 §5.1 要求批量导入/批量修改 |
| 设计未列出查询辅助 | 增加 `getEntryValue` / `resolveEntry` / `macroScopeAt` / `resolveValue` | UI 展示需要宏展开值；同时保持原始值可访问 |
| 序列化 `verify` 默认总是校验 | `verify:'auto'` 仅在 dirty 且原文无 error 时校验 | 原文已有错误时往返结果仍可能含错误，不能因此拒绝输出 |
| 错误恢复中的"无法构建结构"单独块 | 多数情况直接生成 entry/block 并保留原文；`broken` 块用于 `@string`/`@preamble` 结构失败 | 保证条目数据尽可能可编辑；原文始终由块覆盖 |
| 测试数量预计 | 实际 124 项（8 个套件） | 补充了事务性、事件、300 条合成库、CJK、`.tex` 引用等边界 |
| `verify-xelatex` 作为测试 | 独立脚本，缺工具退出码 2 | 避免"跳过"伪装成通过；测试报告单独说明未验证 |

实现完成后的实际文件、依赖与验证结果见 [FILE_CHANGES.md](FILE_CHANGES.md) 与
[TEST_REPORT.md](TEST_REPORT.md)。
