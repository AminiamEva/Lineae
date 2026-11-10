# 集成指南（面向 Lineae 主程序）

> 本模块**没有修改任何上游文件或主程序文件**（只修改了 Bib 模块自身及其测试/
> 文档）。下面的接入步骤都是建议；涉及 `main.js` 等文件的改动需要主程序负责人
> 批准后实施。

## 1. 运行环境与导入

- 浏览器与 Node.js 18+ 通用，纯 ESM，零依赖。
- 从 `apps/web/src/main.js` 导入：

```js
import {
  parseBib, parseBibFile, serializeBib, validateBib, createBibEditor, preflightBib,
} from '../bib/index.mjs';
```

- 路径解析：`apps/web/src/main.js` → `apps/web/bib/index.mjs`。
- esbuild 会把它打进 `editor.mjs`；不 import 则完全不参与构建。

## 2. 打开 `.bib`

现有文件输入是 `<input id="file" type="file" accept=".tex">`
（[index.html](../../apps/web/index.html#L15)），打开逻辑在
[main.js](../../apps/web/src/main.js#L386-L390)。建议**新增**一个独立入口，而不是
改现有 `.tex` 分支：

```js
// 建议新增（示意）
const bibInput = document.createElement('input');
bibInput.type = 'file';
bibInput.accept = '.bib';
bibInput.addEventListener('change', async () => {
  const file = bibInput.files?.[0];
  if (!file) return;
  try {
    const document = await parseBibFile(file);
    openBibliography(document, file.name); // 主程序自己的 UI 流程
  } catch (error) {
    status.textContent = error.message;    // BIB502/BIB503/...
  }
});
```

`parseBibFile` 使用严格 UTF-8：非 UTF-8 文件会得到 `BIB502`，不会静默替换字符。
如果希望沿用现有的 File System Access 句柄逻辑，用 `await handle.getFile()` 后
同样调用 `parseBibFile`。

## 3. 初始化 Editor Engine

```js
const editor = createBibEditor(document, {
  profile: 'biblatex',      // 或 'bibtex'；不选则 'generic'
  strict: false,
  onListenerError: error => console.error('Bib UI listener', error),
});
```

- `document` 可以是 `parseBib`/`parseBibFile` 的结果，也可以直接传 `.bib` 字符串。
- 构造时不会修改文档；`getDocument()` 返回冻结快照。

## 4. 读取与展示

```js
const entries = editor.getEntries();        // 全部条目（冻结）
const entry = editor.getEntry('knuth1984'); // 单个条目或 null
const resolved = resolveEntry(entry, editor.getDocument());
// resolved.fields.author / title / year …（宏已展开）

const { results, total, truncated } = editor.searchEntries('knuth', { limit: 20 });
const report = editor.validate();           // 供 UI 显示问题列表
```

- 展示字段时优先用 `resolveEntry`/`getEntryValue`，它们会展开 `@string` 与月宏；
  原始写法仍在 `entry.fields[i].value` 中。
- 重复 key 的条目全部存在；`getEntry` 返回第一个。修改/删除/重命名需要
  `options.occurrence`（0-based、源码顺序），否则返回 `BIB409`；重命名重复 key
  会报告 `ambiguous:true`，不要假设 `.tex` 引用能区分具体条目。

## 5. 修改并保存

```js
const result = editor.addEntry({
  key: 'lineae2026',
  type: 'software',
  fields: { author: 'Aminiam, Eva', title: 'Lineae', year: '2026' },
});
if (!result.ok) {
  // result.error.code: BIB402/BIB403/BIB404/BIB405/BIB409...
}

editor.updateEntry('lineae2026', {
  fields: { url: 'https://github.com/AminiamEva/Lineae', note: null },
});

// 编译前必须用最新序列化输出重新解析；不能依赖编辑前的 validate()
const preflight = preflightBib(editor.getDocument());
if (!preflight.ok) {
  showDiagnostics(preflight.diagnostics);
  return;
}
const text = preflight.text;      // 等价于 serializeBib，但已通过编译前检查
downloadText(text);               // 复用现有下载/保存逻辑
```

**重要**：字段值是 LaTeX 原文，引擎不做自动转义。用户输入的 `&`、`%`、`_` 等
是否需要写成 `\&`、`\%`、`\_` 由主程序根据字段语义与 UI 约定决定；引擎只拒绝
不平衡花括号和控制字符（`BIB405` / `BIB301`）。

保存时建议沿用现有的 `downloadText`/`showSaveFilePicker`
（[main.js](../../apps/web/src/main.js#L331-L356)），文件名后缀换成 `.bib`。

## 6. 引用与重命名

### 6.1 插入 `\cite`

Bib 引擎不修改 `.tex` 文档树。主程序可以：

- **最小方案**：在 ProseMirror 中插入 `\cite{key}` 文本（现有 `raw` 节点或普通文本），
  由 `.tex` 导出管线原样输出；
- **完整方案**：新增一个 `cite` atom 节点（类似 `ref`），需要修改 `main.js` 与
  `latex-codec.js`，属于现有文件修改，**必须批准**。

### 6.2 重命名并检查 `.tex`

```js
const texSource = sourceView.value; // 当前 .tex 文本
const renamed = editor.renameEntry('knuth1984', 'knuth84', { texSource });
if (renamed.ok && renamed.externalReferences.length) {
  // 列出位置：renamed.externalReferences = [{command, key, start}]
  const applied = applyCitationRenames(texSource, { knuth1984: 'knuth84' });
  // applied.text 是替换后的 .tex（只替换 key token）
}
```

- `renameEntry` 自动同步 `.bib` 内的 `crossref`、`xdata`、`entryset`、`related`。
- `.tex` 不会被自动改写；`applyCitationRenames` 返回新文本，是否采用由主程序决定。
- 若 `.tex` 是多文件项目，`scanTexCitations` 只能看到传入的文本；需要主程序遍历
  所有文件后分别扫描/替换。

## 7. 选择文献后端（BibTeX 还是 Biber）

项目当前没有声明后端，因此**必须由主程序决定**。两种接入方式：

### 7.1 BibTeX + `\bibliography`

```latex
\bibliographystyle{plain}   % 或项目选定的 .bst
\bibliography{refs}         % 编译：xelatex → bibtex → xelatex ×2
```

### 7.2 BibLaTeX + Biber

```latex
\usepackage[backend=biber,style=numeric]{biblatex}
\addbibresource{refs.bib}
...
\printbibliography            % 编译：xelatex → biber → xelatex ×2
```

建议：

- 在 UI 中让用户选择后端，或根据现有模板检测（`\usepackage{biblatex}` /
  `\bibliography` / `\addbibresource`）。
- 序言注入应放在主程序一侧的独立函数中；**不要改 `packages.mjs` 的既有规则**
  （它只识别编辑器产生的宏包特征）。
- 校验时使用对应 profile：`validateBib(doc, { profile: 'bibtex' | 'biblatex' })`。
- 不要假设 XeLaTeX 会直接读取 `.bib`；它只读取 `.bbl`。

## 8. 错误处理

```js
// 业务错误（预期分支）：返回结果对象
const result = editor.updateEntry('missing', { fields: { title: 'x' } });
if (!result.ok) {
  switch (result.error.code) {
    case 'BIB401': /* 不存在 */ break;
    case 'BIB402': /* 重复 key */ break;
    case 'BIB409': /* 重复 key 歧义：需要 options.occurrence */ break;
    default: console.warn(result.error.message);
  }
}

// 编程/环境错误（异常）：try/catch
try {
  const document = await parseBibFile(file);
} catch (error) {
  if (error.code === 'BIB502') { /* 非 UTF-8 */ }
}
```

- 解析出的数据问题不会抛异常；用 `document.diagnostics` 或 `validateBib` 展示。
- `formatDiagnostic(diagnostic, sourceText)` 可直接生成带行号与 `^` 的文本。

## 9. 事件与销毁

```js
const unsubscribe = editor.subscribe(event => {
  if (event.type === 'change') refreshList(event.document.entries);
});
// ...
unsubscribe();
editor.destroy();
```

- 每次成功提交一次事件；批量操作合并。
- `destroy()` 幂等；之后调用其它方法抛 `BIB406`。
- 引擎不实现 undo/redo。若需要，保存 `editor.getDocument()` 快照并自行恢复
  （重新 `createBibEditor(snapshot)`）。

## 10. 对现有文件的最小改动建议（未实施）

| 位置 | 建议改动 | 风险 |
|---|---|---|
| [index.html](../../apps/web/index.html#L15) | 新增 `.bib` 文件入口（单独控件） | 低 |
| [main.js](../../apps/web/src/main.js#L386-L390) | 分支处理 `.bib`，调用 `parseBibFile` | 中：涉及 UI 状态 |
| [main.js](../../apps/web/src/main.js#L247-L263) | 新增文献面板/状态 | 中 |
| [latex-codec.js](../../apps/web/src/editor/latex-codec.js#L63-L64) | 若要 `\cite` atom 节点，增加序列化分支 | 高：现有文件 |
| [packages.mjs](../../apps/web/latex/packages.mjs#L3-L14) | 不建议改；在主程序侧独立注入 | — |
| [package.json](../../package.json) | 无需新增依赖；可选加测试脚本 | 低（仍需批准） |

以上都未执行；本模块可在完全不改现有文件的情况下独立运行与测试。

## 11. 集成自测建议

1. 用 `tests/bib/fixtures/classic.bib` 打开，确认条目数 5、无 error。
2. 修改一个标题，导出，`diff` 只应出现该行。
3. 重命名一个被 `crossref` 引用的父条目，确认子条目字段同步。
4. 保存后再打开，字节不变（未继续编辑时）。
5. 在 Node 侧运行 `node --test --test-isolation=none "tests/bib/*.test.mjs"`。
