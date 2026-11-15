# Project 与当日改动重构（2026-11-15，UTC+8）

核对范围为当日从 1ff8d00 到 2384689 的提交，覆盖原生工程 IO、工程会话、双语界面、表格兼容、页面布局历史、源码界面、设置和工程侧栏。重构保留已有的数据完整性规则和入口。

## 职责边界

| 层 | 代码 | 责任 |
|---|---|---|
| 文件系统 | directory-adapter.mjs、原生 project.rs / bridge.js | 读写字节、路径约束、并发冲突与原子操作 |
| 工程模型 | project.mjs、dependencies.mjs、paths.mjs、recovery.mjs | 文件身份、草稿、依赖、恢复和磁盘操作队列 |
| 工作区会话 | workspace-state.mjs | 工程统一模式、BibTeX 例外、进入工程的 Document 默认值、单文件工作区挂起与恢复 |
| Document 所有权 | document-session.mjs、include-document.mjs | 文件来源、区域边界与各文件的最小源码补丁 |
| 编辑器适配 | editing.js、navigation.js | 工程标题退出、显式缩进、导航和文件拖放；不拥有编辑器全局输入或渲染规则 |
| 文件引用 | include-operations.mjs、include-panel.js | 统一 input/include 添加、排序、删除和循环检查 |
| 工程界面 | explorer.js、tree-view.js、tree-entry.js、context-menu.js | 协调动作，渲染树，行内命名，菜单键盘行为 |
| 外围界面 | floating-toolbar.js、settings-panel.js、sidebar-section.js | 功能区折叠、配置和可折叠分区 |

main.js 通过适配器连接工程与既有编辑器。原生完整性测试提取为 project_tests.rs，继续测试同一套私有 IO 实现。浏览器目录适配器保留 project.mjs 的兼容导出。

## 已明确的行为约束

- Document 默认展开；Source / Split 默认仅折叠功能区。标签行与 v 开关始终可用。
- 工程打开后正文可连续输入、中文输入、删除和回车；空段落不因缺少 TeX 字符而使回写投影失效。
- 标题末尾回车及 Ctrl+J 回到正文，生成可回写的显式 indent。源码导入的既有缩进规则保持。
- 字体控件从当前选区格式或块的计算样式读取，不用固定字体与 10pt 冒充实际样式。标题沿用现有字号与字重，补齐文档指定的 CJK 回退。
- 文件来源标记与 Project 包装层的样式位于 project.css；其块继承既有正文、标题和公式样式。
- 所有 include GUI、命令菜单和拖放使用统一操作与循环检查，删除引用保留原文件。
- 不格式化未编辑源码，不删除未知宏、注释或原始行尾；跨文件边界的非法结构修改仍被拒绝。

## 当日其他改动的验证覆盖

- config / settings：YAML 校验、旧偏好迁移、快捷键冲突与导入导出。
- i18n / traditional / tooltips / title-styles：中英繁体和逐字转换测试。
- blocks / packages / tables / codec：导入导出、multirow、列定义与包依赖测试。
- source-workspace / source-toolbar / source-sync：字节保留、双模式历史、只读 Split、百分比预览。
- bridge / native IO / recovery：目录清单、并发编辑、路径重写、原子写入和取消行为。

## 验证入口

GitHub Actions 执行数据、UI、Bib、Project 编辑边界、工作区导航、连续 Document、文件树、完整编辑器、工程会话及 Rust 原生测试，最后远端生成 Windows 包。禁止本地构建的要求继续生效。
