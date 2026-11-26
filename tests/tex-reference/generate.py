"""Generate test references from PDFs. Usage: python3 tests/tex-reference/generate.py NEW_DIR"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OLD = ROOT / "tests/fixtures/paragraph-layout"
RUNNER = ROOT / "tests/bib/compile/lib/tex-runner.mjs"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def invoke(cwd, label, args):
    args = list(map(str, args))
    with (cwd / (label + ".stdout")).open("wb") as out, (cwd / (label + ".stderr")).open("wb") as err:
        try:
            rc = subprocess.run(args, cwd=cwd, stdout=out, stderr=err, timeout=320).returncode
        except FileNotFoundError:
            rc = 127
        except subprocess.TimeoutExpired:
            rc = 124
    save(cwd / (label + ".command.json"), {"argv": args, "cwd": str(cwd), "exit": rc})
    if rc:
        raise RuntimeError(f"{cwd}: {label} exit {rc}; see {label}.stderr and compile.log")
    return (cwd / (label + ".stdout")).read_text(errors="replace")


def cases():
    for lang, filename in [("en", "xelatex-reference"), ("zh", "xecjk-reference")]:
        fixture = json.loads((OLD / (filename + ".json")).read_text())
        for i, item in enumerate(fixture["cases"]):
            yield lang, f"{lang}-{item.get('name','article')}-{item['margin']}", item, False
            if i == 0:
                yield lang, lang + "-control", item, True


def source_for(lang, original, control):
    # Construct a test document. Both compilers receive precisely the same bytes.
    source = original.replace(r"\setmainfont{Latin Modern Roman}", r"\setmainfont{lmroman10-regular.otf}")
    source = source.replace(r"\usepackage{fontspec,xeCJK}", r"\usepackage{fontspec}")
    source = source.replace(r"\setCJKmainfont{FandolSong-Regular.otf}", r"""\ifXeTeX
\usepackage{xeCJK}
\setCJKmainfont[Scale=1]{FandolSong-Regular.otf}
\else
\usepackage{luatexja-fontspec}
\setmainjfont[Scale=1,JFM=quanjiao]{FandolSong-Regular.otf}
\fi""")
    source = source.replace(r"\usepackage{fontspec}", "\\usepackage{iftex,fontspec}\n\\listfiles")
    before, body = source.split(r"\begin{document}")
    if control:
        word = "Hamburg" if lang == "en" else "中文排版"
        body = "\n\\setbox0=\\hbox{" + word + "}\n\\typeout{LINEAE-ADVANCE-SP=\\number\\wd0}\n\\noindent\\box0\\par\n\\end{document}\n"
    return before + r"""\pagestyle{empty}
\begin{document}
\parindent=15pt
\lefthyphenmin=2 \righthyphenmin=3
\typeout{LINEAE-PARAGRAPH: \number\hsize,\number\parindent,\the\language,\the\lefthyphenmin,\the\righthyphenmin}
\ifLuaTeX\directlua{dofile("nodes.lua")}\fi""" + body


def build(job):
    cwd, engine, source, paired = job
    cwd.mkdir(parents=True)
    tex = cwd / "main.tex"
    tex.write_bytes(source.encode())
    original = sha(tex)
    if paired:
        shutil.copyfile(HERE / "nodes.lua", cwd / "nodes.lua")
    invoke(cwd, "runner", ["node", RUNNER, cwd, engine, "latexmk"])
    if sha(tex) != original:
        raise ValueError(f"Source changed: {tex}")
    invoke(cwd, "pdfinfo", ["pdfinfo", "-box", "main.pdf"])
    invoke(cwd, "fonts", ["pdffonts", "main.pdf"])
    invoke(cwd, "bbox", ["pdftotext", "-bbox-layout", "-enc", "UTF-8", "main.pdf", "bbox.xml"])
    print(cwd.name, cwd.parent.name, "PDF", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    os.environ.update(LC_ALL="C.UTF-8", TZ="UTC", SOURCE_DATE_EPOCH="946684800", FORCE_SOURCE_DATE="1")
    controls = []
    jobs = []
    for lang, key, item, control in cases():
        source = source_for(lang, item["source"], control)
        for engine in ("xelatex", "lualatex"):
            batch = controls if control else jobs
            batch.append((out / key / engine, engine, source, True))
        if not control:
            jobs.append((out / key / "historical-replay", "xelatex", item["source"], False))
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(build, controls))
        list(pool.map(build, jobs))
    from measure import summarize
    summarize(out)


if __name__ == "__main__":
    main()
