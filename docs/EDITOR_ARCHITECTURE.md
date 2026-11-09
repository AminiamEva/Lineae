# Lineae editor architecture

The UTF-8 LaTeX source is the interchange format. Imported blocks retain their original source until edited. Unrecognized structures stay visible as read-only source.

| Module | Responsibility |
| --- | --- |
| latex/document.mjs | Document boundaries, source blocks, line endings and environment grouping |
| latex/inline.mjs | Supported inline syntax and math delimiters |
| latex/tables.mjs | Simple tabular models, alignment, and rule serialization |
| latex/packages.mjs | Feature-to-package resolution and preamble assembly |
| editor.mjs | DOM projection, input, selection, MathLive integration and UI |

Package declarations and package rendering are separate. Declaring a package does not make arbitrary commands editable. A rendering adapter must explicitly recognize the syntax, retain source for unsupported cases, and provide an edit serializer.

The web preview covers supported constructs. XeLaTeX remains the reference for final glyph metrics, page breaking, floats, numbering and arbitrary macro expansion. Native compiler integration and a unified transactional editor model are subsequent architecture work.

GitHub Actions runs the LaTeX regression tests before packaging the pinned MathLive distribution and publishing the static site.
