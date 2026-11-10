# L4 PDF 视觉一致性验证

> 本文件说明第二轮新增的 PDF 层级验证：页数、文本、字体、行距、分页、参考文献
> 缩进、页面图像差异。
> 执行日期：2026-11-10；工具版本见 §2。
> 结论：**全部 19 个编辑组合与 2 个无修改往返通过**；无修改往返页面图像 0 像素差异。

## 1. 为什么要区分四种"一致"

| 层级 | 含义 | 本项目的处理 |
|---|---|---|
| `.bib` 语法 | 能否被 BibTeX/Biber 读取 | Lexer/Parser + 真实工具编译（L3） |
| `.bib` 语义 | 字段值、key、引用关系是否不变 | 语义快照 + 独立字段预期 |
| 工具链兼容 | 能否生成 `.bbl`、退出码 0 | BibTeX 与 Biber 分别执行 |
| **PDF 排版** | 页数、文本、字体、行距、缩进、像素图像 | **本文件 + `run-editor-compile.mjs`** |

**PDF 文件字节一致不作为要求**：TeX 会写入时间戳/ID 等元数据，二进制相同既不
必要也不稳定。本验证比较的是渲染结果，而不是文件哈希。

## 2. 固定工具链

| 组件 | 版本 | 来源 |
|---|---|---|
| XeTeX / XeLaTeX | 3.141592653-2.6-0.999998（TeX Live 2026） | 便携 TinyTeX-1 v2026.11（临时目录） |
| BibTeX | 0.99e（TeX Live 2026） | 同上 |
| Biber | 2.22 | `tlmgr install biber` |
| pdfinfo / pdftotext / pdffonts / pdftoppm | Poppler 26.09.0 | Poppler Windows release |
| Node.js | v24.21.0 | 运行环境 |

编译参数固定：

```text
xelatex -interaction=nonstopmode -halt-on-error -file-line-error main.tex
bibtex main            # 或 biber main
xelatex ... (twice)
```

环境变量：`SOURCE_DATE_EPOCH=0`、`FORCE_SOURCE_DATE=1`（只影响元数据，不参与图像
比较）。仓库未写入 TeX/Poppler 安装文件；工具位于系统临时目录。

## 3. 比较方法

### 3.1 页数

`pdfinfo main.pdf` → `Pages:`。原地编辑要求页数相同；新增/删除允许页数变化，
但记录实际值。本轮所有文档均为 1 页。

### 3.2 文本

`pdftotext -layout main.pdf main.txt`，做 CRLF/尾随空白归一化后：

- 预期不变的 case（key rename、unknown field）：文本必须完全相等；
- 预期变化的 case：必须包含新值、且不包含旧值（独立手写预期）。

### 3.3 字体

`pdffonts main.pdf`。归一化时去掉子集前缀（`ABCDEF+`）和 object ID，比较
字体名称/类型/编码/嵌入标志的集合。所有 case 的字体集合与基线一致
（BibTeX 3 个字体，BibLaTeX 5 个字体）。

### 3.4 行距、分页与参考文献缩进

`pdftotext -bbox-layout main.pdf main.bbox.html` 给出每个 word/line 的坐标。

- **分页**：参考文献标题所在页（`References`）必须与基线相同（原地编辑）；
- **行距**：每页相邻 line 的 `yMin` 差值取**最小正差值**（正文行距；更大间距是
  条目之间的空白，会随条目数变化），要求与基线差 ≤ 1 pt；
- **参考文献缩进**：对 `[n]` 标签行，检查下一行（非新标签）的 `xMin` 是否大于
  标签 `xMin`；统计样本数和违规数，要求样本 > 0 且违规 = 0。

### 3.5 页面图像

`pdftoppm -r 150 -gray main.pdf page` → PGM（P5）逐页图像：

- 解析 PGM 头与像素；
- 像素差阈值 8（忽略抗锯齿噪声）；
- 统计 changed pixels、ratio、平均绝对差、差异包围盒；
- 预期不变的 case 要求 **ratio = 0**；
- 预期变化的 case 要求 ratio > 0，且单页 ratio < 60%（防止灾难性布局变化）。

## 4. 结果

### 4.1 无修改往返

| backend | 页数 | PDF 文本 | 字体 | 行距 | 参考文献起始页 | 页面图像 |
|---|---|---|---|---|---|---|
| BibTeX | 1 → 1 | 完全一致 | 相同 | 相同 | 相同 | **0 像素差异** |
| Biber | 1 → 1 | 完全一致 | 相同 | 相同 | 相同 | **0 像素差异** |

### 4.2 编辑后

| case | backend | 页数 | 图像 diff | 字体 | 缩进违规 | 判定 |
|---|---|---|---:|---|---:|---|
| author | bibtex | 1 → 1 | 1.038% | 相同 | 0 | PASS |
| author | biblatex | 1 → 1 | 1.206% | 相同 | 0 | PASS |
| title | bibtex | 1 → 1 | 0.403% | 相同 | 0 | PASS |
| title | biblatex | 1 → 1 | 1.291% | 相同 | 0 | PASS |
| year | bibtex | 1 → 1 | 0.019% | 相同 | 0 | PASS |
| year | biblatex | 1 → 1 | 0.019% | 相同 | 0 | PASS |
| doi | biblatex | 1 → 1 | 0.060% | 相同 | 0 | PASS |
| key | bibtex | 1 → 1 | **0.000%** | 相同 | 0 | PASS |
| key | biblatex | 1 → 1 | **0.000%** | 相同 | 0 | PASS |
| add | bibtex | 1 → 1 | 0.540% | 相同 | 0 | PASS |
| add | biblatex | 1 → 1 | 0.577% | 相同 | 0 | PASS |
| remove | bibtex | 1 → 1 | 0.173% | 相同 | 0 | PASS |
| remove | biblatex | 1 → 1 | 0.177% | 相同 | 0 | PASS |
| crossref | bibtex | 1 → 1 | 1.579% | 相同 | 0 | PASS |
| crossref | biblatex | 1 → 1 | 1.446% | 相同 | 0 | PASS |
| macro | bibtex | 1 → 1 | 1.017% | 相同 | 0 | PASS |
| macro | biblatex | 1 → 1 | 0.438% | 相同 | 0 | PASS |
| unknown | bibtex | 1 → 1 | **0.000%** | 相同 | 0 | PASS |
| unknown | biblatex | 1 → 1 | **0.000%** | 相同 | 0 | PASS |

图像为 150 dpi 灰度 1241 × 1754 px/页，阈值 8。所有 case 的
`maxPageRatio < 0.016`，远低于 0.6 的上限。

## 5. 如何解读

- **key rename / unknown field 的 0 差异**是最强证据：数据变化了（`.bib`/`.bbl`
  中的 key 或未知字段），但渲染结果逐像素一致，说明引擎没有把编辑泄漏到排版。
- **可见编辑的非零差异**为局部差异（变化的像素比例不超过 1.6%，diff 包围盒记录
  在运行 JSON 中）；页数、字体、行距、缩进保持不变，说明没有发生非预期的全局
  重排。
- **新增/删除**条目后页数仍为 1（短文档），缩进违规仍为 0；字体未改变。
- 本验证不是"任意 PDF 的视觉等价证明"，而是"给定夹具和固定工具版本下的回归
  证明"。

## 6. 未覆盖与限制

1. 单页文档；没有验证多页分页、孤行/寡行、浮动体。
2. 英文 `article`；没有 CJK 字体回退、双栏、图表、脚注。
3. 只比较 150 dpi 灰度；没有颜色通道、子像素渲染或人眼视觉审查。
4. 只跑 `plain` 与 `biblatex numeric` 两种样式；其它 `.bst/.bbx` 可能有不同
   字段映射与排序。
5. PDF 文本抽取受 Poppler 版本影响；本报告固定 Poppler 26.09.0。
6. 未做跨 TeX 版本回归；工具版本升级后应重跑并更新基线。

## 7. 复现

```bash
node tests/bib/compile/run-editor-compile.mjs \
  --tex-bin=<xelatex/bibtex/biber dir> \
  --poppler-bin=<pdfinfo/pdftotext/pdffonts/pdftoppm dir> \
  --out=compile-report.json
```

- 缺 TeX：退出码 2，打印 `UNVERIFIED`，不产生"通过"。
- TeX 存在但缺 Poppler：L3 可跑，L4 标记未验证，整体退出码 2。
- 全部通过：退出码 0；任一检查失败：退出码 1。

底层纯函数（PGM 解析、bbox 解析、字体比较、图像比较）由
`tests/bib/pdf/visual-lib.test.mjs` 独立测试（11 项，不需要 PDF 或 TeX）。

## 8. 结论

- **无修改往返保持原始排版**：是（页面图像 0 差异）。
- **修改后的排版符合预期**：在 19 个组合中，文本/页数/字体/行距/缩进/图像检查
  全部通过；可见修改产生局部且非零的差异，key/unknown 修改保持 0 差异。
- **PDF 视觉比较是否通过**：通过（范围内）。
