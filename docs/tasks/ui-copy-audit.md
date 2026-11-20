# UI 双语文案盘点（只读审计）

- 范围：现有按钮、标签页、菜单、提示、对话框、空状态、错误状态、禁用原因。
- 方法：逐文件阅读当前源码，记录真实位置；**不修改应用源码**。
- 行号基于本次审计时的源码，后续修改可能移动。
- LaTeX 命令名（`itemize`、`frac`、`\label` 等）必须保留为原命令，不得翻译成其他命令；建议只补充双语说明/tooltip。
- 状态：`双语` = 当前已有中英文；`仅中`/`仅英` = 缺另一语言；`命令名` = 以 LaTeX 命令或符号作为可见文本；`空/错/禁` = 空状态、错误或禁用相关文案。

## 1. 顶栏与文件操作

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `apps/web/index.html:15` | `打开 .tex` | 双语（`main.js:761` 切换） | 打开 .tex | Open .tex | 保留 `.tex` |
| `apps/web/index.html:16` | `保存 .tex` | 双语（`main.js:759` 切换） | 保存 .tex | Save .tex | 初始 `disabled`，`main.js:334` 启用 |
| `apps/web/index.html:17-20` | `简体中文` / `English` | 双语 | 简体中文 | English | 语言选项本身不应翻译 |
| `apps/web/index.html:14` | `编辑工具 / Editing tools` | 双语 | 编辑工具 | Editing tools | 区域 aria-label |
| `apps/web/src/main.js:743-751` | 配置按钮（初始无文字，`main.js:760` 设置） | 双语 | 配置 | Config | 导出 `config.yaml` |
| `apps/web/index.html:24` | 状态区（初始隐藏） | 空/错/禁 | 就绪 | Ready | 不主动显示空状态 |
| `apps/web/index.html:5,13` | `Lineae` | 双语（品牌名不译） | Lineae | Lineae | 品牌名 |

## 2. 标签页

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:741` | `文件/主页/插入/表格/格式/引用/数学` | 双语 | 文件 | File | `updateLanguage` 切换 |
| 同上 | `主页` | 双语 | 主页 | Home | |
| 同上 | `插入` | 双语 | 插入 | Insert | |
| 同上 | `表格` | 双语 | 表格 | Table | |
| 同上 | `格式` | 双语 | 格式 | Format | |
| 同上 | `引用` | 双语 | 引用 | Reference | 不是 LaTeX `\cite`，避免译成“文献引用” |
| 同上 | `数学` | 双语 | 数学 | Math | |

## 3. 主页（Home）

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:145` | `↶` | 命令名/符号 | 撤销 | Undo | 已有 tooltip：`icons.js:28` `撤销 / Undo`；aria-label 应写动作而非字形 |
| `main.js:146` | `↷` | 命令名/符号 | 重做 | Redo | `icons.js:28` |
| `main.js:147` | `B` | 仅英/符号 | 粗体 | Bold | 缺少 title/aria-label |
| `main.js:148` | `I` | 仅英/符号 | 斜体 | Italic | 缺少 title/aria-label |
| `main.js:149` | `U` | 仅英/符号 | 下划线 | Underline | 缺少 title/aria-label |
| `main.js:156-157` | 段落样式选择器 aria `段落样式 / Paragraph style` | 双语 | 段落样式 | Paragraph style | |
| `main.js:158` | `正文 / Text` | 双语 | 正文 | Text | |
| `main.js:158` | `section` / `subsection` / `subsubsection` | 命令名 | `section`（一级标题） | `section` (level 1 heading) | 可见 token 保留 `section`，不得改成其他命令 |
| `main.js:168` | `itemize` | 命令名 | `itemize`（无序列表） | `itemize` (bulleted list) | 保留 `itemize` 作为 token |
| `main.js:169` | `enumerate` | 命令名 | `enumerate`（有序列表） | `enumerate` (numbered list) | 保留 `enumerate` |
| `main.js:170` | `▦` | 符号 | 插入表格 | Insert table | `icons.js:30` title 目前是 `▦` |
| `main.js:244` | `＋ Row` | 仅英/混合 | 插入行 | Insert row | |
| `main.js:245` | `＋ Column` | 仅英/混合 | 插入列 | Insert column | |
| `main.js:246` | `$` | 命令名/符号 | 行内公式 | Inline math | 不要改成 `formula` |
| `main.js:247` | `$$` | 命令名/符号 | 行间公式 | Display math | 不要改成 `equation` 以外的新命令名 |
| `format-controls.js:6` | `文字颜色 / Text color` | 双语 | 文字颜色 | Text color | |
| `format-controls.js:19` | `字体 / Font`、`字号 / Size` | 双语 | 字体 / 字号 | Font / Size | |

## 4. 插入（Insert）

当前分组由 `main.js:737-739` 的启发式决定：`itemize`、`enumerate`、`▦`、`＋ Row`、`＋ Column`、`$`、`$$`、`LaTeX` 进入 Insert。下表按当前 DOM 结果列出。

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:168-170` | `itemize`、`enumerate`、`▦` | 命令名/符号 | 见主页 | 见主页 | |
| `main.js:244-247` | `＋ Row`、`＋ Column`、`$`、`$$` | 混合 | 见主页 | 见主页 | |
| `main.js:326` | `LaTeX` | 命令名 | `LaTeX`（源码模式） | `LaTeX` (source mode) | 保留 `LaTeX` token |
| `icons.js:31` | `LaTeX` tooltip | 仅命令名 | 源码模式 | Source mode | 可见文字保留 `LaTeX` |

## 5. 表格（Table）

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:659` | `▦` | 符号 | 插入表格 | Insert table | |
| `main.js:660-661` | `＋ Row` / `＋ Column` | 仅英/混合 | 插入行 / 插入列 | Insert row / Insert column | |
| `main.js:662-663` | `－ Row` / `－ Column` | 仅英/混合 | 删除行 / 删除列 | Delete row / Delete column | |
| `main.js:664` | `删除表格` | 仅中 | 删除表格 | Delete table | |
| `main.js:665` | `merge` | 仅英 | 合并单元格 | Merge cells | 不是 LaTeX 命令；不要写成 `\merge` |
| `main.js:666` | `split` | 仅英 | 拆分单元格 | Split cells | 不是 LaTeX 命令 |
| `main.js:667` | `booktabs` | 命令名/包名 | 三线表（booktabs） | Booktabs table | 保留 `booktabs` token |
| `main.js:668` | `左` / `中` / `右` | 仅中 | 左对齐 / 居中 / 右对齐 | Align left / Center / Align right | |
| `main.js:659-672` | 无禁用态 | 空/错/禁 | 在表格外禁用并说明原因 | Disabled outside tables | 当前按钮始终可点，动作内部判断 |

## 6. 格式（Format）

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:673-675` | `B` / `I` / `U` | 仅英/符号 | 粗体 / 斜体 / 下划线 | Bold / Italic / Underline | 与主页重复 |
| `main.js:676` | `S` | 仅英 | 删除线 | Strikethrough | |
| `main.js:677` | `code` | 仅英 | 代码 | Code | |
| `main.js:678` | `quote` | 仅英 | 引用块 | Blockquote | 不是 `\cite` |
| `main.js:679` | `hr` | 仅英 | 分隔线 | Horizontal rule | |
| `main.js:680` | `desc` | 仅英 | 描述列表 | Description list | |
| `main.js:685` | `1.` | 符号 | 数字编号 | Decimal numbering | |
| `main.js:686` | `a.` | 符号 | 小写字母编号 | Lowercase letters | |
| `main.js:687` | `A.` | 符号 | 大写字母编号 | Uppercase letters | |
| `main.js:688` | `I.` | 符号 | 大写罗马编号 | Uppercase Roman | |
| `main.js:689` | `甲` | 仅中 | 甲乙丙丁编号 | Heavenly stems | 说明是中文序号，不替换成 `\chinese` 之外的命令 |
| `main.js:690` | `•` | 符号 | 自定义项目符号 | Custom bullet | 打开对话框输入 |

## 7. 引用（Reference）

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:691` | `label` | 命令名 | `label`（标签） | `label` (label) | 保留 `\label` 命令名；不要换成 `\tag` |
| `main.js:700` | `ref` | 命令名 | `ref`（引用） | `ref` (reference) | 保留 `\ref`；不要换成 `\cite` |
| `main.js:704` | `toc` | 命令名 | 目录 | Contents | 对应 `\tableofcontents`，可见 `toc` 可保留 + tooltip |
| `main.js:708` | `short` | 仅英 | 短标题 | Short title | 对应 `\section[short]{...}` |
| `main.js:713` | `title` | 仅英 | 标题 | Title | 对应 `\title{}` |
| `main.js:717` | `author` | 仅英 | 作者 | Author | 对应 `\author{}` |
| `references.js:84` | 内联 label 显示 `#key` | 仅符号 | （建议不显示文本） | （建议不显示） | 当前标签会出现在正文；这是文案/交互观察，不在本任务修改 |
| `references.js:42` | `§number` / `→key` | 符号 | 引用编号 / 未解析引用 | Reference number / Unresolved reference | `→key` 表示找不到对应 `label` |
| `references.js:126` | `目录 / Contents` | 双语 | 目录 | Contents | TOC 节点标题 |

## 8. 数学（Math）

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:721-722` | `$` / `$$` | 命令名/符号 | 行内公式 / 行间公式 | Inline math / Display math | 保留 `$`/`$$` |
| `main.js:723` | `frac` | 命令名 | `frac`（分式） | `frac` (fraction) | 保留 `\frac` |
| `main.js:724` | `sqrt` | 命令名 | `sqrt`（根式） | `sqrt` (root) | 保留 `\sqrt` |
| `main.js:725` | `sum` | 命令名 | `sum`（求和） | `sum` (summation) | 保留 `\sum` |
| `main.js:726` | `int` | 命令名 | `int`（积分） | `int` (integral) | 保留 `\int` |
| `main.js:727` | `matrix` | 命令名 | `matrix`（矩阵） | `matrix` | 保留 `pmatrix` 环境 |
| `main.js:728` | `cases` | 命令名 | `cases`（分段） | `cases` | 保留 `cases` 环境 |
| `main.js:729` | `align` | 命令名 | `align`（对齐） | `align` | 保留 `align` 环境 |

## 9. 命令补全菜单

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:399` | `LaTeX 补全 / LaTeX completion` | 双语 | LaTeX 补全 | LaTeX completion | |
| `main.js:401` | `LaTeX 命令 / command` | 双语 | LaTeX 命令 | LaTeX command | |
| `main.js:553` | `\name` | 命令名 | 不翻译 | 不翻译 | 候选必须是真实 LaTeX 命令 |
| `main.js:561` | `无匹配命令 / No matching command` | 双语 | 无匹配命令 | No matching command | 空状态 |
| `main.js:412-436` | 数学候选（`mathbf`、`frac`、`Gamma` 等） | 命令名 | 保留命令名 + 可选说明 | Keep command name + optional description | 不要把 `\Gamma` 改成其他命令 |
| `main.js:440-483` | 结构候选（`section`、`itemize`、`label`、`title` 等） | 命令名/UI | 保留命令名 + 可选说明 | Keep command name + optional description | |
| `main.js:541-544` | `mathFontStyles` 的 `nabla` 等 | 命令名 | 保留命令名 | Keep command name | 由 `math-formatting.js` 提供 |

## 10. 右键菜单

`context-menu.js` 的 `labels` 全部是 `[中文, English]` 双语数组，下表只列需要补文案/说明的项。

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `context-menu.js:41-45` | 插入/删除矩阵行、矩阵列 | 双语 | 保持 | 保持 | 仅矩阵内可见 |
| `context-menu.js:46-89` | 矩阵括号/自定义左右括号 | 双语 | 保持 | 保持 | 自定义对话框 |
| `context-menu.js:90-95` | 切换公式显示样式 | 双语 | 保持 | 保持 | |
| `context-menu.js:96-99` | 撤销/重做/剪切/复制 | 双语 | 保持 | 保持 | 剪切/复制在空选区时 `disabled` |
| `context-menu.js:100-114` | 粘贴文本 | 双语 | 粘贴文本 | Paste text | 仅文本，提示中可说明不含富文本 |
| `context-menu.js:115-118` | 全选 | 双语 | 全选 | Select all | |
| `context-menu.js:119-120` | 粗体/斜体 | 双语 | 保持 | 保持 | 仅在非公式中显示 |
| `context-menu.js:121-124` | 切换标题编号 | 双语 | 保持 | 保持 | 仅标题 |
| `context-menu.js:125-133` | 设置短标题 | 双语 | 保持 | 保持 | 仅标题 |
| `context-menu.js:134-148` | 设置标签 | 双语 | 添加/设置标签 | Add or set label | 标题外插入内联 label，文案可更准确 |
| `context-menu.js:149-157` | 编辑标签 | 双语 | 保持 | 保持 | 仅选中内联 label |
| `context-menu.js:158-166` | 编辑术语 | 双语 | 保持 | 保持 | 仅描述列表 |
| `context-menu.js:167-183` | 插入/编辑引用 | 双语 | 保持 | 保持 | 尚无候选列表（见任务 D/核心问题） |
| `context-menu.js:184-190` | 插入或删除目录 | 双语 | 保持 | 保持 | |
| `context-menu.js:191-200` | 表格行/列/表格删除 | 双语 | 保持 | 保持 | 仅表格 |
| `context-menu.js:201-206` | 删除公式 | 双语 | 保持 | 保持 | 仅公式 |
| `context-menu.js:250-252` | 操作失败 + 剪贴板备选 | 双语 | 保持 | 保持 | 错误状态 |

## 11. 对话框

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `dialog.js:1` | `确定 / OK`、`取消 / Cancel` | 双语 | 确定 / 取消 | OK / Cancel | 默认按钮 |
| `main.js:276,297,469,714` | `标题 / Title` | 双语 | 标题 | Title | |
| `main.js:280,299,473,718` | `作者 / Author` | 双语 | 作者 | Author | |
| `main.js:294` | `添加标题/作者 / Add title & author` | 双语 | 添加标题/作者 | Add title & author | 空元信息 |
| `main.js:457,460,693,696`；`context-menu.js:139,143,153` | `标签键 / Label key` | 双语 | 标签键 | Label key | |
| `main.js:465,701`；`context-menu.js:170,179` | `引用标签 / Reference label` | 双语 | 引用标签 | Reference label | 建议后续加已有 label 候选，见任务 D/核心问题 |
| `main.js:710`；`context-menu.js:129` | `短标题 / Short title` | 双语 | 短标题 | Short title | |
| `main.js:690` | `项目符号 / Bullet marker` | 双语 | 项目符号 | Bullet marker | |
| `context-menu.js:79,81` | `左括号 / Left delimiter`、`右括号 / Right delimiter` | 双语 | 左/右括号 | Left/Right delimiter | |
| `context-menu.js:162` | `术语 / Term` | 双语 | 术语 | Term | |
| 全部对话框 | 输入为空时无空状态提示 | 空/错/禁 | 允许为空 / 必填提示 | Empty allowed / Required | 目前由调用方决定是否校验 |

## 12. 状态栏、元信息与错误

| 位置 | 当前文案 | 状态 | 建议中文 | 建议英文 | 备注 |
|---|---|---|---|---|---|
| `main.js:585-596` | 缩放滑杆/百分比 | 符号 | 缩放 | Zoom | 滑杆缺 aria-label |
| `main.js:646` | `字符 / characters` | 双语 | 字符 | characters | |
| `main.js:639` | 矩阵/行间/行内/表格/列表/标题/正文/源码 | 双语 | 保持 | 保持 | 环境标签 |
| `main.js:315` | `无法识别文档 / Invalid document` | 双语 | 无法识别文档 | Invalid document | 错误 |
| `main.js:331,393` | 错误消息直接用 `error.message` | 空/错 | 打开失败：… | Could not open: … | 建议包裹上下文 |
| `main.js:352` | `已保存 / Saved` | 双语 | 已保存 | Saved | 保存成功 |
| `main.js:64` | `Configuration / 配置` | 双语（console） | 配置加载失败 | Could not load configuration | 仅 console.warn，无 UI |
| `main.js:356,370` | `Save / 保存`、`Open / 打开` | 双语（console） | 保存失败 / 打开失败 | Could not save / open | 仅 console.warn，无 UI |
| `main.js:385-389` | 浏览器原生离开确认 | 空/错/禁 | 修改未保存 | Unsaved changes | 文案由浏览器控制，不能自定义 |
| `table-hover.js:6,14` | 插入行/列 | 双语 | 保持 | 保持 | tooltip |
| `math-node.js:83-84` | `拖动公式 / Drag formula` | 双语 | 拖动公式 | Drag formula | |

## 13. 空状态、错误状态、禁用原因汇总

| 场景 | 位置 | 当前行为 | 建议 |
|---|---|---|---|
| 命令无匹配 | `main.js:559-563` | 显示 `无匹配命令 / No matching command` | 补一句可输入完整 `\命令` 或按 Esc 关闭 |
| 空白文档/空元信息 | `main.js:292-304` | 显示“添加标题/作者” | 可选空状态 |
| 打开文件失败 | `main.js:390-394` | `#status` 显示 `error.message` | 包裹“打开失败 / Could not open” |
| 源码解析失败 | `main.js:315,330-331` | 显示 `无法识别文档 / Invalid document` | 提示保留原文、可继续源码编辑 |
| 配置加载失败 | `main.js:56-64` | 仅 console.warn | 可选状态栏提示 |
| 保存/打开被拒绝或异常 | `main.js:340-373` | console.warn；保存最终回退下载 | 增加“保存失败/已回退下载”提示 |
| 离开未保存 | `main.js:385-389` | 浏览器原生确认 | 文案不可自定义；可另加保存状态标识 |
| 保存按钮初始禁用 | `index.html:16`、`main.js:334` | 脚本加载后启用 | 补 aria-disabled 原因或提示 |
| 剪切/复制空选区 | `context-menu.js:98-99` | `disabled` | 已正确禁用 |
| 粘贴无剪贴板 API | `context-menu.js:100-101` | `disabled` | 已正确禁用 |
| 表格外点击表格按钮 | `main.js:659-672` | 按钮可点但内部 no-op | 建议禁用并给原因 |
| 标题外点击 short/title 等 | `main.js:708-712` | 部分直接 return | 建议禁用并给原因 |
| 矩阵外点击矩阵括号 | `context-menu.js:46-51` | 不可见 | 已按上下文隐藏 |
| 表格外点击行/列删除 | `context-menu.js:191-200` | 不可见 | 已按上下文隐藏 |
| 公式外点击公式菜单 | `context-menu.js:90-95,201-206` | 不可见 | 已按上下文隐藏 |

## 14. 双语缺口汇总（需要补）

- 仅有单语/符号的可见控件：
  - `main.js:145-149`：`↶`、`↷`、`B`、`I`、`U`。
  - `main.js:168-170`、`244-247`：`itemize`、`enumerate`、`▦`、`＋ Row`、`＋ Column`、`$`、`$$`（命令名/符号应保留，补双语 tooltip）。
  - `main.js:659-672`：`－ Row`、`－ Column`、`删除表格`、`merge`、`split`、`booktabs`、`左/中/右`。
  - `main.js:673-690`：`B/I/U/S`、`code`、`quote`、`hr`、`desc`、`1./a./A./I./甲/•`。
  - `main.js:691-720`：`label`、`ref`、`toc`、`short`、`title`、`author`。
  - `main.js:721-729`：`frac`、`sqrt`、`sum`、`int`、`matrix`、`cases`、`align`。
  - `icons.js:28-31` 的 title 仍是命令/符号本身，不是双语动作说明。
- 命令名处理原则：保留 token（如 `itemize`、`\frac`、`\label`），只补“中文说明 / English description”，不得把 `\label` 换成 `\tag`、`\ref` 换成 `\cite`、`itemize` 换成其他命令。
- 已有双语文案：标签页、打开/保存/配置、命令菜单 aria/空状态、对话框默认按钮、右键菜单 labels、环境标签、状态/错误的主要句子、标题/作者、表格悬停、拖动公式。

## 15. 未覆盖

- 浏览器原生文件选择器、`beforeunload` 确认、剪贴板权限提示由浏览器控制，无法自定义文案。
- 代码块/未知环境 `Raw` 节点没有独立文案（`main.js:38-43`）。
- 测试文件中的字符串不属于产品 UI，未纳入。
