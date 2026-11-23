"""Exercise actual direct TeX, ctex, bad input and a runaway latexmk subprocess."""
from pathlib import Path
import json
import subprocess
import sys
from generate import RUNNER, invoke, save

GOOD = r"""\documentclass[fontset=fandol]{ctexart}
\listfiles
\setmainfont{lmroman10-regular.otf}
\pagestyle{empty}
\begin{document}
中文 Lineae
\end{document}
"""


def main(out):
    out.mkdir(parents=True, exist_ok=False)
    for engine in ("xelatex","lualatex"):
        for case,driver,source,timeout in [
            ("valid","direct",GOOD,120000),
            ("invalid","direct",r"\documentclass{article}\begin{document}\LineaeUndefined\end{document}",30000),
            ("missing-bib","latexmk",r"\documentclass{article}\begin{document}\cite{absent}\bibliographystyle{plain}\bibliography{missing}\end{document}",60000),
            ("timeout","latexmk",r"\documentclass{article}\begin{document}\loop\iftrue\repeat\end{document}",1800),
        ]:
            cwd = out / engine / case
            cwd.mkdir(parents=True)
            (cwd/"main.tex").write_text(source,encoding="utf8")
            args = ["node",str(RUNNER),str(cwd),engine,driver,str(timeout)]
            result = subprocess.run(args,capture_output=True,timeout=timeout/1000+15)
            save(cwd/"command.json",{"argv":args,"exit":result.returncode})
            (cwd/"runner.stdout").write_bytes(result.stdout)
            (cwd/"runner.stderr").write_bytes(result.stderr)
            record = json.loads((cwd/"compile.log").read_text().splitlines()[0])
            if case == "valid":
                assert result.returncode == 0 and (cwd/"main.synctex.gz").exists(), cwd
                invoke(cwd,"page",["pdfinfo","main.pdf"])
                invoke(cwd,"text",["pdftotext","main.pdf","main.txt"])
                assert "中文Lineae" in "".join((cwd/"main.txt").read_text().split()), cwd
            elif case == "invalid":
                assert result.returncode == record["status"] and result.returncode not in (0,124,127), cwd
                assert "Undefined control sequence" in (cwd/"main.log").read_text(), cwd
            elif case == "missing-bib":
                assert result.returncode == record["status"] and result.returncode not in (0,124,127), cwd
                assert "missing.bib" in (cwd/"main.blg").read_text(), cwd
            else:
                assert result.returncode == 124 and record["timedOut"], cwd
            print(engine,case,"observed exit",result.returncode,flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
