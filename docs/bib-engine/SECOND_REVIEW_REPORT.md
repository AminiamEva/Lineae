# 第二轮独立质量审查报告

> 审查对象：第一轮 Bib Backend（`apps/web/bib/`，41 个新增文件）及其文档。
> 审查日期：2026-11-10（Asia/Shanghai）。
> 审查原则：不修改或覆盖任何现有文件；发现源码问题先报告；不以 Parser 测试
> 通过替代真实编译；不伪造未执行的结果。
> 第二轮新增：**43 项单元测试 + 19 个真实编译组合 + 2 个无修改往返 + 1 个独立示例**。
> 第二轮结果：**167/167 测试通过；19/19 编辑编译通过；0 个上游文件被修改**。
> 第三轮（最终收尾）已修正 F1–F7/F9 并扩至 **182 项测试**，见 §0 与
> [FINAL_ACCEPTANCE_REPORT.md](FINAL_ACCEPTANCE_REPORT.md)。

## 0. 最终收尾状态（第三轮）

| 发现 | 状态 | 处理 |
|---|---|---|
| F1 文档承诺过大 | **已修正** | API.md / XELATEX 文档区分"重写条目""原始损坏""未知命令/字段""新建/修改" |
| F2 `verify` 语义边界 | **已修正（文档）** | API.md 明确 verify 仅语法回读；语义由独立测试覆盖 |
| F3 重复 key 歧义 | **已修正** | 新增 `BIB409 AMBIGUOUS_KEY` 与 `occurrence`；update/remove/rename 不再模糊修改 |
| F4 编译前诊断 | **已修正** | 新增公共 `preflightBib`；编译 harness 必须先通过最新输出重解析 |
| F5 扫描器宏定义 | **已记录限制** | 不引入不完整 LaTeX 解析器；API.md 与测试明确 |
| F6 `applyCitationRenames` 非法 key | **已修正** | 使用与 Editor 相同的 key 校验，非法值抛 BIB504 |
| F7 非法序列化参数 | **已修正** | `bom`/`finalNewline`/`verify`/`preserveFormatting` 均校验，抛 BIB504 |
| F8 `nocite{*}` 的 uncited 语义 | **已修正（文档）** | API.md 明确 `uncited` 是"无显式 cite"，调用方先检查 `nociteAll` |
| F9 旧 `verify-xelatex` 探测 | **已修正** | Poppler 使用 `-v`；真实运行 2/2 PASS（`.bbl` + PDF 文本） |
| F10 profile 规则未完整公开 | **保留（Info）** | 仍为已知文档缺口，见 §4/§5 |
| F11 新测试未入 CI | **保留（Info）** | 受"不修改 CI"约束，需负责人批准 |

第三轮最终结果：**182/182 测试通过**；19/19 编辑编译、2/2 往返、0 上游文件修改。


## 1. 结论摘要

1. **功能层面没有发现阻塞性缺陷**。10 类 Editor 操作在 BibTeX 与 Biber 下均生成
   可处理 `.bib`、可编译 PDF；无修改往返在页面图像级别完全一致。
2. **发现 1 个需要修正的文档承诺（P1）**：API 文档声称"语法符合 BibTeX/Biber
   共同子集"，但引擎会逐字节保留输入中已存在的损坏条目；这类文档可能无法编译。
   引擎的实际保证应表述为"重写条目语法有效 + 原文错误保留并诊断"，不是"修复并
   保证可编译"。
3. **发现 3 个中等风险的设计/验证缺口（P2）**：
   - `serializeBib` 的 `verify` 只做语法回读，不做语义比较（外部测试已补）；
   - 重复 key 的文档在 Editor 中存在"删除第一个后第二个变成 getEntry 结果"的
     歧义，文档未说明；
   - 未知/损坏结构被原样保留，但可能让外部 BibTeX/Biber 失败；"保留"必须与
     "可编译"分开描述。
4. **发现若干低风险限制（P3）**：扫描器会把 `\newcommand` 定义体里的 `\cite`
   当引用；`applyCitationRenames` 不校验新 key 语法；无效 `bom`/`finalNewline`
   被静默忽略；第一轮的 `verify-xelatex.mjs` 用 `--version` 探测 Poppler，导致
   已安装 `pdftotext` 时仍跳过 PDF 文本比较（本轮新 harness 已修正探测）。
5. **独立使用能力已验证**：`tests/bib/examples/bib-backend-demo.mjs` 仅从
   `index.mjs` 导入，完成导入、解析、编辑、搜索、新增、修改、删除、引用检查、
   导出、销毁，不需要 UI/Tiptap/主程序。
6. **交付判定**：**后端模块达到可交付标准**（功能、真实编译、视觉回归、独立示例
   均通过）；**作为正式发布仍有条件**：P1 文档必须收窄承诺，P2 的重复 key 策略
   需要产品决策，新测试尚未接入 CI。

## 2. 审查方法

- 复读第一轮源码与文档，不做假设；运行原有 124 项测试。
- 新增独立测试（不修改原有文件）：
  - `tests/bib/compile/`：10 类编辑 × 2 backend 的编译矩阵、独立手写预期；
  - `tests/bib/pdf/`：页数/文本/字体/行距/缩进/图像比较纯函数与测试；
  - `tests/bib/api-contract.test.mjs`：公共 API 异常/返回结构；
  - `tests/bib/examples/`：仅公共入口的端到端示例。
- 在临时目录安装便携 TeX Live 2026（XeTeX/BibTeX/Biber）与 Poppler 26.09.0，
  执行真实编译与渲染；工具未写入仓库。
- 用上游 blob SHA-1 清单复核现有文件未被修改。

## 3. 测试与编译结果

### 3.1 单元/契约测试

| 套件 | 数量 | 结果 |
|---|---:|---|
| 第一轮原有（8 个文件） | 124 | 124 通过 |
| 新增 compile case 预期 | 12 | 12 通过 |
| 新增 API 契约 | 18 | 18 通过 |
| 新增 PDF 视觉纯函数 | 11 | 11 通过 |
| 新增独立示例 | 2 | 2 通过 |
| 第三轮最终契约（重复 key/preflight/参数） | 15 | 15 通过 |
| **合计** | **182** | **182 通过 / 0 失败 / 0 跳过** |
| 既有应用测试（latex/config/tex-compat） | 16 | 16 通过 |

### 3.2 真实编译（L3 + L4）

| 项目 | 结果 |
|---|---|
| 编辑组合 | 19 / 19 PASS |
| 失败 | 0 |
| 未验证 | 0 |
| 无修改往返 | 2 / 2 PASS（BibTeX + Biber） |
| 页面图像（往返） | 0 像素差异 |
| 页面图像（可见编辑） | 0.019% – 1.579%，局部变化 |
| 页数 | 全部 1 → 1 |
| 字体 | 全部与基线一致 |
| 参考文献悬挂缩进违规 | 全部 0 |

工具版本：XeTeX 3.141592653-2.6-0.999998（TeX Live 2026）、BibTeX 0.99e、Biber 2.22、
Poppler 26.09.0。详细数据见 [EDITOR_COMPILE_TEST_REPORT.md](EDITOR_COMPILE_TEST_REPORT.md)
与 [PDF_VISUAL_VALIDATION.md](PDF_VISUAL_VALIDATION.md)。

## 4. 发现（按严重程度）

### F1 — P1：API/架构文档对"可编译性"的承诺过大

**证据**

- [API.md](API.md#L488-L495)："保证语法符合 BibTeX/Biber 的共同子集"。
- [XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md#L44-L57)：第 1 条"语法有效"，
  同时第 7 条又说"无法解析的条目逐字节保留"。
- 实际行为：`parseBib('@misc{k, title={x}')` 产生 error 诊断，但
  `serializeBib()` 原样返回损坏文本；`serializeBib(..., {verify:true})` 才抛
  `BIB302`。测试见 `tests/bib/api-contract.test.mjs`
  "serializer verify has a documented boundary for already-broken input"。
- 第一轮损坏夹具同样逐字节保留（`tests/bib/fixtures/broken-*.bib`）。

**影响**：集成方可能误以为"parse 成功/无异常"就等于"可编译"。实际必须检查
`document.diagnostics`/`validateBib()`，且损坏内容可能让 BibTeX/Biber 失败。

**已实施修正（第三轮）**：API.md 的稳定性/可编译性章节已按上述边界重写；
XELATEX_CONSISTENCY §3.1 改为"被重写条目的语法有效；原文错误保留并诊断"；
新增 `preflightBib` 作为编译前门槛。

---

### F2 — P2：`serializeBib` 的 `verify` 只验证语法，不验证语义

**证据**：[serializer.mjs](../../apps/web/bib/serializer.mjs#L86-L94) 的
`shouldVerify` 只重新解析并检查 `hasErrors`；不比较字段、key、类型或宏解析结果。
原文有错误时 `verify:'auto'` 直接跳过。

**影响**：如果未来序列化逻辑出现"丢字段但输出语法合法"的回归，`verify` 不会
发现。当前 10 个编辑 case 未出现该问题；本轮新增的
`checkSemanticInvariants()` 在测试中独立比较 key/type/所有解析后字段值，已覆盖
这一点。

**第三轮处理（已完成）**：API.md 已写明 `verify` 只做语法回读，不是外部编译、
语义或排版证明；独立语义测试保留。`preflightBib` 使用 `verify:false` 并对最新
输出重新解析，专门用于编译前检查。

---

### F3 — P2：重复 key 文档在 Editor 中的删除/更新语义未定义

**证据**：[editor.mjs](../../apps/web/bib/editor.mjs#L305-L306) 的 `planUpdate`、
[L427-L428](../../apps/web/bib/editor.mjs#L427-L428) 的 `planRemove`、
[L467-L468](../../apps/web/bib/editor.mjs#L467-L468) 的 `planRename` 旧实现都使用
`findEntryByKey`（返回第一个）。删除第一个后，第二个同 key 条目成为新的
`getEntry('k')`。

实测（`tests/bib/api-contract.test.mjs`）：

```text
getEntries() = 2
getEntry('k') = A
removeEntry('k') → getEntries() = 1, getEntry('k') = B
```

文档只说明 `getEntry` 返回第一个、`addEntry`/`renameEntry` 拒绝新重复，未说明
对**已存在重复**的 update/remove/rename 行为。

**第三轮修正（已完成）**：新增 `BIB409 AMBIGUOUS_KEY`；`updateEntry`/`removeEntry`/
`renameEntry` 在 key 重复且未指定 `options.occurrence` 时拒绝操作，不再自动选中
第一个。`occurrence` 从 0 开始按源码顺序；唯一 key 可省略。重命名重复 key 时
`ambiguous:true`、库内引用不重写、`.tex` 引用标记 `externalReferencesAmbiguous`。
旧行为（删除第一个后第二个成为 `getEntry`）仅作为历史审查证据保留。

---

### F4 — P2：未知/损坏结构可能让外部工具失败，文档需与 F1 一起收窄

**证据**：`broken` 块、未知 `@command`、不完整条目均原样输出（parser 的
`broken`/`text` 块）；BibTeX/Biber 对这些内容的容忍度不同。引擎的 `error`
诊断能提示，但 `serializeBib` 不会阻止（除非 `verify:true` 且原文干净）。

**第三轮修正（已完成）**：新增 `preflightBib(document)`：
`serializeBib(verify:false)` → 对最新文本 `parseBib` → errorCount。编译 harness
在写 `.bib` 前必须通过它；文档明确"保留 ≠ 可编译"。

---

### F5 — P3：`.tex` 扫描器会把 `\newcommand` 定义体里的 `\cite` 当成真实引用

**证据**：[tex-citations.mjs](../../apps/web/bib/tex-citations.mjs#L125-L155)
使用 `\...cite...` 正则；`\newcommand{\mycite}[1]{\cite{#1}}` 会得到两条
citation（`mycite` 无 key；`cite` key 为 `#1`）。测试
`tests/bib/api-contract.test.mjs` 明确记录该行为。

**影响**：`checkTexCitations` 可能报告不存在的 key；`applyCitationRenames` 可能
替换宏定义体中的占位符（如果匹配）。实际项目模板目前没有这种情况，但用户文档
可能出现。

**第三轮处理（已记录限制）**：未引入不完整的 LaTeX 宏定义解析器。API.md 明确
"不解析 `\newcommand`/`\renewcommand`/`\def` 宏体，宏定义内的 `\cite` 会被当作
引用"；`final-contract.test.mjs` 固定该边界。调用方应避免对含宏定义的源码直接
自动重命名。

---

### F6 — P3：`applyCitationRenames` 不校验新 key 语法

**证据**：`applyCitationRenames('\\cite{a}', {a:'bad key'})` 返回
`\cite{bad key}`；只拒绝空/非字符串。测试见 API 契约套件。

**影响**：调用方可生成不可编译的 `.tex`。`renameEntry` 本身会拒绝非法 key，但
该辅助函数是独立入口。

**第三轮修正（已完成）**：`applyCitationRenames` 对 object/Map 的所有替换 key
使用与 Editor 相同的 `validateKey`；非法值（空、空格、`{}`、`,` 等）抛
`BIB504`，不会生成非法 `.tex`。测试见 `final-contract.test.mjs`。

---

### F7 — P3：部分 Serializer 选项非法值被静默忽略

**证据**：`eol` 非法会抛 `BIB504`，但 `bom:'bogus'` 与
`finalNewline:'bogus'` 被当作默认值。测试见 API 契约套件。
**第三轮修正（已完成）**：`serializeBib` 现在校验 `eol`、`bom`、
`finalNewline`、`preserveFormatting`、`verify`；非法值统一抛 `BIB504`。测试覆盖
合法与非法枚举值。

---

### F8 — P3：`\nocite{*}` 时 `uncited` 仍列出全部条目

**证据**：`checkTexCitations('\\nocite{*}', doc)` 返回
`{nociteAll:true, uncited:['a','b']}`。API 只说明 `\nocite{*}` 不参与 missing，
未说明 `uncited` 的含义。

**影响**：UI 若直接显示"未被引用"会误导（实际全部文献都会进入参考文献表）。

**第三轮修正（文档）**：API.md 明确 `uncited` 表示"无显式 cite"，当
`nociteAll === true` 时所有条目仍会进入参考文献表；调用方先检查 `nociteAll`。
未改变返回值以保持兼容。

---

### F9 — P3：第一轮 `verify-xelatex.mjs` 的 Poppler 探测错误，且 L4 能力不足

**证据**：[verify-xelatex.mjs](../../tests/bib/verify-xelatex.mjs#L39-L50) 对所有
工具使用 `--version`；Poppler 工具只支持 `-v`，因此即使安装了 Poppler，
`pdftotext` 也被判定为缺失（本轮真实运行输出 "pdftotext not installed; PDF text
comparison skipped"）。同时该脚本只比较 `.bbl` 与文本，不比较页面图像。

**第三轮修正（已完成）**：`resolveTool` 对 `pdf*` 工具使用 `-v`。在真实
XeLaTeX/Poppler 环境下重新运行 `verify-xelatex.mjs`：**2/2 PASS，`.bbl` 与 PDF
文本一致**。完整页面图像比较仍由新 harness 负责。

---

### F10 — P3/Info：profile 的必需字段与类型规则没有完整文档化

**证据**：`validator.mjs` 内部有 `BIBTEX_TYPES`/`BIBLATEX_TYPES`/`REQUIRED_FIELDS`
表，但 [API.md](API.md#L124-L126) 只列检查类别；[XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md#L30-L38)
只列 profile 差异概览。
**影响**：用户无法从公开文档预测某个条目会得到哪条 warning。
**建议**：发布规则表或导出只读常量（需改源码，未执行）。

### F11 — Info：新测试未进入 CI，构建未在本环境执行

- 未修改 `.github/workflows/pages.yml` 与 `package.json`（遵守约束）。
- 无 npm 环境，未运行 `npm run build`；引擎零依赖且不参与构建。
- 建议获准后新增一个独立 CI step（Node 测试；有 TeX 时再跑编译矩阵）。

## 5. 任务 §5 的逐项回答

### 5.1 API.md 的"共同语法子集"与"损坏条目保留"是否矛盾？

**第二轮曾存在措辞矛盾；第三轮已修正**。当前 API.md 明确区分：
可识别且通过校验的结构、原始已损坏结构、未知命令/字段、新建/修改条目；并明确
含 error 诊断的完整文档不保证可编译。见 F1、F4 与
[API.md](API.md#31-可编译性边界重要)。

### 5.2 Serializer 对原始错误内容的处理是否有明确边界？

代码边界明确（未修改内容原样输出；`verify:'auto'` 在原文有错时跳过；`verify:true`
强制回读并可能抛 `BIB302`）。**第三轮已在 API.md 明确说明** `verify` 只做语法
回读，不证明外部编译/语义/排版；`preflightBib` 单独承担编译前检查。见 F2。

### 5.3 Parser 对未知结构的处理是否可能造成外部工具编译失败？

**可能**。未知 `@command`、损坏条目、无法识别的区域被保留；BibTeX/Biber 可能
报错或忽略。第三轮新增 `preflightBib` 并要求编译前使用；文档已把它写成硬门槛。
见 F4。

### 5.4 BibTeX 与 Biber profile 的校验规则是否明确？

**部分明确**：profile 名称、重复 key 严重程度、必需字段检查、crossref/xdata
继承在代码中实现；但完整的类型/必需字段表未公开文档化，F10。二者不是简单的
"BibTeX vs Biber"二值差异，样式（`.bst`/`.bbx`）才是最终决定因素。

### 5.5 Editor 对重复字段和重复 key 的行为是否与文档一致？

- **重复字段**：文档说"所有同名字段一起更新"；代码确实更新全部，并保留
  duplicate 标记；一致。校验器对编辑后文档报告 `BIB116`。
- **重复 key**：`getEntry` 返回第一个；add/rename 拒绝新重复；第三轮新增
  `BIB409` + `options.occurrence`，update/remove/rename 不再模糊操作；重命名
  重复 key 会报告 `ambiguous:true` 且不自动改写引用。文档与测试已一致（F3 已
  修正）。

### 5.6 Tex Citation Scanner 的支持范围是否准确？

**总体准确但偏乐观**：

- 准确：可选参数、多 key、复数命令、注释遮蔽、`\nocite{*}`、资源命令、`\citestyle`
  排除、分组合并等均有测试。
- 已明确限制：宏定义体（`\newcommand`/`\def`）中的 `\cite` 会被当作真实引用
  （F5，已在 API.md 记录并有测试）；`\verb`/`\input` 同样在限制中；`\nocite`
  的 `uncited` 语义已在第三轮写入文档（F8）。

### 5.7 所有公共 API 的异常和返回结构是否有测试覆盖？

新增 `tests/bib/api-contract.test.mjs`（18 项）覆盖：

- 导出面、诊断码唯一性；
- `parseBib` 非字符串/`throwOnError`/`maxDiagnostics`；
- `parseBibFile` 非 Blob/非法 UTF-8；
- `serializeBib` 非文档/非法 EOL/不安全值/verify 边界；
- `validateBib` 未知 profile/冻结报告；
- `createBibEditor` 非文档、subscribe 参数、销毁后行为；
- 全部 Editor 错误码 BIB401–BIB408 的可达性；
- `scanTexCitations`/`checkTexCitations`/`applyCitationRenames` 参数错误；
- 查询辅助与诊断格式化。

**未覆盖/保留项**：`BIB302` 只能由强制 verify 触发（已覆盖 broken 输入）；
profile 完整规则表仍未公开（F10）；CI 未接入（F11）；扫描器宏定义限制已记录。
重复 key、preflight、参数校验、非法 rename 等已由 `final-contract.test.mjs`
（15 项）覆盖。见 F3/F5/F6/F7/F8。

## 6. 公共 API 独立使用验证

`tests/bib/examples/bib-backend-demo.mjs`：

- 只导入 `apps/web/bib/index.mjs`；Node 标准库仅用于读文件；
- 流程：读 `base.bib` → `parseBib` → `createBibEditor` → `searchEntries('Turing')`
  → `addEntry('shannon1948')` → `updateEntry('knuth1984', year 2025)` →
  `removeEntry('turing1950')` → `checkTexCitations` → `preflightBib` → `destroy`；
- 实测：解析 6 条、搜索命中 Turing、新增 Shannon、更新 2025、删除 Turing、
  导出 6 条、缺失引用 0、销毁后访问抛 `BIB406`；
- 2 项测试通过（功能 + 仅公共入口/无 DOM/无 Tiptap 静态检查）。

结论：**不需要 UI、Tiptap、ProseMirror 或主程序即可运行**。

## 7. 文件保护与依赖

- 上游 50 个文件：`Modified: 0 / Missing: 0 / Unexpected: 0`（blob SHA-1）。
- 第三轮按授权修改了第一/二轮新增的 Bib 模块源码、测试与文档；**没有修改任何
  上游 50 文件**，没有修改 `main.js`、`package.json`、lock、CI、README。
- 新增依赖：0；临时 TeX/Poppler 位于系统临时目录，不入库。
- `verify-upstream.mjs` 当前输出 `New files: 59`（41 + 第二轮 15 + 第三轮 3）。

第三轮新增文件：

| 路径 | 说明 |
|---|---|
| `apps/web/bib/preflight.mjs` | 编译前检查 API |
| `tests/bib/final-contract.test.mjs` | 重复 key/preflight/参数校验测试 |
| `docs/bib-engine/FINAL_ACCEPTANCE_REPORT.md` | 最终验收报告 |

第三轮修改（授权范围内，不含上游文件）：
`diagnostics.mjs`、`editor.mjs`、`serializer.mjs`、`tex-citations.mjs`、`index.mjs`；
`tests/bib/api-contract.test.mjs`、`browser-compat.test.mjs`、`editor.test.mjs`、
`compile/cases.test.mjs`、`compile/run-editor-compile.mjs`、
`examples/bib-backend-demo.mjs`、`examples/standalone-example.test.mjs`、
`verify-xelatex.mjs`；`API.md`、`ARCHITECTURE.md`、`DATA_MODEL.md`、
`TEST_REPORT.md`、`SECOND_REVIEW_REPORT.md`、`XELATEX_CONSISTENCY.md`、
`INTEGRATION.md`。

## 8. 最终问题回答

1. **Editor 操作后的 `.bib` 能否通过真实 BibTeX/Biber？**
   **能**。19/19 组合生成有效 `.bbl`，退出码 0。
2. **能否通过 XeLaTeX 编译？**
   **能**。19/19 生成 PDF；无 `-halt-on-error` 失败。
3. **无修改往返是否保持原始排版？**
   **是**（本夹具/工具版本范围内）。`.bib` 字节一致，`.bbl`/文本一致，页面图像
   0 像素差异。
4. **修改后的排版是否符合预期？**
   **是**（测试覆盖范围内）。作者/标题/年份/DOI/期刊/crossref/新增/删除均按独立
   预期出现；key 与未知字段不改变视觉输出。
5. **PDF 视觉比较是否通过？**
   **通过**：页数、文本、字体、行距、参考文献缩进、页面图像全部通过；可见修改
   为局部差异，未发生全局重排。
6. **是否发现 API 或架构设计缺陷？**
   第二轮发现 1 个 P1 文档承诺、3 个 P2、若干 P3；第三轮已修正 F1–F7/F9，
   F5/F8 以限制/文档方式收敛，F10/F11 保留为已知非阻塞项。**未发现阻塞编译
   或数据丢失的功能缺陷**；F3 的重复 key 语义现由 BIB409 + occurrence 明确。
7. **当前是否达到正式交付标准？**
   **是（在声明的范围内）**：
   - 182/182 测试通过；原 167 项数量全部保留（未删除/跳过；重复 key 与参数相关
  断言按新契约更新）；
   - 19/19 编辑编译、2/2 往返、L3/L4 PASS；
   - 上游 50 文件零修改；无新增依赖；
   - 重复 key、preflight、参数校验、扫描器限制均有文档与测试；
   - 已知剩余项：F10（profile 规则表未完整公开）、F11（未接入 CI）、单页英文
     夹具、扫描器宏定义限制。它们不阻塞后端模块交付，但应在正式发布说明中
     保留。**不能宣称"任意 `.bib` 都可编译/排版一致"**；承诺范围以
     [API.md](API.md#31-可编译性边界重要) 与
     [XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md) 为准。

## 9. 证据索引

- 编辑编译矩阵：[EDITOR_COMPILE_TEST_REPORT.md](EDITOR_COMPILE_TEST_REPORT.md)
- PDF 视觉方法/数据：[PDF_VISUAL_VALIDATION.md](PDF_VISUAL_VALIDATION.md)
- 第一轮测试报告：[TEST_REPORT.md](TEST_REPORT.md)
- API：[API.md](API.md)、数据模型：[DATA_MODEL.md](DATA_MODEL.md)、
  XeLaTeX 边界：[XELATEX_CONSISTENCY.md](XELATEX_CONSISTENCY.md)
- 新增测试：
  `tests/bib/api-contract.test.mjs`、`tests/bib/compile/cases.test.mjs`、
  `tests/bib/pdf/visual-lib.test.mjs`、`tests/bib/examples/standalone-example.test.mjs`。
- 上游核验：`node tests/bib/verify-upstream.mjs`。
