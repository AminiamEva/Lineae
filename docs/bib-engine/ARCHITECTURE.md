# Bib 引擎架构

> 模块位置：`apps/web/bib/`。公共入口：`apps/web/bib/index.mjs`。
> 本文说明各文件职责、依赖关系、数据流与设计不变量。数据字段细节见
> [DATA_MODEL.md](DATA_MODEL.md)，接口细节见 [API.md](API.md)。

## 1. 目标与非目标

**目标**：为 Lineae 提供一个与 UI 无关、与 TeX 发行版无关、可独立测试的 BibTeX
数据层：解析、无损序列化、语义校验、事务式编辑、`.tex` 引用分析。

**非目标**：网页 UI、PDF 排版、`.bbl` 生成、BibTeX 样式（`.bst`）实现、完整 LaTeX
宏展开、`.tex` 自动改写、undo/redo 状态机。

## 2. 文件职责

| 文件 | 职责 | 是否公共 |
|---|---|---|
| `index.mjs` | 唯一公共入口，聚合导出、输入校验、文件解码 | **是** |
| `diagnostics.mjs` | 诊断码、严重程度、源码定位、`BibError` 家族 | 部分（错误类与常量） |
| `lexer.mjs` | 字符级扫描 → token 流 + 词法诊断 | 否 |
| `parser.mjs` | token 流 → `BibDocument`，错误恢复、格式模板提取 | 否 |
| `model.mjs` | 冻结、字段查询、宏解析、语义快照、键校验、值构造 | 部分（查询辅助） |
| `serializer.mjs` | 无损序列化与最小重写、输出回读校验 | 公共（经入口） |
| `preflight.mjs` | 编译前检查：序列化 → 重新解析 → 最新诊断 | 公共（经入口） |
| `validator.mjs` | 全库语义校验（三种 profile） | 公共（经入口） |
| `editor.mjs` | 事务式增删改查、搜索、批量操作、事件、重复 key occurrence | 公共（经入口） |
| `tex-citations.mjs` | `.tex` 引用扫描、一致性检查、重命名计划 | 公共（经入口） |

代码规模约 3,800 行（含 JSDoc），无第三方依赖。

## 3. 依赖方向

严格单向，无循环：

```text
index ──> parser ──> lexer ──> diagnostics
  │          │          │
  │          └──> model ─┘
  ├──> serializer ──> diagnostics / model / parser（仅回读校验）
  ├──> preflight ───> serializer / parser / model
  ├──> validator ───> diagnostics / model / parser（接受字符串时）
  ├──> editor ──────> parser / serializer / validator / model / tex-citations
  └──> tex-citations ──> diagnostics / model
```

- `model.mjs` 不导入 parser/serializer/editor。
- `serializer.mjs` 导入 parser 只用于 `verify` 选项的回读校验。
- 浏览器打包时不会碰到 Node 内置模块；`node:*` 只出现在 `tests/bib/` 的验证脚本中。

## 4. 数据流

### 4.1 解析

```text
字符串
  │  BOM 剥离（记录 hadBom）
  ▼
lexer.tokenize
  │  token: text/command/comment/word/braced/quoted/equals/hash/comma/close/eof
  ▼
parser.parseBibSource
  │  逐条命令构造 block/entry/string/preamble
  │  字段级与条目级错误恢复
  ▼
BibDocument（blocks 完整分区 source.text，深冻结）
```

### 4.2 序列化

```text
BibDocument
  │  dirty=false 且 preserveFormatting=true → 直接返回 bom + source.text
  │  否则逐 block：
  │    text/comment/broken/string/preamble → 原始切片
  │    entry（dirty）→ 按 format 模板重写；未修改字段仍用原始切片
  ▼
BibTeX 文本
  │  verify=auto 且原文无错误 → 重新解析，出现错误则抛 BIB302
  ▼
输出
```

`verify` 只证明"当前 Parser 能读回输出"，不证明外部工具可编译或语义完全一致。

### 4.3 编辑

```text
addEntry / updateEntry / removeEntry / renameEntry
        │
        ▼
plan*(document, args)  ← 纯函数：校验 + 生成新文档，失败返回 {ok:false,error}
        │
        ▼
commit(nextDocument)   ← 冻结、重建 key 索引、revision+1
        │
        ▼
change 事件（订阅者）
```

批量导入/批量修改在同一事务内顺序 plan，全部成功才 commit。

### 4.4 校验

```text
源文本或 BibDocument
  │  profile: generic | bibtex | biblatex
  ▼
解析诊断（仅未编辑文档）+ 全库检查
  │  重复 key、重复字段、未定义宏、宏循环、缺失 crossref/xdata 目标、
  │  未知类型、必需字段（含 crossref/xdata 继承）
  ▼
ValidationReport（冻结）
```

### 4.5 `.tex` 引用

```text
.tex 文本
  │  注释遮蔽（保持偏移）
  ▼
scanTexCitations
  │  \cite 家族（可选参数、多组）、\bibliography、\addbibresource、\printbibliography
  ▼
{ citations, bibliography, resources, bibliographyStyle, printBibliography }
  │
  ├── checkTexCitations(tex, bib) → missing / uncited
  └── applyCitationRenames(tex, map) → 仅替换 key token，返回新文本与替换记录
```

### 4.6 编译前检查

```text
最终 BibDocument
  → serializeBib(verify:false)
  → parseBib（对最新文本，而非历史诊断）
  → errorCount === 0 ?
      是 → 允许交给 xelatex/bibtex/biber
      否 → 拒绝编译，返回最新 diagnostics
```

实现为 `preflightBib(document, options)`；`tests/bib/compile/run-editor-compile.mjs`
在写入 `.bib` 前调用它。旧文档的 `validate()` 结果不能替代该步骤，因为编辑后只有
重新序列化的文本才代表外部工具实际读取的内容。

## 5. 核心不变量

1. **分区不变量**：解析产生的 `blocks` 按顺序无缝覆盖 `source.text`
   （`blocks.map(blockText).join('') === source.text`）。测试对每个夹具断言。
2. **字节保真**：`serializeBib(parseBib(s)) === s`，包括 CRLF、BOM、注释、空行、
   未知命令与损坏条目；显式传入 `eol`/`bom`/`finalNewline` 时才改变。
3. **最小重写**：只有 `entry.dirty` 的条目重新生成；条目内只有 `field.dirty` 的字段
   重新格式化，其余字段使用原始源码切片（包括 `=` 两侧空白）。
4. **不自动转义**：字段值按调用方提供的 LaTeX 原文写入。只拒绝不平衡花括号、
   NUL/C0 控制字符。语义正确性优先于"看起来能编译"。
5. **不可变快照**：公共文档、报告、事件文档全部深冻结；每次提交产生新对象，
   旧快照仍然可用。
6. **事务性**：任何校验失败都不修改当前文档、不递增 revision、不发事件。
7. **重复不覆盖且变更不模糊**：重复 key 的条目全部保留；`getEntry`/索引返回第一个
   （BibTeX 语义）；Validator 按 profile 报告；`updateEntry`/`removeEntry`/
   `renameEntry` 在 key 重复且未提供 `occurrence` 时返回 `BIB409`，不猜测目标。
   `occurrence` 从 0 开始按源码顺序计数；重复 key 下的库内引用与 `.tex` 引用
   不做自动重定向，重命名结果标记 `ambiguous:true`。
8. **宏作用域顺序**：`@string` 只对其后的条目生效；条目内的宏解析使用其起始偏移
   处可见的定义；未定义/循环宏保留原拼写并产生诊断。

## 6. 错误模型

| 场景 | 行为 |
|---|---|
| `.bib` 语法/数据问题 | 不抛异常；写入 `document.diagnostics`（error/warning/info） |
| `throwOnError: true` | 有 error 诊断时抛 `BibParseError`（携带诊断数组） |
| 编程错误（类型错误、销毁后调用） | 抛 `BibError`/`BibEditorError`，带稳定 `code` |
| 编辑业务错误（key 不存在、重复、非法值） | 返回 `{ok:false, error:{code,message,details}}`，不抛异常 |
| 重复 key 未指定 occurrence | `BIB409 AMBIGUOUS_KEY`，不修改文档 |
| 序列化不安全值 | 抛 `BibError('BIB301')`，拒绝输出损坏的 `.bib` |
| 序列化回读失败 | 抛 `BibError('BIB302')` |

诊断码按域分段：lexer `BIB1xx`、parser `BIB1xx`、validator `BIB2xx`、
serializer `BIB3xx`、editor `BIB4xx`、公共输入 `BIB5xx`。完整表见
[API.md](API.md#诊断码)。

## 7. 格式保持与重写

解析时为每个条目提取 `format`：

- 条目定界符 `{`/`(`；
- 是否多行、字段缩进；
- `=` 两侧空白（字段级 `equalsSpacing` 优先，条目级 `equals` 兜底）；
- 是否有尾逗号；
- 闭定界符缩进。

重写时：新字段使用条目级模板；被修改的已有字段沿用该字段原始 `equalsSpacing`；
未修改字段直接输出 `field.raw`。因此"改一个字段"通常只改变那一行。

新值默认 `{...}`；若原字段是引号且新值不含深度 0 的 `"`，保持引号；原字段是裸数字
且新值仍为数字时保持裸数字。

## 8. 宏解析

- 内建月宏 `jan..dec` 提供默认英文月份名，可被 `@string` 覆盖。
- `macroScopeAt(document, offset)` 只纳入 `start < offset` 的 `@string`，模拟 BibTeX
  的顺序处理。
- `resolveValue()` 递归展开（深度上限 32），检测循环；未定义/循环返回 `unresolved`
  并保留原拼写。解析结果只读，不写回文档。
- `semanticSnapshot()` 输出顺序保留、宏展开后的语义视图，是 round-trip 测试的
  主要断言。

## 9. 测试结构

```text
tests/bib/
  lexer.test.mjs            14
  parser.test.mjs           21
  serializer.test.mjs       18
  validator.test.mjs        17
  editor.test.mjs           22
  roundtrip.test.mjs         8
  tex-citations.test.mjs    13
  browser-compat.test.mjs   11
  api-contract.test.mjs     18
  final-contract.test.mjs   15
  compile/cases.test.mjs    12
  examples/                 2
  pdf/visual-lib.test.mjs   11
  fixtures/*.bib            真实/边界样例
  compile/                  Editor 编译矩阵、独立预期、L3/L4 harness
  pdf/                      PDF 视觉比较纯函数
  examples/                 仅公共入口的独立示例
  xelatex/                  L3/L4 编译夹具
  verify-upstream.mjs       上游文件零修改核验
  verify-xelatex.mjs        缺工具时明确 UNVERIFIED
```

测试只依赖 Node 标准库与引擎本身，不启动浏览器、不需要构建。运行方式见
[TEST_REPORT.md](TEST_REPORT.md)。

## 10. 性能与规模

- 词法/语法分析线性扫描；300 条目合成库 round-trip 在约 40 ms 内完成（含断言）。
- 编辑器每次提交重建 key 索引（O(n)），适合常见文献库（数百到数千条）。
- `serializeBib` 对 dirty 文档默认执行一次回读校验，代价是一次额外解析；可用
  `verify:false` 关闭。
- 未做大文件基准；如需处理数万条，建议后续增量化解析与索引。

## 11. 扩展点

- **新增校验规则**：在 `validator.mjs` 增加检查，复用 `report()` 与 `CODES`。
- **新增字段语义**：在 `model.mjs` 增加解析辅助，不要改动 token/AST。
- **新增编辑操作**：以 `plan*` 纯函数 + `commit` 的形式加入 `editor.mjs`。
- **字符串编辑**：当前只读；若需要，按 `planUpdate` 模式新增，并保持 `@string`
  作用域顺序。
- **BibLaTeX 语义映射**：可在独立模块中实现，不污染核心模型。

## 12. 与现有项目的关系

- 不导入任何现有模块；不被现有模块导入。
- 不参与现有构建（除非主程序显式 import）。
- 现有 `.tex` 管线、ProseMirror 模型、`package.json`、CI 均未改。
- 集成建议（需要主程序负责人批准）见 [INTEGRATION.md](INTEGRATION.md)。
