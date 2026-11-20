# 图标规格审计（只读审计）

- 范围：工具栏、右键菜单、悬停按钮、对话框、标签页的图标/可访问名称/tooltip。
- 方法：阅读 `apps/web/src/editor/icons.js`、`main.js`、`context-menu.js`、`format-controls.js`、`table-hover.js`、`references.js`、`math-node.js`、`dialog.js`。
- **不增加依赖，不修改 CSS、工具栏或核心逻辑**；本文只给建议。
- 现状两个问题：
  1. `icons.js:25` 对未知图标名回退到 `paths.math`，导致所有未登记动作都显示同一个数学图标。
  2. `icons.js:33-34` 只给 `map` 中 11 个标签设置图标；`aria-label` 直接使用可见文本（可能是 `↶`、`▦`、`$` 等符号），不是动作名。
- 原则：图标必须表达动作；语义不清时保留文字；数学操作使用具体数学图形，不能用通用 `math` 图标代替所有数学动作。

## 1. 现有图标清单（`icons.js:2-19`）

| 图标名 | 语义 | 当前使用 |
|---|---|---|
| `undo` | 撤销 | `↶` |
| `redo` | 重做 | `↷` |
| `list` | 列表 | `itemize`、`enumerate` |
| `table` | 表格 | `▦` |
| `row` | 行 | `＋ Row` |
| `column` | 列 | `＋ Column` |
| `math` | 数学（通用） | `$`、`$$`，以及所有未知 id 的回退 |
| `code` | 代码/源码 | `LaTeX` |
| `cut` / `copy` / `paste` | 剪切/复制/粘贴 | 右键菜单（部分） |
| `delete` | 删除 | 右键菜单（部分） |
| `bold` / `italic` | 粗体/斜体 | 右键菜单（部分） |
| `select-all` | 全选 | 右键菜单 |
| `heading-number` | 标题编号 | 右键菜单 |

## 2. 缺图标操作与建议

### 2.1 顶栏 / 文件

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 打开 .tex | `index.html:15` | 纯文字 | `open-file`（新） | 打开 .tex / Open .tex | 打开 .tex / Open .tex |
| 保存 .tex | `index.html:16` | 纯文字 | `save-file`（新） | 保存 .tex / Save .tex | 保存 .tex / Save .tex |
| 界面语言 | `index.html:17-20` | 原生 select | 保留 select；可选 `language`（新） | 界面语言 / Interface language | 界面语言 / Interface language |
| 配置 | `main.js:743-751` | 纯文字 | `settings`（新） | 配置 / Config | 配置 / Config |

### 2.2 主页 / 插入

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 撤销 | `main.js:145` | `undo` | 复用 `undo` | 撤销 / Undo | 撤销 / Undo |
| 重做 | `main.js:146` | `redo` | 复用 `redo` | 重做 / Redo | 重做 / Redo |
| 粗体 | `main.js:147`、`673` | 文字 `B` | 复用 `bold` | 粗体 / Bold | 粗体 / Bold |
| 斜体 | `main.js:148`、`674` | 文字 `I` | 复用 `italic` | 斜体 / Italic | 斜体 / Italic |
| 下划线 | `main.js:149`、`675` | 文字 `U` | `underline`（新） | 下划线 / Underline | 下划线 / Underline |
| 段落样式 | `main.js:156-160` | 原生 select | 保留 select；可选 `paragraph-style` | 段落样式 / Paragraph style | 段落样式 / Paragraph style |
| 文字颜色 | `format-controls.js:3-11` | 字母 `A` | `text-color`（新）或保留 `A` + tooltip | 文字颜色 / Text color | 文字颜色 / Text color |
| 字体 | `format-controls.js:13-23` | 原生 select | 保留 select；可选 `font-family` | 字体 / Font | 字体 / Font |
| 字号 | 同上 | 原生 select | 保留 select；可选 `font-size` | 字号 / Size | 字号 / Size |
| `itemize` | `main.js:168` | `list` | 复用 `list`；文字保留 `itemize` | `itemize`（无序列表）/ `itemize` (bulleted list) | `itemize`（无序列表）/ `itemize` (bulleted list) |
| `enumerate` | `main.js:169` | `list` | 复用 `list`；文字保留 `enumerate` | `enumerate`（有序列表）/ `enumerate` (numbered list) | `enumerate`（有序列表）/ `enumerate` (numbered list) |
| 插入表格 | `main.js:170,659` | `table` | 复用 `table` | 插入表格 / Insert table | 插入表格 / Insert table |
| 插入行/列 | `main.js:244-245,660-661` | `row` / `column` | 复用 `row` / `column` | 插入行/列 / Insert row/column | 插入行/列 / Insert row/column |
| 行内/行间公式 | `main.js:246-247,721-722` | `math` | `inline-math` / `display-math`（新，具体） | 行内公式 / Inline math；行间公式 / Display math | 同上 |
| 源码模式 | `main.js:326` | `code` | 复用 `code`；文字保留 `LaTeX` | LaTeX 源码 / LaTeX source | LaTeX 源码 / LaTeX source |

### 2.3 表格

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 插入表格 | `main.js:659` | `table` | 复用 `table` | 插入表格 / Insert table | 插入表格 / Insert table |
| 插入行/列 | `main.js:660-661` | `row`/`column` | 复用 | 插入行/列 / Insert row/column | 插入行/列 |
| 删除行/列 | `main.js:662-663` | 纯文字 | `delete-row` / `delete-column`（新） | 删除行/列 / Delete row/column | 删除行/列 |
| 删除表格 | `main.js:664` | 纯文字 | `delete-table`（新）或复用 `delete` | 删除表格 / Delete table | 删除表格 |
| 合并单元格 | `main.js:665` | 纯文字 `merge` | `merge-cells`（新） | 合并单元格 / Merge cells | 合并单元格 |
| 拆分单元格 | `main.js:666` | 纯文字 `split` | `split-cell`（新） | 拆分单元格 / Split cells | 拆分单元格 |
| 三线表 | `main.js:667` | 纯文字 `booktabs` | `booktabs`（新）或复用 `table` | 三线表（booktabs）/ Booktabs table | 三线表（booktabs） |
| 左/中/右对齐 | `main.js:668` | `左/中/右` | `align-left` / `align-center` / `align-right`（新） | 左对齐/居中/右对齐 | 左对齐/居中/右对齐 |
| 悬停加行/列 | `table-hover.js:2-16` | `+` 文本 | `add-row` / `add-column`（新）或复用 `row`/`column`+plus | 在下方插入行 / Insert row below；在右侧插入列 / Insert column right | 同左 |

### 2.4 格式

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 粗体/斜体/下划线 | `main.js:673-675` | 文字 | `bold` / `italic` / `underline` | 见 2.2 | 见 2.2 |
| 删除线 | `main.js:676` | 文字 `S` | `strike`（新） | 删除线 / Strikethrough | 删除线 |
| 代码 | `main.js:677` | 文字 `code` | 复用 `code` | 代码 / Code | 代码 |
| 引用块 | `main.js:678` | 文字 `quote` | `quote`（新） | 引用块 / Blockquote | 引用块 |
| 分隔线 | `main.js:679` | 文字 `hr` | `horizontal-rule`（新） | 分隔线 / Horizontal rule | 分隔线 |
| 描述列表 | `main.js:680` | 文字 `desc` | `description-list`（新）或复用 `list` | 描述列表 / Description list | 描述列表 |
| 数字编号 | `main.js:685` | 文字 `1.` | `marker-decimal`（新） | 数字编号 / Decimal numbering | 数字编号 |
| 小写字母 | `main.js:686` | 文字 `a.` | `marker-alpha`（新） | 小写字母编号 / Lowercase letters | 小写字母编号 |
| 大写字母 | `main.js:687` | 文字 `A.` | `marker-alpha`（新） | 大写字母编号 / Uppercase letters | 大写字母编号 |
| 大写罗马 | `main.js:688` | 文字 `I.` | `marker-roman`（新） | 大写罗马编号 / Uppercase Roman | 大写罗马编号 |
| 甲乙丙丁 | `main.js:689` | 文字 `甲` | `marker-cjk`（新） | 甲乙丙丁编号 / Heavenly stems | 甲乙丙丁编号 |
| 自定义符号 | `main.js:690` | 文字 `•` | `marker-custom`（新）或保留 `•` | 自定义项目符号 / Custom bullet | 自定义项目符号 |

> 说明：5 个列表编号按钮如全部复用 `list` 图标，无法区分；建议用不同的 `marker-*` 图标，或保留 `1./a./A./I./甲` 文字 + 双语 tooltip。

### 2.5 引用

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 标签 | `main.js:691` | 文字 `label` | `label`（新） | 标签（`\label`）/ Label (`\label`) | 标签 |
| 引用 | `main.js:700` | 文字 `ref` | `reference`（新） | 引用（`\ref`）/ Reference (`\ref`) | 引用 |
| 目录 | `main.js:704` | 文字 `toc` | `table-of-contents`（新）或复用 `list` | 目录 / Contents | 目录 |
| 短标题 | `main.js:708` | 文字 `short` | `short-title`（新） | 短标题 / Short title | 短标题 |
| 标题 | `main.js:713` | 文字 `title` | `document-title`（新） | 标题 / Title | 标题 |
| 作者 | `main.js:717` | 文字 `author` | `author`（新） | 作者 / Author | 作者 |
| 内联 label 节点 | `references.js:84` | `#key` 文本 | `label`（可选，但不宜显示完整 key） | 标签 / Label | 标签（不显示 key 更安全） |
| 引用节点 | `references.js:42` | `§n` / `→key` | `reference`（可选） | 引用 / Reference | 引用 |

### 2.6 数学

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 行内/行间公式 | `main.js:721-722` | 通用 `math` | `inline-math` / `display-math`（新） | 行内公式 / Inline math；行间公式 / Display math | 同上 |
| 分式 | `main.js:723` | 文字 `frac` | `fraction`（新，分式线+上下位） | 分式 / Fraction | 分式 |
| 根式 | `main.js:724` | 文字 `sqrt` | `radical`（新，√） | 根式 / Square root | 根式 |
| 求和 | `main.js:725` | 文字 `sum` | `summation`（新，Σ） | 求和 / Summation | 求和 |
| 积分 | `main.js:726` | 文字 `int` | `integral`（新，∫） | 积分 / Integral | 积分 |
| 矩阵 | `main.js:727` | 文字 `matrix` | `matrix`（新，网格） | 矩阵 / Matrix | 矩阵 |
| 分段 | `main.js:728` | 文字 `cases` | `cases`（新，左花括号+两行） | 分段函数 / Cases | 分段函数 |
| 对齐 | `main.js:729` | 文字 `align` | `align-environment`（新，等号对齐线） | 对齐环境 / Align | 对齐环境 |

> 不建议把 `frac/sqrt/sum/int/matrix/cases/align` 全部复用 `math`；必须能区分动作。

### 2.7 右键菜单

`context-menu.js:242-243` 用 `icon(...)` 生成图标，未知 id 会回退到 `math`。建议按下表映射：

| 命令 id | 位置 | 当前 | 建议 |
|---|---|---|---|
| `undo`/`redo` | `context-menu.js:96-97` | `undo`/`redo` | 复用 |
| `cut`/`copy`/`paste` | `context-menu.js:98-114` | `cut`/`copy`/`paste` | 复用 |
| `select-all` | `context-menu.js:115-118` | `select-all` | 复用 |
| `bold`/`italic` | `context-menu.js:119-120` | `bold`/`italic` | 复用 |
| `heading-number` | `context-menu.js:121-124` | `heading-number` | 复用 |
| `heading-short-title` | `context-menu.js:125-133` | 回退 `math` | `short-title` |
| `heading-label`/`edit-label` | `context-menu.js:134-157` | 回退 `math` | `label` |
| `description-term` | `context-menu.js:158-166` | 回退 `math` | `term` 或 `description-list` |
| `insert-ref`/`edit-ref` | `context-menu.js:167-183` | 回退 `math` | `reference` |
| `table-of-contents` | `context-menu.js:184-190` | 回退 `math` | `table-of-contents` |
| 表格行/列/删除 | `context-menu.js:191-200` | `row`/`column`/`delete` | 复用 + `delete-row`/`delete-column`/`delete-table` |
| `delete-formula` | `context-menu.js:201-206` | `delete` | 复用 `delete` |
| `display-style` | `context-menu.js:90-95` | 回退 `math` | `display-math` |
| 矩阵行/列/括号 | `context-menu.js:41-89` | `row`/`column`/回退 `math` | `row`/`column`/`matrix` |

### 2.8 对话框、拖动、标签页

| 操作 | 位置 | 当前 | 建议图标 | 双语 tooltip | 可访问名称 |
|---|---|---|---|---|---|
| 对话框确认/取消 | `dialog.js:14-19` | 纯文字 | `check` / `close`（新） | 确定/取消 / OK/Cancel | 确定/取消 |
| 公式拖动柄 | `math-node.js:80-84` | `⠿` 文本 | `drag-handle`（新）或保留 `⠿` | 拖动公式 / Drag formula | 拖动公式 |
| 标签页 | `main.js:767-771` | 纯文字 | 可选 `tab-*` 图标（不强制） | 对应标签页名称 | 对应标签页名称 |
| 命令候选 | `main.js:549-557` | 纯文字 `\name` | 不需要动作图标；可选分类图标 | 候选是命令名，不译 | 命令名 |

## 3. 可访问名称与 tooltip 规格

- 所有只有图标、没有文字的按钮必须有 `aria-label`，内容为动作名（中文或英文，随界面语言），不能是 `↶`、`▦`、`$` 等符号。
- 所有按钮建议有 `title` 双语说明，例如 `合并单元格 / Merge cells`；tooltip 不替代 `aria-label`。
- 装饰性 SVG 继续 `aria-hidden="true"`（`icons.js:22`），按钮本身提供名称。
- 有文字 + 图标的动作（如 `itemize`、`LaTeX`），保留文字 token；图标只辅助识别。
- 语义不清的动作（`1./a./A./I./甲/•`）优先保留可见文字，或使用明确 `marker-*` 图标 + tooltip。
- 禁止用通用 `math` 图标回退所有未知项；`icons.js:25` 的回退应被显式映射替代。

## 4. 验收建议（给实现者）

1. 为本文第 2 节每个“新”图标补齐 SVG 或明确复用已有图标，禁止全部复用 `math`。
2. 为每个操作补 `aria-label` 与双语 `title`；用真实动作名，不用字形。
3. 保留 LaTeX 命令名可见 token（`itemize`、`LaTeX`、`frac` 等），不因图标替换而改名。
4. 右键菜单的未知 id 不得再回退到 `math`；未登记 id 应在审计中补映射。
5. 图标只表达动作；若一个图标无法表达（如 5 种列表编号），保留文字或细分图标。
