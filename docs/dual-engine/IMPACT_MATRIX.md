# Lineae V4 Phase A 影响矩阵

审计对象为 GitHub main 的 `cb52ec41f13246f0e11d8c28a0158224ddbb9700`。表中职责来自该提交的源码和测试入口。未来适配工作留待 Phase A 验收之后。

| 文件或模块 | 当前职责 | 后续边界与验收 |
| --- | --- | --- |
| `apps/web/latex/typeset-layout.mjs` | `typesetProfile` 识别文档类、字号、基线、缩进及 fontspec/ctex/CJK 字体名称。文件还包含纯分页与表格行规划 `planPagination`、`planTableRows`。 | 保留页面单位、页面和表格规划。将由引擎决定的字体及默认排版参数注入 profile。跑 `typeset-layout.test.mjs`、附录/表格/分页浏览器回归。 |
| `apps/web/src/typesetting/optimum-paragraph.mjs` | 纯 boxes/glue/penalties 断行。处理 pretolerance/tolerance、emergency stretch、断词 penalty、相邻行 fitness 等。 | 保留算法一份。对相同输入验证相同断点和行宽。 |
| `apps/web/src/typesetting/paragraph-layout.js` | 读取 ProseMirror 节点、DOM、Canvas 宽度与行约束，执行词法切分、标点 glue、断词、绕图宽度并构建 decorations。 | 保留 DOM 映射、测量、token 遍历、绕图和 decoration。引擎差异以输入传入。使用中英文参考、绕图、真实字符坐标、混合换行和 IME 回归。 |
| `apps/web/src/typesetting/paragraph-parameters.mjs` | 读取导言参数、单位、spaceskip、断词例外、CJK 标点与 glue 配置。 | 单位和通用声明解析共享。核对引擎默认值和冲突诊断；跑 `paragraph-parameters.test.mjs`。 |
| `apps/web/src/typesetting/fandol-pairs.mjs`、`fandol-punctuation.mjs` | 存储 XeTeX/Fandol 常规和粗体标点边界与 glue 数据。 | 保留 Xe 校准来源，Lua 数据独立测量，按字体、版本和引擎选择，未知配置明确降级。 |
| `apps/web/src/typesetting/english-hyphenation.mjs`、`english-patterns.mjs` | TeX 英文断词模式与例外表。 | 共用断词实现。将语言、词首/词尾限制及例外来源明确传入，避免为某一引擎静默替换冻结参考。 |
| `apps/web/src/typesetting/layout-geometry.js`、`apps/web/src/editor/typeset-pagination.js`、`apps/web/pages.css` | 逻辑缩放、字体面与 CSS 属性、DOM 坐标、页面装饰、跨页表格、页眉页脚和排版刷新。 | 保留测量和分页代码，缓存须能识别字体指标/profile 变化。关注同一文档切换 profile、页面数/滚动/位置、字体加载和 IME。 |
| `apps/web/src/main.js`、`apps/web/src/editor/latex-codec.js` | 读入原始 `.tex`、建立投影、保存编辑并传导言至排版层。项目根文件另从模型取 draft。 | 引擎选择独立于源码，适配前后应观察同一 AST、历史和 source buffer。验收覆盖 BOM、LF/CRLF、注释、自定义命令、未知块及字节哈希。 |
| `apps/web/config.yaml`、`apps/web/src/editor/config.mjs`、`config-migrations.mjs` | 全局 YAML v2 偏好、格式校验、v1 迁移、旧 localStorage 键合并。 | 加字段前测试 v1、v2、缺版本、未知键、无效导入和恢复。全局默认、用户强制选择、解析结果分别持久化或计算。 |
| `apps/web/src/project/project.mjs`、`recovery.mjs`、`explorer.js`、`apps/desktop/src-tauri/src/bridge.js`、`project.rs`、`project_checkpoints.rs` | 项目根、主文件、稳定文件 ID、草稿恢复和原生 checkpoint。 | 如需存项目引擎选项，沿现有 metadata/checkpoint 读写成对迁移，按项目根隔离。验证旧恢复文件、版本并发、工作区切换、失败后重试。 |
| `apps/web/src/ui/tikz-studio.js`、`apps/web/src/tikz/`、`scripts/install-mp-tikz-wasm.mjs` | 通用 TikZ 浏览器 SVG 渲染与 CircuiTikZ 编辑。安装器固定 WASM 0.5.1。 | 保持局部预览的引擎路由隔离。分别跑通用 TikZ WASM 和可视化编辑回归。 |
| `tests/bib/compile/`、`tests/bib/verify-xelatex.mjs`、`tests/bib/pdf/` | 测试进程调用 XeLaTeX/BibTeX/Biber/Poppler 取得文献和 PDF 独立证据。 | 保留显式 Xe 调用。后续 Lua 每个样本单独编译，分别记宏包、字体、度量、退出码、PDF 坐标。业务层保留编译接口边界。 |
| `tests/fixtures/{appendix-xelatex,chapter-xelatex}.json`、`tests/fixtures/paragraph-layout/*.json` | XeLaTeX 旧金样，已按原始 Git blob 及检出字节冻结。 | 两者每次都跑 SHA-256。旧 Node/浏览器测试当前使用 Xe 语义，加入选择后必须显式选 Xe，新增 Lua 金样另存。 |
