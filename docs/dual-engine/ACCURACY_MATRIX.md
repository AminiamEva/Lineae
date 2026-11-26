# What layout accuracy covers

| Coverage | Evidence and acceptance |
|---|---|
| Xe Latin Modern and Fandol | Compare the current Xe PDF cases and test the frozen historical paragraph, page and CJK fixtures separately. |
| Lua Latin Modern | Controls, three geometry settings, explicit sentence space, sizes, features and automatic hyphenation. |
| Lua Fandol | Pure Han, punctuation, Latin adjacency and measured JFM rules. Compare each sample with its own engine and class. |
| Custom fonts and complex math | Editable preview. Strict geometry requires a matching font file, shaping settings and a measured case. |
| Tables and floats | Check page membership, cell edits, image bounds and absolute baselines on a matching paper size. Paragraph tolerances alone cannot establish float or page fidelity. |
| Source | Compare raw bytes for unchanged files. For a scoped edit compare against the expected bytes and include siblings. |

For the controlled paragraphs every line must match, absolute width error must be below 1 CSS px, and relative baseline error below 0.5 CSS px. The browser JSON records the PDF and browser text for each line, signed deltas, viewport, engine and candidate commit. Ligatures and Poppler-inserted CJK word gaps are normalized only in the layout comparison. Byte-preservation tests hash the original data.

The Phase F delivery includes a per-case matrix, command exit codes and full measurements. The original Phase A FAIL and the measured Xe picture-wrap limitation remain part of the record. A passing controlled paragraph gives no accuracy guarantee for arbitrary fonts, large unsplittable tabular boxes, complex floats, or an untested OS/WebView.
