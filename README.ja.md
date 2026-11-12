[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**自然に書き、美しく組む。**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae は、学術・技術文書のための実験的なブラウザベース **WYSIWYG LaTeX エディタ**です。単に LaTeX 文書を GUI で編集できるようにするのではなく、**編集画面の見た目を、同じ文書を TeX エンジンでコンパイルした結果にできるだけ近づける**ことを目指しています。文書形式はあくまで LaTeX で、日常的に扱うのは普通の <code>.tex</code> ファイルです。

開発はまだ初期段階です。ブラウザ版のプロトタイプでは本文や数式を直接編集でき、対応する LaTeX の範囲も少しずつ広がっていますが、TeX の改行位置・ページ分割・最終的な PDF レイアウトまで再現できるわけではありません。編集画面とコンパイル結果を一致させることは目標であり、**すでに完成した機能ではありません**。

## Lineae を作る理由

その場で内容を直接いじれるからといって、それが WYSIWYG の組版とは限りません。数式や表、見出しを画面上で編集できても、表示されるレイアウトが TeX の出力と大きく食い違うことはあります。Lineae はこの差を埋めたいと考えています。編集画面は、文書構造を手軽に操作するための表現ではなく、仕上がりを判断できる信頼できるプレビューであるべきです。

既存の科学技術文書向けエディタは、それぞれ異なる設計を選んでいます。[LyX](https://www.lyx.org/) は WYSIWYM（What You See Is What You Mean、見たものが意図そのもの）という考え方で、最終レイアウトの再現よりも文書構造を重視します。[GNU TeXmacs](https://www.texmacs.org/) は WYSIWYG の科学技術編集を実現していますが、独自の組版システムと文書形式を使い、LaTeX を組版エンジンにはしていません。Lineae が狙うのは、**LaTeX ファイルをそのまま使い、直接編集でき、しかも実際の TeX コンパイル結果を基準に表示を調整する**という組み合わせです。

そのため、編集機能だけでなく組版の再現度も同じくらい重要になります。フォント、余白、数式の組み方、行送り、ページ寸法、将来的にはページ分割まで、可能な範囲でコンパイル結果と揃えるべきだと考えています。任意のパッケージや自作マクロに完全一致させるのは現実的な短期目標ではありません。合わない部分や未対応の構文は、隠すのではなく、見える形で残して確認できるようにします。

プロジェクトの原則は四つです。

- **本当の WYSIWYG を目指す。** 編集画面の良し悪しは、その構造をマウスで編集できるかではなく、TeX の出力にどれだけ一致しているかで判断します。
- **LaTeX を文書形式として守る。** 普通の <code>.tex</code> ファイルを扱い、未対応の内容は独自形式に置き換えたり意味を勝手に変えたりせず、そのまま残します。
- **描画とコンパイルを分ける。ただし結果は結びつける。** 編集中の描画は軽快であるべきで、最終出力の基準は実際の TeX エンジンに置きます。将来はその出力を使って表示精度を測り、改善します。ブラウザ上で TeX を丸ごと再実装するつもりはありません。
- **制約を明示する。** 不正確なプレビューや欠損のある変換より、確実なソース保持と、元のソースへ戻れる道筋を優先します。

## 機能

現在のプロトタイプは、技術文書を書き始めるのに必要な基本的な構造をカバーしています。対応範囲は、エディタが認識して扱える構文にあえて限定しています。

### 文章と文書構造

エディタは Tiptap と ProseMirror で構築されています。段落、見出し、太字・斜体・下線・取り消し線、フォント、文字サイズ、文字色、上付き・下付き文字といった一般的な書式を扱えます。番号付きリスト、箇条書き、説明リスト、引用ブロック、水平線、コードブロックにも対応しています。

表は文書内で直接編集でき、基本的な <code>tabular</code> 構造、一部の列指定、列の結合、<code>booktabs</code> 風の罫線をサポートします。定理・補題・命題・系・定義・注意・証明といった定理環境も認識します。

章番号、スター付き見出し、短い見出し、ラベル、相互参照、目次に対応し、脚注や文書全体のタイトル・著者欄も使えます。検索と置換、コンテキストメニュー、キーボードショートカット、元に戻す・やり直しは、日々の編集を支える基本機能です。

編集画面は現在、連続した 1 枚のページとして表示されます。改行位置、余白、ページ分割が TeX の出力と一致する保証はまだありません。この差を縮めることが開発の中心的な課題です。

### 数式編集

MathLive により、インライン数式とディスプレイ数式をその場で編集できます。別のソースパネルを開く必要はありません。一般的な数式入力、行列の挿入と行・列の操作、一部の AMS 環境、コマンド補完、数式と前後の本文の間のキーボード移動に対応しています。

これは編集用のインターフェースであり、TeX の数式エンジンではありません。読み込み・表示・書き出しができるコマンドや環境には限りがあり、現在もテストを続けています。

### LaTeX の読み込みと書き出し

Lineae は UTF-8 の <code>.tex</code> ファイルを開き、ビジュアル編集とソースモードを切り替えられます。認識したコマンドや環境は構造化された編集ノードに変換されます。対応範囲外の構文は、可能な限り不透明なソースブロックとして保持され、ソースモードで確認でき、普通の本文と取り違えられることもありません。

読み込んだだけで何も変更していない文書は、元のソースをそのまま書き出せます。ところが、対応済みの部分をビジュアル編集すると、その範囲が再シリアライズされ、空白、コメント、コマンドの書き方などが変わる場合があります。編集後も完全に無損失で往復できる仕組みは、まだ実装されていません。

### 画像・参照・ファイル

ローカル画像はファイル選択から挿入でき、文書へドラッグ&ドロップすることもできます。実装済みの figure の範囲内で、キャプション、画像幅、配置、回り込み、ラベルを扱えます。文献引用の挿入時にはローカルの <code>.bib</code> ファイルを読み取れ、ラベルと相互参照も文書内で挿入・解決できます。

ブラウザがファイルシステム API に対応していれば、エディタから直接ファイルを開いたり保存したりできます。保存用のインターフェースがないブラウザではダウンロードに切り替わります。<code>Ctrl+S</code> または <code>Cmd+S</code> で保存できます。プロジェクトの書き出しでは、現在の <code>.tex</code> ファイルと、エディタが読み込み済みのローカル資源を ZIP にまとめます。まだ完全な複数ファイル向けのプロジェクト管理機能ではありません。

### 文献モジュール

リポジトリには、エディタの画面とは独立した BibTeX/BibLaTeX モジュールも含まれています。公開 API は、解析、検証、項目の編集、シリアライズ、診断、<code>.tex</code> 内の引用の走査、コンパイル前のプリフライト検査を提供します。

このモジュールの受け入れ報告では、**自動テスト 182 件が通過**し、BibTeX/Biber のワークフローで **19 通りの実際のコンパイル組み合わせが成功**しています。これはあくまで文献モジュールと、その試験範囲における結果です。BibTeX/BibLaTeX への完全対応や、完成した文献管理アプリを意味するものではありません。詳しくは [Bib エンジン API](docs/bib-engine/API.md) と [アーキテクチャ](docs/bib-engine/ARCHITECTURE.md) を参照してください。

### インターフェースと設定

画面は中国語と英語に対応し、ライトテーマとダークテーマ、文書のズーム、リボン形式のツールバー、設定可能な数式用ショートカットを備えています。インターフェースの設定は YAML 形式でローカルに保存されます。

## アーキテクチャ

ブラウザ版エディタは、ProseMirror の文書ツリーを編集モデルとして使います。エディタの枠組みは Tiptap、対話的な数式入力は MathLive が担当します。対応する文書構造の解析とシリアライズは専用の LaTeX モジュールが行い、ソースモードでは元のテキストと未対応の構文をそのまま確認できます。

境界は単純です。

~~~text
ブラウザの画面
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
LaTeX の読み込みと書き出し
       |
       +---- 認識した構文 -> 編集可能な文書ノード
       |
       +---- 未対応の構文 -> ソースブロックとして保持
       |
       v
     .tex ファイル

BibTeX / BibLaTeX エンジン
       |
       +---- 解析、検証、編集、シリアライズ
       +---- .tex のソースに対する引用チェック
~~~

構造化された文書は対話的な編集を支えますが、正式な文書は <code>.tex</code> のソースであり、最終的な組版の基準は TeX エンジンです。対話的な描画とコンパイルを分けるのは実装上の判断であり、**両者が違う見た目になってよいという決定ではありません**。コンパイルとの連携を実装したあとは、その出力を基準に、画面上のフォントメトリクス、数式の組み方、余白、改行、そしてページレイアウトを確認・改善していきます。ソースとの対応付けや部分的な書き戻しも開発目標です。現在の実装では、編集した構造をまとめて再生成することがあります。

実装の詳細は [エディタのアーキテクチャ](docs/EDITOR_ARCHITECTURE.md) にまとめています。

## 開発状況

Lineae は動くプロトタイプであり、完成したエディタではありません。いま使えるものと、これから作るものを分けて示します。

| 分野 | 状況 |
| --- | --- |
| ブラウザ版エディタ | 実用的なプロトタイプ。リッチテキスト編集、数式、文書構造、画面設定に対応 |
| LaTeX との相互運用 | 定義済みの範囲で読み込みと書き出しが可能。未対応の構文は可能な限り保持 |
| 文献 | 独自 API と受け入れテストを持つ、独立した BibTeX/BibLaTeX モジュール |
| ソースの保持 | 未変更のファイルはそのまま保持できる。ビジュアル編集後の確実な部分更新は開発中 |
| 編集画面と PDF の一致 | 中核となる設計目標。コンパイル結果との体系的な比較は未実装 |
| 複数ファイルのプロジェクト | プロジェクト全体のワークフローとしては未対応 |
| TeX コンパイルと PDF プレビュー | 未統合 |
| デスクトップアプリと正確なページ分割 | 未実装 |

直近の作業は三つに集中しています。数式入力とカーソル移動をより確実にすること。ソースの保持、モード切り替え、編集履歴を改善すること。そして、選択、クリップボード、長い文書内の移動といった、普通の文書編集の挙動を詰めることです。

これらの土台が安定してから、複数ファイルのプロジェクト、独立した TeX コンパイル用のインターフェース、PDF プレビューへ進みます。編集画面とコンパイル結果を見比べ、フォント、余白、改行、ページ寸法を少しずつ揃えていくことは、追加のプレビュー機能ではなくプロジェクトの本筋です。ソースと PDF の間の移動、正確なページ分割、デスクトップ向けのパッケージングは今後の課題です。より詳しい優先順位と受け入れ条件は[実装ロードマップ](docs/IMPLEMENTATION_ROADMAP.md)にあります。

## はじめかた

Lineae は静的な Web アプリケーションです。ブラウザ版を使うのにアプリケーションサーバーも TeX ディストリビューションも要りませんが、ファイルはローカルの HTTP サーバー経由で配信する必要があります。

### 必要なもの

- Node.js と npm
- モダンなブラウザ
- Python 3 などのローカル HTTP サーバー

### エディタをビルドする

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive は別配布のブラウザ資産です。ローカルで用意します。

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

ローカルサーバーを起動します。

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

あとは [http://localhost:8000](http://localhost:8000) を開くだけです。

## テスト

LaTeX、設定、互換性、UI のテストを実行します。

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

文献モジュールのテストを実行します。

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

ブラウザ回帰テストには、上で用意した MathLive の資産と Playwright の Chromium が必要です。

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

GitHub Actions はアプリをビルドし、LaTeX と文献のテストを実行し、MathLive を用意してブラウザ回帰テストを走らせ、最後にサイトを GitHub Pages へ配信します。

## デスクトップ版プレビュー

`apps/desktop` に Tauri 2 で作った Windows x64 向けプレビューがあります。ブラウザ版エディタをそのまま使い、ファイルを開く・保存する・名前を付けて保存するためのネイティブダイアログを追加し、プロジェクトの書き出しは既存の ZIP 処理に任せています。ビルドとパッケージングは GitHub Actions 上でのみ行います。成果物と受け入れ手順は [docs/desktop-preview.md](docs/desktop-preview.md) を参照してください。コンパイル、ファイル監視、自動更新はこのプレビューの対象外です。

## コントリビュート

Lineae はまだ初期段階で、内部インターフェースは変わる可能性があります。不具合や LaTeX 互換性の問題を見つけたら、できるだけ小さく再現できる <code>.tex</code> の例を添えて Issue を立ててください。外部からの貢献手順は、プロジェクトの成熟に合わせて整備していきます。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

特に明記がない限り、Lineae のオリジナルソースコードは **GNU Affero General Public License version 3 only（AGPL-3.0-only）** で提供されます。全文は [LICENSE](LICENSE) を参照してください。

サードパーティのライブラリや資産には、それぞれのライセンスが適用されます。本プロジェクトのライセンスが、それらの著作権やライセンス条件を変更するものではありません。

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
