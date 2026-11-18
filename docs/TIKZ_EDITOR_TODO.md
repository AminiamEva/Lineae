# TikZ 编辑器重做清单（参照 Circuit2TikZ/CircuiTikZ-Designer）

参考工程本地副本：`/mnt/agents/output/CircuiTikZ-Designer`（TS 源码，GPL-3.0，许可兼容）。
现有实现：`apps/web/src/tikz/tikz-editor.js`（需按本清单重做/大修）。

## P0 紧急缺陷（先行修复）
- [x] **P0-1 幽灵泄漏**：`redrawGhost()`/`redrawWirePreview()` 每次 pointermove 向 world **追加**节点且 `redraw()` 只清 `[data-item]`，导致符号/预览线随鼠标轨迹堆积（用户截图：未点击即"画出"整串符号）。
  修法：渲染分层——world 下固定顺序子层 `layer-grid / layer-items / layer-preview / layer-ghost`，重绘时整体替换 preview/ghost 层内容，绝不增量 append 未标记节点。
- [x] **P0-2 缩放三件套失联**：滚轮改 `view.k`（视图），slider/输入框改 `widthFraction`（导出宽度），两套状态互不同步。
  目标模型（单一数据源）：内容几何尺寸恒定；`view.k` 为唯一缩放状态；slider+输入框显示并控制「内容物理宽度占 \textwidth 的比例」`v = contentWidthCm(view.k) / textwidthCm`，滚轮缩放时按同一公式回写 slider/输入框（参考 `CircuiTikZ-Designer/src/scripts/controllers/canvasController.ts` 的 zoom 逻辑 + 顶栏 zoom 输入联动）。

## P1 目录结构对齐（右侧边栏，分类树照抄对方）
- [x] 解析 `symbols.svg` 全部 `<symbol id>`，按 id 前缀分组（对方分类法）：`node_*`、`path_*`、`open_*`、`ellipse_*`、`npath_*`、`amp_*` 等，生成**可折叠分类树**（参考 `componentPlacer.ts` 的分类与 `mainController.ts` 对 `leftOffcanvasAccordion` 的填充逻辑），放到**右侧边栏**（用户指定），支持搜索过滤。
- [x] 我方代码目录镜像对方结构：`tikz/controllers/`（canvas/snap/export/selection）、`tikz/snapDrag/`（snapController/snapPoint/snapCursor/dragHandlers）、`tikz/components/`（各元件类）。

## P2 网格吸附与元件放置（核心，参照对方实现，可逐行转译）
- [x] 网格：major/minor 两级（参考 `canvasController.ts`：major 间距 + 每格 minor 数，虚点/细线），切换显示。
- [x] 移植 SnapController（`snapDrag/snapController.ts`、`snapPoint.ts`、`snapCursor.ts`、`dragHandlers.ts` 约 700 行）：最近点吸附、距离阈值、吸附优先级 **元件端点 > 网格点**、吸附时光标/指示点反馈。
- [x] 元件端子系统：每个元件类声明 `snappingPoints`（端子坐标随 transform 重算，参考 `circuitComponent.recalculateSnappingPoints`）。
  - 连线起点/终点吸附端子；放置新元件时其端子对齐已有端子（"原件的端点也会有吸附"）。
  - 拖动元件时端子吸附（`SnapDragHandler.snapDrag`）。
- [x] 放置流程：palette 点击/拖出 → ghost 跟随（每次重绘替换 ghost 层）→ 单击落下（吸附后）。

## P3 元件库与可调尺寸
- [x] 元件基类（对照 `components/circuitComponent.ts`）：id、symbol 引用、位置/旋转矩阵、选中框、端子、可 resize 声明。
- [x] 分类实现（按对方组件逐一移植，至少覆盖常用集）：
  - `nodeSymbolComponent`：ground/vcc/vee/circ 等固定符号（旋转支持）。
  - `pathSymbolComponent`：R/C/L/D 等，**主体长度可拖调**，两端端子位置随长度更新（参考 `pathComponent.resizableSVGs`）。
  - `openComponent`：**美式电压源/电流源 +/- 间距可拖调**（用户点名；参考 `openComponent.ts` 的 resize 逻辑，约 286-369 行）、开关类。
  - `ellipseComponent`：圆圈/椭圆类。
- [x] 选中单件时显示尺寸手柄，拖动实时更新主体并同步端子与导出参数。

## P4 尺寸标定（0.6\textwidth 匹配）
- [x] 建立恒定 px↔cm 标定常数（查参考 `exportController.ts` 的坐标换算常数并沿用），100% 视图下 1cm = 常数 px；symbol 默认尺寸按 circuitikz 默认物理尺寸反推 px。
- [x] 2026-11-19 起改为页面缩放模型：100% = 一个 `\textwidth`；导出默认使用真实 cm 坐标、不再用 `\resizebox` 强制 0.6；编辑器 100% 与自然 LaTeX 尺寸一致。

## P5 连线与导出
- [x] 连线起止吸附端子；导出用 circuitikz `to[...]`，跨接点可用 `(a) to[short] (b)` 或坐标直连（与参考 `exportController` 一致）。
- [x] 可调尺寸元件的长度/间距参数写入对应 `to[]` 选项或 `node[...]` 附加参数。
- [x] 文字标签：默认 12pt（已符合，保留），导出 `\node[font=\fontsize{12}{14.4}\selectfont] {$...$};`。

## P6 回归与交付
- [x] 导出函数纯逻辑单测（坐标换算、resizebox 包裹、长度参数）。
- [x] 手工 smoke：放置→吸附→拖调→导出→插入→保存 .tex→重新打开往返。
- [x] 以 d501f72 为基点重出补丁；确认 main.js/pages.css 仍为纯增量。


> 全部完成（2026-11-18）：目录镜像、全量符号树、吸附+指示、对齐辅助线、撤销/重做、
> 可调尺寸（path/open/ellipse）、标定、导出、tests/tikz-export.test.mjs。

## 2026-11-18 重新核对（参考仓库 + manual）

- `symbols.svg` 的 pin 缺省坐标必须按 0 处理；旧解析产生的 `NaN` 已消除。
- `variant` 的 `mid`、`viewBox`、全部 `pin`、`textpos`、`options` 已按参考数据解析。
- Node 元件的所有命名 pin 都是 snap point；移动/放置时额外允许中心点参与吸附。
- Path 元件保持自然尺寸，START/END 是 adjustment points，其余 pin 是 snap points；
  不再把整个符号横向拉伸到鼠标距离。
- 样式选项来自 variant 的 `<options>` / `<enumopt>`；选择样式会切换 variant，并同步
  pin、引线、样式属性和 TikZ 选项。
- `tests/tikz-export.test.mjs` 覆盖全部 402 个定义、有限 pin 坐标、NPN/Transformer/VCO
  的 pin 与样式切换，以及路径 adjustment points。

## 2026-11-18 正文预览与交互补全

- `TikzEditor` 增加选择、Pan（左键拖动画布）、Eraser、Undo/Redo/Clear/Fit 工具。
- 右侧栏增加选择摘要（元件名、位置、物理尺寸）、网格吸附开关和完整工具组。
- American voltage source 缺失的 artwork 使用圆加正负号 fallback；`+`、`-` 也注册为 snap points。
- 共 36 个 symbols.svg 缺失 ID 使用最近 artwork alias，避免空白元件。
- 新增 `preview-renderer.js`：在正文的 `tikz`/`circuitikz` code block 前插入只读 SVG 预览，不替换原有 code block 编辑内核。
- TikZ 坐标改为真实 cm 单位；默认 bipole pin spacing 约 1.12 cm，与 LaTeX 默认 resistor body 实测一致。

