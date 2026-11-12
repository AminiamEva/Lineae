[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**自然書寫，漂亮排版。**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae 是一款實驗性的瀏覽器 **LaTeX 所見即所得編輯器**，鎖定學術與技術寫作。它想做到的不只是把 LaTeX 文件搬進圖形介面，而是讓**編輯區呈現的樣子和同一份文件交給 TeX 引擎編譯後的結果儘可能一致**。LaTeX 仍是原生文件格式，日常工作的核心就是普通的 <code>.tex</code> 檔。

專案還在早期開發階段。瀏覽器原型已經可以直接編輯內容，並支援一部分 LaTeX 語法，但還無法如實重現 TeX 的斷行、分頁與最終 PDF 版面。讓編輯畫面與編譯結果高度吻合，是專案要達成的目標，**不是現在已經做好的功能**。

## 為什麼要做 Lineae

能在畫面上直接改動內容，並不等於真正的所見即所得。視覺化編輯器或許讓你調整公式、表格和標題，但顯示的版面可能和 TeX 最後排出來的樣子差很多。Lineae 想縮小這個落差：編輯區應該是一份值得信賴的排版預覽，而不只是方便操作的文件結構圖。

既有的科學文件編輯器各有取捨。[LyX](https://www.lyx.org/) 走的是 WYSIWYM（What You See Is What You Mean，所見即所指）路線，重視文件結構，不追求畫面與最終版面完全一致。[GNU TeXmacs](https://www.texmacs.org/) 提供所見即所得的科學編輯體驗，但底下是自己的排版系統與原生格式，並非以 LaTeX 作為排版引擎。Lineae 想走的是另一條路：**原生 LaTeX 檔案、直接編輯，加上以真實 TeX 編譯結果校準的畫面。**

這表示排版細節和編輯操作一樣重要：字型、間距、數學符號、換行、頁面尺寸，日後還包括分頁，都應該盡量與編譯結果一致。要對任意巨集套件與自訂命令做到完美吻合，短期內並不現實；做不到的地方應該清楚呈現、方便檢查，而不是藏起來假裝沒事。

專案遵循四個原則：

- **以真正的所見即所得為目標。** 編輯畫面好不好，要看它和 TeX 編譯結果有多接近，而不是看某個結構能不能用滑鼠編輯。
- **LaTeX 就是文件格式。** 使用一般的 <code>.tex</code> 檔；無法支援的內容要保留下來，不能換成專有表示法，也不能悄悄改變原意。
- **渲染與編譯分開，但結果要對得上。** 互動渲染必須保持流暢，最終輸出則以真正的 TeX 引擎為準，日後也靠它來衡量並改善畫面的擬真度。Lineae 沒有打算在瀏覽器裡重寫一套 TeX。
- **把限制說清楚。** 寧可可靠地保留原始碼、老實退回原始模式，也不要給出失真的預覽或有損的轉換。

## 功能

目前的原型涵蓋了開始寫技術文件時會用到的基本結構。支援範圍刻意限定在編輯器認得、也處理得來的語法。

### 寫作與文件結構

編輯器以 Tiptap 和 ProseMirror 打造，支援段落、章節標題與常見文字格式：粗體、斜體、底線、刪除線、字型、字級、顏色、上標與下標。有序清單、無序清單、描述清單、區塊引用、水平分隔線與程式碼區塊也都在支援之列。

表格可以直接在文件中編輯，涵蓋基本的 <code>tabular</code> 結構、部分欄位規格、合併欄與 <code>booktabs</code> 風格的橫線。編輯器也認得一些定理環境，包括 theorem、lemma、proposition、corollary、definition、remark 與 proof。

章節編號、帶星號的標題、短標題、標籤、交互參照與目錄都支援；註腳以及文件層級的標題、作者欄位同樣可用。尋找取代面板、右鍵選單、鍵盤快速鍵、復原與重做，足以應付日常編輯。

編輯區目前採連續版面。斷行、間距與分頁還不能保證與 TeX 編譯結果一致；把這個差距補起來，是開發的核心目標。

### 數學編輯

MathLive 提供可直接編輯的行內與獨立數學式。公式就在原位編輯，不必另外開一個原始碼面板。目前支援常見數學輸入、插入矩陣與增刪行列、部分 AMS 環境、命令補全，以及公式與前後文之間的鍵盤移動。

這是一層編輯介面，不是 TeX 數學引擎。能匯入、顯示與匯出的命令和環境都有明確範圍，並持續接受測試。

### LaTeX 匯入與匯出

Lineae 可以開啟 UTF-8 編碼的 <code>.tex</code> 檔，並在視覺編輯與原始碼模式之間切換。認得的命令與環境會轉成編輯器裡的結構節點；支援範圍外的寫法會盡量保留成不透明的原始碼區塊，讓它在原始碼模式中仍然看得到，也不會被誤認成普通文字。

匯入後完全沒動過的文件，可以原封不動匯出。一旦用視覺化方式改過某個支援的區段，該區段就可能重新序列化，空白、註解、命令寫法或其他原始碼細節因此改變。編輯後的一般無損往返，目前還沒做到。

### 圖片、參照與檔案

本機圖片可以透過檔案選擇器插入，也能直接拖進文件。在目前實作的 figure 範圍內，支援圖說、圖片寬度、對齊、浮動位置與標籤。插入文獻引用時可以讀取本機 <code>.bib</code> 檔；標籤與交互參照也可以在文件中插入並解析。

瀏覽器支援檔案系統 API 時，編輯器可直接開檔與存檔；不支援存檔介面的瀏覽器則退回下載。按 <code>Ctrl+S</code> 或 <code>Cmd+S</code> 即可儲存。專案匯出會把目前的 <code>.tex</code> 檔和編輯器已載入的本機資源打包成 ZIP；它還不是完整的多檔案專案管理工具。

### 文獻模組

儲存庫裡還有一個獨立的 BibTeX/BibLaTeX 模組，與編輯器介面分開。公開 API 涵蓋解析、驗證、條目編輯、序列化、診斷、掃描 <code>.tex</code> 中的引用，以及編譯前的預檢。

模組的驗收報告記錄了 **182 項自動化測試通過**，以及 BibTeX/Biber 流程中 **19 組真實編譯組合成功**。這些數字只代表文獻模組在受測範圍內的結果，不能解讀成完整支援 BibTeX/BibLaTeX，也不代表已經有成熟的文獻管理應用程式。詳見 [Bib 引擎 API](docs/bib-engine/API.md) 與 [架構說明](docs/bib-engine/ARCHITECTURE.md)。

### 介面與偏好設定

介面提供中文與英文、淺色與深色主題、文件縮放、功能區式工具列，以及可自訂的數學快速鍵。介面偏好以 YAML 格式存放在本機。

## 架構

瀏覽器編輯器以 ProseMirror 文件樹作為即時編輯模型，Tiptap 提供編輯器框架，MathLive 負責互動式數學輸入。專用的 LaTeX 模組負責解析與序列化支援的文件結構；原始碼模式則讓你能看到原始文字與未支援的寫法。

分界很單純：

~~~text
瀏覽器介面
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
LaTeX 匯入與匯出
       |
       +---- 認得的語法 -> 可編輯的文件節點
       |
       +---- 不支援的語法 -> 保留為原始碼區塊
       |
       v
     .tex 檔

BibTeX / BibLaTeX 引擎
       |
       +---- 解析、驗證、編輯與序列化
       +---- 對照 .tex 原始碼檢查引用
~~~

結構化文件負責互動編輯；<code>.tex</code> 原始碼仍是正式文件，最終排版則以 TeX 引擎為準。把互動渲染和編譯分開，是實作上的選擇，**不是**接受兩邊長得不一樣。日後接入編譯流程後，會以它的輸出為基準，檢查並改善畫面上的字型度量、數學排版、間距、斷行，最後是頁面配置。原始碼對應與局部寫回也是開發目標；目前的實作仍可能重新產生整段編輯過的結構。

實作細節請見 [編輯器架構](docs/EDITOR_ARCHITECTURE.md)。

## 開發狀態

Lineae 是能動的原型，不是完成的編輯器。區分「現在可用」和「還在規劃」，很重要。

| 項目 | 狀態 |
| --- | --- |
| 瀏覽器編輯器 | 可用的原型，支援富文字編輯、公式、文件結構與介面偏好 |
| LaTeX 互通性 | 已定義範圍內的匯入與匯出；不支援的寫法盡量保留 |
| 文獻 | 獨立的 BibTeX/BibLaTeX 模組，有自己的 API 與驗收測試 |
| 原始碼保真 | 未修改的檔案可以原樣保留；視覺編輯後可靠的局部更新仍在開發中 |
| 編輯畫面與 PDF 的一致性 | 核心設計目標；尚未實作與編譯結果的系統化比對 |
| 多檔案專案 | 尚未形成完整的專案流程 |
| TeX 編譯與 PDF 預覽 | 尚未整合 |
| 桌面應用程式與精確分頁 | 尚未實作 |

眼前的工作集中在三件事：讓公式輸入與游標移動更可靠；改善原始碼保真、模式切換與編輯歷史；把一般文件編輯的細節做紮實，包括選取、剪貼簿操作與長文件瀏覽。

等這些基礎穩了，才會往多檔案專案、獨立 TeX 編譯介面與 PDF 預覽推進。拿編輯畫面和編譯結果比對，逐步對齊字型、間距、斷行與頁面尺寸，是核心方向，不是可有可無的預覽加分項。原始碼與 PDF 之間的跳轉、精確分頁與桌面封裝，都還屬於未來工作。更細的優先順序與驗收標準見[實作路線圖](docs/IMPLEMENTATION_ROADMAP.md)。

## 開始使用

Lineae 是靜態網頁應用程式。使用瀏覽器編輯器不需要應用程式伺服器，也不需要安裝 TeX 發行版，但檔案必須透過本機 HTTP 伺服器提供。

### 環境需求

- Node.js 與 npm
- 現代瀏覽器
- Python 3 或其他本機 HTTP 伺服器

### 建置編輯器

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive 是另外準備的瀏覽器資源。在本機執行：

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

啟動本機伺服器：

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

接著開啟 [http://localhost:8000](http://localhost:8000)。

## 測試

執行 LaTeX、設定、相容性與介面測試：

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

執行文獻模組測試：

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

瀏覽器回歸測試需要先備妥上述 MathLive 資源，並安裝 Playwright 的 Chromium：

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

GitHub Actions 會建置應用程式、執行 LaTeX 與文獻測試、準備 MathLive、跑瀏覽器回歸測試，最後把網站部署到 GitHub Pages。

## 桌面預覽版

`apps/desktop` 內有一個以 Tauri 2 打造的 Windows x64 預覽版。它沿用瀏覽器編輯器，加上原生的開啟、儲存與另存新檔對話框，並透過既有的 ZIP 流程匯出專案。建置與封裝只在 GitHub Actions 上執行；產物與驗收步驟見 [docs/desktop-preview.md](docs/desktop-preview.md)。編譯、檔案監看與自動更新都不在這個預覽版的範圍內。

## 參與貢獻

Lineae 還在早期階段，內部介面隨時可能調整。發現錯誤或 LaTeX 相容性問題時，附上一份精簡、可重現的 <code>.tex</code> 範例會非常有幫助。正式的外部貢獻流程會隨著專案成熟逐步公布，請見 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 授權

除另有說明外，Lineae 的原創原始碼採用 **GNU Affero General Public License version 3 only（AGPL-3.0-only）**。完整授權條文請見 [LICENSE](LICENSE)。

第三方函式庫與資源各自適用其授權；本專案的授權不會改變它們原有的著作權與授權條件。

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
