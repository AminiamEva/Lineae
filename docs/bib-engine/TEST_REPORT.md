# Bib 引擎测试报告（最终）

> 执行日期：2026-11-10（Asia/Shanghai）
> 环境：Windows，Node.js `v24.21.0`；便携 TeX Live 2026（XeTeX/BibTeX/Biber）与
> Poppler 26.09.0（位于系统临时目录，不写入仓库）。
> 本文只记录实际执行结果；没有把 UNVERIFIED 计为 PASS。

## 1. 结果总览

| 套件 | 文件 | 测试数 | 通过 | 失败 | 跳过 |
|---|---|---:|---:|---:|---:|
| 第一轮原有 8 个文件 | `lexer/parser/serializer/validator/editor/roundtrip/tex-citations/browser-compat` | 124 | 124 | 0 | 0 |
| 第二轮 API 契约 | `tests/bib/api-contract.test.mjs` | 18 | 18 | 0 | 0 |
| 最终契约（重复 key/preflight/参数） | `tests/bib/final-contract.test.mjs` | 15 | 15 | 0 | 0 |
| Editor 编译矩阵的引擎级预期 | `tests/bib/compile/cases.test.mjs` | 12 | 12 | 0 | 0 |
| PDF 视觉纯函数 | `tests/bib/pdf/visual-lib.test.mjs` | 11 | 11 | 0 | 0 |
| 独立示例 | `tests/bib/examples/standalone-example.test.mjs` | 2 | 2 | 0 | 0 |
| **合计** | 13 个测试文件 | **182** | **182** | **0** | **0** |

```text
$ node --test --test-isolation=none "tests/bib/*.test.mjs" \
    tests/bib/compile/cases.test.mjs \
    tests/bib/examples/standalone-example.test.mjs \
    tests/bib/pdf/visual-lib.test.mjs
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

> 说明：`editor.test.mjs` 的事件 action 断言、`api-contract.test.mjs` 的重复 key/
> 非法参数断言按第三轮新契约更新；`browser-compat` 增加 `preflightBib` 导出检查。
> **测试数量没有减少，没有删除、跳过或降低断言**。

既有应用测试（未修改）仍通过：

```text
$ node --test --test-isolation=none tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs
ℹ tests 16
ℹ pass 16
ℹ fail 0
```

## 2. 真实编译与视觉验证

工具版本：

| 工具 | 版本 |
|---|---|
| XeTeX / XeLaTeX | 3.141592653-2.6-0.999998（TeX Live 2026） |
| BibTeX | 0.99e（TeX Live 2026） |
| Biber | 2.22 |
| Poppler（pdfinfo/pdftotext/pdffonts/pdftoppm） | 26.09.0 |

结果：

| 项目 | 结果 |
|---|---|
| Editor 10 类操作 × backend | 19/19 PASS |
| BibTeX `.bbl` | 9/9 backend-case 组通过 |
| Biber `.bbl` | 10/10 backend-case 组通过 |
| XeLaTeX PDF | 19/19 生成 |
| 无修改往返（BibTeX/Biber） | 2/2 PASS，页面图像 0 像素差异 |
| L3 状态 | PASS |
| L4 状态 | PASS（页数/文本/字体/行距/缩进/图像） |
| 第一轮 `verify-xelatex.mjs` | 2/2 PASS（`.bbl` 与 PDF 文本一致，Poppler 探测已修正） |

每个编辑 case 的实测指标、独立预期和复现命令见
[EDITOR_COMPILE_TEST_REPORT.md](EDITOR_COMPILE_TEST_REPORT.md) 与
[PDF_VISUAL_VALIDATION.md](PDF_VISUAL_VALIDATION.md)。摘要：

- 页数全部 1 → 1；
- 字体集合与基线一致（BibTeX 3、BibLaTeX 5）；
- 参考文献悬挂缩进违规 0；
- 可见编辑的图像差异 0.019%–1.579%；
- key rename 与未知字段修改：0 像素差异。

## 3. 本轮新增的契约测试

`tests/bib/final-contract.test.mjs`（15 项）覆盖：

- `BIB409` 导出与重复 key 查询（`getEntry` 仍返回第一个）；
- 重复 key 的 update/remove/rename 未指定 occurrence 时拒绝（BIB409）；
- occurrence 0/1 精确选择、越界 BIB401、非法 occurrence BIB408；
- 重复 key 下 `.bib` 引用不猜测、`.tex` 引用报告 `externalReferencesAmbiguous`；
- 唯一 key 仍正常更新 crossref；
- 新 key 非法/已存在/空 → BIB403/BIB402；
- `preflightBib` 对干净/损坏/已编辑文档的最新诊断；
- `preflightBib` 不依赖 dirty 文档的历史 validate；
- 非法序列化选项（`bom`/`finalNewline`/`verify`/`preserveFormatting`）；
- `applyCitationRenames` 对 object/Map 的非法 key 抛 BIB504；
- 自定义 `\newcommand{\mycite}...` 的扫描器边界；
- 所有合法序列化选项可用。

## 4. 上游文件核验

```text
$ node tests/bib/verify-upstream.mjs
Baseline: https://github.com/AminiamEva/Lineae @ a79a8b9ca0f836eb241a75703ec0d3cac2a8c11e
Upstream files checked: 50/50
Modified:   0
Missing:    0
Unexpected: 0
New files:  59
```

方法：以 GitHub tree API 的 blob SHA-1 为基线，对工作区中所有非新增文件按 Git
`blob <size>\0<content>` 规则重新计算并比对。第一轮/第二轮模块文件本轮按授权
修改，不属于 50 个上游文件。

## 5. 覆盖矩阵（任务书）

| 要求 | 覆盖 | 状态 |
|---|---|---|
| Lexer 单元测试 | `lexer.test.mjs` | 通过 |
| Parser 单元测试/错误恢复 | `parser.test.mjs` | 通过 |
| Editor 单元测试（增删改查/批量/事件） | `editor.test.mjs`、`final-contract.test.mjs` | 通过 |
| Validator 单元测试 | `validator.test.mjs` | 通过 |
| Serializer 单元测试/回读 | `serializer.test.mjs`、`final-contract.test.mjs` | 通过 |
| parse→serialize→parse | `roundtrip.test.mjs` | 通过 |
| 边界（空/BOM/CRLF/损坏/CJK/300 条） | 多个套件 | 通过 |
| 重复 key 查询/删除/修改/重命名/occurrence | `final-contract.test.mjs` | 通过 |
| 非法重命名/非法序列化参数 | `final-contract.test.mjs`、`api-contract.test.mjs` | 通过 |
| 编译前诊断拦截 | `final-contract.test.mjs`、compile harness | 通过 |
| 自定义引用命令边界 | `final-contract.test.mjs` | 通过（限制已记录） |
| XeLaTeX 真实编译 | `run-editor-compile.mjs` | 通过（19/19） |
| PDF 视觉比较 | `run-editor-compile.mjs` + `visual-lib` | 通过 |

## 6. 未覆盖/限制

1. 单页英文夹具；未覆盖多页、双栏、图表、CJK 字体回退。
2. 只使用 `plain` 与 `biblatex numeric` 样式。
3. `.tex` 扫描不解析宏定义体；`\newcommand` 内的 `\cite` 仍会被识别，已记录并
   测试（不引入不完整 LaTeX 解析器）。
4. 未做跨 TeX 版本回归；工具版本已固定并记录。
5. `.bib` 语义完整性的运行时证明仍依赖独立测试；`serializeBib.verify` 只做语法
   回读（文档已明确）。
6. 新测试未接入 CI（受"不修改 CI"约束）；可在获准后添加。

## 7. 复现命令

```bash
# 全部 182 项测试
node --test --test-isolation=none "tests/bib/*.test.mjs" \
  tests/bib/compile/cases.test.mjs \
  tests/bib/examples/standalone-example.test.mjs \
  tests/bib/pdf/visual-lib.test.mjs

# 既有应用测试（16）
node --test --test-isolation=none tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs

# 真实编译 + L4（需要 xelatex/bibtex/biber + Poppler）
node tests/bib/compile/run-editor-compile.mjs \
  --tex-bin=<dir> --poppler-bin=<dir> --out=compile-report.json

# 第一轮脚本（L3 + 文本）
PATH=<tex-bin>:<poppler-bin>:$PATH node tests/bib/verify-xelatex.mjs

# 上游文件零修改
node tests/bib/verify-upstream.mjs
```
