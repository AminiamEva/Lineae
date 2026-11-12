# Remote compile acceptance

The acceptance entry point is:

```text
node tests/bib/verify-xelatex.mjs --acceptance --out=/tmp/lineae-bib-acceptance
```

Run it on the authorized `aliyun1` host. It performs the existing
`xelatex -> bibtex/biber -> xelatex -> xelatex` rounds, copies fixtures into an
isolated output directory, preserves original examples, and writes
`acceptance-report.json` with tool versions, commands, case results, and the
browser-preview limitation. The `bibtex-crlf-中文` case is rewritten to CRLF
inside the isolated directory before compilation.

Coverage:

- BibTeX and Biber/XeLaTeX with Chinese paths and Unicode source.
- Windows CRLF input.
- Duplicate citation keys, requiring a backend diagnostic rather than silent
  replacement.
- Missing `.bib` resources, requiring a compile diagnostic.
- The original `tests/bib/xelatex/` fixtures remain unchanged.

The browser preview can compare source/semantic state, but it does not run
XeLaTeX, BibTeX, or Biber and cannot certify PDF layout. XeLaTeX output is the
authoritative rendering result.

## Current run status

The remote attempt from this worktree used:

```text
ssh aliyun1 "uname -a; command -v xelatex; command -v bibtex; command -v biber"
```

It was blocked before tool discovery with:

```text
Permission denied (publickey,password).
root@47.116.178.249: Permission denied (publickey,password).
```

Therefore this checkout contains the rerunnable fixtures and entry point, but
does not claim a remote compile pass or tool versions until the authorized SSH
identity is available.
