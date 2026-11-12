[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**Écrivez naturellement. Composez avec élégance.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae est un **éditeur LaTeX WYSIWYG** expérimental qui tourne dans le navigateur et s'adresse à l'écriture académique et technique. Son ambition ne s'arrête pas à une interface graphique posée sur LaTeX : **ce que montre l'éditeur doit ressembler autant que possible au résultat de la compilation du même document par un moteur TeX**. LaTeX reste le format natif, et le travail quotidien repose sur de simples fichiers <code>.tex</code>.

Le projet n'en est qu'au début. Le prototype pour navigateur permet déjà de modifier le contenu et couvre une part croissante de LaTeX, mais il ne reproduit pas encore fidèlement les retours à la ligne, la pagination ni la mise en page finale du PDF produit par TeX. La concordance entre la vue d'édition et le résultat compilé est l'objectif poursuivi, **pas une fonctionnalité déjà livrée**.

## Pourquoi Lineae

Manipuler un document directement ne suffit pas à faire de la composition WYSIWYG. Un éditeur visuel peut laisser modifier formules, tableaux et titres tout en affichant une mise en page très éloignée de ce que TeX produira au final. Lineae veut réduire cet écart : la surface d'édition doit devenir une vue fiable du document composé, et non un simple schéma pratique de sa structure.

Les éditeurs scientifiques existants font des choix différents. [LyX](https://www.lyx.org/) suit l'approche WYSIWYM (*What You See Is What You Mean*, « ce que vous voyez est ce que vous voulez dire ») et privilégie la structure du document à une reproduction exacte de la mise en page finale. [GNU TeXmacs](https://www.texmacs.org/) propose une édition scientifique WYSIWYG avec son propre système de composition et un format natif, sans utiliser LaTeX comme moteur sous-jacent. Lineae vise une autre combinaison : **des fichiers LaTeX natifs, l'édition directe, et un rendu calibré sur de vraies compilations TeX**.

La fidélité typographique compte donc autant que les contrôles d'édition : polices, espacements, notations mathématiques, retours à la ligne, géométrie de page et, à terme, pagination devraient concorder avec la sortie compilée chaque fois que possible. Une correspondance parfaite avec n'importe quel paquet ou macro personnalisée n'est pas une promesse réaliste à court terme ; les écarts et les constructions non prises en charge doivent rester visibles et inspectables plutôt que d'être masqués.

Le projet s'appuie sur quatre principes :

- **Viser un vrai WYSIWYG.** La qualité de la vue d'édition se juge à sa concordance avec la sortie de TeX, pas à la seule possibilité de modifier un élément à la souris.
- **Garder LaTeX comme format du document.** On travaille avec des fichiers <code>.tex</code> ordinaires ; ce qui n'est pas pris en charge est conservé, sans le remplacer par une représentation propriétaire ni en modifier silencieusement le sens.
- **Séparer le rendu de la compilation, mais relier leurs résultats.** Le rendu interactif doit rester fluide, tandis qu'un vrai moteur TeX sert de référence pour la sortie finale et, plus tard, pour mesurer et améliorer la fidélité visuelle. Lineae n'a pas l'intention de réimplémenter TeX dans le navigateur.
- **Rendre les limites explicites.** Mieux vaut préserver le source de façon fiable et revenir clairement au mode d'origine que d'offrir un aperçu inexact ou une conversion avec pertes.

## Fonctionnalités

Le prototype actuel couvre les structures courantes nécessaires pour commencer un document technique. La prise en charge se limite volontairement à la syntaxe que l'éditeur sait reconnaître et traiter.

### Écriture et structure du document

L'éditeur repose sur Tiptap et ProseMirror. Il gère les paragraphes, les titres de section et les mises en forme usuelles : gras, italique, souligné, barré, police, corps, couleur, exposant et indice. Les listes numérotées, à puces et de description, les citations en bloc, les filets horizontaux et les blocs de code sont également disponibles.

Les tableaux se modifient directement dans le document, avec la prise en charge des structures <code>tabular</code> de base, de certaines spécifications de colonnes, de la fusion de colonnes et des filets façon <code>booktabs</code>. L'éditeur reconnaît aussi plusieurs environnements de théorème : théorème, lemme, proposition, corollaire, définition, remarque et démonstration.

La numérotation des sections, les titres étoilés, les titres courts, les étiquettes, les références croisées et la table des matières sont pris en charge. Les notes de bas de page ainsi que les champs de titre et d'auteur au niveau du document le sont aussi. Un panneau de recherche et remplacement, des menus contextuels, des raccourcis clavier, l'annulation et le rétablissement accompagnent le travail quotidien.

La vue actuelle est un document continu. Ses retours à la ligne, ses espacements et sa pagination ne sont pas encore garantis conformes à la sortie de TeX ; réduire cet écart est un objectif central du développement.

### Édition mathématique

MathLive fournit des formules modifiables en ligne et isolées. Les équations se modifient sur place, sans panneau de source séparé. L'implémentation actuelle couvre la saisie mathématique courante, l'insertion de matrices et les opérations sur les lignes ou colonnes, certains environnements AMS, la complétion de commandes et la navigation au clavier entre les formules et le texte qui les entoure.

Il s'agit d'une interface d'édition, pas d'un moteur mathématique TeX. L'ensemble des commandes et environnements pouvant être importés, affichés et exportés est fini et continue d'être testé.

### Import et export LaTeX

Lineae ouvre les fichiers <code>.tex</code> en UTF-8 et permet de basculer entre l'édition visuelle et le mode source. Les commandes et environnements reconnus sont convertis en nœuds structurés dans l'éditeur. Les constructions hors du sous-ensemble pris en charge sont conservées autant que possible sous forme de blocs source opaques : elles restent visibles en mode source et ne sont pas confondues avec du texte ordinaire.

Un document importé sans modification peut être exporté avec son source d'origine intact. En revanche, dès qu'une section prise en charge est modifiée visuellement, cette section peut être resérialisée, ce qui change les espaces, les commentaires, le choix des commandes ou d'autres détails du source. Un aller-retour général sans perte après édition n'est pas encore implémenté.

### Images, références et fichiers

Les images locales peuvent être insérées via un sélecteur de fichiers ou glissées dans le document. Dans le sous-ensemble de figures implémenté, les légendes, la largeur, l'alignement, le placement et les étiquettes sont disponibles. L'insertion d'une citation peut lire un fichier <code>.bib</code> local, et les étiquettes comme les références croisées peuvent être insérées et résolues dans le document.

L'éditeur ouvre et enregistre les fichiers via les API de système de fichiers du navigateur lorsqu'elles existent ; à défaut, le fichier est téléchargé. <code>Ctrl+S</code> ou <code>Cmd+S</code> déclenche l'enregistrement. L'export de projet crée un ZIP contenant le fichier <code>.tex</code> actif et les ressources locales déjà chargées par l'éditeur ; ce n'est pas encore un gestionnaire complet de projets multi-fichiers.

### Module bibliographique

Le dépôt contient aussi un module BibTeX/BibLaTeX autonome, distinct de l'interface de l'éditeur. Son API publique couvre l'analyse, la validation, la modification d'entrées, la sérialisation, les diagnostics, le balayage des citations dans les fichiers <code>.tex</code> et un contrôle avant compilation.

Le rapport de recette du module consigne **182 tests automatisés réussis** et **19 combinaisons de compilation réelles validées** dans des flux BibTeX/Biber. Ces résultats concernent le module bibliographique et son périmètre de test ; ils ne doivent pas être lus comme une compatibilité complète avec BibTeX/BibLaTeX ni comme une application de gestion bibliographique terminée. Voir l'[API du moteur Bib](docs/bib-engine/API.md) et l'[architecture](docs/bib-engine/ARCHITECTURE.md).

### Interface et préférences

L'application propose une interface en chinois et en anglais, des thèmes clair et sombre, le zoom du document, un ruban d'outils et des raccourcis mathématiques configurables. Les préférences d'interface sont stockées localement au format YAML.

## Architecture

L'éditeur pour navigateur utilise un arbre de documents ProseMirror comme modèle d'édition en direct, avec Tiptap comme cadre. MathLive gère la saisie mathématique interactive. Des modules LaTeX dédiés analysent et sérialisent les structures prises en charge, tandis que le mode source donne accès au texte d'origine et aux constructions non prises en charge.

La frontière est simple :

~~~text
Interface du navigateur
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
Import et export LaTeX
       |
       +---- syntaxe reconnue -> nœuds de document modifiables
       |
       +---- syntaxe non prise en charge -> blocs source conservés
       |
       v
     fichiers .tex

Moteur BibTeX / BibLaTeX
       |
       +---- analyse, validation, édition et sérialisation
       +---- vérification des citations dans le source .tex
~~~

Le document structuré porte l'édition interactive ; le source <code>.tex</code> reste le document de référence, et un moteur TeX fait autorité pour la composition finale. Séparer le rendu interactif de la compilation relève de l'implémentation, **pas** d'un choix d'accepter des résultats visuels différents. L'intégration de la compilation fournira une référence pour évaluer et améliorer les métriques de police à l'écran, la composition mathématique, les espacements, les retours à la ligne et, à terme, la mise en page. La représentation fidèle au source et les mises à jour locales du source sont aussi des objectifs ; l'implémentation actuelle peut encore régénérer des structures modifiées entières.

Les détails d'implémentation sont dans [Architecture de l'éditeur](docs/EDITOR_ARCHITECTURE.md).

## État du développement

Lineae est un prototype fonctionnel, pas un éditeur terminé. La distinction entre ce qui est déjà utilisable et ce qui reste prévu compte.

| Domaine | État |
| --- | --- |
| Éditeur navigateur | Prototype utilisable avec édition de texte enrichi, équations, structures de document et préférences |
| Interopérabilité LaTeX | Import et export pour un sous-ensemble défini ; les constructions non prises en charge sont conservées si possible |
| Bibliographie | Module BibTeX/BibLaTeX autonome, avec sa propre API et ses tests de recette |
| Fidélité du source | Les fichiers non modifiés sont préservés ; les mises à jour locales fiables après édition visuelle sont encore en développement |
| Fidélité visuelle éditeur–PDF | Objectif de conception majeur ; la comparaison systématique avec la sortie compilée n'est pas encore implémentée |
| Projets multi-fichiers | Pas encore de flux de projet complet |
| Compilation TeX et aperçu PDF | Non intégrés |
| Application de bureau et pagination précise | Non implémentées |

Le travail immédiat se concentre sur trois axes : fiabiliser la saisie d'équations et la navigation ; améliorer la conservation du source, le changement de mode et l'historique d'édition ; et affiner le comportement de l'édition ordinaire, notamment la sélection, le presse-papiers et la navigation dans les documents longs.

Une fois ces fondations stables, le projet pourra avancer vers la gestion de projets multi-fichiers, une interface de compilation TeX indépendante et l'aperçu PDF. Comparer la vue d'édition à la sortie compilée et aligner progressivement polices, espacements, retours à la ligne et géométrie de page est une direction centrale, pas un supplément d'aperçu. La navigation entre source et PDF, la pagination exacte et l'empaquetage de bureau restent à faire. La [feuille de route](docs/IMPLEMENTATION_ROADMAP.md) détaille les priorités et les critères de recette.

## Pour commencer

Lineae est une application web statique. L'éditeur pour navigateur ne nécessite ni serveur applicatif ni distribution TeX, mais les fichiers doivent être servis par un serveur HTTP local.

### Prérequis

- Node.js et npm
- Un navigateur moderne
- Python 3 ou un autre serveur HTTP local

### Compiler l'éditeur

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive est distribué comme ressource navigateur séparée. Préparez-la en local avec :

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

Lancez un serveur local :

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

Puis ouvrez [http://localhost:8000](http://localhost:8000).

## Tests

Lancez les tests LaTeX, configuration, compatibilité et interface avec :

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

Lancez les tests du module bibliographique avec :

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

La suite de régression navigateur requiert les ressources MathLive ci-dessus et Chromium via Playwright :

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

Le workflow GitHub Actions compile l'application, exécute les suites LaTeX et bibliographie, prépare MathLive, lance la régression navigateur et déploie le site sur GitHub Pages.

## Aperçu de bureau

Un aperçu Windows x64 construit avec Tauri 2 se trouve dans `apps/desktop`. Il réutilise l'éditeur du navigateur, ajoute des boîtes de dialogue natives pour ouvrir, enregistrer et enregistrer sous, et exporte les projets via le pipeline ZIP existant. La compilation et l'empaquetage ne s'exécutent que sur GitHub Actions ; voir [docs/desktop-preview.md](docs/desktop-preview.md) pour les artefacts et les étapes de recette. La compilation, la surveillance de fichiers et les mises à jour automatiques sont volontairement hors périmètre de cet aperçu.

## Contribuer

Lineae en est encore à ses débuts et ses interfaces internes peuvent évoluer. Si vous trouvez un bug ou un problème de compatibilité LaTeX, un ticket accompagné d'un exemple <code>.tex</code> court et reproductible est particulièrement utile. Le processus formel de contribution externe sera documenté à mesure que le projet mûrit ; voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Sauf indication contraire, le code source original de Lineae est distribué sous **GNU Affero General Public License version 3 only (AGPL-3.0-only)**. Le texte complet se trouve dans [LICENSE](LICENSE).

Les bibliothèques et ressources tierces conservent leurs propres licences. La licence du projet ne se substitue pas à leurs conditions de copyright ou de licence.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
