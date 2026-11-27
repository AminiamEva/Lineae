# Phase C · 真实 TeX 双引擎基准

本阶段交付测试管线和两份 Lua 实测参考。生成器针对相同输入分别运行 XeLaTeX 和 LuaLaTeX，另外用当前 XeLaTeX 原样重编 12 份历史源码。浏览器排版继续沿用 Phase B 的 Xe 入口。最终候选 SHA、干净 worktree 复验、逐条命令和退出码见配套验收记录。

## 起点与变更

首次 fetch 的 main 为 26623a302b9ebbb6c2a985b300290abd409c9de4，开发中再次 fetch 到 d9f852580f43b7f70151b43d4243068b63362697。后者新增数学编辑和工具栏修复。历史 B 候选 4a3cc6f794c310906c309c170bd6b65f52cc9c70 保存在本地 archive/phase-b-4a3cc6f。两次 range-diff 均显示 A、修复、B 三笔补丁等价。最终 C 父提交为 a4ac45c884b82f8742f4f10d89da722313abc421，分支为 feat/lualatex-dual-engine。独立验收从最终候选重新建立工作区。

| 文件 | 作用 |
|---|---|
| tests/bib/compile/lib/tex-runner.mjs | 运行受限选项的 latexmk 或直接调用引擎。记录 argv、cwd、限时、状态与通道日志；超时终止进程组。CLI 的输入是独立目录中的 main.tex。 |
| tests/bib/compile/lib/tools.mjs | 既有工具发现增加 Lua 与 latexmk，编译委托给同一 runner，保留原 PDF 分析逻辑。 |
| tests/bib/verify-xelatex.mjs | 默认绑定 Xe，可选 Lua 和 direct。保留两个文献后端，失败目录留存，已有输出目录复用时新建子目录。 |
| tests/bib/compile/run-editor-compile.mjs | 真实编辑测试将 engine 和 driver 传到编译调用并等待输出。 |
| tests/tex-reference/runner.test.mjs、smoke.py | 检查非零状态、参数、stdout/stderr、超时和过期产物。双引擎分别编译 ctexart、未定义命令、缺失的文献数据库和无限循环。 |
| tests/tex-reference/generate.py、nodes.lua | 从旧文档的 source 字段建立测试语料。隔离编译、保留源文件和 PDF，并提取 Lua 的行盒尺寸。 |
| tests/tex-reference/measure.py | 对齐 Poppler 字框和 PDF 文本原点，核对正文覆盖、字体文件和两侧段落参数。差异报告只对齐相同文本行。 |
| tests/tex-reference/verify.sh | 在新目录生成并逐字节比对两个 golden，运行双引擎文献验证。 |
| tests/fixtures/paragraph-layout/texlive-2025-debian/ | 独立英文、中文 Lua golden，两份 JSON 共 51,405 字节。 |
| docs/dual-engine/PHASE_C.md | 记录环境、定义、实验结果和复现入口。 |

## 重放

Linux 需要 Node、Bash、Python、PyMuPDF、fontTools、两种引擎、latexmk、BibTeX、Biber、kpsewhich、xdvipdfmx 和 Poppler。运行编辑视觉扩展还使用 pdftoppm。下列命令从仓库根目录执行；OUT 为一个尚未创建的绝对路径。verify.sh 会先核验冻结哈希，再从新目录实际编译。完整 TeX 发行版可直接运行。复现本次 Debian 的精确组合见证据包 environment/，含包归档 SHA-256 和格式生成命令。

~~~bash
JOBS=4 bash tests/tex-reference/verify.sh "$OUT"
python3 -B tests/tex-reference/generate.py "$SECOND" --jobs 4
for f in lualatex-reference.json luatexja-reference.json current-xelatex.json engine-differences.json provenance.json; do
  cmp "$OUT/reference/$f" "$SECOND/$f" || exit 1
done
node tests/bib/compile/run-editor-compile.mjs --engine=xelatex --out="$OUT/editor-xe.json"
node tests/bib/compile/run-editor-compile.mjs --engine=lualatex --out="$OUT/editor-lua.json"
~~~

精简定位单个编译错误时，将测试项目复制到新目录，让入口名为 main.tex，运行：

~~~bash
node tests/bib/compile/lib/tex-runner.mjs "$FRESH_PROJECT" lualatex direct 120000
~~~

latexmk 负责多遍、参考文献后端和 Xe 的 XDV 转 PDF。直接模式可在共享 API 传入 bibtex 或 biber，此时显式执行引擎、文献工具、两遍引擎。两条路径都启用 nonstopmode、halt-on-error、file-line-error、recorder、SyncTeX 和 no-shell-escape。latexmk 使用 -norc 和 -bibtex，缺少文献数据库也会实际调用后端并返回失败。测试只接受受信语料；编译器进程保留运行账户的文件权限。

## 坐标与测量

样本为单栏、水平排版、不旋转的单页 article。两侧同一 UTF-8 文件通过 iftex 分支选择 xeCJK 或 LuaTeX-ja + quanjiao，字号 10 TeX pt，首行缩进 15 TeX pt。每份记录比较 hsize、parindent、language 和断词最小长度（2/3）。用一种字体的控制行先放进不可伸缩的 hbox，原自动断行段落单独编译。节点探针只观察 post_linebreak_filter，不修改节点。原始历史源码以独立文件按原样编译。

* PDF 原点按左上、向下为正，含页宽和页高。以 pdftotext -bbox-layout 的词框并集定义有效文字边界。widthBp = xMax − xMin。保留 XML 以便复算。Poppler 的字体度量框和实际黑色墨迹可能不同。
* 用 MuPDF 读取 PDF 水平文本运行的 origin.y；同一行可含中英多种运行。记录全部 runBaselinesBp，baselineBp 取其中最上方原点。本语料将相差不超过 2 bp 的运行视作一行，超过 5 bp 的词框匹配误差即报错。新样本若含上标、旋转或多栏，须单独定义分组规则。
* PDF bp × 96/72 = CSS px。TeX pt × 96/72.27 = CSS px。65536 sp = 1 TeX pt。控制行记录盒子推进宽度，Lua 行记录分配到的 hlist width、height、depth。两类 TeX 尺寸与词框分别保存。
* 行文本保留提取器的词间隔。逐行对照使用 NFKC，英文折叠空白，中文及中英混排忽略提取器插空。另有正文覆盖检查；差异表保留变更前后文本、匹配行号与有方向的 bbox、宽度和基线差。历史 JSON 只有 bbox，所以历史比较不提供真实基线差。
* 规范化 JSON 保存几何、字体版本/哈希和源码哈希。机器路径、完整 argv、工具原文、格式文件哈希、未规范化的 PDF 和日志单独留存。在新目录重跑时以 JSON 原始字节为比较对象。

## 数据与观察

Linux Debian，XeTeX 0.999996、LuaHBTeX 1.18.0（均报告 TeX Live 2025/dev/Debian），latexmk 4.86、BibTeX 0.99d、Biber 2.21、Poppler 25.03.0、PyMuPDF 1.26.6、MuPDF 1.26.11、fontTools 4.61.1，locale 为 C.UTF-8。ctex 2.5.10、xeCJK 3.9.1、LuaTeX-ja 20260130.1、fontspec 2.9e、biblatex 3.21。引擎版本与后装宏包版本分别记录。实际加载的字体由 Xe XDV 驱动详细输出、Lua PDF 后端日志和 pdffonts 交叉核对。

| 字体 | 版本 | 文件 SHA-256 |
|---|---|---|
| lmroman10-regular.otf | 2.004 | 1aa18cfefa58132c52ce5de70db1fd1154201c19cd2b2cdaffba4906a33e6852 |
| FandolSong-Regular.otf | 1.300 | a3820003227d4abe31fe28b493200d94a849ccfd078b50a019264f70353020b0 |

单次生成 40 份 PDF，包括当前配对 14 × 2 份、历史源码重编 12 份。英文 Lua 5 例 30 行，中文 Lua 9 例 44 行。未伸缩的 Hamburg 和“中文排版”在两引擎的推进分别为 2,660,106 sp 和 2,621,440 sp。英文控制词 PDF 边界宽在 Xe 为 40.448156 bp，在 Lua 为 40.438356 bp；两侧 TeX 推进宽度相同。Xe 的 Fandol 子集在此环境 pdffonts 的 uni 列为 no，原始正文的覆盖由实际 Poppler 提取逐例核对。

| 对照 | 观测 |
|---|---|
| 2023 冻结 → 当前 Xe 原源码 | 12/12 个段落逐行文本相符。匹配行最大绝对宽差 0.000203 bp。此项同时包含发行版、字体环境和提取器的变化。 |
| 当前 Xe 原源码 → 当前 Xe 对齐配置 | 12/12 个段落行文本相符，匹配行宽差为 0 bp。 |
| 当前 Xe → 当前 Lua | 英文 4/4 段落行文本相同。中文 8 段中 6 段出现行尾差异，8 段的总行数在两侧分别相同。同字体对照包含引擎及 CJK 宏包栈的共同影响。 |
| 中文 han，左右页边距 45 mm | 首行 Xe 末尾为“采用相同的”，Lua 为“采用相同的断”。两侧起始 x 均为 142.503 bp；Lua 的实际行盒和 PDF 文本位置可作为后续校准输入。 |

## 自测、遗留项与下一步输入

runner 首次执行因模块缺失退出 1，完成后 4/4 通过。真实 ctexart 的初次试编发现缺 zhnumber，补齐后又从 Lua 日志定位到缺 chinese-jfm。两包使用冻结归档安装到隔离 TEXMF 后，两引擎均得到可提取“中文 Lineae”的有效 PDF。未定义命令分别返回 1，超时返回 124。复验还发现 latexmk 在缺库时可能输出部分 PDF 并返回 0，新增失败测试覆盖后，两侧都要求后端非零状态和 main.blg 中的 missing.bib 诊断。两种引擎均通过旧文献入口的两组对照，Xe 编辑回归 19/19、原样往返 2/2。

额外执行旧 verify-xelatex.mjs --acceptance。原起点 2/6 通过，另有两例中文测试在 PDF 缺“张三”和“李四”，两个预期故障的后端诊断未进入旧日志。新 runner 保留后端诊断，扩展套件 4/6 通过；相同两份中文样例仍 FAIL。两份样例都没有为中文正文字形选择可用字体。保留原样例和断言，错误信息见每个 acceptance-report.json。Phase B 的浏览器偏差沿用其阶段记录，本次验证对象是编译管线。

四份旧参考按 docs/dual-engine/fixtures.sha256 逐项检查。新生成目录独立，旧参考文件不作输出目标。Phase D 可读取两个 golden 的 cases[].paragraph、lines[].bbox、baselineBp、runBaselinesBp、lineBoxSp 及各例字体。该阶段仍需以浏览器实测对照 Lua 排版；本次没有启用 Lua 产品默认值或调整产品参数。Windows/macOS 本轮未执行。
