# 正文页渲染内核修改提案（待仓库主人审批）

> 背景：Lineae 渲染内核（`apps/web/src/editor/typeset-pagination.js` 分页引擎，
> 依赖 `apps/web/latex/typeset-layout.mjs` 的 `planPagination`）目前**不感知分栏**。
> 按仓库要求，内核暂保持原样；本文件列出拟修改的内核位置、改法与影响，
> 获批前相关 UI（「布局 → 全局分栏」控件）已注释停用，见 `main.js` 中
> `// 全局分栏：正文页渲染内核……` 注释段。

## 现状（未修改的内核行为）

- 内核按**整页文本宽度**测量块高、按 `pageHeight + pageGap` 的网格平移块，
  每页视为单栏（`planPagination(virtual, geometry)`）。
- 全局两栏仅靠 CSS 实现：
  `.document-page[data-global-columns="2"] .ProseMirror { column-count:2; column-gap:2em; column-fill:auto; }`
- 缺陷：连续流容器高度不固定，`column-fill:auto` 令全部内容堆积在左栏；
  且分页规划的容量与半宽渲染不匹配（每页内容量只有一栏半）。即「全局分两栏时
  所有内容集中到左边栏」的 bug 根源在**内核无栏位感知**，CSS 无法独立修复。

## 拟修改的内核部分（typeset-pagination.js，共 7 处）

1. **`layout()` 几何计算处**：新增 `columnsMode = page.dataset.globalColumns === '2'`
   与 `columnBody = pageHeight - marginTop - marginBottom`。
2. **baseRules 注入处**：`columnsMode` 下给每个块追加
   `{ width: calc(50% - 1em) }`，使测量与文本重排在**栏宽**下进行。
3. **块测量处**：`columnsMode` 下跳过段内行分割（`paragraphLines` 不调用），
   段落作为整体参与规划。
4. **规划处（核心）**：以栏为「伪页」调用现有 `planPagination`：
   `planPagination(pseudoBlocks, { pageHeight: columnBody, pageGap: 0, marginTop: 0, marginBottom: 0 })`，
   之后把每 2 个伪页映射回 1 张纸：
   `finalTranslation = translation + floor(j/2)*(pageHeight+pageGap) + marginTop - j*columnBody`，
   其中 `j = floor((top + translation) / columnBody)`。
5. **表格续行处**：`columnsMode` 下禁用跨页/跨栏表格续行（整表移栏）。
6. **规则生成处**：`columnsMode` 下伪页号为奇数的块追加
   `margin-left: calc(50% + 1em)`（右栏横移）。
7. **页数换算处**：`sheets = ceil(plan.pageCount / 2)`，供
   `--page-stack-height`、`--editor-min-height`、`data-page-count` 与 `renderSheets` 使用。

不改 `planPagination` 本身（纯函数，复用）；不改页面家具/页码渲染。

## 影响面

- 仅当 `data-global-columns="2"` 时走新分支；单栏文档路径逐字节不变。
- 已按此方案实现并验证过（伪页映射数值模拟 + 11 个单测通过），
  实现见 `lineae-session-changes.patch` 历史版本，获批后整体恢复。
- 「布局 → 全局分栏」控件已注释停用；恢复时同步恢复 `main.js` 注释段、
  以及 `pages.css` 中被方案替代的 CSS 栏规则（现为原样保留）。

## 已知限制（实现时记录在案的取舍）

- 段落不跨栏拆分（整体移栏，栏底可能留白；XeLaTeX 为段内断行）；
- 表格不跨栏续行；`\section` 未做通栏；末页两栏未平衡；
- 浏览器端视觉回归需人工确认（CI 的 Playwright 步骤未运行）。
