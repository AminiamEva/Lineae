[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**Write naturally. Typeset beautifully.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae 是一款正在开发的 **LaTeX 所见即所得编辑器**，面向论文、讲义和技术文档写作。我们想做的不只是让用户摆脱 LaTeX 命令、改用图形界面编辑，而是让**编辑区里的排版效果与同一份文档经过 TeX 引擎编译后的结果尽可能一致**。<code>.tex</code> 文件仍是文档的基础，不需要转存为另一种专有格式。

项目目前处于早期开发阶段。浏览器原型已经支持直接编辑正文、公式和一部分 LaTeX 结构，但尚不能准确复现 TeX 的断行、分页和最终 PDF 版式。编辑画面与编译结果高度一致，是 Lineae 要实现的目标，**不是当前已经完成的功能**。

## 为什么做 Lineae

能够直接编辑文档，不等于真正的所见即所得。如果编辑区能插入公式、调整表格，却只能看到一种大致的示意排版，最后仍然要反复编译 PDF 才知道文档究竟长什么样，那么写作和排版依旧是割裂的。Lineae 希望把这个差距尽量缩小：编辑区不仅用来输入内容，也应当尽可能真实地呈现最终成稿。

已有的科学文档编辑器各有侧重。[LyX](https://www.lyx.org/) 采用 WYSIWYM（What You See Is What You Mean，「所见即所指」）的思路，更关注文档结构，不追求编辑画面与最终版式完全一致。[GNU TeXmacs](https://www.texmacs.org/) 本身就支持所见即所得，但使用的是自己的排版系统和原生文档格式，并不直接以 LaTeX 引擎完成内部排版。Lineae 选择的是另一条路线：**保留原生 LaTeX 工作流，让可直接编辑的画面尽量贴近真实的 TeX 编译结果。**

这意味着，除了能否直接编辑公式、表格和章节，我们还必须关心字体、字距、段落间距、数学公式尺寸、断行、页面尺寸，乃至今后的分页是否与编译结果相符。任意宏包和自定义命令都能做到像素级一致，并不是现阶段可以许诺的事；对暂时无法准确呈现的内容，编辑器应当明确保留源码并提供核对途径，而不是假装已经正确渲染。

围绕这个目标，Lineae 坚持几个原则：所见即所得是一项**排版一致性要求**，不是界面宣传语；继续以 <code>.tex</code> 为正式文档，尽量保留无法识别的内容；交互渲染与 TeX 编译在架构上分离，但要以真实编译输出检验和改进编辑画面，而非任由两者各自呈现不同的结果；对尚未支持的功能明确说明限制，避免为了表面兼容而损坏文档。

## 目前已经能做什么

Lineae 现在是一款可以实际运行的浏览器编辑器原型。它已经具备日常写作所需的一批基础功能，支持范围则以当前解析器和编辑器能够可靠处理的 LaTeX 语法为限。

### 正文与文档结构

编辑区采用 Tiptap 和 ProseMirror 构建。正文、章节标题以及常见文字格式都可以直接编辑，包括粗体、斜体、下划线、删除线、字体、字号、文字颜色、上标和下标。编号列表、项目列表、描述列表、引用块、分隔线和代码块也已具备。

表格可以在文档中直接编辑。目前支持一部分常见的 <code>tabular</code> 结构，包括若干列格式、合并列和 <code>booktabs</code> 风格的横线。章节编号、带星号的标题、短标题、标签、交叉引用和目录也已纳入导入、编辑或导出流程。

此外，编辑器还支持定理、引理、命题、推论、定义、注记和证明等环境，以及脚注、文档标题和作者信息。日常编辑所需的撤销、重做、快捷键、右键菜单和查找替换也已实现。

目前编辑区采用连续排版，断行、间距和分页还不能保证与 TeX 编译结果一致。让这些排版细节逐步对齐，是项目接下来的核心任务，而不只是增加一种 PDF 预览方式。

### 数学公式

公式编辑由 MathLive 提供。行内公式和独立公式都可以直接在文档中编辑，分数、根式、上下标等常见输入方式均可使用。矩阵支持插入以及行、列操作；部分 AMS 数学环境也已纳入支持范围。

编辑器还提供数学命令补全，并处理公式与正文之间的键盘移动。公式编辑仍是当前重点打磨的部分：命令能否插入、能否正确显示、能否导入和导出，是不同的兼容性问题，不能仅凭命令出现在补全列表里就认为已经全部支持。

### LaTeX 源码与文件

Lineae 可以打开 UTF-8 编码的 <code>.tex</code> 文件，并在可视化编辑与源码模式之间切换。解析器会把能够识别的命令和环境转换成编辑器中的结构；暂不支持的部分，在适当情况下会作为独立源码块保留，仍可在源码模式下查看和修改。

这里有一个需要特别说明的限制：**未修改的文档可以保留原始源码，但这不等于编辑之后也能无损往返。** 目前对已支持结构的可视化修改，仍可能触发重新序列化，进而改变空格、注释、命令写法或其他源码细节。源码模式也是一次整份文档的修改与重建，切回可视化模式时会重建编辑视图，并重置富文本编辑历史。

文件打开和保存会优先使用浏览器提供的文件系统接口；浏览器不支持相应接口时，则回退为下载文件。使用 <code>Ctrl+S</code> 或 macOS 上的 <code>Cmd+S</code> 可以触发保存。另有 ZIP 项目导出，可将当前 <code>.tex</code> 文件与编辑器已经载入的本地资源一并打包；这还不是完整的多文件项目管理功能。

### 图片、引用与文献

图片可以从本地选择，也可以拖入文档。当前实现覆盖了一部分 figure 结构，可设置题注、图片宽度、对齐方式、浮动位置和标签。

文档中的标签、交叉引用和文献引用可以通过编辑器插入。插入文献引用时，可以读取本地 <code>.bib</code> 文件并选择相应条目。

仓库还包含一个独立的 BibTeX/BibLaTeX 文献处理模块，与编辑器界面分离。它提供文献文件解析、校验、条目编辑、序列化、诊断信息、对 <code>.tex</code> 源码中的引用进行检查，以及编译前检查等接口。该模块的验收报告记录了 **182 项自动化测试全部通过，19 组真实编译组合通过**。这些结果针对的是文献模块及其明确测试范围，并不意味着整个 Lineae 已经具备完整的文献管理或编译能力。接口和设计说明见 [Bib 引擎 API](docs/bib-engine/API.md) 与 [架构文档](docs/bib-engine/ARCHITECTURE.md)。

### 页面设置与界面

编辑器可以修改文档标题、作者、纸张规格、页面方向和页边距。界面提供中英文切换、浅色与深色主题、文档缩放和工具栏操作；部分偏好设置以 YAML 格式保存在本地。

## 技术结构

编辑器以 ProseMirror 文档树作为实时编辑模型，Tiptap 负责提供编辑器框架，MathLive 负责公式输入。独立的 LaTeX 模块处理目前支持的语法，将识别出的内容转换成编辑节点，并在导出时重新生成相应源码；无法识别的内容则尽可能保留为源码块。

大致的数据流如下：

~~~text
浏览器界面
    |
    v
Tiptap / ProseMirror  <---->  MathLive
    |
    v
LaTeX 导入与导出
    |
    +---- 已识别语法 -> 可编辑的文档结构
    |
    +---- 暂不支持的语法 -> 保留为源码块
    |
    v
  .tex 文件

独立的 BibTeX / BibLaTeX 模块
    |
    +---- 解析、校验、条目编辑与序列化
    +---- 检查 .tex 源码中的文献引用
~~~

结构化文档模型用于支撑交互编辑，<code>.tex</code> 源文件仍是正式文档，最终排版则以 TeX 引擎为准。**渲染与编译分离，不代表编辑画面可以与编译结果各不相同。** 后续需要接入真实编译流程，以 PDF 输出为基准，逐步校准编辑区的字体度量、公式布局、间距、断行与分页。同时也要建立更可靠的源码映射和局部写回机制：修改一个段落或公式时，尽量只改动对应的源码范围。上述能力目前尚未完整实现。

关于编辑器内部结构，可参阅 [编辑器架构说明](docs/EDITOR_ARCHITECTURE.md)。

## 开发进度

Lineae 已经越过纯界面原型阶段，但距离完整的 LaTeX 编辑环境仍有不少工作。下面区分的是目前能用的部分和仍待实现的部分，不把规划中的功能算作现有能力。

| 模块 | 当前情况 |
| --- | --- |
| 浏览器编辑器 | 已有可运行原型，支持正文、公式、常用文档结构和基础编辑操作 |
| LaTeX 导入与导出 | 已支持一部分常用语法；未知内容尽可能保留，编辑后的源码保真仍需加强 |
| BibTeX / BibLaTeX | 独立文献模块已完成一轮验收，并有自动化与真实编译测试 |
| 源码保真与编辑历史 | 正在完善源码定位、局部写回，以及可视化模式和源码模式之间的历史一致性 |
| 编辑画面与 PDF 排版一致性 | 核心设计目标；尚未建立与真实 TeX 编译结果的系统化对照和校准 |
| 多文件项目 | 尚未形成完整的项目管理流程 |
| TeX 编译、PDF 预览与 SyncTeX | 尚未集成 |
| 桌面端与精确分页 | 尚未实现 |

眼下的开发重点主要有三项：一是把公式输入、光标移动和矩阵等复杂结构的编辑行为做得更可靠；二是改善源码保真、模式切换和撤销重做，避免局部编辑影响文档其他部分；三是继续打磨正文选择、剪贴板、查找和长文档编辑等基础体验。

这些基础稳定后，将推进多文件项目、独立的 TeX 编译接口与 PDF 预览，并以实际编译结果为依据，逐步解决编辑区和成稿在字体、间距、断行、页面布局上的差异。**提高编辑画面与最终排版的一致性，是 Lineae 的主线目标，而不是附加的预览功能。** 源码与 PDF 的双向定位、精确分页和桌面封装都还属于后续工作。更细的功能拆分、优先级和验收条件见 [实现路线图](docs/IMPLEMENTATION_ROADMAP.md)。

## 本地运行

Lineae 目前以静态网页应用的形式运行。使用浏览器编辑器不需要安装 TeX 发行版，也不需要单独启动应用后端；本地开发只需 Node.js、npm 和一个 HTTP 服务。

### 环境要求

- Node.js 与 npm
- 现代浏览器
- Python 3，或其他本地 HTTP 服务

### 构建

克隆仓库并安装依赖：

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive 作为独立的浏览器资源提供。构建后还需要准备公式编辑器的脚本和字体：

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

启动本地 HTTP 服务：

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

然后访问 [http://localhost:8000](http://localhost:8000)。

## 测试

运行 LaTeX 解析、配置、兼容性和界面测试：

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

运行 BibTeX/BibLaTeX 模块测试：

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

浏览器回归测试需要先准备上面的 MathLive 资源，并安装 Playwright 的 Chromium：

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

GitHub Actions 会自动构建应用、运行 LaTeX 和文献模块测试、准备 MathLive、执行浏览器回归测试，并将网页应用部署到 GitHub Pages。

## 桌面预览版

`apps/desktop` 里有一个用 Tauri 2 构建的 Windows x64 预览版。它复用浏览器编辑器，增加了原生的打开、保存和另存为对话框，并沿用现有的 ZIP 流程导出项目。构建和打包只在 GitHub Actions 上运行；产物清单和验收步骤见 [docs/desktop-preview.md](docs/desktop-preview.md)。编译、文件监听和自动更新不在这个预览版的范围内。

## 参与项目

Lineae 还处在早期开发阶段，内部接口和实现方式可能继续调整。如果发现问题，欢迎提交 Issue；如果涉及 LaTeX 兼容性，最好附上一份尽可能精简、能够复现问题的 <code>.tex</code> 文件。正式的外部贡献流程会随着项目成熟逐步补充，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

除另有说明外，Lineae 的原创源代码采用 **GNU Affero General Public License version 3 only（AGPL-3.0-only）**。完整许可文本见 [LICENSE](LICENSE)。

第三方库、字体和其他资源仍遵循各自的许可证；本项目许可证不改变它们原有的版权和许可条件。

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
