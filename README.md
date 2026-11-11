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

Lineae is an experimental, browser-based LaTeX editor for technical and scientific writing. It combines a word-processor-style editing interface with mathematical input, while keeping LaTeX as the document format.

> **Project status:** Early development. The browser editor is functional, but supports a defined subset of LaTeX. It is not a complete TeX environment or a replacement for a conventional LaTeX workflow.

## What works today

**Document editing.** The editor supports paragraphs, section headings, common text formatting, lists, description lists, tables, code blocks, quotations, theorem and proof environments, footnotes, labels, cross-references, and tables of contents. Document title, author, paper size, orientation, and margins can also be edited.

**Mathematics.** MathLive provides editable inline and display equations. The editor includes matrix insertion and row/column operations, selected AMS environments, formula command completion, and keyboard navigation between equations and surrounding text.

**LaTeX files.** Open and edit UTF-8 <code>.tex</code> files in either the visual editor or source mode. Supported structures are converted to editable document elements; unsupported content is retained as source blocks where possible. Unmodified documents can be exported with their original source intact. After visual edits, supported structures are serialized again, so edited documents are not guaranteed to round-trip losslessly. Browser file pickers are used for direct file access where supported; project export is a separate ZIP download.

**References and bibliography.** Labels, <code>\ref</code>, <code>\eqref</code>, footnotes, and citation insertion are available in the editor. A separate BibTeX/BibLaTeX engine provides parsing, validation, entry operations, serialization, and <code>.tex</code> citation checks. Its public API and design are documented in [the Bib engine documentation](docs/bib-engine/API.md).

**Images and project export.** Local images can be inserted or dropped into the document, with support for figure captions and width settings. The project export action packages the active <code>.tex</code> file together with local assets already loaded by the editor.

**Interface.** The application has Chinese and English interface options, light and dark themes, zoom controls, and locally stored YAML-based preferences.

## Getting started

Lineae runs as a static web application. The interactive editor does not require an application server or a TeX distribution.

### Requirements

- Node.js and npm
- A modern browser
- Python 3, or another local HTTP server

### Build

Clone the repository and install the locked dependencies:

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive is distributed separately as a static browser asset. Prepare it with the same packaging step used by the deployment workflow:

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

Start a local server:

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

Open [http://localhost:8000](http://localhost:8000).

## Editor configuration

In the **File** tab, choose **Export YAML** to download your current settings and **Import YAML** to apply an edited file. Lineae remembers them in the current browser. Omitted settings use the defaults in [config.yaml](apps/web/config.yaml).

In the document, press `Ctrl+E` and then `C` to insert a display formula, or `B` to toggle `\fbox`. In a matrix or table, `Ctrl+E C` adds a column and `Ctrl+E R` adds a row. `Ctrl+E E` edits the formula next to the caret. Use a space between strokes, a YAML list for alternatives, and `null` to disable a binding. `mod` means Ctrl on Windows and Linux and Command on macOS.

```yaml
version: 2
editing:
  autoReplaceLigatures: true
keybindings:
  editor:
    insertDisplayMath: ctrl+e c
    toggleBox: [ctrl+e b, ctrl+alt+b]
```

Ligature replacement is off by default. When enabled, typing a space or punctuation after a word applies the replacements in `editing.ligatures`. This changes the document text and can be undone. Code, formulas, and imported or pasted text keep their original contents.

## Development and tests

Build the editor bundle with:

~~~bash
npm run build
~~~

Run the LaTeX, configuration, and compatibility tests:

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs
~~~

Run the Bib engine tests:

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

The browser regression suite requires the MathLive assets above and Playwright's Chromium build:

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

GitHub Actions builds the application, runs the regression suites, prepares the browser assets, and deploys the web application to GitHub Pages.

## Architecture

The editing model is built on Tiptap and ProseMirror. MathLive handles interactive mathematical input, while dedicated LaTeX modules parse and serialize the supported document structures. The Bib engine is a separate module and does not depend on the editor UI.

See [Editor Architecture](docs/EDITOR_ARCHITECTURE.md) for the editor internals and [Bib engine architecture](docs/bib-engine/ARCHITECTURE.md) for the bibliography subsystem.

## Current limitations

- LaTeX support is intentionally limited. Arbitrary macro expansion and the full semantics of third-party packages are not implemented.
- Unsupported commands and environments may remain available only as source blocks, rather than editable visual elements.
- Source preservation is strongest for documents that have not been modified. Editing supported structures can change their original formatting or serialization.
- The editor uses a continuous document view; it does not reproduce TeX's exact line-breaking or pagination.
- TeX compilation, PDF preview, and SyncTeX navigation are not integrated.
- The current editor works on one active <code>.tex</code> document. ZIP export can include loaded resources, but this is not yet a full multi-file project editor.
- A desktop application is not currently provided.

Development is focused on more reliable mathematical editing, source-preserving document operations, and broader LaTeX compatibility. Compilation and multi-file project workflows remain separate stages of the roadmap.

## Licence

Unless otherwise indicated, Lineae's original source code is licensed under the **GNU Affero General Public License version 3 only (AGPL-3.0-only)**. See [LICENSE](LICENSE) for the full licence text.

Third-party libraries and assets retain their respective licences. This project licence does not override third-party copyright or licensing terms.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
