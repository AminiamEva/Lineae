# Phase E · 默认引擎与编辑器交互

功能分支为 feat/lualatex-dual-engine。开工时远端 main 为 49b2d392d27bd116fe208f398b5b60176b71059d，Phase D 独立验收对象为 71c42547299bedfc6c493ae1378e6f5d7a6fd848。两者在隔离工作区合入本地功能分支后，本阶段起点为 470073ae21c240b7f95be3809c16d066f94eb6a2。

## 既有门禁

A 如实冻结 Linux 英文、中文、绕图与环境失败。B 在同一环境保留两项旧宽度失败。C 建立真实 PDF 参考，旧扩展文献套件仍有两例缺中文字形。Windows D 验收的范围为 33 个 Lua 受控样本、164 行，另有 14 个同环境 Xe 样本。最大行宽偏差 0.523599 CSS px，最大相对基线偏差 0.025153 CSS px。上述历史结论和冻结文件继续保留。任意字体、数学公式及平台的全面 PDF 一致性尚待验证。

## 用户行为和修改文件

| 入口 | 行为 |
|---|---|
| apps/web/config.yaml，src/editor/config.mjs，src/ui/settings-panel.js | 保持配置版本 2。旧 YAML 缺省的新字段继承 LuaLaTeX，两种合法默认值可在 Settings 中选择。 |
| apps/web/index.html，src/main.js，src/ui/engine-panel.js，pages.css | 页脚展开引擎控件，可为工程或单个文件选 Auto、Lua、Xe。控件用本地化标签和原生选择框，显示实际采用的引擎、判断原因与文件、行、列、命令。Auto 冲突时移除精确断行装饰。 |
| src/project/project.mjs，src/project/explorer.js | 根文档以及由字面 input/include 可达的实时草稿参与解析。浏览器通过 IndexedDB 保存目录句柄，以 isSameEntry 区分同名目录。显式选择跟随工程根目录，浏览器 metadata 与桌面 checkpoint 共用字段。 |
| src/editor/typeset-pagination.js，src/typesetting/paragraph-layout.js，font-measurement.mjs | 引擎更改时为当前编辑器替换 profile、清理测量缓存、更新字体样式并请求重排。装饰事务不含文本步骤，不写入撤销栈。中文组合输入期间保持当前引擎。 |
| src/ui/tikz-studio.js，scripts/install-mp-tikz-wasm.mjs | 独立 WASM 的 Unicode 后端用于 fontspec、unicode-math；图绘制库调用 Lua，明确需要 Xe 的图形返回诊断。0.5.1 的 Ghostscript 运行时由单独的发布包提供，安装完成后才写就绪标记。 |
| tests/engine-preferences.test.mjs，tests/engine-preferences-browser.cjs | 覆盖配置、旧项目识别、根与子文件、草稿、改名、独立文档、完全退出重开、IME、双语控件、原始 ZIP 字节与撤销。 |
| apps/desktop/src-tauri/src/project.rs，tests/project-browser.cjs，tests/tikz-studio-browser.cjs，tests/lua-custom-font-browser.cjs | 原生独立进程 checkpoint 断言字段；工程用例指定其英文断言使用的 locale；WASM 等待对应 SVG 重绘，旧 Lua 显式测试绑定新的 bootstrap 属性。 |

## 迁移与保存

旧工程的有根目录身份的记录同时含有效主文件、文件 ID 且无引擎声明时，一次性保存 Xe 偏好。用户改回 Auto 后重开继续采用 Auto。无元数据的独立 .tex 仅依据源码和全局默认推断，用户可选 Xe。独立导入的偏好按文件名和原始字节摘要保存。外部重命名或更改字节会获得新身份。同名同内容的两个独立导入共享身份。浏览器选择写本地存储，桌面工程选择随异步 checkpoint 保存。重新选择单独文件或目录仍由用户完成。

## 复验入口

在 Windows 工作区使用锁文件对应依赖，构建前端并准备 MathLive、Playwright Chromium 和完整 mp-tikz-wasm 0.5.1。没有 WASM 时脚本的 SKIP 不能作为成功证据。

~~~powershell
node --test "tests/**/*.test.mjs"
npm run build
node tests/engine-preferences-browser.cjs
node tests/project-browser.cjs
node tests/tikz-editor-browser.cjs
node tests/tikz-studio-browser.cjs
node docs/dual-engine/probe-layout.cjs <输出目录>
node apps/desktop/scripts/stage.mjs
cargo test --offline --manifest-path apps/desktop/src-tauri/Cargo.toml --lib independent_process_checkpoints_survive_saves_and_stale_acknowledgement
~~~

Lua/Xe 精度重放使用 tests/lua-pdf-browser.cjs 的 engine、reference、output 三个实参。配套独立验收记录列出候选 SHA、真实命令、状态、大小和原始日志。工程运行时仅提供编辑器预览与局部 TikZ 渲染。
