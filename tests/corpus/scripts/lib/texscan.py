"""Lightweight TeX project inspection: features, packages, likely main file."""

from __future__ import annotations

import re
from pathlib import Path

PACKAGE_FEATURES = {
    "amsmath": "amsmath",
    "amssymb": "amsmath",
    "amsthm": "theorem",
    "mathtools": "amsmath",
    "tikz": "tikz",
    "pgfplots": "pgfplots",
    "algorithm2e": "algorithm",
    "algorithmic": "algorithm",
    "algorithmicx": "algorithm",
    "algpseudocode": "algorithm",
    "longtable": "longtable",
    "tabularx": "tabularx",
    "booktabs": "booktabs",
    "biblatex": "biblatex",
    "natbib": "bibliography",
    "hyperref": "hyperref",
    "cleveref": "cross-reference",
    "subcaption": "subfigure",
    "subfig": "subfigure",
    "multicol": "multicol",
    "beamer": "beamer",
    "geometry": "geometry",
    "fancyhdr": "header-footer",
    "fontspec": "fontspec",
    "siunitx": "siunitx",
    "glossaries": "glossaries",
    "listings": "listings",
    "minted": "listings",
    "microtype": "microtype",
}

ENV_FEATURES = {
    "theorem": "theorem",
    "lemma": "theorem",
    "definition": "theorem",
    "proposition": "theorem",
    "corollary": "theorem",
    "proof": "proof",
    "align": "amsmath",
    "equation": "amsmath",
    "gather": "amsmath",
    "matrix": "matrix",
    "pmatrix": "matrix",
    "bmatrix": "matrix",
    "cases": "cases",
    "algorithm": "algorithm",
    "algorithm2e": "algorithm",
    "tikzpicture": "tikz",
    "axis": "pgfplots",
    "longtable": "longtable",
    "tabularx": "tabularx",
    "tabular": "table",
    "figure": "figure",
    "subfigure": "subfigure",
    "multicols": "multicol",
    "frame": "beamer",
    "thebibliography": "bibliography",
    "lstlisting": "listings",
}

DOC_CLASS_ENGINE = {
    "article": "pdflatex",
    "report": "pdflatex",
    "book": "pdflatex",
    "amsart": "pdflatex",
    "amsbook": "pdflatex",
    "revtex4-1": "pdflatex",
    "revtex4-2": "pdflatex",
    "beamer": "pdflatex",
}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def analyze_tree(root: Path) -> dict:
    tex_files = sorted(p for p in root.rglob("*.tex") if p.is_file())
    bib_files = sorted(p for p in root.rglob("*.bib") if p.is_file())
    sty_files = sorted(
        list(root.rglob("*.sty")) + list(root.rglob("*.cls")) + list(root.rglob("*.bst"))
    )
    packages: set[str] = set()
    environments: set[str] = set()
    commands: set[str] = set()
    features: set[str] = set()
    document_classes: dict[str, int] = {}
    include_targets: set[str] = set()

    for tex in tex_files:
        text = read_text(tex)
        for match in re.finditer(r"\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}", text):
            for name in match.group(1).split(","):
                packages.add(name.strip())
        for match in re.finditer(r"\\begin\s*\{([^}]+)\}", text):
            environments.add(match.group(1).strip())
        for match in re.finditer(r"\\(?:newcommand|renewcommand|DeclareMathOperator|def)\*?\s*\{?\\([A-Za-z@]+)", text):
            commands.add(match.group(1))
        for match in re.finditer(r"\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}", text):
            cls = match.group(1).strip()
            document_classes[cls] = document_classes.get(cls, 0) + 1
        for match in re.finditer(r"\\(?:input|include|subfile)\s*\{([^}]+)\}", text):
            include_targets.add(match.group(1).strip())
        if "\\begin{document}" in text:
            features.add("standalone-document")
        if re.search(r"\\cite[a-z]*\s*[\[{]", text):
            features.add("citations")
        if re.search(r"\\footnote\s*[\[{]", text):
            features.add("footnote")
        if re.search(r"\\ref\s*\{", text) or re.search(r"\\label\s*\{", text):
            features.add("cross-reference")
        if re.search(r"\\url\s*\{|\\href\s*\{", text):
            features.add("hyperref")
        if re.search(r"\\multicolumn\s*\{", text):
            features.add("multicolumn")
        if re.search(r"\\multirow\s*\{", text):
            features.add("multirow")
        if "\\twocolumn" in text or re.search(r"\\documentclass\s*\[[^\]]*twocolumn", text):
            features.add("twocolumn")
        if re.search(r"\\includegraphics", text):
            features.add("figure")

    for pkg in packages:
        if pkg in PACKAGE_FEATURES:
            features.add(PACKAGE_FEATURES[pkg])
    for env in environments:
        if env in ENV_FEATURES:
            features.add(ENV_FEATURES[env])
    if any(c.startswith("tikz") for c in commands):
        features.add("tikz")
    if len(commands) >= 5:
        features.add("custom-macro")
    if bib_files:
        features.add("bibfile")
    if document_classes.get("beamer") or "beamer" in packages:
        features.add("beamer")

    return {
        "tex_files": [p.relative_to(root).as_posix() for p in tex_files],
        "bib_files": [p.relative_to(root).as_posix() for p in bib_files],
        "style_files": [p.relative_to(root).as_posix() for p in sty_files],
        "packages": sorted(packages),
        "environments": sorted(environments),
        "commands": sorted(commands),
        "document_classes": document_classes,
        "include_targets": sorted(include_targets),
        "features": sorted(features),
        "file_count": sum(1 for p in root.rglob("*") if p.is_file()),
    }


def build_hints(root: Path) -> dict:
    """Extract build entry points from project metadata without running it."""
    hints: set[str] = set()
    commands: list[str] = []
    generated: set[str] = set()
    for name in ("Makefile", "makefile", "README", "README.md", "latexmkrc", ".latexmkrc"):
        path = root / name
        if not path.is_file():
            continue
        text = read_text(path)
        for match in re.finditer(r"[A-Za-z0-9_./-]+\.tex\b", text):
            hints.add(match.group(0).replace("./", ""))
        for match in re.finditer(r"^[ \t]*([A-Za-z0-9_./-]+)\.pdf\s*:", text, re.M):
            generated.add(match.group(1) + ".tex")
        for match in re.finditer(
            r"\b(?:latexmk|pdflatex|xelatex|lualatex|latex)\b[^\n]*?"
            r"(?:-{1,2}[A-Za-z0-9=._-]+\s+)*([A-Za-z0-9_./-]+)\b",
            text,
        ):
            token = match.group(1)
            if token.endswith(".tex"):
                hints.add(token)
            elif token not in {"pdf", "dvi", "ps", "aux"}:
                hints.add(token + ".tex")
        if "latexmk" in text or "pdflatex" in text:
            commands.append(name)
    return {"tex_mentions": sorted(hints), "generated_targets": sorted(generated), "build_files": commands}


def resolve_include(root: Path, target: str, from_file: Path) -> Path | None:
    candidates = [from_file.parent / target, root / target]
    for base in candidates:
        for suffix in ("", ".tex"):
            path = base.with_suffix(".tex") if base.suffix == "" and suffix else base
            if suffix and not path.suffix:
                path = Path(str(path) + ".tex")
            if path.is_file():
                return path.resolve()
    return None


def score_main(path: Path, root: Path, text: str, hints: set[str] | None = None) -> int:
    score = 0
    name = path.name.lower()
    rel = path.relative_to(root).as_posix()
    hints = hints or set()
    if "\\documentclass" in text:
        score += 50
    if "\\begin{document}" in text:
        score += 50
    if name in {"main.tex", "paper.tex", "ms.tex", "article.tex", "root.tex"}:
        score += 30
    if name.startswith(("main", "paper", "ms", "thesis", "book", "article")):
        score += 10
    if path.parent == root:
        score += 30
    if rel in hints or path.name in {Path(h).name for h in hints}:
        score += 80
    depth = len(path.relative_to(root).parts)
    score -= depth * 2
    if any(part in {"sample", "samples", "example", "examples", "test", "tests", "template"} for part in path.parts):
        score -= 20
    if "\\input" in text or "\\include" in text:
        score += 15
    if len(text) > 5000:
        score += 5
    return score


def detect_main(root: Path) -> dict:
    """Return the best main-file candidate with evidence, never assuming main.tex."""
    tex_files = sorted(p for p in root.rglob("*.tex") if p.is_file())
    hints_info = build_hints(root)
    hints = {h for h in hints_info["tex_mentions"] if (root / h).is_file()}
    if not tex_files:
        return {"main_file": None, "engine": None, "evidence": ["no .tex files"], **hints_info}
    scored = []
    for path in tex_files:
        text = read_text(path)
        if "\\documentclass" not in text and "\\begin{document}" not in text:
            continue
        scored.append((score_main(path, root, text, hints), path, text))
    if not scored:
        generated = [g for g in hints_info["generated_targets"]]
        return {
            "main_file": None,
            "generated_main": generated[0] if generated else None,
            "engine": "pdflatex",
            "evidence": ["no \\documentclass or \\begin{document} in the repository"],
            **hints_info,
        }
    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best_path, best_text = scored[0]
    evidence = [f"score {best_score} for {best_path.relative_to(root).as_posix()}"]
    cls = re.search(r"\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}", best_text)
    document_class = cls.group(1).strip() if cls else ""
    if document_class:
        evidence.append(f"documentclass {document_class}")

    engine = DOC_CLASS_ENGINE.get(document_class, "pdflatex")
    preamble = best_text.split("\\begin{document}", 1)[0]
    if re.search(r"\\usepackage(\[[^\]]*\])?\{fontspec\}|\\usepackage(\[[^\]]*\])?\{unicode-math\}",
                 preamble) or document_class in {"ctexart", "ctexbook"}:
        engine = "xelatex"
    if re.search(r"\\directlua|\\usepackage(\[[^\]]*\])?\{luacode\}", preamble):
        engine = "lualatex"
    evidence.append(f"engine inferred from preamble: {engine}")

    # README / Makefile / latexmkrc may name a different engine.
    for candidate in ("README", "README.md", "Makefile", "makefile", "latexmkrc", ".latexmkrc"):
        path = root / candidate
        if path.is_file():
            text = read_text(path)
            if re.search(r"\bxelatex\b", text):
                engine = "xelatex"
                evidence.append(f"{candidate} specifies xelatex")
            elif re.search(r"\blualatex\b", text):
                engine = "lualatex"
                evidence.append(f"{candidate} specifies lualatex")
            elif re.search(r"\bpdflatex\b", text):
                evidence.append(f"{candidate} specifies pdflatex")
    return {
        "main_file": best_path.relative_to(root).as_posix(),
        "engine": engine,
        "document_class": document_class,
        "evidence": evidence,
        "tex_file_count": len(tex_files),
        **hints_info,
    }
