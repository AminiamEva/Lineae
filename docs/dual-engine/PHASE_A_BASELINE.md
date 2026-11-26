# Lineae V4 Phase A 基线审计与冻结

## Git 基线和交付范围

2026-11-23 从 GitHub 直接 fetch 成功，`origin/main` 为 `cb52ec41f13246f0e11d8c28a0158224ddbb9700`，树为 `0090516f9adb5aa4ec8a6db22c8f05d716f85806`，对应合并 PR #34。先前 Windows 隔离分支和当前 Linux 隔离分支从相同提交建立。Linux 使用独立克隆及同名分支 `feat/lualatex-dual-engine`，新建后 `git status --porcelain=v1 --branch` 只有分支行。原 Windows 工作区曾有未提交修改，前一次隔离检出已核对其 Git 状态。此轮在 Linux 上重新运行并采集证据。阶段候选 SHA 从本报告所在提交和验收日志读取。

本阶段新增审计报告、[影响矩阵](IMPACT_MATRIX.md)、[fixture 哈希](fixtures.sha256)、[测试索引](baseline.json)及测试用脚本。应用代码、已有测试、现有 fixtures、依赖锁文件保持原样。产品包体增量为 0，基线 `editor.mjs` 为 3,270,649 字节，`gzip -n` 为 782,313 字节。构建日志中的单次 esbuild 耗时属于该机测量。首次基线没有跨环境性能回归结论。

## 从 article 正文到排版装饰

| 阶段 | 已检查函数 | 对文档的影响 |
| --- | --- | --- |
| 读取源码并建立编辑视图 | `apps/web/src/main.js:1516` 的 `load` 调 `parseDocument` 和 `importBlocks`，用 `setContent` 安装 AST，并保留导入源字符串和 JSON 快照。 | 这是读入并替换编辑器文档的入口，编解码和保真也在此建立。 |
| 读取导言并应用页面几何 | `main.js:1375` 的 `applyPageSetup` 从 standalone 或 project root 得到导言，计算纸张与列、边距，调用 `typesetPagination.update`。 `typeset-pagination.js` 中 `applyProfile` 调 `typesetProfile` 并更新 CSS。 | 页面状态和 DOM 更新。 `applyProfile` 还设置章标题及序列化的文档类上下文。后续拆引擎需要保住共享类信息。 |
| 读取段落和测量 | `paragraph-layout.js:41` 的 `tokensFor` 遍历 ProseMirror 文本和行内节点，取得 DOM 字体及原位置。 `measure` 用 Canvas `measureText` 与字距，按 font/letterSpacing/text 缓存。原子节点宽度来自真实 DOM。 | 生成 boxes/glue/penalties 及其位置，只读 AST。字体加载结束后清空缓存。 |
| 求断行与几何 | `paragraph-layout.js:212–227` 将 token、首行缩进、绕图逐行可用宽度及导言断行参数交给 `optimumParagraph`，完成整段优化并去掉末尾空行。 | 计算行末位置、伸缩比例及连字符等几何。非支持的 CJK 字体、标点模式或自定义 glue 回退；非两端对齐和部分多栏布局也跳过。 |
| 更新视图 | `paragraph-layout.js:231–255` 构建节点、行内与 widget decorations，派发仅含 plugin meta 的事务并禁用历史。 `typeset-pagination.js:18–39,144,437–451` 由 DOM 和页面规划再加分页 widget。 | 没有文档替换步骤。段落插件处理上下方向键时单独更新 selection。分页还更新坐标和 DOM。 |
| 导出与保存 | `main.js:1498` 的 `source` 对导入快照一致的文档返回原始源码，工程合成返回根文件 draft，发生编辑时走投影/序列化。 | 这是需要测试原字节 SHA256 的边界。独立探针导入带注释、宏、中文和混合换行的两个 article，经过 Document/Source/Document 并下载 ZIP，比较 `.tex` entry 的 SHA-256 和 AST。 |

段落 goldens 的浏览器测试验证真实 DOM 行末、宽度和相对行距。两个旧浏览器脚本的源码往返断言使用 `trimEnd()`。原始字节结论以独立探针及 `source-workspace-mixed-eol.cjs` 的导出证据为准。现有编辑器没有引擎选择状态，源码冲突诊断及切引擎保真属于后续阶段。

## 三类排版和编译入口

| 能力 | 当前实现 |
| --- | --- |
| 浏览器实时排版 | 有共享段落优化、浏览器字体与 Canvas 测量、英文断词、Fandol 标点、DOM 分页和表格分页。依靠解析到的有限导言信息。 |
| TikZ / CircuiTikZ | `tikz-studio.js` 懒加载固定版 `mp-tikz-wasm`，按局部源码选择 `auto` 或 `lualatex`，提取所需导言/包，展示 SVG 首页。通用 TikZ 与可视化电路编辑均有浏览器入口。固定版安装脚本在官方核心包没有内嵌 `dist/ghostscript` 时退出 1。通过独立的同版本 Ghostscript 包补足并校验两份官方 SHA-256 后，执行真实 WASM 浏览器测试。 |
| 整文 PDF | `README.md:129,135` 与 web/Tauri 入口核对一致，产品整文编译与 PDF 预览尚待集成。真实 CLI 编译在测试端运行，段落探针用 `xelatex` / `lualatex` 和 Poppler 产生 PDF、字体、文字与坐标。Bib 测试独立调用 `xelatex` 搭配 BibTeX 或 Biber。 |

## 偏好、项目数据与 checkpoint

- `config.yaml:1` 为版本 2。`createConfigStore` 以 YAML 1.2 解析并验证默认值和覆盖值，检查未知字段、类型及快捷键冲突。`migrateVersion` 将 v1 识别到的语言、缩放、旧数学快捷键转成 v2。无版本的部分配置继承默认 v2。独立的 `lineae.theme`、`lineae.sourceFontSize`、`lineae.indentOnSave` 在无对应覆盖时迁移。覆盖偏好写入 `lineae.config`，导入无效时保留当前有效配置。现有迁移清理键的路径独立于 `persist` 报错回调，后续需保住失败后的可恢复性。
- `ProjectModel.open` 读 `lineae:project-state:v1:<root>` 的 `main` 和 `files`（路径到 ID），有 native `loadState` 时尝试磁盘状态。主文件路径只接受 `.tex`；ID 按路径恢复并去重。`persistMetadata` 写上述字段，`RecoveryStore` 在 `lineae:project-recovery:v1:<root>` 保存 `{path,saved,draft}[]`。native adapter 串行写 `{main,files,drafts}`。持久化对象是明确列举的字段，新增字段需同时更新读写。
- `bridge.js:92–94` 使用 UTF-8 JSON 调 `load_state`、`checkpoint`、`ack_checkpoint`，经 `project.rs` 进入 `project_checkpoints.rs`。磁盘读取兼容旧 `.lineae-state.json` 与每进程 `.lineae-state-<id>.json`。最新修改的对象提供 metadata，非空草稿另带 `recoveryVersions[{id,drafts,expected}]`。恢复后用原 bytes 比对再归档，避免覆盖并发更新。写入受锁保护并使用安全落盘路径。坏 checkpoint 保留并报告，后续 metadata 写入受该状态限制。
- Web 项目模型、恢复、磁盘 mock、native bridge 契约及实际 Chromium 工程回归见 `baseline.json`。原生 WebView/Tauri 运行条件单列。

## 冻结与复现实验

`fixtures.sha256` 保存四份 XeLaTeX 金样的完整 SHA-256。每个哈希都从检出原字节计算并与 `origin/main` Git blob 对照。后续阶段必须保留这四份原字节，不用新的输出覆盖。已有浏览器入口当前依赖唯一的 Xe 风格路径。引擎选择可用后，应显式固定这些旧用例到 `xelatex`。 `probe-tex.py` 从 Phase A 起已用显式 `xelatex` 重编冻结段落，不写回 fixture。

```bash
npm ci --no-audit --no-fund
npm run build
npx playwright install --only-shell chromium
archive=$(npm pack mathlive@0.108.0 --silent)
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
sha256sum --strict -c docs/dual-engine/fixtures.sha256
bash docs/dual-engine/run-baseline.sh layout /absolute/evidence
node docs/dual-engine/probe-layout.cjs /absolute/evidence/byte-probe
python3 docs/dual-engine/probe-tex.py /absolute/evidence/tex
```

其余测试分组为 `node`、`project`、`source`、`editor`、`tikz`、`native`、`bib`。测试命令、准确退出码、环境、日志相对路径和状态见 [baseline.json](baseline.json)。每次采集运行对应版本的 `git rev-parse HEAD`。原生测试须有 Rust/Cargo 和目标平台开发依赖，桌面实际交互须有原生窗口环境。 `fixtures.sha256` 须配合保留既有文件字节的检出设置使用。

## 进入下一阶段前的风险

- 两个 paragraph golden 浏览器用例在 Linux Chromium 首个样本停止，后续样本和 xeCJK 脚本末尾的 IME 分支在该入口内未执行。字体网络响应和实际加载由独立探针记录。需要在固定环境中复跑，与现有 Windows 初次英文回归区分。
- 独立 TeX 参考分开记录编译成功和金样文本/坐标差异。用 TeX Live 版本、宏包版本、字体 hash、文本断行和坐标误差解释差异；后续 Lua 配置需要自己的成套参考。
- 固定 engine 与检测到的 preamble 语义应分别保存。冲突诊断、缓存失效、旧文件和项目恢复数据，均需用字节保真回归覆盖。Phase A 未触碰这些业务代码。

## 自测结果与阶段判定

**FAIL。** 基线在应用代码原样的情况下出现浏览器断行、绕排和一项独立 Xe 参考差异。书籍旧测试素材与 Linux 原生桌面工具链另外记为 BLOCKED。各失败均有可复现入口和日志。Phase B 的输入是这份冻结清单、失败证据与固定的工具链基线。

| 实测项 | 结果 |
| --- | --- |
| 四个关键入口 | `optimum-paragraph.test.mjs` 4/4，`typeset-layout.test.mjs` 11/11。英文 `paragraph-layout-browser.cjs` 和中文 `xecjk-layout-browser.cjs` 均退出 1。英文 22 mm 首行多出 `end-`，中文 45 mm 首行多出“断”。 |
| Node 和 config | 全量 927/927；其中参数专项 2/2、配置 7/7。 |
| 排版浏览器扩展 | 6 PASS、3 FAIL、1 BLOCKED，含两个关键段落入口。绕图测试报 `r-explicit-plain` 首行右沿 925.6875 px，参考上界 923.651075 px。旧 `book-fixtures-browser.cjs` 所需 `bookreporttest/test_book.tex` 未被该提交追踪，退出 1。 |
| 项目、源码、编辑器 | 工程浏览器 11/11，编辑器/快捷键三条入口 3/3，源码专项 18/19。单独直跑的 `source-workspace` 两次卡在浏览器剪贴板读回，退出 1。完整 `editor.cjs` 与 `source-eol-browser.cjs` 正常通过，同一混合换行用例在独立入口通过。 |
| TikZ / 字节保真 | WASM 与可视化电路浏览器 2/2。两个 article 均有真实视觉换行、字体加载，模式往返后 AST 和实际下载的 `.tex` SHA-256 一致。 |
| XeLaTeX / LuaLaTeX | 两引擎英文、中文四个最小 article 均生成 PDF，Poppler 提取正文、字体及边界坐标，原测试输入 SHA 不变。12 个冻结段落全部用显式 `xelatex` 编译，11/12 的文本和坐标比较通过。英文 margin 65 mm 样本的真实 XeTeX 首行相同，第三行等位置出现不同断词。 |
| Bib 真实编译 | 19/19 案例，BibTeX、Biber 各一次无修改往返 2/2，含 PDF 文本、字体、页数、坐标和图像。 |
| 原生桌面 | 资源 staging 退出 0。Cargo/Rust、WebKitGTK 4.1 / GTK 3 开发模块缺失，native 测试和构建 BLOCKED，真实 WebView 与目录选择 UNVERIFIED。 |

真实 TeX 使用 Linux 发布自带 XeTeX 0.999996、LuaHBTeX 1.18.0 和本地用户格式，宏包来自安装树和 TeX Live 2025 冻结归档。Xe 参考原始记录为 TeX Live 2023。Fontspec 为 2.9e，xeCJK 为 3.9.1，Geometry 为 5.9。字体精确版本、TeX/Poppler 子工具版本及 SHA 记录在 `baseline.json` 和证据包 `setup/tex-package-versions.log`。Lua 最小编译证明工具链和本轮样本可运行，浏览器尚无 LuaLaTeX 校准路径。

Linux 自测使用的额外 TeX 包归档、外部工具补齐、失败尝试与确认命令见证据包 `setup/`。原生进程和未触达断言按实际执行范围记录。独立验收在候选提交之后从独立 Git 检出复验，验收记录在证据包 `acceptance/`，包含候选和父提交 SHA。
