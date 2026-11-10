# Bib 引擎数据模型

> 所有公共数据结构都是普通 JavaScript 对象/数组，不含类实例、函数、Map 或循环引用，
> 可直接 `JSON.stringify`（编辑器内部另有 key 索引 Map，但不属于文档）。
> 解析与校验返回的对象被**深冻结**；编辑提交后的文档同样被冻结。

## 1. `BibDocument`

```json
{
  "format": "bibtex",
  "modelVersion": 1,
  "source": {
    "text": "% header\n@article{knuth1984, ...}\n",
    "eol": "\n",
    "hadBom": false,
    "bom": "",
    "filename": "references.bib"
  },
  "blocks": [
    { "kind": "text", "start": 0, "end": 9 },
    { "kind": "entry", "entryId": "e1", "start": 9, "end": 240 },
    { "kind": "text", "start": 240, "end": 241 }
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

| 字段 | 说明 |
|---|---|
| `source.text` | **解析时的原始输入**（不含 BOM）。编辑后它不会更新；当前内容请用 `serializeBib()`。 |
| `source.eol` | 检测到的首个行尾：`"\n"`、`"\r\n"` 或 `"\r"`；无换行时为 `"\n"`。 |
| `source.hadBom` / `bom` | UTF-8 BOM 是否存在；`bom` 为 `"\ufeff"` 或 `""`。 |
| `source.filename` | 仅用于诊断，可为 `null`。 |
| `blocks` | 按源码顺序排列的顶层块，完整覆盖 `source.text`。 |
| `entries` | 全部条目，按源码顺序，包含重复 key。 |
| `strings` | `@string` 定义，按源码顺序。 |
| `preambles` | `@preamble` 块，按源码顺序。 |
| `diagnostics` | 解析阶段诊断（lexer + parser），按偏移排序。 |
| `stats` | 各类计数快照。 |
| `dirty` | 是否被编辑过；`false` 时序列化直接返回原文。 |
| `revision` | 每次成功提交 +1；解析结果为 0。 |

## 2. `Block`

| kind | 字段 | 含义 |
|---|---|---|
| `text` | `start`, `end` | 条目之外的普通文本（注释、空行、邮件地址、无法识别的 `@`） |
| `comment` | `start`, `end` | 整个 `@comment{...}` / `@comment(...)`，原样保留 |
| `entry` | `entryId`, `start`, `end`, `prefix?` | 文献条目；`prefix` 仅用于编辑时新增条目的分隔空白 |
| `string` | `stringId`, `start`, `end` | `@string` 定义 |
| `preamble` | `preambleId`, `start`, `end` | `@preamble` 块 |
| `broken` | `start`, `end` | 无法构建结构、但必须逐字节保留的命令区域 |

`start`/`end` 是 `source.text` 的偏移（左闭右开）。编辑新增的条目使用
`start = end = -1`。

## 3. `BibEntry`

```json
{
  "id": "e1",
  "type": "article",
  "typeRaw": "Article",
  "key": "knuth1984",
  "keyRaw": "knuth1984",
  "fields": [],
  "raw": "@Article{knuth1984, ...}",
  "start": 9,
  "end": 240,
  "dirty": false,
  "format": {
    "delimiter": "{",
    "multiline": true,
    "indent": "  ",
    "equals": " = ",
    "trailingComma": false,
    "closeIndent": ""
  }
}
```

| 字段 | 说明 |
|---|---|
| `id` | 文档内唯一，`e1`、`e2`…；跨解析不保证稳定。 |
| `type` | 小写语义类型；自定义类型同样接受。 |
| `typeRaw` | 原始写法，用于未修改条目与重写时保持大小写。 |
| `key` / `keyRaw` | 语义 key 与原始写法；key 大小写敏感。 |
| `fields` | 按源码顺序；可包含重复字段。 |
| `raw` | 原始源码切片；编辑后为**历史原文**，不随字段修改更新。 |
| `start`/`end` | 原始偏移；编辑后不再指向当前输出。 |
| `dirty` | 条目是否需要重写（任一字段修改、类型修改或 key 重命名）。 |
| `format` | 重写模板；见"格式模板"。 |

### 重复 key

- 所有重复条目都保留在 `entries` 与 `blocks` 中。
- `findEntryByKey`、`getEntry`、`macroScopeAt` 的引用解析均返回**第一个**条目
  （BibTeX 语义）。
- 校验器报告 `BIB117`：`generic`/`bibtex` 为 warning，`biblatex` 为 error。
- Editor 的 `addEntry`/`renameEntry` 拒绝产生新的重复 key（`BIB402`）。
- `updateEntry`/`removeEntry`/`renameEntry` 在 key 重复且未提供
  `options.occurrence` 时返回 `BIB409 AMBIGUOUS_KEY`，不自动选择条目。
  `occurrence` 从 0 开始、按源码顺序；唯一 key 可省略。重命名重复 key 时结果
  标记 `ambiguous:true`，不自动改写引用字段。

### 重复字段

- 全部保留；第一个之后的字段标记 `duplicate: true`。
- `getEntryField`、`resolveEntryValues`、必需字段检查忽略被遮蔽的重复字段。
- 解析器报告 `BIB116`（warning）；编辑后的文档由校验器报告。

## 4. `Field`

```json
{
  "name": "author",
  "nameRaw": "Author",
  "nameEnd": 30,
  "value": { "...": "BibValue" },
  "equalsSpacing": "    = ",
  "raw": "Author    = {Knuth, Donald E.}",
  "start": 20,
  "end": 54,
  "dirty": false,
  "duplicate": false,
  "unparsed": false
}
```

| 字段 | 说明 |
|---|---|
| `name` | 小写字段名（BibTeX 字段名大小写不敏感）。 |
| `nameRaw` | 原始写法；未修改字段原样输出。 |
| `nameEnd` | 字段名结束偏移（用于提取 `=` 两侧空白）。 |
| `value` | `BibValue` 或 `null`（解析失败时）。 |
| `equalsSpacing` | 该字段原始的 `=` 两侧空白，例如 `"    = "`；重写时优先使用。 |
| `raw` | 原始字段切片（从字段名到值末尾，不含前导缩进与尾逗号）。 |
| `start`/`end` | 原始偏移。 |
| `dirty` | 字段是否被修改；`false` 时输出 `raw`。 |
| `duplicate` | 是否被前一个同名字段遮蔽。 |
| `unparsed` | 字段名可识别但 `=`/值无法解析；保留 `raw` 原文。 |

## 5. `BibValue` 与 `ValuePart`

```json
{
  "kind": "concat",
  "parts": [
    { "kind": "macro", "name": "acm", "nameRaw": "acm", "raw": "acm", "start": 100, "end": 103 },
    { "kind": "quoted", "value": " Transactions", "raw": "\" Transactions\"", "start": 106, "end": 122 }
  ],
  "raw": "acm # \" Transactions\"",
  "start": 100,
  "end": 122
}
```

`value.kind`：

| kind | parts 形态 | 示例 |
|---|---|---|
| `braced` | 一个 `braced` part | `{Knuth}` |
| `quoted` | 一个 `quoted` part | `"Knuth"` |
| `number` | 一个 `number` part | `2024` |
| `macro` | 一个 `macro` part | `jan`、`acmtrans` |
| `concat` | 两个及以上 part，以 `#` 连接 | `"Jan " # jan` |
| `invalid` | 仅用于外部构造的占位；解析器不产生 | — |

part 字段：

| kind | 字段 |
|---|---|
| `braced` | `value`（不含外层花括号的内部原文） |
| `quoted` | `value`（不含外层引号的内部原文） |
| `number` | `value`（数字字符串） |
| `macro` | `name`（小写查找名）、`nameRaw`（原始拼写） |

part 的 `start`/`end` 对解析结果有效；编辑构造的新值为 `null`。

## 6. `StringDefinition` / `Preamble`

```json
{
  "id": "s1",
  "name": "acm",
  "nameRaw": "acm",
  "value": { "...": "BibValue" },
  "raw": "@string{acm = \"ACM\"}",
  "start": 0,
  "end": 22
}
```

`@preamble` 结构相同，无 `name`/`nameRaw`。二者在 v1 中**只读**：编辑器不提供
修改接口，但完整保留，并参与宏解析与语义快照。

## 7. `Diagnostic`

```json
{
  "code": "BIB102",
  "severity": "error",
  "message": "Unterminated braced value: 1 closing brace(s) missing.",
  "source": "lexer",
  "entryKey": "knuth1984",
  "fieldName": null,
  "hint": "Add the missing '}'.",
  "related": null,
  "location": {
    "start": { "offset": 31, "line": 2, "column": 14 },
    "end": { "offset": 66, "line": 2, "column": 49 }
  }
}
```

- `severity`：`error` / `warning` / `info`。
- `source`：`lexer` / `parser` / `validator` / `serializer`（诊断来源）。
- `related`：可选的相关位置数组（如重复 key 的首次出现）。
- 位置为 1-based 行列，偏移为 0-based（与 `String#slice` 一致）。

## 8. `ValidationReport`

```json
{
  "ok": false,
  "profile": "bibtex",
  "strict": false,
  "errorCount": 1,
  "warningCount": 2,
  "infoCount": 0,
  "diagnostics": [],
  "summary": {
    "entryCount": 8,
    "keyCount": 7,
    "duplicateKeys": ["dup"],
    "stringCount": 0,
    "preambleCount": 0,
    "blockCount": 17,
    "dirty": false
  }
}
```

`ok === (errorCount === 0)`。报告与 `diagnostics` 均冻结。

## 9. 编辑操作结果

成功：

```json
{ "ok": true, "entry": { "...": "BibEntry" }, "revision": 3 }
```

失败（不抛异常）：

```json
{
  "ok": false,
  "error": {
    "code": "BIB402",
    "message": "Entry key \"knuth1984\" already exists.",
    "details": { "key": "knuth1984" }
  }
}
```

不同操作附加字段：

| 操作 | 附加字段 |
|---|---|
| `updateEntry` | `changedFields: [{name, action:'added'|'updated'|'removed'}]`、`occurrence`、`keyCount`；无变化时 `revision` 不变 |
| `removeEntry` | `danglingReferences: [{entryKey, field}]`、`occurrence`、`remainingWithKey` |
| `renameEntry` | `updatedReferences: [{entryKey, field, count}]`、`externalReferences: [{command, key, start}]`、`ambiguous`、`ambiguity`、`occurrence`、`referencesSkipped`、`externalReferencesAmbiguous` |
| `importEntries` | `entries`, `skipped`, `count` |
| `updateEntries` | `entries`, `count` |
| `searchEntries` | `results`, `total`, `truncated` |

## 10. 事件

```json
{
  "type": "change",
  "revision": 4,
  "actions": [
    { "type": "rename", "key": "knuth84", "previousKey": "knuth1984", "occurrence": 0 }
  ],
  "document": { "...": "BibDocument" }
}
```

- `type`：`change` 或 `destroyed`。
- 每次成功提交只发一次事件；批量操作合并为一次。
- `document` 为冻结快照。
- 监听器抛出的异常被隔离，交给 `onListenerError`（默认 `console.error`）。

## 11. 偏移与冻结

- 解析产生的所有 `start`/`end` 指向 `source.text`，不含 BOM。
- 编辑新增的条目/字段使用 `-1` 或 `null` 作为偏移；编辑后的偏移不再表示当前输出位置。
- 文档、条目、字段、值、诊断、报告、事件文档全部深冻结。旧快照在后续编辑后依然有效。
- 编辑操作不会修改传入的文档对象；它们返回新文档。

## 12. 宏解析模型

- `macroScopeAt(document, offset)`：收集 `start < offset` 的 `@string`，叠加内建月宏。
- `resolveValue(value, scope)`：递归展开，返回 `{text, unresolved}`。
- 未定义宏在文本中保留原拼写（如 `acm`），同时记录 `unresolved`；校验器报 `BIB201`。
- 循环宏返回 `unresolved: [{reason:'cycle'}]`；校验器报 `BIB202`。
- 字符串定义自身使用其起始偏移处的作用域，因此前向引用会被诊断为未定义。
- 语义快照 `semanticSnapshot()` 是 round-trip 断言的权威视图。

## 13. 格式模板

| 字段 | 来源 | 用途 |
|---|---|---|
| `delimiter` | 命令开定界符 | 输出 `{...}` 或 `(...)` |
| `multiline` | 原文是否含换行 | 多行/单行布局 |
| `indent` | 首个字段行前空白 | 多行缩进 |
| `equals` | 首个字段 `=` 两侧空白 | 新字段的等号间距 |
| `trailingComma` | 最后一个字段后是否有逗号 | 是否输出尾逗号 |
| `closeIndent` | 闭定界符前空白 | 多行闭合缩进 |

字段级 `equalsSpacing` 优先于条目级 `equals`，因此修改既有字段时能保持原有对齐。
