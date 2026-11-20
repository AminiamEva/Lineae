# Known Issues

## Merged causes

- **Stale translations / stale line measurements**: pagination drift and body/source mode overflow had one cause. Fixed together.
- **Wrap paragraph geometry**: wrapfigure line breaking and vertical spacing use the same float-box/first-line geometry. Fixed and verified together.

## Resolved

### Pagination drifts after a second pagination pass

- Status: fixed
- Area: `apps/web/src/editor/typeset-pagination.js`
- Symptom: blocks were measured after previous CSS translations, and paragraph line detection could return line tops outside the paragraph, pushing one paragraph per page.
- Fix:
  - Block positions are measured without the element's current `translate`.
  - Paragraph line positions are derived from ProseMirror text positions instead of DOM child counts.
  - Invalid line measurements outside the paragraph bounds fall back to treating the paragraph as one unsplit block.

### Text overflows the page after switching between body and source mode

- Status: fixed.
- Area: source/body mode switching plus `typeset-pagination.js`
- Fix: pagination is paused while source mode is active; returning to document mode clears pagination translations and stale line-break decorations through `typesetPagination.reset()`, then repaginates from scratch.
- Verified: an 80-paragraph document and a document with `wrapfigure` keep their page count and have no overflow after repeated source/body switches.

### Table hover can trigger a spurious pagination pass

- Status: fixed.
- Area: `apps/web/src/editor/typeset-pagination.js`, `apps/web/src/typesetting/paragraph-layout.js`
- Symptom: hovering a table on page 2 could trigger a pagination pass; the paragraph directly under a wrapfigure on page 1 was then pushed to the next page even though the document had not changed.
- Cause: pagination was not idempotent. Hover controls and table geometry could schedule a second layout; the second pass still saw previous line-break decorations, and wrap geometry was read from the translated image rectangle. Re-running the same content could therefore produce a different wrap-line count.
- Fix:
  - `typeset-pagination.js`: `layoutSignature()` now compares document identity plus preamble, mode, column mode, page size, editor size, image/table heights and furniture style. If unchanged and not forced, the layout pass returns without touching the page.
  - Real layout passes clear the previous `pagination-line-break` decorations before measuring.
  - `layout()` clears `lineBreaks` before measurement and re-adds them only after the new plan is known.
  - `paragraph-layout.js`: wrap geometry uses the image rectangle with its own `translate` removed, and side spacing uses the computed `\columnsep` minus overhang.
  - `image-node.js`: exposes `data-wrap-overhang` so the kernel can apply wrapfig's overhang rule.
  - `update()`, `setMaketitle()`, `setMode()`, `setTableContinuation()`, `reset()` and `pause(false)` force a real layout when their settings change.

### wrapfigure vertical spacing does not match XeLaTeX

- Status: fixed
- Area: `apps/web/pages.css`
- Fix: the gap is the outer `.document-image[data-wrap]` margin, not figure/image padding. Top margin is `\intextsep + 0.5 × line-height` so the image top sits near the second wrapped line's midline; bottom uses `2.25 × line-height` margin plus `1.1 × line-height` padding, because a float's margin alone does not extend its wrapping box. The side gap now uses the actual `\columnsep` (10pt in article) from the computed margin instead of a hard-coded 10px; overhang is subtracted when present.
- Verified against XeLaTeX output: the first wrapped line starts 13.8 pt below the image top in the reference, and the updated Lineae layout matches within about 0.3 pt.

## PR #26 table model: removed interactive table capabilities

- Status: accepted trade-off in the PR #26 merge.
- Table architecture: PR #26 is now authoritative. It keeps the original table source and patches cell source ranges (`tblr`, `tabularx`, table floats) instead of rebuilding a semantic table model.
- Removed/deferred:
  - per-edge table line toggle buttons;
  - row/cell rule attrs (`rules`, `trailingRules`, `horizontalRuleMode`);
  - cell `ruleLeft`/`ruleRight` and column-rule interactions that depended on the semantic AST;
  - table margin/height edits that assumed the semantic table serializer.
- Consequence: complex source-preserving tables remain editable, but the previous visual edge-toggle interactions are no longer available. Any replacement must be rebuilt on PR #26 source ranges and must not mutate the semantic table rule attrs.
