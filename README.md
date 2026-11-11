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

Lineae is an experimental browser-based **WYSIWYG LaTeX editor** for academic and technical writing. Its goal is not merely to make LaTeX documents editable through a graphical interface: **what appears in the editor should match the result of compiling the same document with a TeX engine as closely as possible.** LaTeX remains the native document format, with ordinary <code>.tex</code> files at the centre of the workflow.

The project is in early development. Its browser prototype supports direct editing and a growing subset of LaTeX, but it does not yet reproduce TeX's exact line breaking, pagination, or final PDF layout. Close correspondence between the editing view and compiled output is the project's objective, **not a feature already delivered**.

## Why Lineae

Direct manipulation alone is not the same as WYSIWYG typesetting. A visual editor may let users edit equations, tables, and headings while displaying a layout that differs substantially from the document ultimately produced by TeX. Lineae aims to close that gap: the editing surface should become a trustworthy view of the typeset document, not just a convenient representation of its structure.

Existing scientific editors make different trade-offs. [LyX](https://www.lyx.org/) follows a WYSIWYM (*What You See Is What You Mean*) approach, prioritising document structure rather than exact on-screen reproduction of the final layout. [GNU TeXmacs](https://www.texmacs.org/) offers WYSIWYG scientific editing with its own typesetting system and native document format, rather than using LaTeX as its underlying typesetter. Lineae's intended combination is **native LaTeX files, direct editing, and rendering calibrated against actual TeX compilation**.

That means fidelity in typography and layout matters as much as editing controls: fonts, spacing, mathematical notation, line wrapping, page geometry, and eventually pagination should agree with the compiled output wherever feasible. A perfect match for arbitrary packages and custom macros is not a realistic short-term promise; mismatches and unsupported constructs should remain visible and inspectable rather than being concealed.

The project follows four principles:

- **Aim for true WYSIWYG.** Judge the editing view by its agreement with compiled TeX output, not simply by whether a construct can be edited visually.
- **Keep LaTeX as the document format.** Work with ordinary <code>.tex</code> files and preserve unsupported material rather than replacing it with a proprietary representation or silently changing its meaning.
- **Separate rendering from compilation, but connect their results.** The interactive renderer should remain responsive, while a real TeX engine provides the reference for final output and, in future, for measuring and improving visual fidelity. Lineae does not plan to reimplement TeX wholesale in the browser.
- **Make limitations explicit.** Prefer reliable source preservation and a clear fallback to inaccurate previews or lossy conversion.

## Features

The current prototype covers the everyday structures needed to begin working on a technical document. Support is deliberately limited to syntax the editor can recognise and handle.

### Writing and document structure

The editor is built on Tiptap and ProseMirror. It supports paragraphs, section headings, and common text formatting, including bold, italic, underline, strikethrough, font family, font size, colour, superscript, and subscript. Ordered, unordered, and description lists, block quotations, horizontal rules, and code blocks are available as well.

Tables can be edited in the document, with support for basic <code>tabular</code> structures, selected column specifications, merged columns, and <code>booktabs</code>-style rules. The editor also recognises selected theorem environments, including theorem, lemma, proposition, corollary, definition, remark, and proof.

Section numbering, starred headings, short titles, labels, references, and a table of contents are supported. Footnotes and document-level title and author fields are also available. A find-and-replace panel, context menus, keyboard shortcuts, undo, and redo support day-to-day editing.

The editor currently uses a continuous document view. Its line breaks, spacing, and pagination are not yet guaranteed to match compiled TeX output; closing that gap is a central development goal.

### Mathematical editing

MathLive provides editable inline and display mathematics. Equations are edited in place rather than in a separate source panel. The current implementation includes common mathematical input, matrix insertion and row or column operations, selected AMS environments, command completion, and keyboard navigation between equations and surrounding text.

This is an editing surface, not a TeX math engine. The set of commands and environments that can be imported, displayed, and exported is finite and continues to be tested.

### LaTeX import and export

Lineae can open UTF-8 <code>.tex</code> files and switch between visual editing and source mode. Recognised commands and environments are converted into structured editor nodes. Constructs outside the supported subset are kept as opaque source blocks where possible, so they remain available in source mode and are not mistaken for ordinary text.

An imported document that has not been changed can be exported with its original source intact. Once a supported section is edited visually, that section may be serialised again; whitespace, comments, command choices, or other source details can therefore change. General lossless round-tripping after edits is not implemented yet.

### Images, references, and files

Local images can be inserted from a file picker or dropped into the document. Figure captions, image width, alignment, placement, and labels are supported within the implemented figure subset. Citation insertion can read a local <code>.bib</code> file, while labels and cross-references can be inserted and resolved in the document.

The editor can open and save files through browser file-system APIs where available. Browsers without the required save interface fall back to a download. <code>Ctrl+S</code> or <code>Cmd+S</code> invokes the save action. Project export creates a ZIP containing the active <code>.tex</code> file and local resources already loaded by the editor; it is not yet a full multi-file project manager.

### Bibliography module

The repository also contains a standalone BibTeX/BibLaTeX module, separate from the editor interface. Its public API covers parsing, validation, entry editing, serialization, diagnostics, citation scanning in <code>.tex</code> files, and a preflight check before compilation.

The module's acceptance report records **182 passing automated tests** and **19 successful real compilation combinations** across BibTeX/Biber workflows. These results apply to the bibliography module and its tested scope; they should not be read as a claim of complete BibTeX/BibLaTeX compatibility or a finished bibliography-management application. See the [Bib engine API](docs/bib-engine/API.md) and [architecture](docs/bib-engine/ARCHITECTURE.md).

### Interface and preferences

The application has Chinese and English interface options, light and dark themes, document zoom, a ribbon-style toolbar, and configurable mathematical keyboard shortcuts. Interface preferences are stored locally in YAML format.

## Architecture

The browser editor uses a ProseMirror document tree as its live editing model, with Tiptap providing the editor framework. MathLive handles interactive mathematical input. Dedicated LaTeX modules parse and serialise the supported document structures, while the editor's source mode provides access to the original text and unsupported constructs.

The intended boundary is straightforward:

~~~text
Browser interface
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
LaTeX import and export
       |
       +---- recognised syntax -> editable document nodes
       |
       +---- unsupported syntax -> preserved source blocks
       |
       v
     .tex files

BibTeX / BibLaTeX engine
       |
       +---- parsing, validation, editing and serialisation
       +---- citation checks against .tex source
~~~

The structured editor document supports interactive editing; the <code>.tex</code> source remains the document of record, and a TeX engine remains the authority for final typesetting. Separating the interactive renderer from compilation is an implementation choice, **not** a decision to accept different visual results. The planned compilation integration will provide a reference against which to assess and improve on-screen font metrics, mathematical layout, spacing, line breaking, and eventually page layout. Source-aware representation and localised source updates are also development goals; the current implementation can still regenerate edited structures.

See [Editor Architecture](docs/EDITOR_ARCHITECTURE.md) for implementation details.

## Development status

Lineae is a working prototype, not a finished editor. The distinction between what is already usable and what remains planned is important.

| Area | Status |
| --- | --- |
| Browser editor | Usable prototype with rich-text editing, equations, document structures, and interface preferences |
| LaTeX interoperability | Import and export for a defined subset; unsupported constructs are preserved where possible |
| Bibliography | Standalone BibTeX/BibLaTeX module with its own API and acceptance tests |
| Source fidelity | Unmodified files can be preserved; reliable local updates after visual edits are still in development |
| Editor–PDF visual fidelity | A core design goal; systematic comparison with compiled TeX output is not yet implemented |
| Multi-file projects | Not yet supported as a complete project workflow |
| TeX compilation and PDF preview | Not integrated |
| Desktop application and precise pagination | Not implemented |

The immediate work is centred on three areas: making equation input and navigation more reliable; improving source preservation, mode switching, and editing history; and tightening the behaviour of ordinary document editing, including selection, clipboard operations, and long-document navigation.

After these foundations are stable, the project can move towards multi-file project handling, an independent TeX compilation interface, and PDF preview. Comparing the editor view with compiled output—and progressively aligning fonts, spacing, line breaks, and page geometry—is a core direction, not an optional preview enhancement. Source-to-PDF navigation, accurate pagination, and desktop packaging remain future work, not current features. The [implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md) records the more detailed priorities and acceptance criteria.

## Getting started

Lineae runs as a static web application. You do not need an application server or a TeX distribution to use the browser editor. A local HTTP server is required to serve the files.

### Requirements

- Node.js and npm
- A modern browser
- Python 3 or another local HTTP server

### Build the editor

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive is distributed as a separate browser asset. Prepare it locally with:

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

Then open [http://localhost:8000](http://localhost:8000).

## Tests

Run the LaTeX, configuration, compatibility, and UI tests with:

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

Run the bibliography module tests with:

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

The browser regression suite requires the MathLive assets above and Playwright's Chromium build:

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

The GitHub Actions workflow builds the application, runs the LaTeX and bibliography test suites, prepares MathLive, runs the browser regression suite, and deploys the site to GitHub Pages.

## Contributing

Lineae is still in an early stage, and internal interfaces may change. If you find a bug or a LaTeX compatibility issue, an issue with a small, reproducible <code>.tex</code> example is especially useful. The formal process for external contributions will be documented as the project matures; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Unless otherwise indicated, Lineae's original source code is licensed under the **GNU Affero General Public License version 3 only (AGPL-3.0-only)**. See [LICENSE](LICENSE) for the full licence text.

Third-party libraries and assets retain their respective licences. The project licence does not override third-party copyright or licensing terms.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
