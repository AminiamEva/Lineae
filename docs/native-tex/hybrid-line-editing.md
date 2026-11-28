# Editing a paragraph while LuaLaTeX is typesetting

ProseMirror owns input, composition, selection and history for the lifetime of an edit. The native page owns the confirmed glyphs. A paragraph can change several times, split, lose focus, or move to another page before the host responds.

| Path reviewed | Behavior at the boundary | Regression evidence |
| --- | --- | --- |
| Document transaction → TeX source | Splitting an imported paragraph preserves its two pieces, physical line breaks, spaces, comments, emphasis commands and Unicode spelling. Inline formulas and citations keep their exact source bytes when typing in adjacent text. | `tests/native-paragraph-geometry.test.mjs`, `tests/native-hybrid-baseline-browser.cjs --app` |
| Text layout → editable DOM | Editing invalidates break and justification decorations on every changed text block. A soft wrap can have two physical caret stops at one document offset. Home, End and their Shift selections use the confirmed TeX line under the caret. | `tests/native-paragraph-geometry.test.mjs`, `tests/native-hybrid-baseline-browser.cjs` |
| Composition → committed text | The focused DOM node stays mounted. Placement uses the browser's measured font baseline, the native text column, paragraph indentation and the current zoom. | `tests/native-hybrid-typing-webview.cjs` |
| Split or blur → pending page | The completed lines retain their measured word and glyph positions on each sheet. Obsolete glyphs are masked until that sheet has painted the matching revision. | `tests/native-hybrid-baseline-browser.cjs` compares per-character rectangles and deliberately stalls the host |
| Host delta → displayed page | The next complete delta is reconstructed from its complete predecessor. A late complete page cannot roll back newer paragraph ink. Virtualized pages acquire the same revision when painted. | `tests/native-paragraph-geometry.test.mjs`, `tests/native-tex-preview-browser.cjs` |
| Equation, history and source views | The ordinary editor still handles the active formula. Native geometry and transient DOM fragments stay outside the document and its saved TeX. | `tests/native-desktop-typing.cjs`, `tests/math-editing-browser.cjs`, `tests/native-hybrid-baseline-browser.cjs --app` |

A complete justified line in one text run retains its measured width and is shaped together. Where several marks share a line, their partial runs retain their individual origins. The browser regression checks every visible character in both cases and checks that a long plain paragraph creates just one fragment per visual line.

The Windows WebView test samples animation frames across pinyin composition, Han text commitment, repeated Enter, and the return of confirmed ink. It checks model and source contents separately from movement on screen. A delayed change from the article indent to the Chinese indent is also replayed before a new paragraph has a native line box. It uses the browser's composition protocol. Candidate-window placement in a particular system IME needs a separate hardware test.

LuaLaTeX may legitimately change page or line placement after a font, paper, or paragraph-style change. Multiple empty TeX paragraphs can also typeset as a single break. In that case the active insertion point stays visible while the user edits, and the confirmed result uses TeX's spacing.
