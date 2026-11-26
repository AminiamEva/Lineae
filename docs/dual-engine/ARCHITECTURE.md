# Browser typesetting and TeX references

The footer holds the user's choice. The resolver reads the root source, its reachable dependencies and the global default. The editor obtains a profile for the resolved engine. An unresolved conflict needs a user decision. [Selection rules](ENGINE_RESOLUTION.md)

| Component under apps/web | Responsibility |
|---|---|
| src/typesetting/engine-resolution.mjs | Inspect literal evidence and return file, line, column and command. |
| src/typesetting/engine-profile.mjs | Select the Xe Fandol data or the Lua font and JFM rules. |
| src/typesetting/font-measurement.mjs | Identify loaded faces, engine, features and profile version for measurement reuse. |
| src/typesetting/paragraph-layout.js | Measure tokens for the available line widths and construct the editor decorations. |
| src/typesetting/optimum-paragraph.mjs | Select breaks from boxes, glue and penalties for both profiles. |
| src/editor/typeset-pagination.js | Position shared page breaks, including row boundaries of supported long tables. |
| src/project/project.mjs | Persist project metadata and checkpoints separately from document text. |

The typesetting choice changes measurement and requests layout. Source mode, visual editing and ZIP export share the document's source-preservation paths. Engine selection writes a preference outside the TeX file. TikZ Studio has its own WASM runtime and produces figure previews. The whole-document TeX runner lives under tests/bib/compile. See [reference generation](REFERENCE_GENERATION.md) and [measured scope](ACCURACY_MATRIX.md).
