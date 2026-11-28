# Phase B 引擎解析与浏览器排版接口

## 起点

| 对象 | Git 提交或状态 |
|---|---|
| 本轮 fetch 的 origin/main | cb52ec41f13246f0e11d8c28a0158224ddbb9700 |
| 原 Phase A 工作分支及分离验收 worktree | 262ddf42eff0414e9232f0eed7b2381ea21750b6，父提交为上述 main |
| 本轮起点 | 74c8ecb8e0494bffad803a4ec30f3e7b84c092e6，父提交为上述 Phase A 候选 |
| 目标分支 | feat/lualatex-dual-engine。Linux 原分支干净，通过验证过的修复 bundle 快进。旧验收 worktree 继续指向历史 SHA |
| 已纳入 | Windows 修复交付物中的七文件变更，包括整数 Canvas 字宽、书籍页号及三份素材、真实 Xe 格式预检、桌面测试端口和轮询 |
| 未纳入 | 桌面默认文件树的新旧期望冲突、剪贴板、工程重开和 Windows 权限问题属于既有独立问题。阶段 A 历史报告保留原结论 |

## 调用契约

从 `apps/web/src/typesetting/engine-resolution.mjs` 导入 `resolveEngine`。主文档可为字符串（位置记为 main.tex）或 `{path,text}`。工程源数组为同一工程中路径唯一的其他 `{path,text}`，可以包含未关联文件。输入使用调用方已解码的文本。位置采用 1 起始行号与 UTF-16 列号，保留原文件的 CRLF、LF 或 CR。

解析器沿静态可达的 input/include 访问文件，调用工程既有的 `dependencyRanges`、`resolveMetadata` 处理根目录相对路径和 .tex 后缀，以访问集终止循环。文件开头的注释区识别 `% !TeX program = ...` 和 TS-program。显式选择优先，其次是主文件 magic，无主文件声明时采用可达子文件的一致 magic，再按无条件专属依赖裁决，最后使用 globalDefault（省略时 lualatex）。同一优先级有两个候选时返回 null 和 conflict。结果含 requestedChoice、resolvedEngine、reason、evidence 和 diagnostics。所有相反证据均附带来源，包括被较高优先级压过的宏包。无效枚举抛 TypeError。解析器独立于浏览器、文件写入和 ProseMirror。

扫描复用 `sourceStructure` 屏蔽字面环境、行内 verb、数学与常见宏定义。识别列入表中的 XeTeX/Lua 原语、字面单层宏包参数，排除 if…fi 各分支及动态路径。此阶段不展开 TeX，不推导条件真值，不遍历分组、数学或宏参数内的依赖，不解释 catcode、宏生成命令及所有第三方条件结构。条件内的声明不会据以选择引擎。启动编辑器的默认 HTML 指定 xelatex，解析器回退规则供调用方使用；全局配置、设置界面、工程持久化属于 Phase E。

## 模块与实际调用路径

| 文件与入口 | 职责及本次变化 |
|---|---|
| apps/web/index.html、src/main.js 的启动逻辑 | 声明当前引擎，从 getTypesettingProfile 取得对象，检查能力并注入 installTypesetPagination |
| src/typesetting/engine-profile.mjs | Xe 暴露原 documentStyle、paragraphParameters、englishHyphenation、Fandol regular/bold 表、适用字体和行间胶伸长系数；Lua 的解析可用，浏览器英文/CJK 排版待标定，对应数据入口为 null |
| src/editor/typeset-pagination.js 的 installTypesetPagination、applyProfile | 向下传入同一 profile，使用其文档字体与段落样式；分页和页面坐标算法沿用原实现 |
| src/typesetting/paragraph-layout.js 的 installParagraphLayout、tokensFor、measure | 根据 profile 获取断词、标点边界和字对数据。Canvas、DOM 测量、boxes/glue/penalties、wrapLineWidthAt 和装饰构造沿用同一套实现 |
| src/typesetting/optimum-paragraph.mjs、layout-geometry.js、latex/typeset-layout.mjs | 公共优化、几何与分页。保留现有函数及调用契约 |
| src/main.js 的 load、source、downloadProject 和 editor/latex-codec.js | 文档载入、快照与原始源码导出。引擎解析和测量均未接入序列化或正文事务 |
| tests/engine-resolution.test.mjs、typesetting-profile.test.mjs | 解析优先级、位置、图访问与循环、互斥分支、不变性、profile 数据身份与隔离 |
| tests/xe-reference-page.cjs 和浏览器入口 | 在启动前显式选择 Xe，并断言真正的 ProseMirror 实例已安装相应 profile。中英文用例另查排版产生的节点装饰 |
| tests/appendix.test.mjs、paragraph-parameters.test.mjs、typeset-layout.test.mjs | 显式绑定对应 Xe 参考及参数。纯编号、分页和单位换算仍使用公共逻辑 |
| docs/dual-engine/probe-layout.cjs | 对实际输入文件、三个模式的独立导入与往返、ZIP 中的 .tex 原始字节、dirty、字体和 AST 取证 |

改造前，main → installTypesetPagination → installParagraphLayout → tokensFor 直接读 fandolPairs、fandolPunctuation、englishHyphenation → optimumParagraph → DecorationSet。改造后，main → getTypesettingProfile('xelatex') → installTypesetPagination → installParagraphLayout(editor,profile) → tokensFor 读 profile → 同一个 optimumParagraph 与 DecorationSet。页面上的 data-paragraph-profile 由安装函数写入，段落的 data-tex-engine 由实际排版生成的节点 decoration 写入。历史数值未重算。Lua 或 Auto 冲突不具有可用的 Xe 排版数据；调用方应先判断 resolvedEngine，再检查 capabilities.browserLayout。

## 自测与独立复验

运行 npm run build、node --test 'tests/**/*.test.mjs'、bash docs/dual-engine/run-baseline.sh layout 绝对输出目录、node tests/editor.cjs、node docs/dual-engine/probe-layout.cjs 绝对输出目录、python3 docs/dual-engine/probe-tex.py 绝对输出目录。浏览器回归使用锁定的 Playwright 和 Chromium，以及固定的 MathLive 本地资产。真实 TeX 需要英语断词配置和可定位的字体。逐项环境、退出码、PDF、浏览器尺寸、源码字节及最终候选 SHA 见配套验收记录。

初次红测出现模块缺失，可加载的默认回退实现随后产生 9 个行为失败。自测的 10 个旧布局入口为 8 PASS、2 FAIL。普通英文和中文首例的文本与冻结结果相符，宽度断言在起点已经失败。独立验收保留这些阈值。该 Linux 上完整的参考 PDF 与浏览器测量分别判断。Phase C 可基于 resolveEngine 和 getTypesettingProfile('lualatex') 增加独立标定；当前 Lua profile 不能用于声称中文间距或英文断词已与真实 Lua PDF 一致。

补充覆盖包括原语别名、文档结束后的文本，以及含嵌套分组的宏包选项。扫描器复用 latex/source-structure.mjs 的 groupEnd，原函数只新增命名导出。最终开发自测为 Node 955/955。两份样本从每个模式直接打开并导出，以及在 Document → Source → Split → Document 的每个停靠点导出，共 14 次，原始字节、哈希和 clean 状态全部通过。
