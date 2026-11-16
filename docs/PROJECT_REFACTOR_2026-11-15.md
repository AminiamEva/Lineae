# 2026-11-15 自有新增代码重写

以 UTC+8 的 2026-11-15 为日期范围，以 PR #17 合并后的 1ff8d00 为差异基线，仅处理 AminiamEva 新增代码。zhumohan632-rgb 的 PR 实现保留；02fe38f 曾做的整体模型替换已由 db7fd6d 撤回。

## 保留的上游实现

- project.mjs 的文件身份、操作队列、恢复、持久化、移动后目录核对和 DirectoryHandleAdapter 主体。
- paths.mjs、依赖扫描循环、Source 同步算法、CodeMirror 编辑与历史主体。
- 文件树渲染原有行为、原生磁盘安全操作和原生测试。目录适配器和 Rust 测试已回到原位置。
- 原有富文本和公式输入主体、字体资源、OpenCC 署名字表、既有回归测试。

## 自有实现的职责

| 功能 | 实现 |
|---|---|
| 新工程与文件树操作 | opening、context-actions、tree-entry、context-menu、sidebar、mutation-presentation |
| 目录删除与路径重写扩展 | project-actions、reference-paths；通过原模型接口调用 |
| 连续多文件 Document | include-document、document-session、composition-controller、rich-session |
| include/input 的图形化操作 | include-operations、include-panel、navigation |
| 模式与列表策略 | workspace-state、list-policy |
| 空文档同步边界 | source-boundaries；不替换上游同步算法 |
| 页面设置和历史 | default-document、page-layout-history、settings-values |
| 标题退出与显式首段缩进 | editing、paragraph-format；原 Tab 空格行为保留 |
| 字体状态 | selection-typography、format-controls；从实际选区读取字体与 TeX 点 |
| 外围功能区与设置 | floating-toolbar、settings-panel、sidebar-section、source-presentation |
| 大纲与引用导航 | outline-panel；既有 ToC/引用模型沿用，导航扩展接入 |
| 复杂表格扩展 | table-spans；原简单列解析与分行入口保留 |
| 中英繁体 | i18n、traditional、config-migrations、localized-control；字表与文案数据保留 |

HTML、YAML、包依赖以及图标/工具提示的文案映射是声明数据，保留其有效配置，不为制造差异而改动资源或上游控件主体。自己的样式集中于 project.css 与 source-workspace.css 的扩展区；pages.css 回到基线。

## 验收约束

Document 默认展开，Source/Split 默认仅折叠下排，标签和 v 保留；Normal 默认模板一致；布局修改进入撤销；Split 只读且按百分比缩放；新文件继承当前模式。工程打开后能连续编辑，标题 Enter/Ctrl+J 生成可回写的显式缩进；已有标题首段通过 Ctrl+I 和 indent/noindent 命令也能改变缩进。

原始源文件中的未编辑字节、未知命令与行尾继续受保护。include 编辑归属原文件，图形操作检查循环，不删除被引用文件。磁盘冲突、操作中的新输入与恢复检查继续沿用并验证原有安全语义。

只在 GitHub Actions 构建与验证，不本地构建。最终提交、回归和部署结果见 REWRITE_2026-11-15_STATUS.md。
