[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**Escribe con naturalidad. Compón con belleza.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae es un **editor WYSIWYG de LaTeX** experimental que funciona en el navegador y está pensado para la escritura académica y técnica. No se conforma con llevar LaTeX a una interfaz gráfica: busca que **lo que se ve en el editor se parezca lo más posible al resultado de compilar el mismo documento con un motor TeX**. LaTeX sigue siendo el formato nativo, y el centro del trabajo diario son archivos <code>.tex</code> corrientes.

El proyecto está en una fase temprana. El prototipo para navegador ya permite editar el contenido y cubre una parte creciente de LaTeX, pero todavía no reproduce con exactitud los saltos de línea, la paginación ni el aspecto final del PDF de TeX. Que la vista de edición y el resultado compilado coincidan es el objetivo, **no una función ya terminada**.

## Por qué existe Lineae

Poder tocar el documento directamente no equivale a componer con WYSIWYG. Un editor visual puede dejarte cambiar fórmulas, tablas y títulos mientras muestra una maqueta que se aleja bastante de lo que TeX producirá al final. Lineae quiere cerrar esa brecha: la interfaz de edición debería ser una vista fiable del documento compuesto, no solo una representación cómoda de su estructura.

Los editores científicos que ya existen hacen distintas concesiones. [LyX](https://www.lyx.org/) sigue el enfoque WYSIWYM (*What You See Is What You Mean*, lo que ves es lo que quieres decir) y prioriza la estructura del documento sobre la reproducción exacta del aspecto final. [GNU TeXmacs](https://www.texmacs.org/) ofrece edición científica WYSIWYG con su propio sistema de composición y un formato nativo, en lugar de usar LaTeX como motor de fondo. Lineae apunta a otra combinación: **archivos LaTeX nativos, edición directa y una representación calibrada contra compilaciones reales de TeX**.

Por eso la fidelidad tipográfica importa tanto como los controles de edición: las fuentes, el espaciado, la notación matemática, el corte de líneas, la geometría de la página y, más adelante, la paginación deberían coincidir con el resultado compilado siempre que sea posible. Igualar al píxel cualquier paquete o macro personalizada no es una promesa realista a corto plazo; las discrepancias y los elementos no admitidos deben quedar a la vista y poder revisarse, no ocultarse.

El proyecto se guía por cuatro principios:

- **Aspirar a un WYSIWYG de verdad.** La calidad de la vista de edición se mide por su parecido con la salida de TeX, no por si un elemento se puede editar con el ratón.
- **Mantener LaTeX como formato del documento.** Se trabaja con archivos <code>.tex</code> normales; lo que no se admite se conserva en lugar de sustituirlo por una representación propietaria o cambiar su significado en silencio.
- **Separar la representación de la compilación, pero conectar sus resultados.** El render interactivo debe seguir siendo ágil, mientras que un motor TeX real marca la referencia de la salida final y, en el futuro, sirve para medir y mejorar la fidelidad visual. Lineae no pretende reimplementar TeX entero en el navegador.
- **Explicitar las limitaciones.** Es preferible conservar el código fuente con fiabilidad y ofrecer una vuelta clara al modo original antes que dar vistas previas inexactas o conversiones con pérdidas.

## Funciones

El prototipo actual cubre las estructuras habituales para empezar a trabajar en un documento técnico. El soporte se limita a propósito a la sintaxis que el editor reconoce y sabe manejar.

### Escritura y estructura del documento

El editor está construido sobre Tiptap y ProseMirror. Admite párrafos, encabezados de sección y los formatos de texto más comunes: negrita, cursiva, subrayado, tachado, familia tipográfica, tamaño, color, superíndice y subíndice. También hay listas numeradas, con viñetas y descriptivas, citas en bloque, líneas divisorias y bloques de código.

Las tablas se editan dentro del documento, con soporte para estructuras <code>tabular</code> básicas, algunas especificaciones de columna, columnas combinadas y filetes al estilo <code>booktabs</code>. El editor reconoce además varios entornos de teorema: teorema, lema, proposición, corolario, definición, observación y demostración.

Se admiten la numeración de secciones, los títulos con asterisco, los títulos cortos, las etiquetas, las referencias cruzadas y el índice. También hay notas al pie y campos de título y autor para todo el documento. El panel de buscar y reemplazar, los menús contextuales, los atajos de teclado, deshacer y rehacer cubren el trabajo diario.

La vista actual es un documento continuo. Sus saltos de línea, espaciado y paginación todavía no garantizan coincidir con la salida de TeX; cerrar esa distancia es uno de los objetivos centrales del desarrollo.

### Edición matemática

MathLive proporciona fórmulas editables en línea y en bloque. Las ecuaciones se editan en su sitio, sin abrir un panel de código aparte. La implementación actual incluye entrada matemática habitual, inserción de matrices y operaciones de fila o columna, algunos entornos AMS, autocompletado de comandos y navegación con el teclado entre las fórmulas y el texto que las rodea.

Esto es una interfaz de edición, no un motor matemático de TeX. El conjunto de comandos y entornos que se pueden importar, mostrar y exportar es finito y se sigue probando.

### Importación y exportación de LaTeX

Lineae abre archivos <code>.tex</code> en UTF-8 y permite alternar entre la edición visual y el modo de código fuente. Los comandos y entornos reconocidos se convierten en nodos estructurados del editor. Las construcciones que quedan fuera del subconjunto admitido se conservan como bloques de código opacos siempre que sea posible, de modo que siguen disponibles en el modo fuente y no se confunden con texto normal.

Un documento importado que no se haya modificado se puede exportar con su código original intacto. En cambio, cuando una sección admitida se edita visualmente, esa sección puede volver a serializarse y cambiar así espacios, comentarios, elección de comandos u otros detalles del código. La ida y vuelta general sin pérdidas después de editar todavía no está implementada.

### Imágenes, referencias y archivos

Las imágenes locales se pueden insertar con un selector de archivos o arrastrar al documento. Dentro del subconjunto de figure implementado se admiten pies de figura, ancho de imagen, alineación, posición y etiquetas. Al insertar una cita se puede leer un archivo <code>.bib</code> local, y las etiquetas y referencias cruzadas se pueden insertar y resolver en el documento.

El editor abre y guarda archivos mediante las API de sistema de archivos del navegador cuando están disponibles; si el navegador no ofrece la interfaz de guardado, se descarga el archivo. <code>Ctrl+S</code> o <code>Cmd+S</code> ejecuta la acción de guardar. La exportación del proyecto genera un ZIP con el archivo <code>.tex</code> activo y los recursos locales que el editor ya haya cargado; todavía no es un gestor completo de proyectos con varios archivos.

### Módulo de bibliografía

El repositorio incluye además un módulo independiente de BibTeX/BibLaTeX, separado de la interfaz del editor. Su API pública cubre el análisis, la validación, la edición de entradas, la serialización, los diagnósticos, el escaneo de citas en archivos <code>.tex</code> y una comprobación previa a la compilación.

El informe de aceptación del módulo registra **182 pruebas automatizadas superadas** y **19 combinaciones reales de compilación correctas** en flujos de BibTeX/Biber. Son resultados del módulo de bibliografía y de su ámbito de prueba; no deben leerse como una compatibilidad completa con BibTeX/BibLaTeX ni como una aplicación de gestión bibliográfica terminada. Consulta la [API del motor Bib](docs/bib-engine/API.md) y la [arquitectura](docs/bib-engine/ARCHITECTURE.md).

### Interfaz y preferencias

La aplicación ofrece interfaz en chino e inglés, temas claro y oscuro, zoom del documento, una cinta de opciones y atajos de teclado matemáticos configurables. Las preferencias de la interfaz se guardan localmente en formato YAML.

## Arquitectura

El editor del navegador usa un árbol de documentos de ProseMirror como modelo de edición en vivo, con Tiptap como marco del editor. MathLive se encarga de la entrada matemática interactiva. Los módulos de LaTeX específicos analizan y serializan las estructuras admitidas, mientras que el modo fuente da acceso al texto original y a las construcciones no admitidas.

La frontera es sencilla:

~~~text
Interfaz del navegador
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
Importación y exportación de LaTeX
       |
       +---- sintaxis reconocida -> nodos editables del documento
       |
       +---- sintaxis no admitida -> bloques de código conservados
       |
       v
     archivos .tex

Motor BibTeX / BibLaTeX
       |
       +---- análisis, validación, edición y serialización
       +---- comprobación de citas contra el código .tex
~~~

El documento estructurado sostiene la edición interactiva; el código <code>.tex</code> sigue siendo el documento de referencia y un motor TeX, la autoridad para la composición final. Separar el render interactivo de la compilación es una decisión de implementación, **no** la de aceptar resultados visuales distintos. Cuando se integre la compilación, su salida servirá de referencia para evaluar y mejorar las métricas tipográficas en pantalla, la composición matemática, el espaciado, el corte de líneas y, con el tiempo, la maquetación de páginas. La representación consciente del código y las actualizaciones locales del fuente también son metas de desarrollo; la implementación actual todavía puede regenerar estructuras editadas completas.

Los detalles de implementación están en [Arquitectura del editor](docs/EDITOR_ARCHITECTURE.md).

## Estado del desarrollo

Lineae es un prototipo funcional, no un editor terminado. Conviene distinguir lo que ya se puede usar de lo que sigue siendo un plan.

| Área | Estado |
| --- | --- |
| Editor de navegador | Prototipo usable con edición de texto enriquecido, ecuaciones, estructuras de documento y preferencias |
| Interoperabilidad con LaTeX | Importación y exportación para un subconjunto definido; lo no admitido se conserva cuando es posible |
| Bibliografía | Módulo BibTeX/BibLaTeX independiente, con API y pruebas de aceptación propias |
| Fidelidad del código | Los archivos sin modificar se conservan; las actualizaciones locales fiables tras editar en visual siguen en desarrollo |
| Fidelidad visual entre editor y PDF | Objetivo central de diseño; aún no hay comparación sistemática con la salida compilada de TeX |
| Proyectos con varios archivos | Todavía no hay un flujo de proyecto completo |
| Compilación TeX y vista previa del PDF | Sin integrar |
| Aplicación de escritorio y paginación precisa | Sin implementar |

El trabajo inmediato se concentra en tres frentes: hacer más fiables la entrada de ecuaciones y la navegación; mejorar la conservación del código, el cambio de modo y el historial de edición; y pulir el comportamiento de la edición normal, incluidos la selección, el portapapeles y la navegación por documentos largos.

Cuando esas bases estén firmes, el proyecto podrá avanzar hacia la gestión de proyectos con varios archivos, una interfaz independiente de compilación TeX y la vista previa del PDF. Comparar la vista del editor con la salida compilada y alinear poco a poco fuentes, espaciado, saltos de línea y geometría de página es una dirección central, no un extra opcional de la vista previa. La navegación entre código y PDF, la paginación exacta y el empaquetado de escritorio siguen siendo trabajo futuro. La [hoja de ruta](docs/IMPLEMENTATION_ROADMAP.md) recoge prioridades y criterios de aceptación más detallados.

## Primeros pasos

Lineae se ejecuta como aplicación web estática. Para usar el editor del navegador no hacen falta un servidor de aplicaciones ni una distribución de TeX, pero los archivos deben servirse desde un servidor HTTP local.

### Requisitos

- Node.js y npm
- Un navegador moderno
- Python 3 u otro servidor HTTP local

### Compilar el editor

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive se distribuye como un recurso aparte para el navegador. Prepáralo en local con:

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

Inicia un servidor local:

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

Luego abre [http://localhost:8000](http://localhost:8000).

## Pruebas

Ejecuta las pruebas de LaTeX, configuración, compatibilidad e interfaz con:

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

Ejecuta las pruebas del módulo de bibliografía con:

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

La suite de regresión del navegador necesita los recursos de MathLive anteriores y Chromium de Playwright:

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

El flujo de GitHub Actions compila la aplicación, ejecuta las suites de LaTeX y bibliografía, prepara MathLive, lanza la regresión del navegador y publica el sitio en GitHub Pages.

## Vista previa de escritorio

En `apps/desktop` hay una vista previa para Windows x64 construida con Tauri 2. Reutiliza el editor del navegador, añade diálogos nativos para abrir, guardar y guardar como, y exporta proyectos mediante el flujo ZIP existente. La compilación y el empaquetado solo se ejecutan en GitHub Actions; consulta [docs/desktop-preview.md](docs/desktop-preview.md) para ver los artefactos y los pasos de aceptación. La compilación, la vigilancia de archivos y las actualizaciones automáticas quedan fuera del alcance de esta vista previa.

## Cómo contribuir

Lineae está en una fase temprana y sus interfaces internas pueden cambiar. Si encuentras un error o un problema de compatibilidad con LaTeX, un issue con un ejemplo <code>.tex</code> pequeño y reproducible resulta de gran ayuda. El proceso formal para contribuciones externas se documentará a medida que el proyecto madure; consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Salvo que se indique lo contrario, el código original de Lineae se distribuye bajo la **GNU Affero General Public License version 3 only (AGPL-3.0-only)**. El texto completo está en [LICENSE](LICENSE).

Las bibliotecas y los recursos de terceros conservan sus propias licencias. La licencia del proyecto no sustituye sus condiciones de copyright ni de licencia.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
