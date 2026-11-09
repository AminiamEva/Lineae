# Lineae

**Write naturally. Typeset beautifully.**

Lineae is an experimental, lightweight, browser-based LaTeX editor that brings the familiarity of a word processor to scientific and technical writing.

Instead of writing LaTeX commands for every paragraph, heading, or equation, Lineae lets you work directly with the document itself. Text is formatted in place, mathematical expressions are edited visually, and supported document structures are represented as rich-text elements.

LaTeX remains the underlying document format.

> **Project status:** Early development. Lineae is a functional browser-based prototype, not yet a complete LaTeX environment or a replacement for a conventional TeX editor.

## Philosophy

Writing and typesetting should complement each other rather than compete for attention.

LaTeX offers exceptional control over document structure and mathematical notation, but working directly with its source can interrupt the writing process. Traditional word processors provide a more immediate editing experience, often without the same degree of typographic control.

Lineae aims to bring these approaches together.

The project is guided by four principles:

- **Direct manipulation.** Edit text, equations, and document structures where they appear.
- **LaTeX compatibility.** Keep `.tex` as the document format rather than introducing a proprietary alternative.
- **Separation of concerns.** Keep interactive editing independent of final TeX compilation.
- **Lightweight by design.** Prefer focused, reusable components over a monolithic document-processing environment.

Lineae does not attempt to reimplement the entire TeX system.

Its long-term goal is to provide a natural editing interface while leaving final typesetting to established TeX engines.

## Features

The current prototype includes the following capabilities.

### Rich-text editing

Lineae provides a document-oriented editing interface built on Tiptap and ProseMirror.

It currently supports:

- Paragraphs and section headings
- Bold, italic, underline, and strikethrough
- Text colours, font families, and font sizes
- Ordered, unordered, and description lists
- Block quotations and horizontal rules
- Tables with editable cells and basic structural operations
- Undo and redo
- Context menus and keyboard shortcuts

The editor uses a continuous document layout rather than paginated sheets.

### Mathematical editing

Mathematical expressions are integrated into the rich-text document through MathLive.

Supported interactions include:

- Inline and display mathematics
- Direct editing within rendered equations
- Fractions, roots, superscripts, and subscripts
- Matrices and selected mathematical environments
- Formula insertion and command completion
- Keyboard navigation between mathematical structures and surrounding text

Mathematical expressions retain their LaTeX representations.

### Document structure

Lineae recognises selected LaTeX document structures and presents them as editable elements.

Current support includes section numbering, starred headings, short titles, labels, references, and tables of contents.

Basic tabular environments are supported, including selected column alignments, merged columns, and `booktabs`-style rules.

### LaTeX interoperability

Lineae can open UTF-8 `.tex` files and export edited documents back to LaTeX.

The current import and export implementation supports a defined subset of common LaTeX commands and environments.

Unsupported structures are preserved as opaque source blocks where possible and remain accessible through source mode.

An imported document that has not been modified is exported without rewriting its original source.

**Important:** Source preservation after editing is not yet lossless. Modifying a document may cause supported sections to be regenerated, changing source formatting or other details. Arbitrary LaTeX documents are not guaranteed to round-trip without modification.

### Interface

The interface currently provides:

- A ribbon-style toolbar
- Chinese and English interface options
- Document zoom controls
- A LaTeX source editing mode
- Configurable mathematical keyboard shortcuts
- YAML-based interface preferences

Preferences are stored locally in the browser.

## Getting started

Lineae currently runs as a static web application. No application server or TeX distribution is required for its interactive editor.

### Requirements

For local development, you need:

- Node.js and npm
- A modern browser
- Python or another local HTTP server

The repository currently uses Tiptap 2.11.5, ProseMirror, esbuild, and MathLive 0.108.0.

### Installation

Clone the repository:

```bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
```

Install the dependencies:

```bash
npm ci
```

Build the editor bundle:

```bash
npm run build
```

The build generates `apps/web/editor.mjs`.

MathLive is distributed separately as a static browser asset. The following commands reproduce the packaging step used by GitHub Actions in a Bash-compatible environment:

```bash
npm pack mathlive@0.108.0

mkdir -p apps/web/vendor/mathlive

tar -xzf mathlive-0.108.0.tgz \
  -C apps/web/vendor/mathlive \
  --strip-components=1 \
  package/mathlive.min.js \
  package/fonts
```

Start a local HTTP server:

```bash
python -m http.server 8000 --directory apps/web
```

Then open:

```text
http://localhost:8000
```

Lineae should now be available in your browser.

The generated editor bundle and MathLive assets are excluded from version control.

## Working with documents

To begin writing, open the editor and enter text directly into the document area.

Use the toolbar to apply formatting, insert structural elements, or create mathematical expressions.

You can also open an existing `.tex` file using **Open .tex**.

The visual editor supports common LaTeX structures. For unsupported commands or environments, switch to **LaTeX** source mode to inspect or modify the original source.

To export your document, select **Download .tex** or press `Ctrl+S` (`Cmd+S` on macOS).

At present, saving initiates a browser download rather than modifying the original file directly.

### Current limitations

Lineae is not yet a full LaTeX implementation.

In particular:

- LaTeX parsing is limited to supported commands and environments.
- Arbitrary macro expansion is not implemented.
- Edited documents do not yet have general lossless source round-tripping.
- Switching from source mode reconstructs the visual document and resets rich-text editing history.
- The editor does not reproduce TeX's exact line-breaking or page-breaking algorithms.
- Local TeX compilation and PDF generation are not yet integrated.
- Multi-file LaTeX project management is not yet supported.

These limitations are architectural priorities rather than merely missing interface controls.

## Architecture

Lineae separates the document editing experience from LaTeX source processing.

The current implementation follows this general structure:

```text
                       Lineae
                          |
                  Browser Interface
                          |
                   Tiptap Editor
                          |
                 ProseMirror Model
                          |
           +--------------+--------------+
           |                             |
     Rich-text Editing             MathLive
           |                             |
           +--------------+--------------+
                          |
                  LaTeX Import/Export
                          |
                 Supported Structures
                          |
                     .tex Files
```

The ProseMirror document tree represents the editable document.

LaTeX import routines convert recognised commands and environments into structured editor nodes. Unsupported content is represented through raw source nodes where possible.

The export layer serialises the edited document back to LaTeX and resolves selected package dependencies.

A separate, source-preserving intermediate representation is planned but has not yet been implemented.

More information is available in [Editor Architecture](docs/EDITOR_ARCHITECTURE.md).

### Project structure

```text
lineae/
├── apps/
│   └── web/
│       ├── index.html
│       ├── pages.css
│       ├── config.yaml
│       ├── latex/
│       │   ├── document.mjs
│       │   ├── blocks.mjs
│       │   ├── inline.mjs
│       │   ├── tables.mjs
│       │   ├── packages.mjs
│       │   └── math-symbols.mjs
│       └── src/
│           ├── main.js
│           └── editor/
├── docs/
│   └── EDITOR_ARCHITECTURE.md
├── tests/
│   ├── fixtures/
│   ├── latex.test.mjs
│   ├── config.test.mjs
│   ├── tex-compat-parse.test.mjs
│   └── editor.cjs
├── package.json
└── package-lock.json
```

The application is currently implemented primarily in JavaScript.

A native desktop backend is not required by the present architecture.

## Development

### Building

```bash
npm ci
npm run build
```

### Testing

The repository includes unit tests for LaTeX processing and configuration, compatibility fixtures, and browser interaction tests.

Run the Node.js tests:

```bash
node --test tests/latex.test.mjs
node --test tests/config.test.mjs
node --test tests/tex-compat-parse.test.mjs
```

To run the browser regression suite, first build the application and prepare the MathLive assets as described above.

Install Chromium for Playwright:

```bash
npx playwright install chromium
```

Then run:

```bash
node tests/editor.cjs
```

The browser tests exercise rich-text input, mathematical editing, document structures, keyboard interactions, and LaTeX import/export behaviour.

GitHub Actions also builds and tests the application before deploying the web assets to GitHub Pages.

## Roadmap

The long-term development direction centres on improving LaTeX fidelity without compromising the editing experience.

### Document fidelity

Introduce a source-preserving syntax representation and structured document cache.

Move towards localised source modifications rather than regenerating entire edited documents.

Preserve comments, whitespace, unknown commands, and user-defined macros whenever possible.

### Editing experience

Expand support for mathematical structures, tables, references, figures, and common LaTeX environments.

Improve keyboard navigation, selection behaviour, accessibility, and interoperability between visual and source editing.

### Compilation

Introduce an independent compilation interface for established TeX engines, initially targeting XeLaTeX and LuaLaTeX.

Provide PDF previews, compilation diagnostics, and source-to-output navigation.

### Desktop application

Evaluate a lightweight desktop distribution after the browser editor and document model have become sufficiently stable.

Desktop packaging should not require bundling an entire TeX distribution.

### Layout

Investigate closer correspondence between the interactive document view and the final typeset output.

Accurate pagination is a future objective, not a requirement for the initial editor.

## Contributing

Lineae is in early development, and its internal interfaces are subject to change.

Bug reports, compatibility fixtures, regression tests, and implementation proposals are welcome.

Contributions concerning LaTeX source preservation, mathematical editing, and document model consistency are particularly valuable.

Before implementing substantial changes, please open an issue to discuss the proposed approach.

## Licence

A licence file has not yet been committed to this repository.

GNU GPLv3 is the intended licence, subject to formal adoption and verification of third-party dependency obligations.

Until a licence is published, the repository's public availability should not be interpreted as granting general redistribution or modification rights.

---

*Lineae — where writing meets typesetting.*
