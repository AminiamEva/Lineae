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

Lineae 是一款面向科技与学术写作的实验性浏览器 LaTeX 编辑器。它采用接近文字处理软件的编辑方式，支持在文档中直接编辑正文与数学公式，同时以 LaTeX 作为文档格式。

> **项目状态：** 早期开发阶段。当前网页编辑器已经可以使用，但只支持 LaTeX 的一部分语法，尚不是完整的 TeX 工作环境，也不能替代传统 LaTeX 编辑与编译流程。

## 当前功能

**文档编辑。** 支持正文、章节标题、常用文字格式、有序与无序列表、描述列表、表格、代码块、引用块、定理与证明环境、脚注、标签、交叉引用和目录。文档标题、作者、纸张规格、页面方向及页边距也可以在编辑器中调整。

**数学公式。** 使用 MathLive 编辑行内和行间公式，支持矩阵插入及行列操作、部分 AMS 数学环境、公式命令补全，以及正文与公式之间的键盘导航。

**LaTeX 文件。** 可以打开 UTF-8 编码的 <code>.tex</code> 文件，并在可视化编辑模式和源码模式之间切换。编辑器会将已支持的结构转换为可编辑元素；无法识别的内容在适当情况下保留为源码块。未修改的文档可以保留原始源码；经过可视化编辑后，已支持的结构会重新序列化，因此不能保证任意文档都能无损往返。浏览器支持文件系统访问接口时，可以通过文件选择器直接打开和保存；项目导出则单独生成 ZIP 文件。

**引用与文献。** 编辑器支持标签、<code>\ref</code>、<code>\eqref</code>、脚注和文献引用插入。独立的 BibTeX/BibLaTeX 引擎提供解析、校验、条目增删改、序列化和 <code>.tex</code> 引用检查。相关接口与设计见 [Bib 引擎文档](docs/bib-engine/API.md)。

**图片与项目导出。** 可以插入本地图片或将图片拖入文档，并设置题注和宽度。项目导出功能会将当前 <code>.tex</code> 文件与编辑器已载入的本地资源打包为 ZIP。

**界面。** 提供简体中文和英文界面、明暗主题、缩放控制，以及保存在本地的 YAML 格式偏好设置。

## 快速开始

Lineae 以静态网页应用的形式运行。使用编辑器不需要单独的应用服务器，也不要求本机安装 TeX 发行版。

### 环境要求

- Node.js 与 npm
- 现代浏览器
- Python 3 或其他本地 HTTP 服务器

### 构建与运行

克隆仓库并安装锁定版本的依赖：

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive 作为独立的浏览器静态资源提供。执行与部署流程相同的资源准备步骤：

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

访问 [http://localhost:8000](http://localhost:8000) 即可打开编辑器。

## 开发与测试

构建编辑器：

~~~bash
npm run build
~~~

运行 LaTeX、配置和兼容性测试：

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs
~~~

运行 Bib 引擎测试：

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

浏览器回归测试需要先准备上述 MathLive 资源，并安装 Playwright 的 Chromium：

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

GitHub Actions 会构建应用、运行回归测试、准备浏览器资源，并将网页应用部署到 GitHub Pages。

## 架构

编辑器以 Tiptap 和 ProseMirror 作为文档模型，MathLive 负责交互式数学输入，独立的 LaTeX 模块负责解析和序列化已支持的文档结构。Bib 引擎是独立子系统，不依赖编辑器界面。

更详细的说明见 [编辑器架构](docs/EDITOR_ARCHITECTURE.md) 和 [Bib 引擎架构](docs/bib-engine/ARCHITECTURE.md)。

## 当前限制

- LaTeX 支持范围有限，尚不支持任意宏展开和第三方宏包的完整语义。
- 部分未知命令与环境只能以源码块形式保留，不能直接作为可视化元素编辑。
- 源码保真主要适用于未经修改的文档。编辑已支持的结构后，原有格式或序列化形式可能发生变化。
- 编辑区采用连续文档布局，不会复现 TeX 的精确断行和分页算法。
- 尚未集成本地 TeX 编译、PDF 预览或 SyncTeX 源码定位。
- 当前一次编辑一个 <code>.tex</code> 文档。ZIP 导出可以附带已载入的资源，但还不是完整的多文件项目管理器。
- 目前没有桌面端应用。

当前开发重点是提高数学编辑的可靠性、完善源码保真机制，并逐步扩大 LaTeX 兼容范围。编译与多文件项目工作流仍属于后续工作。

## 许可证

除另有说明外，Lineae 原创源代码采用 **GNU Affero General Public License version 3 only（AGPL-3.0-only）**。完整文本见 [LICENSE](LICENSE)。

第三方库与资源仍遵循各自的许可证。本项目许可证不覆盖第三方版权或许可条款。

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
