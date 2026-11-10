# Editor 操作后的真实 BibTeX/Biber + XeLaTeX 编译测试报告

> 执行日期：2026-11-10（Asia/Shanghai）
> 测试对象：公开 API（`parseBib` → `createBibEditor` → `serializeBib`）产生的
> **编辑后** `.bib`。
> 结论：**19 个 case/backend 组合全部通过 L3 + L4**，2 个无修改往返全部通过。

## 1. 测试目标

第一轮只验证"原始 `.bib` 经 parse → serialize 的往返"。本轮验证真正发生编辑后的
数据能否被真实工具链处理，并检查 PDF 输出是否符合**独立编写的预期**，而不是用
同一引擎生成输入和预期。

每个 case 固定流程：

```text
base.bib
  → parseBib()                     （公开 Parser）
  → createBibEditor().<edit>()     （公开 Editor）
  → validateBib()                  （公开 Validator）
  → preflightBib()                 （序列化 + 最新文本重新解析 + error 拦截）
  → 写 refs.bib + main.tex
  → xelatex → bibtex/biber → xelatex ×2
  → 检查 .bbl / PDF 文本 / 页数 / 字体 / 布局 / 页面图像
```

## 2. 环境与版本（固定）

| 工具 | 版本 |
|---|---|
| Node.js | v24.21.0（Windows） |
| XeTeX / XeLaTeX | 3.141592653-2.6-0.999998（TeX Live 2026） |
| BibTeX | BibTeX 0.99e（TeX Live 2026） |
| Biber | 2.22 |
| pdfinfo / pdftotext / pdffonts / pdftoppm | Poppler 26.09.0 |
| 文档类 / 样式 | `article` 11pt + `plain.bst`；`biblatex` numeric + Biber |
| 编译参数 | `-interaction=nonstopmode -halt-on-error -file-line-error` |
| 可复现环境变量 | `SOURCE_DATE_EPOCH=0`, `FORCE_SOURCE_DATE=1` |

本轮为实际编译，使用了临时目录中的便携 TeX Live 2026（TinyTeX-1 Windows
v2026.11，经 `tlmgr update --self` 并安装 `biblatex`/`biber`）与 Poppler 26.09.0
Windows 发行包。它们位于系统临时目录，**没有写入仓库**；仓库只新增脚本与夹具。

## 3. 夹具与独立预期

- 基线库：`tests/bib/compile/fixtures/base.bib`（6 条：宏、拼接、crossref、DOI、
  未知字段、可删除条目）。
- 模板：`main-bibtex.tex`（`\bibliographystyle{plain}` + `\bibliography{refs}`）与
  `main-biblatex.tex`（`biblatex` + `\addbibresource` + `\printbibliography`）。
- 预期值写在 `tests/bib/compile/cases.mjs`，是按目标文献内容**手写**的字符串
  （例如作者改为 Turing/Church、DOI 改为 `10.1000/new.2025`、crossref 改为 parentB
  后期望继承 Springer/Berlin），不是从 Serializer 输出复制。
- 大小写：BibTeX `plain.bst` 会把标题改为句首大写，BibLaTeX 保留原大小写；因此
  标题类检查使用显式的大小写不敏感断言（`*ContainsCI`）。

## 4. 覆盖的 10 类编辑

| # | 操作 | 编辑 | 独立预期（摘要） | backend |
|---|---|---|---|---|
| 1 | 修改作者 | `knuth1984.author = Turing, Alan M. and Church, Alonzo` | PDF/.bbl 出现 Turing、Church；不再出现 Knuth | BibTeX + Biber |
| 2 | 修改标题 | `Selected Papers on Analysis of Algorithms` | 新标题出现；旧 `TEXbook` 消失 | BibTeX + Biber |
| 3 | 修改年份 | `1984 → 2025` | 2025 出现；旧年份不因 DOI 误判 | BibTeX + Biber |
| 4 | 修改 DOI | `10.1000/new.2025` | BibLaTeX 渲染新 DOI；旧 DOI 消失 | Biber |
| 5 | 修改 key | `knuth1984 → knuth84`，同时用公开 `applyCitationRenames` 更新 `\cite` | `.bib`/`.bbl` 含新 key；PDF 文本与页面图像与基线**完全一致** | BibTeX + Biber |
| 6 | 新增文献 | 新增 `shannon1948`（Shannon 1948） | PDF/.bbl 出现 Shannon 与标题；条目数 7 | BibTeX + Biber |
| 7 | 删除文献 | 删除 `turing1950` | PDF/.bbl 不再出现 Turing；条目数 5 | BibTeX + Biber |
| 8 | 修改 crossref | `child2020.crossref: parentA → parentB` | 子条目继承 Springer/Berlin；不出现 parentA 的 New York | BibTeX + Biber |
| 9 | 修改 `@string` 宏字段 | `journal: acmtrans → {Journal of Testing}` | 新期刊名出现；旧 `ACM Transactions` 消失 | BibTeX + Biber |
| 10 | 保留/修改未知字段 | `customfield = keep-me-updated`，新增 `newfield = added-value` | `.bib` 两个字段保留；PDF/页面图像与基线**完全一致** | BibTeX + Biber |

> DOI 只跑 Biber：`plain.bst` 不打印 DOI，BibTeX 下 DOI 变化不会出现在排版中；
> 这不是引擎缺陷，而是样式差异（见 §9）。

## 5. 结果总览

```text
L3（BibTeX/Biber 生成 .bbl）: PASS
L4（PDF 文本/页数/字体/布局/图像）: PASS
19 / 19 编辑组合: PASS
2 / 2 无修改往返: PASS
失败: 0    未验证: 0
```

### 5.1 每个组合的实测结果

页面图像：150 dpi 灰度，1241 × 1754 px/页；像素差阈值 8；diff 为整页变化像素比例。

| case | backend | 页数 | 图像 diff | 字体集合 | 参考文献缩进样本/违规 | 行距差 |
|---|---|---|---:|---|---|---:|
| author | bibtex | 1 → 1 | 1.038% | 相同（3） | 6/6，0/0 | 0.01 pt |
| author | biblatex | 1 → 1 | 1.206% | 相同（5） | 6/6，0/0 | 0 |
| title | bibtex | 1 → 1 | 0.403% | 相同（3） | 6/6，0/0 | 0 |
| title | biblatex | 1 → 1 | 1.291% | 相同（5） | 6/6，0/0 | 0 |
| year | bibtex | 1 → 1 | 0.019% | 相同（3） | 6/6，0/0 | 0 |
| year | biblatex | 1 → 1 | 0.019% | 相同（5） | 6/6，0/0 | 0 |
| doi | biblatex | 1 → 1 | 0.060% | 相同（5） | 6/6，0/0 | 0 |
| key | bibtex | 1 → 1 | **0.000%** | 相同（3） | 6/6，0/0 | 0 |
| key | biblatex | 1 → 1 | **0.000%** | 相同（5） | 6/6，0/0 | 0 |
| add | bibtex | 1 → 1 | 0.540% | 相同（3） | 7/7，0/0 | 0 |
| add | biblatex | 1 → 1 | 0.577% | 相同（5） | 7/7，0/0 | 0 |
| remove | bibtex | 1 → 1 | 0.173% | 相同（3） | 5/5，0/0 | 0 |
| remove | biblatex | 1 → 1 | 0.177% | 相同（5） | 5/5，0/0 | 0 |
| crossref | bibtex | 1 → 1 | 1.579% | 相同（3） | 2/2，0/0 | 0 |
| crossref | biblatex | 1 → 1 | 1.446% | 相同（5） | 2/2，0/0 | 0 |
| macro | bibtex | 1 → 1 | 1.017% | 相同（3） | 6/6，0/0 | 0.01 pt |
| macro | biblatex | 1 → 1 | 0.438% | 相同（5） | 6/6，0/0 | 0 |
| unknown | bibtex | 1 → 1 | **0.000%** | 相同（3） | 6/6，0/0 | 0 |
| unknown | biblatex | 1 → 1 | **0.000%** | 相同（5） | 6/6，0/0 | 0 |

说明：

- 每个可见编辑都产生非零且局部的图像差异（diff 包围盒记录在运行 JSON 中）。
- `key` 与 `unknown` 预期是"排版不变"：实测 0 像素差异，证明 key 重命名和未知字段
  不会改变视觉输出。
- `crossref` 的 .bib 仍包含 parentA/parentB，但 `.tex` 只 `\nocite` 被引用的
  child2020 与 knuth1984，因此 New York 不再出现，Berlin/Springer 来自继承。

## 6. 无修改往返（回归）

对两个 backend：

| backend | `.bib` 字节 | `.bbl` | PDF 文本 | 页数 | 字体 | 布局 | 页面图像 |
|---|---|---|---|---|---|---|---|
| BibTeX | 完全一致 | 一致 | 一致 | 1 → 1 | 相同 | 相同 | **0 像素差异** |
| Biber | 完全一致 | 一致 | 一致 | 1 → 1 | 相同 | 相同 | **0 像素差异** |

这直接回答了"无修改往返是否保持原始排版"：在固定工具链与夹具范围内，是。

## 7. 判定逻辑（防止假阳性）

每个 case 只有全部适用检查通过才记 `PASS`：

1. 引擎级：条目数、validate 无 error、序列化后 reparse 无错误、独立 `.bib` 字符串
   预期、语义不变量（key/type/所有解析后字段值一致）。
2. L3：`.bbl` 必须包含/不包含指定文本；`.tex` 的 `\cite` 已同步。
3. L4：
   - `.bbl`/PDF 文本包含新值且不含旧值；
   - 页数符合预期（原地编辑必须 1 → 1）；
   - 字体集合（去掉子集前缀与 object ID）完全相同；
   - 行距（最小行距差 ≤ 1 pt）、参考文献起始页相同、悬挂缩进违规 0；
   - 页面图像：预期变化的 case 必须有非零差异且单页 diff < 60%；预期不变的
     case 必须 0 像素差异。
4. 任一检查为 `false` → FAIL；缺少工具 → UNVERIFIED（退出码 2），不会记 PASS。

## 8. 复现

```bash
# 有系统 TeX + Poppler 时
node tests/bib/compile/run-editor-compile.mjs

# 或指定便携工具目录
node tests/bib/compile/run-editor-compile.mjs \
  --tex-bin=<dir with xelatex/bibtex/biber> \
  --poppler-bin=<dir with pdfinfo/pdftotext/pdffonts/pdftoppm> \
  --out=compile-report.json

# 只跑引擎级预期（无 TeX 时自动如此，退出码 2）
node tests/bib/compile/cases.test.mjs
```

本轮实际命令：

```text
node tests/bib/compile/run-editor-compile.mjs \
  --tex-bin=C:\Users\vertin\AppData\Local\Temp\lineae-tex\TinyTeX\TinyTeX\bin\windows \
  --poppler-bin=C:\Users\vertin\AppData\Local\Temp\lineae-poppler\extracted\poppler-26.09.0\Library\bin \
  --out=...\lineae-compile-report-final.json
→ exit 0
```

无 TeX 时的行为已验证：同一命令输出 `UNVERIFIED`、退出码 2，未伪造通过。

## 9. 边界与未覆盖

- 夹具是**单页**、英文、`article` + `plain`/`biblatex numeric`；不代表双栏、图表、
  多页、CJK 字体切换等排版场景。
- BibTeX 的 `plain.bst` 不打印 DOI；DOI case 只在 Biber 下验证。
- BibTeX 的 `plain.bst` 会改变标题大小写；测试已分别处理两种样式。
- 未测试 `\include`/多文件、BibTeX8、biblatex 其它样式、字体缺失、超长文献。
- 测试验证的是"给定夹具、给定工具版本"下的行为；未做跨版本回归。
- XeLaTeX 编译成功不等于任意真实论文的排版正确；本轮只证明数据层改动不会破坏
  代表性文档的编译与排版结构。

## 10. 结论（对应任务问题）

1. **编辑后的 `.bib` 能否通过真实 BibTeX/Biber？** 能。19/19 组合生成有效 `.bbl`，
   BibTeX 与 Biber 均成功。
2. **能否通过 XeLaTeX 编译？** 能。19/19 生成 PDF，无 `-halt-on-error` 失败。
4. **修改后的排版是否符合预期？** 在测试覆盖范围内符合：新作者/标题/年份/DOI/
   期刊名/crossref 继承与新增条目均按独立预期出现；删除项消失；key 重命名与未知
   字段不改变视觉输出。
