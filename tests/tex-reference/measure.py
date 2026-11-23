"""Measure horizontal, single-column article PDFs. No fixture expectations enter extraction."""
import difflib
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

import fontTools
from fontTools.ttLib import TTFont
import pymupdf
from generate import HERE, OLD, cases, invoke, save, sha

NAMES = {"en": "lualatex-reference.json", "zh": "luatexja-reference.json"}
UNITS = {"origin": "top-left, unrotated PDF page", "bbox": "Poppler word-box union, bp",
         "baseline": "PDF text origin y (MuPDF), bp", "cssPxPerBp": 96/72,
         "cssPxPerTexPt": 96/72.27, "spPerTexPt": 65536}


def text_key(text, lang):
    text = unicodedata.normalize("NFKC", text)
    return "".join(text.split()) if lang == "zh" else " ".join(text.split())


def versions(out):
    directory = out / "provenance"
    directory.mkdir(exist_ok=True)
    result = {"tools": {}, "packages": {}, "fonts": {}, "locale": os.environ["LC_ALL"],
              "pymupdf": pymupdf.VersionBind, "mupdf": pymupdf.VersionFitz, "fonttools": fontTools.version}
    for tool in ("xelatex", "lualatex", "latexmk", "bibtex", "biber", "pdfinfo", "pdftotext", "pdffonts"):
        invoke(directory, tool, [tool, "-v" if tool.startswith("pdf") else "--version"])
        lines = "".join((directory / (tool + ext)).read_text() for ext in (".stdout", ".stderr")).splitlines()
        result["tools"][tool] = next(line.strip() for line in lines if line.strip())
    for name in ("ctex.sty", "xeCJK.sty", "luatexja.sty", "luatexja-fontspec.sty", "jfm-quanjiao.lua",
                 "fontspec.sty", "biblatex.sty", "lmroman10-regular.otf", "FandolSong-Regular.otf"):
        path = Path(invoke(directory, name, ["kpsewhich", name]).strip())
        entry = {"file":name, "sha256":sha(path)}
        if path.suffix == ".otf":
            with TTFont(path) as font:
                entry["version"] = font["name"].getDebugName(5)
                entry["postscript"] = font["name"].getDebugName(6)
            result["fonts"][name] = entry
        else:
            data = path.read_text(errors="replace")
            # Keep upstream declarations, including dates whose macros are expanded by LaTeX.
            entry["declarations"] = [line.strip() for line in data.splitlines() if re.search(
                r"GetIdInfo\$Id:|^\s*\{\\ExplFileDate\}\{|^\\def\\LuaTeXjaversion|"
                r"^\\ProvidesPackage\{luatexja-fontspec|^\s*\{\d{4}/\d{2}/\d{2}\}\{|^\\def\\abx@(date|version)\{", line)][:5]
            result["packages"][name] = entry
    for engine in ("xelatex", "lualatex"):
        fls = (out / "en-control" / engine / "main.fls").read_text()
        path = Path(next(line[6:] for line in fls.splitlines() if line.startswith("INPUT ") and line.endswith(".fmt")))
        save(directory / (engine + "-format.json"), {"path":str(path), "sha256":sha(path)})
    return result


def physical_lines(cwd):
    pages = ET.parse(cwd / "bbox.xml").findall(".//{*}page")
    with pymupdf.open(cwd / "main.pdf") as pdf:
        if len(pdf) != 1 or len(pages) != 1 or pdf[0].rotation:
            raise ValueError(f"Unexpected page count or rotation: {cwd}")
        page = pdf[0]
        spans = [s for block in page.get_text("dict")["blocks"] for line in block.get("lines", [])
                 for s in line["spans"] if s["text"].strip()]
        groups = []
        for span in sorted(spans, key=lambda s: s["origin"][1]):
            y = span["origin"][1]
            # Same physical line can have separate runs for Latin and CJK.
            if not groups or y - groups[-1]["y"] > 2:
                groups.append({"y": y, "spans": [], "words": []})
            groups[-1]["spans"].append(span)
        for word in pages[0].findall(".//{*}word"):
            box = [float(word.get(k)) for k in ("xMin", "yMin", "xMax", "yMax")]
            center = (box[1]+box[3])/2
            def distance(g):
                return min(abs(center - (s["bbox"][1]+s["bbox"][3])/2) for s in g["spans"])
            group = min(groups, key=distance)
            if distance(group) > 5:
                raise ValueError(f"Unmatched PDF word at {box}: {cwd}")
            group["words"].append(("".join(word.itertext()), box))
        lines = []
        for group in groups:
            words = sorted(group["words"], key=lambda w:w[1][0])
            if not words:
                raise ValueError(f"PDF origin missing Poppler words: {cwd}")
            boxes = [w[1] for w in words]
            box = [f(v[index] for v in boxes) for index,f in enumerate((min,min,max,max))]
            origins = sorted({round(s["origin"][1], 5) for s in group["spans"]})
            lines.append({"text":" ".join(w[0] for w in words), "bbox":box, "widthBp":round(box[2]-box[0],6),
                          "baselineBp":origins[0], "runBaselinesBp":origins})
        return lines, [page.rect.width, page.rect.height]


def measure(cwd, lang, item, control, fonts):
    original = cwd.name == "historical-replay"
    log = (cwd / "main.log").read_text(errors="replace")
    lines, size = physical_lines(cwd)
    if original and lang == "zh":
        if lines[-1]["text"] != "1" or lines[-1]["baselineBp"] - lines[-2]["baselineBp"] < 50:
            raise ValueError("Expected isolated article page number: " + str(cwd))
        lines.pop()
    body = item["source"].split(r"\begin{document}")[1].split(r"\end{document}")[0]
    expected = ("Hamburg" if lang == "en" else "中文排版") if control else body
    def letters(text):
        return "".join(unicodedata.normalize("NFKC", text).split()).replace("-", "")
    if letters("".join(line["text"] for line in lines)) != letters(expected):
        raise ValueError("PDF text failed corpus coverage: " + str(cwd))
    result = {"sourceSha256":sha(cwd/"main.tex"), "pageSizeBp":size, "lines":lines}
    if original:
        return result
    if "Missing character:" in log or "LaTeX Font Warning: Font shape" in log:
        raise ValueError(f"Glyph or font shape unavailable: {cwd}")
    embedded = (cwd / "fonts.stdout").read_text().splitlines()[2:]
    used = []
    unicode_maps = {}
    if cwd.name == "xelatex":
        invoke(cwd, "xdv-fonts", ["xdvipdfmx", "-vv", "-o", os.devnull, "main.xdv"])
        transcript = (cwd / "xdv-fonts.stderr").read_text()
    else:
        transcript = log.replace("\n", "")
    for row in embedded:
        embedding = re.search(r"\byes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$", row)
        if not embedding:
            raise ValueError(f"Expected embedded font: {row}")
        font = next((f for f in fonts.values() if f["postscript"] in row.split()[0]), None)
        if not font:
            raise ValueError("Unexpected PDF font: " + row)
        # TeX's actual emitted font path (Xe XDV driver / Lua PDF backend), not just a kpsewhich match.
        path = re.search(r'[/][^<>"\n]*?/' + re.escape(font["file"]) + r'(?=[@">/])', transcript)
        if not path or not Path(path[0]).is_file() or sha(Path(path[0])) != font["sha256"]:
            raise ValueError(f"Cannot verify physical font path: {cwd}, {font}")
        used.append(font["file"])
        unicode_maps[font["file"]] = embedding[2] == "yes"
    if not used:
        raise ValueError(f"No embedded fonts: {cwd}")
    params = re.search(r"LINEAE-PARAGRAPH: (\d+),(\d+),(\d+),(\d+),(\d+)", log)
    result["paragraph"] = dict(zip(("hsizeSp","parindentSp","language","leftHyphenMin","rightHyphenMin"),
                                   map(int,params.groups())))
    result["hasToUnicodeMap"] = unicode_maps
    result["embeddedFontFiles"] = sorted(set(used))
    if cwd.name == "lualatex":
        boxes = [[int(v) for v in line.split()] for line in (cwd / "line-boxes.tsv").read_text().splitlines()]
        if len(boxes) != len(lines):
            raise ValueError(f"PDF/TeX line count mismatch {len(lines)}/{len(boxes)}: {cwd}")
        for line, (width,height,depth) in zip(lines, boxes):
            line["lineBoxSp"] = {"width":width,"height":height,"depth":depth}
    if control:
        result["controlAdvanceSp"] = int(re.search(r"LINEAE-ADVANCE-SP=(\d+)", log)[1])
        if len(lines) != 1:
            raise ValueError("Control wrapped")
    return result


def compare(first, second, lang):
    a, b = [[text_key(line["text"],lang) for line in rows] for rows in (first,second)]
    matcher = difflib.SequenceMatcher(None, a,b,autojunk=False)
    deltas = []
    for i,j,n in matcher.get_matching_blocks():
        for offset in range(n):
            x,y = first[i+offset],second[j+offset]
            delta = [round(v-u,6) for u,v in zip(x["bbox"],y["bbox"])]
            row = {"fromLine":i+offset+1,"toLine":j+offset+1,"bboxDeltaBp":delta,
                   "widthDeltaBp":round(delta[2]-delta[0],6)}
            if "baselineBp" in x:
                row["baselineDeltaBp"] = round(y["baselineBp"]-x["baselineBp"],6)
            deltas.append(row)
    changes = [{"from":a[i:k],"to":b[j:l]} for op,i,k,j,l in matcher.get_opcodes() if op != "equal"]
    return {"lineCounts":[len(a),len(b)], "changedText":changes, "matchedLineDeltas":deltas}


def summarize(out):
    provenance = versions(out)
    save(out / "provenance.json", provenance)
    data = {lang:[] for lang in NAMES}
    xe, report = [], {}
    for lang,key,item,control in cases():
        x,l = [measure(out/key/e,lang,item,control,provenance["fonts"]) for e in ("xelatex","lualatex")]
        if x["sourceSha256"] != l["sourceSha256"] or x["embeddedFontFiles"] != l["embeddedFontFiles"] or x["paragraph"] != l["paragraph"]:
            raise ValueError("Unmatched source or fonts: "+key)
        data[lang].append({"id":key, **l})
        xe.append({"id":key, **x})
        diff = {"currentXeToLua":compare(x["lines"],l["lines"],lang)}
        if not control:
            replay = measure(out/key/"historical-replay",lang,item,False,provenance["fonts"])
            diff["historical2023ToReplay"] = compare(item["lines"],replay["lines"],lang)
            diff["replayToMatchedXe"] = compare(replay["lines"],x["lines"],lang)
        else:
            diff["controlAdvanceDeltaSp"] = l["controlAdvanceSp"]-x["controlAdvanceSp"]
        report[key] = diff
    for name, engine, rows in [(NAMES[lang], "lualatex",data[lang]) for lang in NAMES] + [
            ("current-xelatex.json","xelatex",xe)]:
        save(out/name, {"schema":1,"engine":engine,"units":UNITS,"provenance":provenance,"cases":rows})
    save(out/"engine-differences.json",report)


if __name__ == "__main__":
    summarize(Path(sys.argv[1]).resolve())
