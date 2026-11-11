[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**Write naturally. Typeset beautifully.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a></p>

Lineae 是一款面向论文、讲义和技术文档写作的浏览器 LaTeX 编辑器。它希望把 LaTeX 的结构与排版能力，放进一种更直接的编辑方式里：正文、标题、表格和公式都可以在文档中就地编辑，而不必时时面对源码命令。文档仍以 <code>.tex</code> 为基础，编辑器不另造一种封闭格式。

项目目前还在早期开发阶段。浏览器原型已经可以运行，常用编辑功能和一部分 LaTeX 导入、导出已经具备；但它还不是完整的 TeX 工作环境，也不能替代成熟的 LaTeX 编辑与编译流程。

## 为什么做 Lineae

LaTeX 的长处在于结构清楚、数学排版能力强，适合论文和技术文档；但如果所有操作都围绕源码展开，写作时就难免在正文、命令和编译结果之间来回切换。Word、Pages 一类文字处理软件更适合直接修改文档，却不是围绕 LaTeX 源文件设计的。

Lineae 想做的是把两种工作方式接起来。写正文时，直接选中文字调整格式；编辑公式时，直接进入公式本身；章节、列表、表格和图片也尽量在文档中完成操作。需要检查或修改源码时，仍然可以切回 LaTeX 源码视图。

这并不意味着要在浏览器里重新实现一遍 TeX。Lineae 负责改善写作和编辑过程，最终的专业排版仍应交给成熟的 TeX 引擎。公式在编辑器中的交互显示，与 TeX 对整份文档进行断行、分页和生成 PDF，是两件不同的事。

项目也不会为了追求“看起来支持 LaTeX”，就把无法识别的命令强行转换成普通文本。能可靠识别的结构才进入可视化编辑；暂时处理不了的内容，尽可能作为源码保留下来。对 LaTeX 编辑器而言，保住用户原来的文档，比制造一种似是而非的兼容性更重要。

## 目前已经能做什么

Lineae 现在是一款可以实际运行的浏览器编辑器原型。它已经具备日常写作所需的一批基础功能，支持范围则以当前解析器和编辑器能够可靠处理的 LaTeX 语法为限。

### 正文与文档结构

编辑区采用 Tiptap 和 ProseMirror 构建。正文、章节标题以及常见文字格式都可以直接编辑，包括粗体、斜体、下划线、删除线、字体、字号、文字颜色、上标和下标。编号列表、项目列表、描述列表、引用块、分隔线和代码块也已具备。

表格可以在文档中直接编辑。目前支持一部分常见的 <code>tabular</code> 结构，包括若干列格式、合并列和 <code>booktabs</code> 风格的横线。章节编号、带星号的标题、短标题、标签、交叉引用和目录也已纳入导入、编辑或导出流程。

此外，编辑器还支持定理、引理、命题、推论、定义、注记和证明等环境，以及脚注、文档标题和作者信息。日常编辑所需的撤销、重做、快捷键、右键菜单和查找替换也已实现。

目前编辑区采用连续排版，不会像最终 PDF 那样精确分页，也不模拟 TeX 的完整断行算法。

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

结构化文档模型服务于编辑体验，不取代原始源码，也不负责最终排版。项目接下来的重要工作，是建立更可靠的源码映射和局部写回机制：用户修改一个段落或公式时，尽量只改动对应的源码范围，而不是重新生成整份文档。当前实现还没有达到这一点。

关于编辑器内部结构，可参阅 [编辑器架构说明](docs/EDITOR_ARCHITECTURE.md)。

## 开发进度

Lineae 已经越过纯界面原型阶段，但距离完整的 LaTeX 编辑环境仍有不少工作。下面区分的是目前能用的部分和仍待实现的部分，不把规划中的功能算作现有能力。

| 模块 | 当前情况 |
| --- | --- |
| 浏览器编辑器 | 已有可运行原型，支持正文、公式、常用文档结构和基础编辑操作 |
| LaTeX 导入与导出 | 已支持一部分常用语法；未知内容尽可能保留，编辑后的源码保真仍需加强 |
| BibTeX / BibLaTeX | 独立文献模块已完成一轮验收，并有自动化与真实编译测试 |
| 源码保真与编辑历史 | 正在完善源码定位、局部写回，以及可视化模式和源码模式之间的历史一致性 |
| 多文件项目 | 尚未形成完整的项目管理流程 |
| TeX 编译、PDF 预览与 SyncTeX | 尚未集成 |
| 桌面端与精确分页 | 尚未实现 |

眼下的开发重点主要有三项：一是把公式输入、光标移动和矩阵等复杂结构的编辑行为做得更可靠；二是改善源码保真、模式切换和撤销重做，避免局部编辑影响文档其他部分；三是继续打磨正文选择、剪贴板、查找和长文档编辑等基础体验。

这些基础稳定后，再推进多文件项目、独立的 TeX 编译接口、PDF 预览以及源码与 PDF 之间的定位。精确分页和桌面封装属于更后面的工作。更细的功能拆分、优先级和验收条件见 [实现路线图](docs/IMPLEMENTATION_ROADMAP.md)。

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
