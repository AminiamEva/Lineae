# Lineae editing architecture

The editable document is a ProseMirror tree hosted by Tiptap. Changes use transactions, which map selections and support undo and redo. Lists, headings, paragraphs and tables use the editor's structural commands.

## Components

- src/main.js assembles the editor, command toolbar, source view, file input and display controls.
- src/editor/math-node.js adapts MathLive to an inline atomic node. Formula input dispatches transactions.
- src/editor/caret-motion.js and src/editor/selection-motion.js share the page's coordinate system and an animation clock. Text highlights use measured text runs. Formulas and other atomic nodes use their own bounds. The browser and ProseMirror still own the selection. Navigation retargets from the displayed position, and edits use a shorter motion at the insertion point. IME composition and reduced motion use native rendering. MathLive and table cell selections keep their own rendering. src/editor/space-overlay.js updates the caret separately from nonprinting marks.
- src/editor/latex-codec.js maps supported LaTeX to the editor tree and serializes edited content.
- latex/document.mjs retains preamble, document boundaries and opaque source blocks.
- latex/inline.mjs recognizes supported inline syntax.
- latex/tables.mjs recognizes simple table syntax.
- latex/packages.mjs resolves feature dependencies in exported LaTeX.

Source mode is an explicit whole-document edit. Applying it rebuilds the editable projection. Unsupported constructs remain opaque nodes editable in source mode.

## Verification and builds

Dependencies are locked in package-lock.json. GitHub Actions runs npm ci, bundles the application, runs source regression tests, packages MathLive, and executes Chromium editing regressions before deployment. Generated editor.mjs and vendor assets belong to the deployment artifact.

## Current fidelity limits

The editable browser layout is not calibrated to XeLaTeX page breaking or arbitrary package expansion. Complex package constructs and source trivia inside changed supported blocks need dedicated adapters and a lossless syntax model. Source edits reset rich-text history. MathLive completion covers math commands; the document command menu covers structural insertions.
