# 最终验收报告：Lineae Bib Backend

> 验收日期：2026-11-10（Asia/Shanghai）
> 验收对象：`apps/web/bib/`（第一轮 41 文件 + 第二轮 15 文件 + 第三轮收尾）。
> 结论：**后端模块达到正式交付标准（在本文声明的范围内）**。
> 所有结果均为实际执行；没有把 UNVERIFIED 计为 PASS。

## 1. 最终结果

| 项目 | 结果 |
|---|---|
| 公共入口 | `apps/web/bib/index.mjs`（唯一） |
| 测试总数 | **182 / 182 通过**，0 失败、0 跳过 |
| 第一轮原有测试 | **124 / 124 通过**（数量保留） |
| 第二轮原有测试 | **43 / 43 通过**（数量保留；少量断言按新契约更新） |
| 第三轮新增测试 | **15 / 15 通过** |
| 既有应用测试 | 16 / 16 通过 |
| BibTeX/Biber 真实编译 | **19 / 19 组合 PASS** |
| XeLaTeX 编译 | **19 / 19 PDF 生成** |
| 无修改往返 | **2 / 2 PASS，页面图像 0 像素差异** |
| 第一轮 `verify-xelatex` | **2 / 2 PASS**（`.bbl` + PDF 文本） |
| 上游 50 文件 | **Modified 0 / Missing 0 / Unexpected 0** |
| 新增依赖 | **0** |
| 未验证项 | **0**（本轮环境具备 TeX/Poppler） |

工具版本：XeTeX 3.141592653-2.6-0.999998（TeX Live 2026）、BibTeX 0.99e、
Biber 2.22、Poppler 26.09.0、Node.js v24.21.0。

## 2. 本轮修正（F1–F5 与扫描器）

### F1 可编译性保证收窄

- `API.md` 新增"3.1 可编译性边界"：区分可识别且通过校验的结构、原始损坏结构、
  未知命令/字段、新建/修改条目。
- 明确：**含 error 诊断的完整文档不保证通过外部 BibTeX/Biber**；引擎保留原始
  错误，不修复。
- `XELATEX_CONSISTENCY.md` 的"语法有效"改为"被重写条目的语法有效；原文错误
  保留并诊断"。

### F2 重复 citation key 策略

- Parser 保留全部重复条目；Validator 继续用 `BIB117` 报告；`getEntry(key)` 仍返回
  第一个（兼容）。
- 新增稳定错误码 **`BIB409 AMBIGUOUS_KEY`**。
- `updateEntry` / `removeEntry` / `renameEntry` 在 key 重复且未指定
  `options.occurrence` 时拒绝，不猜测。
- `occurrence` 从 **0** 开始，按源码顺序；唯一 key 可省略。
  - 负数/非整数/字符串 → `BIB408`；
  - 越界 → `BIB401`（`details.count`、`occurrences`）；
  - 重复 key 重命名 → `ambiguous:true`、`ambiguity:{key,count,occurrences}`、
    `referencesSkipped:true`；不自动改写 `.bib` 引用；
  - `.tex` 引用存在时 `externalReferencesAmbiguous:true`。
- 删除重复 key 时返回 `occurrence`、`remainingWithKey`；若仍有同 key 条目，
  `danglingReferences` 为空（引用仍可解析）。

### F3 Serializer.verify 保证范围

- `API.md` 明确：`verify:true` 只验证"序列化输出能被当前 Parser 正确解析"。
- 明确它**不是**：外部 BibTeX/Biber 编译验证、语义完全一致性证明、PDF 排版验证。
- 独立语义测试 `checkSemanticInvariants()` 保留并在编译矩阵中使用。

### F4 编译前诊断检查

新增公共 API `preflightBib(document, options?)`：

```text
最终文档 → serializeBib(verify:false) → 对最新文本 parseBib
        → errorCount === 0 ? 允许编译 : 拒绝并返回最新 diagnostics
```

- 不依赖 dirty 文档的历史 `validate()`；
- 编译 harness 在写 `.bib` 前调用；
- 损坏 `.bib` 会被明确拦截；
- 测试覆盖干净/损坏/已编辑文档、非法选项。

### F5 参数校验

- `applyCitationRenames`：object/Map 的所有新 key 都使用与 Editor 相同的
  `validateKey`；非法 key 抛 `BIB504`。
- `serializeBib`：`eol`、`bom`、`finalNewline`、`preserveFormatting`、`verify`
  非法值统一抛 `BIB504`。
- 不再静默忽略非法参数。

### 扫描器限制

`\newcommand{\mycite}[1]{\cite{#1}}` 仍会被识别为 `mycite` + `cite` 两条记录。
完整支持宏定义需要不完整的 LaTeX 解析器，因此**不引入**；已在 `API.md` 明确记录，
并由 `final-contract.test.mjs` 固定行为。调用方应避免对含宏定义的源码直接自动
重命名。

## 3. 测试明细

| 套件 | 测试数 | 结果 |
|---|---:|---|
| lexer | 14 | 通过 |
| parser | 21 | 通过 |
| serializer | 18 | 通过 |
| validator | 17 | 通过 |
| editor | 22 | 通过 |
| roundtrip | 8 | 通过 |
| tex-citations | 13 | 通过 |
| browser-compat | 11 | 通过 |
| api-contract | 18 | 通过 |
| final-contract（第三轮） | 15 | 通过 |
| compile cases（引擎级） | 12 | 通过 |
| examples | 2 | 通过 |
| pdf visual-lib | 11 | 通过 |
| **合计** | **182** | **通过** |

```text
$ node --test --test-isolation=none "tests/bib/*.test.mjs" \
    tests/bib/compile/cases.test.mjs \
    tests/bib/examples/standalone-example.test.mjs \
    tests/bib/pdf/visual-lib.test.mjs
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

## 4. 真实编译/视觉验证

```text
$ node tests/bib/compile/run-editor-compile.mjs --tex-bin=... --poppler-bin=...
Summary: { pass: 19, fail: 0, partial: 0, unverified: 0 }
Layers:  engine=PASS  l3=PASS  l4=PASS
Round-trip: BibTeX=PASS (0 pixel diff), Biber=PASS (0 pixel diff)
```

10 类编辑（19 个 backend 组合）：

- 作者、标题、年份、DOI、citation key、新增、删除、crossref、`@string` 字段、
  未知字段；
- 全部生成可编译 PDF；`.bbl`/PDF 文本符合独立手写预期；
- 页数 1 → 1；字体集合一致；行距差 ≤ 0.01 pt；参考文献悬挂缩进违规 0；
- 可见编辑图像差异 0.019%–1.579%；key rename/unknown field **0 像素差异**。

第一轮脚本在修正 Poppler 探测后：

```text
PASS: .bbl and PDF text are identical.
PASS: .bbl and PDF text are identical.
exit 0
```

详细数据：[EDITOR_COMPILE_TEST_REPORT.md](EDITOR_COMPILE_TEST_REPORT.md)、
[PDF_VISUAL_VALIDATION.md](PDF_VISUAL_VALIDATION.md)。

## 5. 独立使用验证

`tests/bib/examples/bib-backend-demo.mjs` 仅从 `apps/web/bib/index.mjs` 导入，
完成：

```text
读 base.bib → parseBib → createBibEditor → searchEntries('Turing')
→ addEntry('shannon1948') → updateEntry('knuth1984', {year:2025})
→ removeEntry('turing1950') → checkTexCitations → preflightBib → destroy
```

实测：解析 6 条、搜索命中 Turing、新增/更新/删除成功、导出 6 条、
missing citations 0、preflight true、销毁后访问抛 `BIB406`。不需要 UI、Tiptap、
ProseMirror 或主程序。

## 6. 文件保护与变更

- 上游 50 文件：**0 修改**（blob SHA-1 清单核验）。
- 未修改 `main.js`、`package.json`、lock、现有 LaTeX 模块、CI、README。
- 新增文件总数：**59**（41 + 15 + 3）。
  - 第三轮新增：`apps/web/bib/preflight.mjs`、
    `tests/bib/final-contract.test.mjs`、本报告。
- 第三轮按授权修改的文件：
  - 引擎：`diagnostics.mjs`、`editor.mjs`、`serializer.mjs`、`tex-citations.mjs`、
    `index.mjs`；
  - 测试：`api-contract.test.mjs`、`browser-compat.test.mjs`、`editor.test.mjs`、
    `compile/cases.test.mjs`、`compile/run-editor-compile.mjs`、
    `examples/bib-backend-demo.mjs`、`examples/standalone-example.test.mjs`、
    `verify-xelatex.mjs`；
  - 文档：`API.md`、`ARCHITECTURE.md`、`DATA_MODEL.md`、`TEST_REPORT.md`、
    `SECOND_REVIEW_REPORT.md`、`XELATEX_CONSISTENCY.md`、`INTEGRATION.md`。
- 新增依赖：0；便携 TeX/Poppler 只在系统临时目录使用。

## 7. 验收条件对照

| # | 条件 | 结果 |
|---|---|---|
| 1 | 原有 50 个上游文件零修改 | **满足**（50/50，Modified 0） |
| 2 | 不增加依赖 | **满足**（package.json/lock 未改） |
| 3 | 原有 167 项测试继续通过 | **满足**（原 124 + 第二轮 43 全部通过） |
| 4 | 新增测试全部通过 | **满足**（15/15；总 182/182） |
| 5 | BibTeX/Biber/XeLaTeX 测试继续通过 | **满足**（19/19，L3/L4 PASS） |
| 6 | 重复 key 操作具有明确行为 | **满足**（BIB409 + occurrence + ambiguity） |
| 7 | API 文档与实现一致 | **满足**（F1–F5 已更新并有测试；F10 为非阻塞文档缺口） |
| 8 | 所有公共接口都有调用示例 | **满足**（API.md 覆盖每个函数/编辑器方法/错误类；新增 preflight、occurrence、查询/扫描示例） |
| 9 | 不存在未记录的重大已知问题 | **满足**（剩余项均在 §8 记录） |

## 8. 已知剩余限制（非阻塞）

1. **F10**：profile 的完整必需字段/类型表未在公开文档逐项列出（代码内实现）；
   用户可通过 `validateBib` 输出观察，但文档仍可更详尽。
2. **F11**：新测试未接入 CI；受"不修改 CI"约束，需要负责人批准后添加。
3. `.tex` 扫描器不解析宏定义体、`\verb`、`\input`；已记录并测试。
4. 编译/视觉夹具是单页英文 `article` + `plain`/`biblatex numeric`；未覆盖多页、
   双栏、图表、CJK 字体回退和所有样式。
5. `serializeBib.verify` 仍只做语法回读；语义由独立测试保证，编译/排版由 L3/L4
   harness 保证。调用方应使用 `preflightBib`。
6. 未做跨 TeX 版本回归；工具版本已固定。
7. `npm run build` 未在本环境执行（无 npm）；引擎零依赖且不参与构建。

以上限制已写入 API/架构/测试/审查文档，不构成未记录的重大问题。

## 9. 正式结论

**Lineae Bib Backend 达到正式交付标准**：

- 公共 API 统一、文档与实现一致；
- 重复 key、preflight、参数校验等剩余契约问题已解决；
- 真实 BibTeX/Biber/XeLaTeX 编译与 PDF 视觉回归通过；
- 182 项测试全部通过，原 167 项数量全部保留（未删除/跳过；少数断言随新契约更新）；
- 上游文件零修改、零新增依赖。

**保证范围**：引擎保证数据层语法/语义与已声明的编译前检查；不保证任意含错误的
`.bib` 或任意样式/文档都能编译或排版一致。该边界已在
[API.md](API.md#31-可编译性边界重要) 与
[XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md) 明确。

## 10. 复现

```bash
# 全部测试
node --test --test-isolation=none "tests/bib/*.test.mjs" \
  tests/bib/compile/cases.test.mjs \
  tests/bib/examples/standalone-example.test.mjs \
  tests/bib/pdf/visual-lib.test.mjs

# 既有应用测试
node --test --test-isolation=none tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs

# 真实编译 + L4
node tests/bib/compile/run-editor-compile.mjs \
  --tex-bin=<dir> --poppler-bin=<dir> --out=compile-report.json

# 第一轮脚本
PATH=<tex-bin>:<poppler-bin>:$PATH node tests/bib/verify-xelatex.mjs

# 上游零修改
node tests/bib/verify-upstream.mjs
```
