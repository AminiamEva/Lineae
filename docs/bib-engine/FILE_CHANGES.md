# 文件变更报告

> 基线：Lineae `main` @ `a79a8b9ca0f836eb241a75703ec0d3cac2a8c11e`
> （2026-11-09T15:34:59Z，50 个文件，本地副本与上游 blob 逐一比对一致）。
> 本次交付**只新增文件**，未修改、覆盖、删除或重构任何现有文件。

## 1. 现有文件修改情况

**0 个现有文件被修改。**

```text
$ node tests/bib/verify-upstream.mjs
Baseline: https://github.com/AminiamEva/Lineae @ a79a8b9ca0f836eb241a75703ec0d3cac2a8c11e
Upstream files checked: 50/50
Modified:   0
Missing:    0
Unexpected: 0
New files:  41
```

核验方法：`docs/bib-engine/verification/upstream-baseline.json` 记录了上游 50 个文件
的 Git blob SHA-1；`tests/bib/verify-upstream.mjs` 对工作区中所有不属于三个新增
目录的文件重新计算 `blob <size>\0<content>` 的 SHA-1 并逐一比对。任何修改、缺失
或目录外新增文件都会导致脚本以退出码 1 失败。

未修改的关键文件包括（不完整列举）：

- `apps/web/src/main.js`
- `apps/web/src/editor/*`（含 `references.js`、`latex-codec.js`）
- `apps/web/latex/*`
- `apps/web/index.html`、`apps/web/config.yaml`、`apps/web/pages.css`
- `package.json`、`package-lock.json`
- `tests/latex.test.mjs`、`tests/config.test.mjs`、`tests/tex-compat-parse.test.mjs`、
  `tests/editor.cjs`、`tests/fixtures/**`
- `.github/workflows/pages.yml`、`.gitignore`、`README.md`、`docs/EDITOR_ARCHITECTURE.md`

## 2. 新增文件（41）

### 2.1 引擎源码（9）

| 文件 | 行数 | 职责 |
|---|---:|---|
| `apps/web/bib/index.mjs` | 143 | 唯一公共入口、JSDoc、文件解码 |
| `apps/web/bib/diagnostics.mjs` | 270 | 诊断码、严重程度、定位、错误类 |
| `apps/web/bib/lexer.mjs` | 420 | 字符扫描 → token 流 + 词法诊断 |
| `apps/web/bib/parser.mjs` | 578 | token → `BibDocument`，错误恢复、格式模板 |
| `apps/web/bib/model.mjs` | 476 | 冻结、查询、宏解析、语义快照、键/值校验 |
| `apps/web/bib/serializer.mjs` | 228 | 无损/最小重写序列化、回读校验 |
| `apps/web/bib/validator.mjs` | 437 | generic/bibtex/biblatex 语义校验 |
| `apps/web/bib/editor.mjs` | 814 | 事务式编辑、搜索、批量、事件 |
| `apps/web/bib/tex-citations.mjs` | 317 | `.tex` 引用扫描、检查、重命名计划 |

### 2.2 测试（11）

| 文件 | 说明 |
|---|---|
| `tests/bib/lexer.test.mjs` | 14 项词法测试 |
| `tests/bib/parser.test.mjs` | 21 项语法/恢复/模型测试 |
| `tests/bib/serializer.test.mjs` | 18 项无损/最小重写测试 |
| `tests/bib/validator.test.mjs` | 17 项语义校验测试 |
| `tests/bib/editor.test.mjs` | 22 项编辑/事务/事件测试 |
| `tests/bib/roundtrip.test.mjs` | 8 项 parse→serialize→parse 测试 |
| `tests/bib/tex-citations.test.mjs` | 13 项 `.tex` 引用测试 |
| `tests/bib/browser-compat.test.mjs` | 11 项环境/导出/Blob 测试 |
| `tests/bib/helpers.mjs` | 夹具读取、块重建、断言辅助 |
| `tests/bib/verify-upstream.mjs` | 上游文件零修改核验 |
| `tests/bib/verify-xelatex.mjs` | L3/L4 编译验证（缺工具退出 2） |

### 2.3 测试夹具（11）

| 文件 | 说明 |
|---|---|
| `tests/bib/fixtures/classic.bib` | 经典 BibTeX：宏、拼接、preamble、嵌套括号、Unicode |
| `tests/bib/fixtures/biblatex.bib` | BibLaTeX：`@online`/`@dataset`/`@software`/`@thesis`/`@xdata` |
| `tests/bib/fixtures/crossref.bib` | crossref、entryset、related |
| `tests/bib/fixtures/messy.bib` | 重复 key/字段、缺逗号、多余逗号、括号条目、自定义类型、`@comment` |
| `tests/bib/fixtures/broken-brace.bib` | 未闭合花括号 |
| `tests/bib/fixtures/broken-quote.bib` | 未闭合引号 |
| `tests/bib/fixtures/broken-entry.bib` | 缺少条目闭合定界符 |
| `tests/bib/xelatex/bibtex/main.tex` | BibTeX 编译夹具 |
| `tests/bib/xelatex/bibtex/refs.bib` | BibTeX 数据（`\&`、`\%`、`@string`、月宏） |
| `tests/bib/xelatex/biblatex/main.tex` | Biber/BibLaTeX 编译夹具 |
| `tests/bib/xelatex/biblatex/refs.bib` | BibLaTeX 数据（`@online` 等） |

### 2.4 文档（10）

| 文件 | 说明 |
|---|---|
| `docs/bib-engine/PHASE_A_RESEARCH.md` | 阶段 A 架构调研报告 |
| `docs/bib-engine/PHASE_B_DESIGN.md` | 阶段 B 技术设计 |
| `docs/bib-engine/ARCHITECTURE.md` | 模块职责、依赖、数据流、不变量 |
| `docs/bib-engine/API.md` | 公共 API、参数、返回值、异常、诊断码、示例 |
| `docs/bib-engine/DATA_MODEL.md` | 文档/块/条目/字段/值/诊断/报告/事件模型 |
| `docs/bib-engine/INTEGRATION.md` | 主程序接入指南（仅建议） |
| `docs/bib-engine/XELATEX_CONSISTENCY.md` | XeLaTeX 一致性边界、验证矩阵、验收对照 |
| `docs/bib-engine/TEST_REPORT.md` | 测试数量、结果、编译验证状态、限制 |
| `docs/bib-engine/FILE_CHANGES.md` | 本文件 |
| `docs/bib-engine/verification/upstream-baseline.json` | 上游 50 文件 blob 基线 |

## 3. 依赖与配置

- **新增依赖：无。** 未修改 `package.json` / `package-lock.json`。
- 引擎只使用 ECMAScript 标准库（`TextDecoder`、`Map`、`Object`、`String` 等），
  无 `node:*`、无 DOM API。
- 未修改构建脚本、CI、`.gitignore`、README。
- 新测试不需要 npm 安装即可运行（`node --test`）。
- 生成物：无。`verify-xelatex.mjs` 使用系统临时目录，不在仓库留下构建产物。

## 4. 主程序需要配合的修改（未执行，需批准）

| 文件 | 建议改动 | 必要性 |
|---|---|---|
| `apps/web/index.html` | 新增 `.bib` 文件入口 | 接入 UI 时 |
| `apps/web/src/main.js` | 打开 `.bib`、创建 Editor、文献面板、保存 `.bib` | 接入 UI 时 |
| `apps/web/src/main.js` / `latex-codec.js` | 若需要 `\cite` 原子节点则新增节点与序列化分支 | 可选，风险较高 |
| 主程序序言处理 | 按选择注入 `\bibliography` 或 `\addbibresource` | 编译文献时 |
| `package.json` | 可选添加测试脚本 | 可选 |
| `.github/workflows/pages.yml` | 可选加入新测试步骤 | 可选 |

以上均未执行。详细步骤见 [INTEGRATION.md](INTEGRATION.md)。

## 5. 当前未实现的能力

1. **UI**：文献列表/编辑面板、`.bib` 文件选择、引用插入按钮（本任务明确不做 UI）。
2. **字符串编辑**：`@string` 可解析、参与宏展开，但 Editor 未提供增删改接口。
3. **undo/redo**：未实现；理由与替代方案见 `ARCHITECTURE.md` / `API.md`。
4. **`.tex` 自动改写**：只提供扫描与重命名计划，不修改 `.tex`。
5. **完整 LaTeX 宏展开 / 语法检查**：只做 `.bib` 层括号与控制字符检查。
6. **BibLaTeX 语义模型**：不解析 `.bbx`/`.cbx`，不做字段映射或排序。
7. **真实编译验证**：本机无 TeX，L3/L4 未执行（脚本与夹具已交付）。
8. **多文件项目**：`.tex` 扫描只针对传入的单个文本。
9. **超大库性能优化**：当前为 O(n) 解析/索引重建，未做数万条基准。

## 6. 冲突与覆盖检查

- 新增目录/文件在创建前均不存在，未覆盖任何目标文件。
- 未发现与现有模块的命名冲突或导入环。
- 现有 50 个文件逐字节未变（见第 1 节）。
- 工作区外曾创建 `D:\Deepseek harness 项目\dsh-acl-recovery`（会话开始时修复
  文件夹权限的备份/报告），不属于 Lineae 仓库内容，未纳入本次交付。

## 7. 复核方式

```bash
# 现有文件零修改
node tests/bib/verify-upstream.mjs

# 全部新测试（124）
node --test --test-isolation=none "tests/bib/*.test.mjs"

# 既有测试回归（16）
node --test --test-isolation=none tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs

# TeX 编译验证（本机缺工具，退出 2 = UNVERIFIED）
node tests/bib/verify-xelatex.mjs
```
