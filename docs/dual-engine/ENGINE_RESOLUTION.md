# Selecting a typesetting engine

`resolveEngine({explicitChoice, source, projectSources, globalDefault})` returns `requestedChoice`, `resolvedEngine`, `reason`, `evidence` and `diagnostics`. A source is a string (main.tex) or an object with path and text. Project sources use the same object shape. The resolver walks resolved literal input/include edges from the root and sorts evidence by file and source order.

| Input | Auto | Explicit LuaLaTeX |
|---|---|---|
| Plain article, ctexart, fontspec or unicode-math alone | Global default, initially LuaLaTeX | LuaLaTeX |
| Unconditional xeCJK | XeLaTeX | LuaLaTeX with the Xe dependency location |
| Unconditional LuaTeX-ja or directlua | LuaLaTeX | LuaLaTeX |
| Both dependencies, no directive | Unresolved with locations for both | LuaLaTeX with conflicting Xe evidence |

An explicit choice takes precedence. In Auto, main-file magic comments have priority over child declarations, followed by unconditional dependencies and then the global default. Conflicting evidence at the deciding priority requires a choice. A successful decision still reports incompatible evidence. Static inspection understands supported literal commands and conditionals. Dynamically generated package names can require a manual choice.

A migrated project with evidence of its earlier Xe default can retain its Xe preference. An independent legacy file without a directive, dependency or preference follows the current default. The footer exposes the requested choice, resolved engine, reason and diagnostics. Use `node --test tests/engine-resolution.test.mjs tests/engine-preferences.test.mjs` for the contract and `node tests/engine-preferences-browser.cjs` after building for the editor and persistence checks.
