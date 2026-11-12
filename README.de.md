[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**Natürlich schreiben. Schön setzen.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae ist ein experimenteller **WYSIWYG-LaTeX-Editor** im Browser für wissenschaftliches und technisches Schreiben. Es geht nicht nur darum, LaTeX-Dokumente über eine grafische Oberfläche bearbeitbar zu machen: **Was im Editor zu sehen ist, soll dem Ergebnis möglichst nahekommen, das dieselbe Datei beim Kompilieren mit einer TeX-Engine liefert.** LaTeX bleibt das native Format, und im Mittelpunkt der täglichen Arbeit stehen gewöhnliche <code>.tex</code>-Dateien.

Das Projekt steckt noch in einer frühen Phase. Der Browser-Prototyp erlaubt bereits die direkte Bearbeitung von Inhalten und deckt einen wachsenden Teil von LaTeX ab. Zeilenumbrüche, Seitenaufteilung und das endgültige PDF-Layout von TeX gibt er aber noch nicht exakt wieder. Dass Bearbeitungsansicht und kompiliertes Ergebnis übereinstimmen, ist das Ziel, **keine bereits fertige Funktion**.

## Warum Lineae

Ein Dokument direkt bearbeiten zu können ist noch kein WYSIWYG-Satz. Ein visueller Editor mag Formeln, Tabellen und Überschriften bearbeitbar machen, zeigt dabei aber ein Layout, das deutlich von dem abweicht, was TeX am Ende erzeugt. Lineae will diese Lücke schließen: Die Bearbeitungsfläche soll eine verlässliche Ansicht des gesetzten Dokuments sein, nicht nur eine bequeme Darstellung seiner Struktur.

Bestehende wissenschaftliche Editoren treffen unterschiedliche Entscheidungen. [LyX](https://www.lyx.org/) folgt dem WYSIWYM-Ansatz (*What You See Is What You Mean*, „Was du siehst, ist was du meinst“) und stellt die Dokumentstruktur über die exakte Nachbildung des endgültigen Layouts. [GNU TeXmacs](https://www.texmacs.org/) bietet wissenschaftliche WYSIWYG-Bearbeitung mit einem eigenen Satzsystem und einem nativen Dokumentformat, statt LaTeX als zugrunde liegendes Satzsystem zu verwenden. Lineae strebt eine andere Kombination an: **native LaTeX-Dateien, direkte Bearbeitung und eine Darstellung, die an echten TeX-Kompilierungen ausgerichtet wird.**

Deshalb zählt typografische Genauigkeit ebenso viel wie die Bedienelemente: Schriften, Abstände, mathematische Notation, Zeilenumbruch, Seitengeometrie und später auch die Seitenaufteilung sollten mit dem kompilierten Ergebnis übereinstimmen, soweit das möglich ist. Perfekte Übereinstimmung mit beliebigen Paketen und eigenen Makros ist kein realistisches Versprechen für die nähere Zukunft; Abweichungen und nicht unterstützte Konstrukte sollen sichtbar und prüfbar bleiben, statt verdeckt zu werden.

Das Projekt folgt vier Grundsätzen:

- **Echtes WYSIWYG anstreben.** Die Qualität der Bearbeitungsansicht bemisst sich daran, wie gut sie mit der Ausgabe von TeX übereinstimmt, nicht daran, ob sich ein Konstrukt mit der Maus bearbeiten lässt.
- **LaTeX als Dokumentformat beibehalten.** Gearbeitet wird mit gewöhnlichen <code>.tex</code>-Dateien; nicht unterstützte Inhalte bleiben erhalten, statt durch eine proprietäre Darstellung ersetzt oder in ihrer Bedeutung still verändert zu werden.
- **Darstellung und Kompilierung trennen, die Ergebnisse aber verbinden.** Die interaktive Darstellung soll flüssig bleiben, während eine echte TeX-Engine die Referenz für die endgültige Ausgabe liefert und künftig dazu dient, die visuelle Genauigkeit zu messen und zu verbessern. Lineae plant nicht, TeX im Browser neu zu implementieren.
- **Grenzen offenlegen.** Lieber den Quelltext zuverlässig bewahren und klar zum Ausgangszustand zurückkehren als ungenaue Vorschauen oder verlustbehaftete Konvertierungen anzubieten.

## Funktionen

Der aktuelle Prototyp deckt die alltäglichen Strukturen ab, die man zum Beginn eines technischen Dokuments braucht. Der Umfang ist bewusst auf Syntax beschränkt, die der Editor erkennt und verarbeiten kann.

### Schreiben und Dokumentstruktur

Der Editor basiert auf Tiptap und ProseMirror. Er unterstützt Absätze, Abschnittsüberschriften und gängige Textformatierung: fett, kursiv, unterstrichen, durchgestrichen, Schriftart, Schriftgrad, Farbe, hoch- und tiefgestellt. Auch nummerierte Listen, Aufzählungen, Beschreibungslisten, Blockzitate, waagerechte Linien und Codeblöcke sind verfügbar.

Tabellen lassen sich direkt im Dokument bearbeiten, mit Unterstützung für grundlegende <code>tabular</code>-Strukturen, ausgewählte Spaltenspezifikationen, verbundene Spalten und Linien im <code>booktabs</code>-Stil. Der Editor erkennt außerdem ausgewählte Theorem-Umgebungen: Satz, Lemma, Proposition, Korollar, Definition, Bemerkung und Beweis.

Abschnittsnummerierung, Titel mit Stern, Kurztitel, Labels, Querverweise und Inhaltsverzeichnis werden unterstützt. Fußnoten sowie Titel- und Autorenfelder auf Dokumentebene sind ebenfalls verfügbar. Suchen und Ersetzen, Kontextmenüs, Tastenkürzel, Rückgängig und Wiederholen begleiten die tägliche Arbeit.

Die Ansicht ist derzeit fortlaufend. Zeilenumbrüche, Abstände und Seitenaufteilung sind noch nicht garantiert mit der Ausgabe von TeX identisch; diese Lücke zu schließen ist ein zentrales Entwicklungsziel.

### Mathematisches Bearbeiten

MathLive stellt bearbeitbare Formeln im Fließtext und abgesetzt bereit. Gleichungen werden an Ort und Stelle bearbeitet, nicht in einem separaten Quelltextfenster. Die aktuelle Umsetzung umfasst gängige mathematische Eingaben, das Einfügen von Matrizen und Operationen auf Zeilen und Spalten, ausgewählte AMS-Umgebungen, Befehlsvervollständigung und Tastaturnavigation zwischen Formeln und umgebendem Text.

Das ist eine Bearbeitungsoberfläche, keine TeX-Mathematik-Engine. Die Menge der Befehle und Umgebungen, die importiert, dargestellt und exportiert werden können, ist begrenzt und wird weiter getestet.

### LaTeX-Import und -Export

Lineae öffnet UTF-8-kodierte <code>.tex</code>-Dateien und wechselt zwischen visueller Bearbeitung und Quellmodus. Erkannte Befehle und Umgebungen werden in strukturierte Editor-Knoten umgewandelt. Konstrukte außerhalb des unterstützten Umfangs bleiben nach Möglichkeit als undurchsichtige Quellblöcke erhalten, sodass sie im Quellmodus verfügbar sind und nicht für gewöhnlichen Text gehalten werden.

Ein importiertes Dokument, das nicht verändert wurde, lässt sich mit unverändertem Quelltext exportieren. Sobald jedoch ein unterstützter Abschnitt visuell bearbeitet wird, kann dieser Abschnitt erneut serialisiert werden; Leerzeichen, Kommentare, Befehlsvarianten oder andere Details des Quelltexts können sich dadurch ändern. Ein allgemeiner verlustfreier Rundlauf nach Änderungen ist noch nicht umgesetzt.

### Bilder, Verweise und Dateien

Lokale Bilder lassen sich über eine Dateiauswahl einfügen oder in das Dokument ziehen. Im umgesetzten Figure-Umfang werden Bildunterschriften, Bildbreite, Ausrichtung, Platzierung und Labels unterstützt. Beim Einfügen von Zitaten kann eine lokale <code>.bib</code>-Datei gelesen werden; Labels und Querverweise lassen sich im Dokument einfügen und auflösen.

Der Editor öffnet und speichert Dateien über die Dateisystem-APIs des Browsers, sofern vorhanden; fehlt die Speicherschnittstelle, wird die Datei heruntergeladen. <code>Ctrl+S</code> oder <code>Cmd+S</code> löst das Speichern aus. Der Projekt-Export erzeugt eine ZIP-Datei mit der aktiven <code>.tex</code>-Datei und den bereits geladenen lokalen Ressourcen; ein vollständiger Projektmanager für mehrere Dateien ist das noch nicht.

### Literaturmodul

Das Repository enthält außerdem ein eigenständiges BibTeX/BibLaTeX-Modul, getrennt von der Editor-Oberfläche. Seine öffentliche API deckt Parsen, Validierung, Bearbeiten von Einträgen, Serialisierung, Diagnosen, das Durchsuchen von <code>.tex</code>-Dateien nach Zitaten und eine Prüfung vor der Kompilierung ab.

Der Abnahmebericht des Moduls verzeichnet **182 bestandene automatisierte Tests** und **19 erfolgreiche reale Kompilierungskombinationen** in BibTeX/Biber-Abläufen. Diese Ergebnisse gelten für das Literaturmodul und seinen getesteten Umfang; sie sind weder ein Beleg für vollständige BibTeX/BibLaTeX-Kompatibilität noch für eine fertige Literaturverwaltung. Siehe [Bib-Engine-API](docs/bib-engine/API.md) und [Architektur](docs/bib-engine/ARCHITECTURE.md).

### Oberfläche und Einstellungen

Die Anwendung bietet eine Oberfläche auf Chinesisch und Englisch, helle und dunkle Designs, Dokumentzoom, eine Werkzeugleiste im Menüband-Stil und konfigurierbare mathematische Tastenkürzel. Oberflächeneinstellungen werden lokal im YAML-Format gespeichert.

## Architektur

Der Browser-Editor verwendet einen ProseMirror-Dokumentbaum als Bearbeitungsmodell in Echtzeit; Tiptap liefert das Editor-Gerüst. MathLive übernimmt die interaktive mathematische Eingabe. Eigene LaTeX-Module parsen und serialisieren die unterstützten Dokumentstrukturen, während der Quellmodus Zugriff auf den Originaltext und nicht unterstützte Konstrukte gibt.

Die Grenze ist einfach:

~~~text
Browser-Oberfläche
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
LaTeX-Import und -Export
       |
       +---- erkannte Syntax -> bearbeitbare Dokumentknoten
       |
       +---- nicht unterstützte Syntax -> bewahrte Quellblöcke
       |
       v
     .tex-Dateien

BibTeX-/BibLaTeX-Engine
       |
       +---- Parsen, Validierung, Bearbeiten und Serialisieren
       +---- Zitationsprüfung gegen den .tex-Quelltext
~~~

Das strukturierte Dokument trägt die interaktive Bearbeitung; der <code>.tex</code>-Quelltext bleibt das maßgebliche Dokument, und eine TeX-Engine bleibt die Instanz für den endgültigen Satz. Die interaktive Darstellung von der Kompilierung zu trennen ist eine Umsetzungsentscheidung, **nicht** die Entscheidung, unterschiedliche visuelle Ergebnisse zu akzeptieren. Die geplante Kompilierungsanbindung liefert eine Referenz, an der Schriftmetriken auf dem Bildschirm, mathematischer Satz, Abstände, Zeilenumbrüche und schließlich das Seitenlayout geprüft und verbessert werden. Quelltextbewusste Darstellung und lokale Aktualisierungen im Quelltext sind ebenfalls Entwicklungsziele; die aktuelle Umsetzung kann bearbeitete Strukturen noch vollständig neu erzeugen.

Umsetzungsdetails stehen in der [Editor-Architektur](docs/EDITOR_ARCHITECTURE.md).

## Entwicklungsstand

Lineae ist ein funktionierender Prototyp, kein fertiger Editor. Die Unterscheidung zwischen dem, was bereits nutzbar ist, und dem, was noch geplant ist, ist wichtig.

| Bereich | Stand |
| --- | --- |
| Browser-Editor | Nutzbarer Prototyp mit formatierter Textbearbeitung, Gleichungen, Dokumentstrukturen und Oberflächeneinstellungen |
| LaTeX-Interoperabilität | Import und Export für einen definierten Umfang; nicht unterstützte Konstrukte bleiben nach Möglichkeit erhalten |
| Literatur | Eigenständiges BibTeX/BibLaTeX-Modul mit eigener API und Abnahmetests |
| Quelltexttreue | Unveränderte Dateien bleiben erhalten; zuverlässige lokale Aktualisierungen nach visuellen Änderungen sind noch in Arbeit |
| Visuelle Treue zwischen Editor und PDF | Zentrales Designziel; ein systematischer Vergleich mit der kompilierten Ausgabe fehlt noch |
| Projekte mit mehreren Dateien | Noch kein vollständiger Projektablauf |
| TeX-Kompilierung und PDF-Vorschau | Nicht integriert |
| Desktop-Anwendung und exakte Seitenaufteilung | Nicht umgesetzt |

Die unmittelbare Arbeit konzentriert sich auf drei Bereiche: Formeleingabe und Navigation verlässlicher machen; Quelltexttreue, Moduswechsel und Bearbeitungsverlauf verbessern; und das Verhalten der gewöhnlichen Dokumentbearbeitung einschließlich Auswahl, Zwischenablage und Navigation in langen Dokumenten schärfen.

Sind diese Grundlagen stabil, kann das Projekt zu Projekten mit mehreren Dateien, einer eigenständigen TeX-Kompilierungsschnittstelle und der PDF-Vorschau übergehen. Die Editoransicht mit der kompilierten Ausgabe zu vergleichen und Schriften, Abstände, Zeilenumbrüche und Seitengeometrie schrittweise anzugleichen, ist eine zentrale Richtung und keine optionale Vorschau-Verbesserung. Navigation zwischen Quelltext und PDF, exakte Seitenaufteilung und Desktop-Paketierung bleiben künftige Arbeit. Die [Roadmap](docs/IMPLEMENTATION_ROADMAP.md) hält Prioritäten und Abnahmekriterien im Detail fest.

## Erste Schritte

Lineae läuft als statische Webanwendung. Für den Browser-Editor werden weder ein Anwendungsserver noch eine TeX-Distribution benötigt, aber die Dateien müssen über einen lokalen HTTP-Server ausgeliefert werden.

### Voraussetzungen

- Node.js und npm
- Ein moderner Browser
- Python 3 oder ein anderer lokaler HTTP-Server

### Editor bauen

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive wird als separate Browser-Ressource ausgeliefert. Lokal vorbereiten:

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

Lokalen Server starten:

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

Dann [http://localhost:8000](http://localhost:8000) öffnen.

## Tests

LaTeX-, Konfigurations-, Kompatibilitäts- und Oberflächentests ausführen:

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

Tests des Literaturmoduls ausführen:

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

Die Browser-Regressionstests benötigen die oben vorbereiteten MathLive-Ressourcen und Chromium von Playwright:

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

Der GitHub-Actions-Workflow baut die Anwendung, führt die LaTeX- und Literaturtests aus, bereitet MathLive vor, startet die Browser-Regressionstests und veröffentlicht die Seite auf GitHub Pages.

## Desktop-Vorschau

Unter `apps/desktop` liegt eine Vorschau für Windows x64, gebaut mit Tauri 2. Sie nutzt den Browser-Editor weiter, ergänzt native Dialoge zum Öffnen, Speichern und Speichern unter und exportiert Projekte über die vorhandene ZIP-Pipeline. Build und Paketierung laufen ausschließlich auf GitHub Actions; Artefakte und Abnahmeschritte stehen in [docs/desktop-preview.md](docs/desktop-preview.md). Kompilierung, Dateiüberwachung und automatische Updates sind bewusst nicht Teil dieser Vorschau.

## Mitwirken

Lineae ist noch früh dran, interne Schnittstellen können sich ändern. Wer einen Fehler oder ein LaTeX-Kompatibilitätsproblem findet, hilft mit einem kleinen, reproduzierbaren <code>.tex</code>-Beispiel im Issue besonders. Der formale Ablauf für externe Beiträge wird dokumentiert, sobald das Projekt reift; siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

Sofern nicht anders angegeben, steht der Originalquellcode von Lineae unter der **GNU Affero General Public License version 3 only (AGPL-3.0-only)**. Der vollständige Text findet sich in [LICENSE](LICENSE).

Bibliotheken und Ressourcen Dritter behalten ihre jeweiligen Lizenzen. Die Projektlizenz ersetzt weder deren Urheberrecht noch deren Lizenzbedingungen.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
