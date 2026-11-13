# Lineae 混合换行符序列化修复报告

日期：2026-11-13（北京时间）

> 本文保存推送前的本地修复验收快照。后续已获授权正式提交、推送独立修复分支并复用 Draft PR #11；远程 CI 以该 PR 最新提交的 Checks 为准。文中“没有推送/未创建 PR/远程 CI 未运行”描述的是本地验收时状态。
> PR：https://github.com/AminiamEva/Lineae/pull/11
> 原始报告、补丁、真实 ZIP、截图及日志：https://chatgpt.com/library?file_id=libfile_f4aeef022a9881918aff7c62bf757b50&account_id=personal

## 1. 状态与工作保护

混合 LF/CRLF 缺陷：**PASS，产品修复及真实 Windows Chromium ZIP 导出已验证**。

- 本地工作副本：`C:/Users/vertin/Documents/ChatGPT/Latex/Lineae-mixed-eol-fix`。
- 分支：`fix/mixed-eol-preservation`；基线 HEAD：`18f6912f5678992d5b2f73b5d768a8d137f91ceb`。
- 修改尚未提交。没有推送、创建 PR、合并、部署或触发远程工作流。
- 原工作副本 `Lineae-source-editor-pr` 的 453 个文件已完整备份；修复后 SHA-256 逐一复核，453/453 未变化。原工作中的未跟踪环境资料保留。
- `before-workspace.zip`、`before-tracked-source.zip`、`before-files.json`、`before-status.txt`、`before.patch` 保存开始前状态；开始时没有已有受跟踪修改，因此 before.patch 为空。
- package.json、package-lock.json、后端 API、Bib 引擎、XeLaTeX 核心、UI 布局及生命周期产品逻辑未改。
- 完整补丁已对备份基线执行 `git apply --check`，通过。

## 2. 根因与完整数据路径

原 `source-workspace.js` 的 `replace(text)` 先提取首个分隔符到 `lineEnding`，再用 `text.replace(/\r\n?/g, '\n')` 初始化 CodeMirror 文档。CodeMirror Text 保存逻辑行，未保存原分隔符类型；信息损失发生在初始化规范化时，旧代码仅保存了单一 lineEnding，无法还原每个位置。

文件通过原有 file.text()/导入流程进入 main.js 的 load()/importedSource，正文/源码切换将字符串交给 sourceView.open()。编辑时 updateListener 在 docChanged 后清除 original。随后旧 `value()` 调用 `doc.sliceString(0, doc.length, lineEnding)`，将所有逻辑换行统一为首个格式。主样例首个为 LF，所以末尾 CRLF 也输出为 LF，丢失 0D。

main.js 的 downloadProject() 使用 `sourceView.hidden ? source() : sourceView.value`，再经 buildProjectZip 写入 UTF-8 字节。源码切到正文时，原有同步流程把 workspace.value 交回 load()；未发生正文编辑时 importedSource/snapshot 路径保留该源字符串。ZIP 层没有执行换行转换。本轮未修改 main.js、解析器或 ZIP 打包器。

## 3. 修复设计

选用 **A + B：逐分隔符元数据与独立序列化层**，通过 CodeMirror transaction 增量更新。C（全文/逐行 diff）需要处理重复行与空行匹配歧义，每次编辑还会增加全文匹配工作，因此未采用。

- `source-eol.mjs`：sourceEndings() 按原顺序记录 LF、CRLF、独立 CR；updateEndings() 更新分隔符数组；serializeSource() 将逻辑 LF 与数组严格配对。数量不匹配会显式抛错，避免悄悄导出错误源码。
- `source-eol-state.js`：StateField 与 CodeMirror 文档同事务更新；iterChanges 提供原文坐标，lineAt() 转换为分隔符索引。删除区间移除相应分隔符，新区间按新增逻辑行数补入分隔符，其他数组项原样保留。
- 新增换行策略：采用变更起点所在原行的终止符；该行无终止符则沿用前一行；空文档默认为 LF。一次多行插入使用同一邻近格式。多选区按各自原坐标独立处理。
- 纯文字修改不重建换行数组；结构性编辑对数组做线性拼接；序列化为线性操作。300,000 分隔符用例验证无 spread 参数上限问题，未进行专项延迟基准。
- invertedEffects 保存编辑前的不可变数组引用，历史撤销/重做恢复对应元数据；分组历史也覆盖。外部 reset() 重建文档与元数据；普通 open()/close() 保留既有状态。
- 文件末尾与连续空行由真实分隔符数组自然表达，无单独补 CR 或补末尾换行逻辑。
- 移除原 initialDoc/initialText 快捷返回：即使逻辑文本相同，删掉旧分隔符再重新插入也可能合法地产生另一种 EOL；现在按当前元数据序列化。未保存标记同时核对精确源码。

## 4. 修改文件

| 类型 | 文件 | 内容 |
|---|---|---|
| 产品 | apps/web/src/editor/source-workspace.js | 接入元数据序列化、精确 dirty 判断、移除单一 lineEnding 与 initialDoc 捷径 |
| 产品（新增） | apps/web/src/editor/source-eol.mjs | 换行收集、事务映射、严格序列化 |
| 产品（新增） | apps/web/src/editor/source-eol-state.js | CodeMirror StateField、历史恢复效果 |
| 测试 | tests/source-workspace-mixed-eol.cjs | 保留严格字节断言，新增撤销/重做实际 ZIP 与截图 |
| 测试 | tests/source-workspace.cjs | 将新增 EOL 状态测试接入原浏览器入口 |
| 测试 | tests/editor.cjs | 仅将起始浏览器 locale 固定为 en-US，匹配原有英文断言；未删改断言 |
| 测试（新增） | tests/source-eol.test.mjs | 74 项序列化与编辑矩阵 |
| 测试（新增） | tests/source-eol-codemirror.test.mjs | 7 项真实 CodeMirror transaction/history 测试 |
| 测试（新增） | tests/source-workspace-eol-state.cjs | 浏览器验证 EOL-only dirty、历史与外部 reset |
| 辅助测试（新增） | tests/source-eol-browser.cjs | 本地静态服务与浏览器专项运行入口，支持原版 bundle 对照 |

## 5. 452 → 451 字节复现与修复

使用仓库此前真实 QA 夹具 `tests/fixtures/source-workspace-mixed-eol.json` 的原始 base64 与 SHA-256，未重新手工制作样例。修复前由 HEAD 原 source-workspace.js 构建独立 baseline bundle，真实导入、键盘编辑并下载 ZIP。该对照在本轮恢复浏览器环境后补跑，时间晚于初步产品修改；baseline 使用 HEAD 原代码，没有混入修复。

| 文件 | 字节 | 独立 LF | CRLF | 结果 |
|---|---:|---:|---:|---|
| 原始 QA | 409 | 13 | 1 | 原始哈希通过 |
| 编辑后预期 | 452 | 14 | 1 | 预期哈希通过 |
| 原版实际 ZIP 中 .tex | 451 | 15 | 0 | FAIL（预期复现） |
| 修复后实际 ZIP 中 .tex | 452 | 14 | 1 | PASS |

原版前 450 字节相同，首个差异位于 0-based 450：预期 0D，实际 0A。修复后全 452 字节相同，firstDifference=-1，末尾为 0D0A。

- 原始 SHA-256：`e74ad9dddd49fc111c1205f5d0c894022d652fbd81c7bd4277b79464ac837127`。
- 预期和修复后实际 SHA-256：`e4015aadd42c20ca1c590e8511bbe43b6c08539f7ee0ba7cb4df6b4825dacd4e`。
- 修复后真实下载 ZIP SHA-256：`af88b668d1120682a792a925b6146daf263d38ddb7a490b1e4dee8e9b7302406`。

每次先将真实下载 ZIP 与其 .tex 保存，再做比较；证据位于 before/lineae-mixed-eol 与 after/lineae-mixed-eol。浏览器输出没有用剪贴板或直接序列化调用代替。

## 6. EOL 测试矩阵

| 编号 | 内容 | 结果 |
|---|---|---|
| EOL-01 | 全 LF | PASS |
| EOL-02 | 全 CRLF | PASS |
| EOL-03 | 混合 LF/CRLF | PASS |
| EOL-04 | 混合且末尾 CRLF | PASS |
| EOL-05 | 混合且末尾 LF | PASS |
| EOL-06 | 末尾无换行 | PASS |
| EOL-07 | 空文件 | PASS |
| EOL-08 | 单行文件 | PASS |
| EOL-09 | 连续空行 | PASS |
| EOL-10 | 中文 UTF-8 与混合换行 | PASS |
| EOL-11 | 数学公式与混合换行 | PASS |
| EOL-12 | 自定义命令与混合换行 | PASS |
| EOL-13 | 多个末尾空行 | PASS |
| EOL-14 | 独立 CR | PASS |

矩阵对每类文件验证原样往返、首/中/末字符编辑、多行插入、删除、行合并、尾部新增与删除；另测原 QA、同事务多选区及元数据不一致拒绝。真实 CodeMirror 测试覆盖分组/独立历史、多次编辑完整回撤/重做、清空文档、新文档、混合 CR/LF/CRLF 与相同逻辑文本的不同元数据。

## 7. 真实浏览器验收

Windows Chromium Headless Shell 141.0.7390.37，Playwright 1.56.1；是真实 Windows 浏览器进程。

专项 **PASS**：导入原始文件、普通文字修改、数学公式修改、键盘输入中文注释及 Enter、撤销/重做并各自实际导出、切正文/源码、展开/收起、双栏拖动、再次编辑、重新打开、下载 ZIP、严格逐字节比较。无浏览器脚本异常。

生命周期 **PASS 6/6**：visible/until-found × ordinary/expanded/collapsed，包含三次 close、重复 destroy、真实 input 与销毁后无渲染。

剪贴板 **PASS**：分别保存调用 writeText 前的源码、Windows 原生 readback、真实 ZIP 与预期文件。仅 readback 比较规范化 CRLF；workspace.value 和 ZIP 均严格比较。原 LF 330/337 字节在 Windows 剪贴板读回为 CRLF 342/350 字节，但源码与 ZIP 仍分别保持 330/337 字节。

独立工作区状态 **PASS**：EOL-only 修改 dirty 标记、真实按键撤销重做、关闭重开、含独立 CR 的外部 reset()、中文输入均通过。

完整浏览器：**PASS**，最后一次完整运行退出 0，日志包含 Browser regressions passed；新增的工作区 EOL 状态测试也已接入原 source-workspace 入口。

## 8. 回归与构建

| 检查 | 最终结果 | 证据 |
|---|---|---|
| 原 Data | PASS 39/39 | data-tests-final.log（含新增 EOL/历史后为 120/120） |
| 原 UI Node | PASS 31/31 | ui-tests.log |
| 原 Bib backend | PASS 184/184 | bib-tests.log |
| 原 Node 合计 | PASS 254/254 | 上述三组，全部在修复后代码运行 |
| 新 EOL Node | PASS 74/74 | eol-tests.log、node-final.log |
| 新真实 CodeMirror | PASS 7/7 | codemirror-resumed.log |
| 全部 Node | PASS 335/335，0 skip | node-final.log |
| 生命周期 | PASS 6/6 | browser-after.log |
| 源码专项/剪贴板/ZIP | PASS | browser-after.log、after/ 与截图 |
| npm ci | PASS，76 packages | npm-ci-resumed.log |
| npm run build | PASS | build.log |
| LaTeX 基础编译 | PASS 5/5（含故意错误的失败诊断） | latex-smoke-final.log、smoke-final/ |
| 原 BibTeX/BibLaTeX 编译往返 | PASS 2/2 | bib-xelatex-final.log、tex-original-final/ |
| 编辑后 Bib 编译 | PASS 19/19，0 unverified | bib-editor-final.json、bib-editor-compile-final.log |
| 编辑器无修改 PDF 对照 | PASS 2/2，像素差异为 0 | bib-editor-final.json |
| 完整浏览器 | PASS，退出 0 | browser-full-final.log |
| 补丁应用检查 | PASS | patch-check.log |
| GitHub Windows Actions | BLOCKED：本轮禁止推送，远程不能执行本地未提交代码 | 未触发远程工作流 |

环境恢复说明：最初终端网络 EACCES/DNS 失败；后使用可用执行环境正常完成锁定依赖下载与 npm ci。npm 第一次恢复尝试因缺少 Windows shell 环境变量失败，补齐 ComSpec/PATH 后成功；没有改锁文件或升级依赖。Biber 初次探测不可用，后正常启动并重新执行原始编译及 19 项对照，旧的 UNVERIFIED 不作为最终结果。

## 9. 尚未解决的问题与合并准备

核心 EOL 修复与要求的本地主要回归均为 PASS，可供本地审查并准备后续 PR；合并前仍应在目标分支执行 Windows Actions。

**已知测试波动**：初始完整浏览器在中文环境等待英文 Inline math 而超时；固定起始 locale=en-US 后保留原断言。有一次完整运行在 tests/editor.cjs:1807 的公式光标位置断言出现 2 != 9；同样的问题在 HEAD 原版 bundle 的独立诊断中复现。没有修改该断言或相关产品光标代码，随后完整原断言运行及接入新增测试后的完整运行均通过。最终 PASS 不表示该既有波动已修复；相关尝试的日志全部保留。

扩展参考文献 acceptance 夹具（原项目外加的 --acceptance 运行）仍记录既有失败：中文字体未指定导致 PDF 缺字；duplicate-key/missing-resource 预期诊断未被夹具从 .blg 正确采集。初次该运行还缺少可启动的 Biber。原 verify-xelatex 默认两组和编辑编译 19 组在环境恢复后均通过。这些扩展夹具与后端/编译代码不在本轮修改范围，保留原始失败日志，不将其宣称通过。

此修复具备源码、严格回归、真实导出与编译证据，未创建或推送任何 PR。完整 Windows GitHub Actions 仍需未来允许推送该分支后验证；本轮未构建 Rust/Tauri 发布产物或部署。Node 24.22.1 本地结果不冒充工作流 Node 22 的远程结果。长期性能与任意外部协同历史重基未做专门基准；当前应用本地编辑/历史与 300,000 分隔符结构操作已有测试。

## 10. 重跑命令

在本地修复副本执行（使用已准备好的 Node/npm、TeX 与 Poppler 环境）：

~~~powershell
npm ci --no-audit --no-fund
npm run build
node --test tests/*.test.mjs tests/ui/*.test.mjs tests/bib/**/*.test.mjs
node tests/source-eol-browser.cjs
node tests/editor.cjs
node tests/bib/verify-xelatex.mjs
node tests/bib/compile/run-editor-compile.mjs --tex-bin=<TeX目录> --poppler-bin=<Poppler目录> --json
~~~

补丁与 final-source/ 包含全部 10 个变更文件；不包含 node_modules、浏览器缓存或 npm 缓存。screenshots/ 与各浏览器证据目录包含用户要求的截图及实际导出。
