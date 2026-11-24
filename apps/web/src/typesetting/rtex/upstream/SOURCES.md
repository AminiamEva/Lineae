# Vendored rtex Canvas renderer

- Repository: https://github.com/HenryXiaoYang/realtime-tex-vsc-plugin
- Tag: `v0.0.6`
- Commit: `fcf6bea3f2c62f89890a5473539119b6185fb4dd`
- Copied paths (original directory layout): `webview/render.ts`,
  `src/protocol.ts`, `src/fontKey.ts`, `LICENSE`.
- License: MIT; copyright (c) 2026 Henry Yang. See `LICENSE`.
- Upstream files are unmodified, including headers and UTF-8/LF encoding.
- No font assets copied.
- Runtime dependency: `opentype.js` version `1.3.4` (not installed here).

Resource loading and UI integration belong outside this directory. The first
adapter supports OTF/TTF fonts only and must reject unsupported resources and
inexact pages before painting; no image or PDF fallback is provided.
