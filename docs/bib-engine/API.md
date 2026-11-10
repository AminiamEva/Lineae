# Bib 引擎公共 API

> 唯一公共入口：`apps/web/bib/index.mjs`。主程序**不得**直接 import 内部文件
> （`lexer.mjs`、`parser.mjs`、`model.mjs`、`serializer.mjs`、`validator.mjs`、
> `editor.mjs`、`tex-citations.mjs`），它们的接口不保证稳定。

```js
import {
  parseBib, parseBibFile, serializeBib, validateBib, createBibEditor,
  BibEditor, preflightBib,
  scanTexCitations, checkTexCitations, applyCitationRenames,
  getEntryValue, resolveEntry, getEntryField, macroScopeAt, resolveValue,
  formatDiagnostic, DIAGNOSTIC_CODES, SEVERITY, MODEL_VERSION,
  BibError, BibParseError, BibEditorError,
} from '../bib/index.mjs';
```

所有解析/序列化/校验/编辑 API 都是**同步**的；只有 `parseBibFile` 返回 Promise
（浏览器 `File`/`Blob` 读取）。

---

## 1. `parseBib(source, options?)`

解析 BibTeX 文本为 `BibDocument`。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `source` | `string` | — | `.bib` 全文 |
| `options.filename` | `string \| null` | `null` | 仅用于诊断 |
| `options.maxDiagnostics` | `number` | 无上限 | 超过后不再收集诊断 |
| `options.throwOnError` | `boolean` | `false` | 有 error 诊断时抛 `BibParseError` |

**返回**：冻结的 `BibDocument`（见 [DATA_MODEL.md](DATA_MODEL.md)）。

**异常**：
- `source` 不是字符串 → `BibError('BIB501')`。
- `throwOnError: true` 且存在 error 诊断 → `BibParseError`（`error.code === 'BIB_PARSE'`，
  `error.diagnostics` 为 error 诊断数组）。

**行为**：
- 语法/数据错误默认**不抛异常**，写入 `document.diagnostics`，尽量保留全部内容。
- 未修改文档 `dirty === false`，`serializeBib(document)` 逐字节还原输入。

```js
const document = parseBib(source, { filename: 'refs.bib' });
console.log(document.entries.map(entry => entry.key));
console.log(document.stats.errorCount);
```

---

## 2. `parseBibFile(file, options?)`

从浏览器 `File`/`Blob` 异步解析，严格 UTF-8 解码。

| 参数 | 类型 | 说明 |
|---|---|---|
| `file` | `Blob & {name?: string}` | `File` 或 `Blob` |
| `options` | 同 `parseBib` | `filename` 默认取 `file.name` |

**返回**：`Promise<BibDocument>`。

**异常**：
- 不是 Blob/File → `BibError('BIB503')`。
- 非 UTF-8 字节 → `BibError('BIB502')`（不会静默替换字节）。
- 解析选项异常同 `parseBib`。

```js
const document = await parseBibFile(file); // file from <input type="file">
```

**Node.js**：没有 `File` 时请用 `fs.readFile` + `parseBib`：

```js
import { readFileSync } from 'node:fs';
const document = parseBib(readFileSync('refs.bib', 'utf8'), { filename: 'refs.bib' });
```

---

## 3. `serializeBib(document, options?)`

把 `BibDocument` 序列化为 BibTeX 文本。

| 选项 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `eol` | `'preserve' \| 'lf' \| 'crlf'` | `'preserve'` | 行尾；`preserve` 保持原文 |
| `bom` | `'preserve' \| 'never'` | `'preserve'` | 是否保留 BOM |
| `finalNewline` | `'preserve' \| 'ensure' \| 'none'` | `'preserve'` | 末尾换行 |
| `preserveFormatting` | `boolean` | `true` | `false` 时重新生成所有条目（格式归一化） |
| `verify` | `'auto' \| boolean` | `'auto'` | 回读校验；`auto` 仅在 dirty 且原文无 error 时执行 |

**`verify` 的保证范围**：`verify:true` 只验证"序列化输出能否被当前 Parser 正确
解析"（`BIB302` 表示回读出现 error）。它**不是**外部 BibTeX/Biber 编译验证，
不是语义完全一致性证明，也不是 PDF 排版验证；语义一致性由独立测试与
`checkSemanticInvariants` 覆盖，编译/排版由 L3/L4 harness 覆盖。

**返回**：`string`。

**异常**：
- 不是 `BibDocument` → `BibError('BIB303')`。
- 字段值括号不平衡/含控制字符 → `BibError('BIB301')`。
- 回读出现错误 → `BibError('BIB302')`，附 `details.diagnostics`。
- 任一选项取值非法（`eol`/`bom`/`finalNewline`/`preserveFormatting`/`verify`）
  → `BibError('BIB504')`。

**保证**：未修改文档逐字节等于输入（含 CRLF、BOM、注释、未知内容）；
修改后只重写受影响条目/字段。

### 3.1 可编译性边界（重要）

`serializeBib` 的保证按数据来源分层，不能合并成"任意文档可编译"：

| 类别 | 引擎行为 | 可编译性 |
|---|---|---|
| 可识别且通过校验的结构 | 可被本引擎重新解析；`validateBib` 无 error | 通常可交给 BibTeX/Biber，但样式仍可能拒绝字段 |
| 原始文件中已损坏的结构 | 逐字节保留（`broken`/`text` 块）+ error 诊断 | **不保证**；很可能编译失败 |
| 未知命令/未知字段 | 未知字段保留；未知命令通常保留原文并诊断 | 取决于外部工具；未知字段可能被忽略，未知命令可能报错 |
| 新建/修改的条目与字段 | 由 Serializer 重写，括号/控制字符受校验 | 语法在引擎范围内有效；LaTeX 语义仍需调用方负责 |

因此，**含有 error 诊断的完整文档不保证能通过外部 BibTeX/Biber 编译**。编译前
必须使用 `preflightBib`（见 3.2）或等价的"重新解析最新输出"流程。

### 3.2 `preflightBib(document, options?)`（编译前检查）

对当前文档执行：

```text
serializeBib(verify:false)
  → parseBib（最新输出）
  → 统计 error/warning 诊断
```

它**不使用**编辑前文档的历史诊断，因此适合作为交给 BibTeX/Biber 之前的最后一道
门槛。

| 参数 | 类型 | 说明 |
|---|---|---|
| `document` | `BibDocument` | 当前最终文档 |
| `options.eol` / `bom` / `finalNewline` / `preserveFormatting` | 同 `serializeBib` | 序列化选项 |
| `options.filename` | `string` | 诊断文件名 |

**返回**：

```js
{
  ok: true,                 // errorCount === 0
  text: '...',              // 实际交给外部工具的文本
  diagnostics: [ /* 最新解析诊断 */ ],
  errorCount: 0,
  warningCount: 0,
  document: { /* 重新解析后的 BibDocument */ }
}
```

**异常**：输入不是 `BibDocument` → `BIB303`；序列化选项非法 → `BIB504`；
序列化本身产生不安全值 → `BIB301`。

```js
const preflight = preflightBib(editor.getDocument());
if (!preflight.ok) {
  throw new Error('Fix bibliography errors before compiling: ' +
    preflight.diagnostics.filter(d => d.severity === 'error').map(d => d.code).join(','));
}
saveToProject(preflight.text); // 这才允许交给 xelatex/bibtex/biber
```

**边界**：`preflightBib` 只证明"当前 Parser 能解析这份文本"。它**不等于**外部
BibTeX/Biber 编译、语义等价证明或 PDF 排版验证。


```js
const text = serializeBib(editor.getDocument());
const crlf = serializeBib(document, { eol: 'crlf' });
```

---

## 4. `validateBib(sourceOrDocument, options?)`

全库语义校验。

| 选项 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `profile` | `'generic' \| 'bibtex' \| 'biblatex' \| 'biber'` | `'generic'` | `biber` 是 `biblatex` 的别名 |
| `strict` | `boolean` | `false` | 必需字段缺失从 warning 升为 error |
| `filename` | `string` | — | 仅在传入字符串时用于诊断 |
| `maxDiagnostics` | `number` | 无上限 | 诊断上限 |

**返回**：冻结的 `ValidationReport`（见 [DATA_MODEL.md](DATA_MODEL.md#8-validationreport)）。

**检查项**：重复 key、重复字段、空/非法 key、未定义宏、宏循环、缺失 crossref/xdata
目标、未知条目类型、必需字段（支持 crossref/xdata 继承）、`@conference` 别名、
字符串重定义。

**异常**：未知 profile → `BibError('BIB504')`。

```js
const report = validateBib(document, { profile: 'biblatex' });
if (!report.ok) {
  for (const diagnostic of report.diagnostics) {
    console.error(formatDiagnostic(diagnostic, document.source.text));
  }
}
```

> 对已编辑（`dirty`）文档，校验只针对当前模型；解析阶段的旧诊断不会重放。

---

## 5. `createBibEditor(input, options?)`

创建 Editor Engine。

| 参数 | 类型 | 说明 |
|---|---|---|
| `input` | `BibDocument \| string` | 已解析文档或 `.bib` 文本 |
| `options.profile` | `'generic' \| 'bibtex' \| 'biblatex'` | `validate()` 默认 profile |
| `options.strict` | `boolean` | `validate()` 默认 strict |
| `options.parse` | `{filename?, maxDiagnostics?}` | 输入为字符串时传给解析器 |
| `options.onListenerError` | `(error) => void` | 订阅者抛错时的回调（默认 `console.error`） |

**返回**：`BibEditor`。

```js
const editor = createBibEditor(document, { profile: 'biblatex' });
console.log(editor instanceof BibEditor); // true
```

### 5.1 查询

| 方法 | 返回 | 说明 |
|---|---|---|
| `getDocument()` | `BibDocument` | 冻结快照；销毁后抛 `BIB406` |
| `getEntries()` | `ReadonlyArray<BibEntry>` | 按源码顺序，含重复 key |
| `getEntry(key)` | `BibEntry \| null` | key 大小写敏感；重复 key 返回第一个 |
| `searchEntries(query, options?)` | `{results, total, truncated}` | 见下 |
| `validate(options?)` | `ValidationReport` | 默认使用构造时的 profile/strict |
| `toBibTeX(options?)` | `string` | 等价于 `serializeBib(getDocument(), options)` |

`searchEntries` 选项：

| 选项 | 默认 | 说明 |
|---|---|---|
| `fields` | 内置字段列表 | 覆盖默认搜索字段；key/type 始终参与 |
| `caseSensitive` | `false` | 大小写敏感 |
| `limit` | `100` | 最大结果数；`Infinity` 表示不限 |

默认字段：`author, editor, title, year, date, journal, journaltitle, booktitle,
publisher, school, institution, doi, url`。匹配方式为 NFC 归一化后的子串匹配。

### 5.2 重复 key 与 `occurrence`

Parser 保留所有重复条目，Validator 通过 `BIB117` 报告；`getEntry(key)` 仍返回
源码顺序中的第一个条目（兼容既有行为）。

当**多个条目具有相同 key** 时，`updateEntry`、`removeEntry`、`renameEntry` 默认
返回 `BIB409 AMBIGUOUS_KEY`，不做模糊修改。调用方必须用 `options.occurrence`
指定条目：

- `occurrence` 从 **0** 开始，按源码顺序计数；
- 唯一 key 可省略 occurrence（等价于 `0`）；
- 负数、非整数、字符串 → `BIB408`；
- 超出范围 → `BIB401`（`details.count` 给出重复数）；
- `.tex` 引用无法区分具体重复条目：重命名会返回 `ambiguous:true`，并且不自动
  改写 `.bib` 内的引用字段（`referencesSkipped:true`）。

```js
editor.updateEntry('dup', { fields: { title: 'Second' } }, { occurrence: 1 });
editor.removeEntry('dup', { occurrence: 0 });
editor.renameEntry('dup', 'dup2', { occurrence: 1, texSource });
```

### 5.3 写入

所有写入返回 `{ok:true, ...}` 或 `{ok:false, error:{code,message,details}}`；
失败时文档、revision、订阅者都不变。

#### `addEntry(input)`

```js
const result = editor.addEntry({
  key: 'knuth1984',
  type: 'article',              // 可省略，默认 'misc'
  fields: {                     // 或 [{name, value}, ...]
    author: 'Knuth, Donald E.',
    title: 'The {\\TeX}book',
    year: '1984',
  },
});
```

- 字段值：`string`（LaTeX 原文）或 `{text, delimiter?: 'braced'|'quoted'|'number'}`。
- **不做自动转义**：调用方负责 `\&`、`\%` 等；只校验括号平衡与控制字符。
- 新条目追加到文档末尾，自动补充分隔空行。
- 错误码：`BIB402` 重复 key、`BIB403` 非法 key、`BIB404` 非法条目/类型、
  `BIB405` 非法字段/值、`BIB408` 参数错误。

#### `updateEntry(key, patch, options?)`

```js
editor.updateEntry('knuth1984', {
  type: 'book',                              // 可选
  fields: {
    title: 'A new title',                    // 修改/新增
    note: null,                              // 删除字段
  },
  replaceFields: false,                      // true 时先清空所有字段
}, { occurrence: 0 });                        // 重复 key 时必填
```

- 未在 `patch.fields` 中出现的字段（包括未知字段）保持原样。
- 修改既有字段时，所有同名（重复）字段一起更新。
- `patch.key` 被拒绝（`BIB408`），请用 `renameEntry`。
- 无实际变化时返回 `{ok:true, revision: 旧值, changedFields: []}`，不发事件。
- 重复 key 未指定 occurrence → `BIB409`；结果附加 `occurrence`、`keyCount`。

#### `removeEntry(key, options?)`

```js
editor.removeEntry('knuth1984', { occurrence: 0 });
```

删除条目，返回：

```js
{
  ok: true,
  entry: { /* 被删除的条目 */ },
  danglingReferences: [{ entryKey: 'child', field: 'crossref' }],
  occurrence: 0,
  remainingWithKey: 0,       // 删除后仍使用该 key 的条目数
  revision: 5,
}
```

- 不会级联删除引用字段；`danglingReferences` 供 UI 提示。
- 如果还有同 key 条目，引用仍可解析，`danglingReferences` 为空。
- 重复 key 未指定 occurrence → `BIB409`；occurrence 越界 → `BIB401`。

#### `renameEntry(oldKey, newKey, options?)`

```js
const result = editor.renameEntry('knuth1984', 'knuth84', {
  texSource: texText,            // 可选：只分析，不修改
  occurrence: 0,                 // 重复 key 时必填
});
// result.updatedReferences: [{entryKey, field, count}]
// result.externalReferences: [{command, key, start}]
// result.ambiguous: false
```

- 同步改写库内 `crossref`、`xdata`、`entryset`、`related` 字段中的旧 key。
- `texSource` 存在时扫描 `\cite` 家族，报告受影响位置；**不修改 `.tex`**。
- 新 key 已存在 → `BIB402`；非法 → `BIB403`；旧 key 不存在 → `BIB401`。
- 重复 key 未指定 occurrence → `BIB409`。
- 旧 key 重复时（即使指定 occurrence）：`ambiguous:true`、
  `ambiguity:{key,count,occurrences}`、`referencesSkipped:true`；库内引用字段
  **不猜测目标**，`.tex` 引用若存在则 `externalReferencesAmbiguous:true`。
  调用方必须先人工/由上层解决歧义。

#### `importEntries(inputs, options?)`

```js
const result = editor.importEntries([
  { key: 'a', type: 'misc', fields: { title: 'A' } },
  { key: 'b', type: 'misc', fields: { title: 'B' } },
], { onConflict: 'skip' });   // 'error'（默认）| 'skip'
```

- 事务式：任一失败（除 `skip` 的重复 key）→ 全部不提交，返回 `BIB407`。
- 返回 `{entries, skipped, count}`。

#### `updateEntries(patches)`

```js
editor.updateEntries([
  { key: 'a', patch: { fields: { year: '2020' } } },
  { key: 'b', patch: { fields: { note: null } } },
]);
```

- 事务式：任一失败 → 全部不提交，返回 `BIB407`，`error.details.index` 指出位置。
- 批量 patch 没有 occurrence 参数；若目标 key 重复，计划阶段返回 `BIB409`，
  调用方需先消除重复或改用单条 `updateEntry(..., {occurrence})`。

### 5.4 事件

```js
const unsubscribe = editor.subscribe(event => {
  // event.type: 'change' | 'destroyed'
  // event.revision, event.actions, event.document
});
unsubscribe();
```

- 每次成功提交发一次 `change`；批量操作合并为一次。
- `destroy()` 发一次 `destroyed`，随后清空订阅者。
- 监听器异常被隔离，交给 `onListenerError`。
- 不实现 undo/redo；主程序可保存 `getDocument()` 快照自行管理历史。

### 5.5 `destroy()`

幂等。销毁后除 `destroy()` 外所有方法抛 `BibEditorError('BIB406')`。

---

## 6. `.tex` 引用辅助

### `scanTexCitations(texSource)`

```js
const scan = scanTexCitations(texSource);
console.log(scan.citations, scan.bibliography, scan.resources);
```

扫描注释遮蔽后的 `.tex`：

- 任意 `\...cite...` 命令（`\cite`、`\citep`、`\citet`、`\parencite`、`\textcite`、
  `\autocite`、`\footcite`、`\nocite`、复数 `\cites`、星号变体等）；
- 跳过可选参数 `[...]`，解析一个或多个 `{...}`；
- 识别 `\bibliography`、`\bibliographystyle`、`\addbibresource`/`\addglobalbib`/
  `\addsectionbib`、`\printbibliography`。

返回：

```js
{
  citations: [{ command, start, end, keys: [{key, start, end}] }],
  bibliography: [{command:'bibliography', path, start, end}],
  bibliographyStyle: {style, start, end} | null,
  resources: [{command, path, start, end}],
  printBibliography: [{start, end}],
  nociteAll: boolean,
  maskedSource: string
}
```

**限制**：不做宏展开、不解析 `\verb`、不处理 `\input` 引入的其它文件；复数命令的
分组会合并到一条 `citations` 记录。`\citestyle` 被排除。**不解析
`\newcommand`/`\renewcommand`/`\def` 定义的宏体**：宏定义内部的 `\cite` 会被当作
真实引用（例如 `\newcommand{\mycite}[1]{\cite{#1}}` 会产生 `mycite` 与 `cite`
两条记录）。完整支持需要 LaTeX 宏定义解析，当前明确不引入不完整实现；调用方应
避免对含宏定义的源码直接做自动重命名。

### `checkTexCitations(texSource, bibDocument)`

```js
const { missing, uncited, nociteAll } = checkTexCitations(texSource, document);
```

返回 `{cited, missing:[{key,command,start}], uncited, nociteAll, citationCount}`。
`\nocite{*}` 不参与 missing 判定。第二参数必须是 `BibDocument`，否则 `BIB504`。
`uncited` 表示"没有显式 cite"，**不等同于"不会出现在参考文献表"**：当
`nociteAll === true` 时，所有条目都会进入参考文献表，但 `uncited` 仍列出它们。
调用方应先检查 `nociteAll` 再展示"未引用"提示。

### `applyCitationRenames(texSource, renames)`

```js
const result = applyCitationRenames(tex, { knuth1984: 'knuth84' });
// {text, replaced:[{oldKey,newKey,start,end}], unresolved:[...], count}
```

只替换扫描到的 key token；注释、可选参数、其它文本不动。`start`/`end` 指向
**输入文本**。未在文本中出现的映射键进入 `unresolved`。

替换 key 必须通过与 Editor 相同的 key 校验；非法（空、含空格、`{}`、`,` 等）会抛
`BibError('BIB504')`，不会生成非法 `.tex`。

---

## 7. 查询辅助

| API | 返回 |
|---|---|
| `getEntryValue(entry, fieldName, document)` | 宏展开后的字段文本，缺失/未解析为 `null` |
| `resolveEntry(entry, document)` | `{key, type, fields, unresolved}` |
| `getEntryField(entry, fieldName)` | 原始 `BibField \| null`（忽略重复字段） |
| `macroScopeAt(document, offset)` | 该偏移处可见的宏 `Map<string, BibValue>` |
| `resolveValue(value, scope)` | `{text, unresolved}` |
| `formatDiagnostic(diagnostic, sourceText?)` | 含行列、源码行与 `^` 的字符串 |

```js
const author = getEntryValue(entry, 'author', document); // 宏已展开，缺失为 null
const resolved = resolveEntry(entry, document);          // {key, type, fields, unresolved}
const scope = macroScopeAt(document, entry.start);
const rawValue = resolveValue(getEntryField(entry, 'journal').value, scope);
console.log(formatDiagnostic(document.diagnostics[0], document.source.text));
```

---

## 8. 错误类型

| 类 | 用途 | 关键字段 |
|---|---|---|
| `BibError` | 参数/文档/序列化错误 | `code`, `message`, `details` |
| `BibParseError` | `throwOnError` 时的语法错误 | `code='BIB_PARSE'`, `diagnostics` |
| `BibEditorError` | 编辑器生命周期/编程错误 | `code`, `details` |

所有错误都有 `toJSON()`；`details` 为普通对象。

```js
try {
  const document = await parseBibFile(file);
} catch (error) {
  if (error instanceof BibParseError) console.error(error.diagnostics);
  else if (error instanceof BibEditorError) console.error(error.code);
  else if (error instanceof BibError) console.error(error.toJSON());
}
```

---

## 9. 诊断码

### Lexer / Parser

| 码 | 严重程度 | 含义 |
|---|---|---|
| `BIB101` | error | 条目内出现意外字符 |
| `BIB102` | error | 花括号值未闭合 |
| `BIB103` | error | 引号值未闭合 |
| `BIB104` | error | `@comment` 未闭合 |
| `BIB105` | error | 命令体到 EOF 仍未闭合 |
| `BIB106` | error | 定界符不匹配 |
| `BIB107` | info | `@` 与命令名之间有空白（宽容） |
| `BIB108` | warning | 条目内出现 `%`（非 BibTeX 注释），已跳到行尾 |
| `BIB109` | error | 引号值内出现多余的 `}` |
| `BIB111` | error | 条目缺少 key |
| `BIB112` | 保留 | （未发射）非法 key 的解析级提示 |
| `BIB113` | error | 字段缺少 `=` |
| `BIB114` | error | 字段缺少值 |
| `BIB115` | error | 字段之间缺少逗号 |
| `BIB116` | warning | 重复字段（首个生效） |
| `BIB117` | warning/error | 重复 key；`biblatex` profile 为 error |
| `BIB118` | error | 条目内意外 token |
| `BIB119` | info | 条目没有任何字段 |
| `BIB120` | 保留 | （未发射）非法条目类型 |
| `BIB121` | 保留 | （未发射）非法字段名 |
| `BIB122` | 保留 | （未发射）无法构建结构的命令 |
| `BIB123` | info | `@string` 重复定义 |
| `BIB124` | error | `#` 后缺少值 |

### Validator

| 码 | 严重程度 | 含义 |
|---|---|---|
| `BIB201` | error | 未定义宏 / 宏前向引用 |
| `BIB202` | error | 宏循环 |
| `BIB203` | warning | 当前 profile 不认识的条目类型 |
| `BIB204` | warning（strict: error） | 缺少必需字段 |
| `BIB205` | warning | `crossref`/`xdata`/`entryset`/`related` 目标不存在 |
| `BIB206` | error | 空 key |
| `BIB207` | 保留 | （未发射）条目外杂文本 |
| `BIB208` | info | `@conference` 别名提示（bibtex） |
| `BIB209` | 保留 | （未发射）月份写法提示 |
| `BIB210` | error | key 含 BibTeX/Biber 不接受的字符 |

### Serializer

| 码 | 严重程度 | 含义 |
|---|---|---|
| `BIB301` | error（抛出） | 字段值括号不平衡/含控制字符，拒绝序列化 |
| `BIB302` | error（抛出） | 序列化结果回读失败，拒绝输出 |
| `BIB303` | error（抛出） | 不是 `BibDocument` |

### Editor

| 码 | 含义 |
|---|---|
| `BIB401` | 条目不存在 |
| `BIB402` | 重复 key |
| `BIB403` | 非法 key |
| `BIB404` | 非法条目/条目类型 |
| `BIB405` | 非法字段名/字段值 |
| `BIB406` | 编辑器已销毁 |
| `BIB407` | 批量操作失败（整体回滚） |
| `BIB408` | 参数/用法错误（如用 `updateEntry` 改 key） |
| `BIB409` | 重复 key 导致操作歧义；需 `options.occurrence` |

### 公共输入

| 码 | 含义 |
|---|---|
| `BIB501` | 解析输入不是字符串 |
| `BIB502` | 文件不是合法 UTF-8 |
| `BIB503` | 不是 Blob/File |
| `BIB504` | 非法参数（未知 profile、非法 eol/bom/finalNewline/verify、非法重命名 key） |

`DIAGNOSTIC_CODES` 导出以上全部常量；`SEVERITY` 导出 `error/warning/info`。

---

## 10. 完整示例

```js
import {
  parseBib, validateBib, createBibEditor, preflightBib, formatDiagnostic,
} from '../bib/index.mjs';

// 1. 解析
const document = parseBib(sourceText, { filename: 'refs.bib' });

// 2. 校验（按目标后端选择 profile）
const report = validateBib(document, { profile: 'biblatex' });
for (const diagnostic of report.diagnostics) {
  console.warn(formatDiagnostic(diagnostic, document.source.text));
}

// 3. 编辑
const editor = createBibEditor(document, { profile: 'biblatex' });
const unsubscribe = editor.subscribe(event => {
  renderEntries(event.document.entries); // UI 自行实现
});

const added = editor.addEntry({
  key: 'new2024',
  type: 'article',
  fields: { author: 'Doe, Jane', title: 'A Title', year: '2024' },
});
if (!added.ok) console.error(added.error.code, added.error.message);

// 重复 key 必须显式选择 occurrence（0-based，源码顺序）
const ambiguous = editor.updateEntry('dup', { fields: { title: 'X' } });
if (!ambiguous.ok && ambiguous.error.code === 'BIB409') {
  editor.updateEntry('dup', { fields: { title: 'X' } }, { occurrence: 1 });
}

const renamed = editor.renameEntry('knuth1984', 'knuth84', { texSource });
if (renamed.ok && renamed.externalReferences.length) {
  // 提醒用户：.tex 中这些位置需要同步修改（或调用 applyCitationRenames）
}

// 4. 编译前检查：以最新序列化输出重新解析，禁止把含 error 的文本当作可编译
const preflight = preflightBib(editor.getDocument());
if (!preflight.ok) {
  throw new Error('Fix bibliography errors before compiling: ' +
    preflight.diagnostics.filter(d => d.severity === 'error').map(d => d.code).join(','));
}
saveText(preflight.text); // 主程序自行实现；这是唯一允许交给 BibTeX/Biber 的文本

// 5. 销毁
unsubscribe();
editor.destroy();
```

## 11. 稳定性

- `MODEL_VERSION === 1`；公共数据结构变更时递增。
- 诊断码一旦发布不再改变含义；`BIB409` 表示重复 key 歧义。
- 内部模块不承诺稳定；主程序只依赖 `index.mjs`。
- **可编译性不是无条件保证**：可识别且通过校验的结构可被本引擎重新解析；
  原始文件中的损坏结构、未知命令/字段会按原样保留并诊断；新建/修改的条目在
  语法层受 Serializer 校验。含 error 诊断的完整文档必须经过 `preflightBib`
  （或等价的最新输出重解析），且外部样式仍可能拒绝某些字段。引擎不修复原始错误，
  也不保证任意 `.bib` 能被第三方工具接受（见
  [XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md)）。

## 11. 稳定性

- `MODEL_VERSION === 1`；公共数据结构变更时递增。
- 诊断码一旦发布不再改变含义。
- 内部模块不承诺稳定；主程序只依赖 `index.mjs`。
- 不保证 `.bib` 能被任意第三方工具 100% 接受（见
  [XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md)），但保证语法符合
  BibTeX/Biber 的共同子集，且不静默改写用户数据。
