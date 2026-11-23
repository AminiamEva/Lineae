"""Compile isolated article and frozen paragraph samples, then extract PDF evidence."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
TEX_FLAGS = ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error"]
ARTICLE = r"""\documentclass{article}
\listfiles
\usepackage{fontspec,geometry}
\setmainfont{lmroman10-regular.otf}
\pagestyle{empty}
\begin{document}
Lineae TeX baseline. Typography allows reusable measurements.
\end{document}
"""
CJK = {
    "xelatex": r"\usepackage{xeCJK}" + "\n" + r"\setCJKmainfont{FandolSong-Regular.otf}",
    "lualatex": r"\usepackage{luatexja-fontspec}" + "\n" + r"\setmainjfont{FandolSong-Regular.otf}",
}


def run(directory, log_name, argv):
    try:
        process = subprocess.run(argv, cwd=directory, capture_output=True, timeout=120, check=False)
        code, output = process.returncode, process.stdout + process.stderr
    except FileNotFoundError as error:
        code, output = 127, str(error).encode()
    except subprocess.TimeoutExpired as error:
        code, output = 124, (error.stdout or b"") + (error.stderr or b"")
    log = directory / log_name
    log.write_bytes(
        (json.dumps({"command": argv, "cwd": str(directory)}, ensure_ascii=False) + "\n").encode()
        + output + f"\nexit={code}\n".encode()
    )
    return {"command": argv, "exit": code, "log": str(log)}


def read_pdf_lines(xml_file):
    namespace = {"pdf": "http://www.w3.org/1999/xhtml"}
    root = ET.parse(xml_file)
    lines = []
    for page_number, page in enumerate(root.findall(".//pdf:page", namespace), 1):
        for line in page.findall(".//pdf:line", namespace):
            words = ["".join(word.itertext()) for word in line.findall("pdf:word", namespace)]
            if words:
                bbox = [float(line.attrib[key]) for key in ("xMin", "yMin", "xMax", "yMax")]
                lines.append({"page": page_number, "text": " ".join(words), "bbox": bbox})
    return lines


def compare_frozen(lines, expected, chinese):
    # Golden files contain body paragraphs only. Poppler may emit the centered
    # article footer as a line, and may split one physical line into fragments.
    last_reference_y = expected[-1]["bbox"][1]
    bounds = [line for line in lines if line["page"] == 1 and not (
        line["text"].strip() == "1" and line["bbox"][1] > last_reference_y + 100
    )]
    physical = []
    for line in sorted(bounds, key=lambda entry: (round(entry["bbox"][1], 1), entry["bbox"][0])):
        if physical and abs(line["bbox"][1] - physical[-1]["bbox"][1]) < .25:
            previous = physical[-1]
            previous["text"] += " " + line["text"]
            previous["bbox"] = [
                min(previous["bbox"][0], line["bbox"][0]), min(previous["bbox"][1], line["bbox"][1]),
                max(previous["bbox"][2], line["bbox"][2]), max(previous["bbox"][3], line["bbox"][3]),
            ]
        else:
            physical.append(dict(line))
    lines = physical

    def normalize(text):
        if chinese:
            return re.sub(r"\s+", "", unicodedata.normalize("NFC", text))
        return " ".join(unicodedata.normalize("NFKC", text).split())

    def width(line):
        return line["bbox"][2] - line["bbox"][0]

    text_equal = [normalize(line["text"]) for line in lines] == [
        normalize(line["text"]) for line in expected
    ]
    width_errors = [abs(width(actual) - width(golden)) for actual, golden in zip(lines, expected)]
    baseline_errors = [
        abs((actual["bbox"][1] - lines[0]["bbox"][1]) - (golden["bbox"][1] - expected[0]["bbox"][1]))
        for actual, golden in zip(lines, expected)
    ]
    width_error = max(width_errors, default=None)
    baseline_error = max(baseline_errors, default=None)
    return {
        "textEqual": text_equal,
        "expectedLineCount": len(expected),
        "actualLineCount": len(lines),
        "maxWidthErrorBp": width_error,
        "maxRelativeYErrorBp": baseline_error,
        "status": "PASS" if text_equal and width_error is not None
        and width_error < .75 and baseline_error < .375 else "FAIL",
    }


def probe(output, identifier, engine, source, expected_text=(), golden=None, chinese=False):
    directory = output / identifier
    directory.mkdir()
    tex = directory / "main.tex"
    data = source.encode("utf-8")
    tex.write_bytes(data)
    commands = [run(directory, "compile.log", [engine, *TEX_FLAGS, "main.tex"])]
    lines = []
    if commands[0]["exit"] == 0:
        commands.extend([
            run(directory, "bbox.log", ["pdftotext", "-bbox-layout", "main.pdf", "main.bbox.html"]),
            run(directory, "fonts.log", ["pdffonts", "main.pdf"]),
            run(directory, "page-info.log", ["pdfinfo", "main.pdf"]),
        ])
        if commands[1]["exit"] == 0:
            lines = read_pdf_lines(directory / "main.bbox.html")
    actual_text = re.sub(r"\s+", "", "".join(line["text"] for line in lines))
    unchanged = hashlib.sha256(data).digest() == hashlib.sha256(tex.read_bytes()).digest()
    exits = [command["exit"] for command in commands]
    compile_log = (directory / "compile.log").read_text(errors="replace")
    missing = 127 in exits or bool(re.search(r"File .* not found|can't find the format file", compile_log, re.I))
    status = "BLOCKED" if missing else "PASS" if exits == [0, 0, 0, 0] and lines and unchanged and all(
        text in actual_text for text in expected_text
    ) else "FAIL"
    result = {
        "id": identifier, "engine": engine, "status": status, "sourceUnchanged": unchanged,
        "sourceSha256": hashlib.sha256(data).hexdigest(), "commands": commands, "lines": lines,
    }
    if golden is not None:
        result["frozenComparison"] = (
            compare_frozen(lines, golden, chinese) if status == "PASS" else {"status": "UNVERIFIED"}
        )
    return result


def english_reference_environment(output):
    directory = output / "xelatex-format"
    directory.mkdir()
    (directory / "check.tex").write_text(
        r"\documentclass{article}\begin{document}"
        r"\typeout{LINEAE-HYPHEN=\the\language,\the\lefthyphenmin,\the\righthyphenmin}"
        r"\showhyphens{interdependent}\end{document}", encoding="ascii"
    )
    commands = [run(directory, name + ".log", ["kpsewhich", "--engine=xetex", name])
                for name in ("language.dat", "hyphen.tex", "xelatex.fmt")]
    compile_command = run(directory, "compile.log", ["xelatex", *TEX_FLAGS, "check.tex"])
    commands.append(compile_command)
    log = Path(compile_command["log"]).read_text(errors="replace")
    match = re.search(r"^LINEAE-HYPHEN=(\d+),(\d+),(\d+)\s*$", log, re.M)
    parameters = list(map(int, match.groups())) if match else None
    valid = all(command["exit"] == 0 for command in commands) and parameters == [0, 2, 3]
    return {"id": "xelatex-format", "status": "PASS" if valid else "BLOCKED",
            "englishLanguageAndMinima": parameters, "commands": commands,
            "diagnostic": "" if valid else "Restore the matching TeX Live English language configuration and rebuild the xelatex format."}


def main():
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    revision = subprocess.check_output(["git", "-C", ROOT, "rev-parse", "HEAD"], text=True).strip()
    reference_environment = english_reference_environment(output)
    results = [reference_environment]
    for engine, package in CJK.items():
        results.append(probe(output, f"{engine}-article", engine, ARTICLE, ("LineaeTeXbaseline.",)))
        chinese = ARTICLE.replace(r"\pagestyle", package + "\n" + r"\pagestyle").replace(
            "Typography allows reusable measurements.", "中文排版測試。"
        )
        results.append(probe(output, f"{engine}-cjk", engine, chinese, ("LineaeTeXbaseline.", "中文排版測試")))
    fixtures = ROOT / "tests/fixtures/paragraph-layout"
    for name in ("xelatex-reference", "xecjk-reference"):
        reference = json.loads((fixtures / f"{name}.json").read_text(encoding="utf-8"))
        for index, case in enumerate(reference["cases"], 1):
            if reference_environment["status"] != "PASS":
                results.append({"id": f"{name}-{index:02d}", "engine": "xelatex", "status": "BLOCKED",
                                "diagnostic": reference_environment["diagnostic"],
                                "frozenComparison": {"status": "UNVERIFIED"}})
                continue
            results.append(probe(output, f"{name}-{index:02d}", "xelatex", case["source"],
                                 golden=case["lines"], chinese=name == "xecjk-reference"))
    versions = [
        run(output, f"{executable}-version.log", [executable, flag])
        for executable, flag in (("xelatex", "--version"), ("lualatex", "--version"),
                                 ("pdftotext", "-v"), ("pdffonts", "-v"), ("bibtex", "--version"))
    ]
    output.joinpath("results.json").write_text(
        json.dumps({"commit": revision, "environment": {
            key: os.environ.get(key) for key in ("TEXMF", "TEXMFVAR", "TEXMFCACHE", "TEXMFCONFIG")
        }, "versions": versions, "cases": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for case in results:
        print(case["id"], case["status"], case.get("frozenComparison", {}).get("status", ""))
    outcomes = [case["status"] for case in results] + [
        case["frozenComparison"]["status"] for case in results if "frozenComparison" in case
    ]
    return 1 if "FAIL" in outcomes else 2 if "BLOCKED" in outcomes else 0


if __name__ == "__main__":
    sys.exit(main())
