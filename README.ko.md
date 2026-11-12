[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**자연스럽게 쓰고, 아름답게 조판합니다.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

Lineae는 학술·기술 문서를 위한 실험적인 브라우저 기반 **WYSIWYG LaTeX 편집기**입니다. LaTeX 문서를 그래픽 인터페이스에서 고칠 수 있게 하는 데 그치지 않고, **편집 화면이 같은 문서를 TeX 엔진으로 컴파일한 결과와 최대한 비슷하게 보이도록** 하는 것이 목표입니다. 문서 형식은 어디까지나 LaTeX이며, 일상적인 작업의 중심에는 평범한 <code>.tex</code> 파일이 있습니다.

아직 초기 개발 단계입니다. 브라우저 프로토타입은 본문과 수식을 직접 편집할 수 있고 지원하는 LaTeX 문법도 조금씩 늘고 있지만, TeX의 줄바꿈 위치나 쪽 나눔, 최종 PDF 레이아웃까지 재현하지는 못합니다. 편집 화면과 컴파일 결과를 일치시키는 것은 목표이며, **이미 완성된 기능은 아닙니다**.

## Lineae를 만드는 이유

화면에서 내용을 직접 고칠 수 있다고 해서 그것이 곧 WYSIWYG 조판은 아닙니다. 수식과 표, 제목을 눈앞에서 편집하더라도 화면에 보이는 배치가 TeX의 출력과 크게 다를 수 있습니다. Lineae는 이 간극을 줄이고자 합니다. 편집 화면은 문서 구조를 손쉽게 다루는 도구가 아니라, 완성본을 가늠할 수 있는 믿을 만한 미리보기여야 합니다.

기존 과학·기술 문서 편집기는 각자 다른 선택을 했습니다. [LyX](https://www.lyx.org/)는 WYSIWYM(What You See Is What You Mean, 보이는 것이 곧 의미) 방식을 따라 최종 레이아웃의 재현보다 문서 구조를 중시합니다. [GNU TeXmacs](https://www.texmacs.org/)는 WYSIWYG 과학 편집을 제공하지만 자체 조판 시스템과 문서 형식을 쓰며, LaTeX를 조판 엔진으로 사용하지는 않습니다. Lineae가 노리는 조합은 **LaTeX 파일 그대로, 직접 편집, 그리고 실제 TeX 컴파일 결과를 기준으로 맞춘 화면**입니다.

그래서 편집 기능만큼 조판의 재현도 중요합니다. 글꼴, 여백, 수식 배치, 줄바꿈, 페이지 크기, 나아가 쪽 나눔까지 가능한 범위에서 컴파일 결과와 맞아야 합니다. 임의의 패키지와 사용자 정의 매크로까지 완벽히 일치시키는 것은 단기간에 약속할 수 있는 일이 아닙니다. 맞지 않는 부분과 지원하지 않는 구조는 감추지 말고 눈에 보이게 남겨 확인할 수 있어야 합니다.

프로젝트는 네 가지 원칙을 따릅니다.

- **진짜 WYSIWYG를 목표로 합니다.** 편집 화면의 가치는 어떤 구조를 마우스로 고칠 수 있는지가 아니라, TeX 출력과 얼마나 일치하는지로 판단합니다.
- **LaTeX를 문서 형식으로 지킵니다.** 평범한 <code>.tex</code> 파일을 다루고, 지원하지 않는 내용은 독자 형식으로 바꾸거나 의미를 몰래 바꾸지 않고 그대로 남깁니다.
- **렌더링과 컴파일을 분리하되 결과는 연결합니다.** 화면 렌더링은 가볍고 빨라야 하고, 최종 출력의 기준은 실제 TeX 엔진에 둡니다. 앞으로는 그 출력으로 화면 정확도를 재고 개선합니다. 브라우저에서 TeX를 통째로 다시 구현할 계획은 없습니다.
- **한계를 분명히 밝힙니다.** 부정확한 미리보기나 손실 있는 변환보다는 소스를 확실히 보존하고 원문으로 돌아갈 길을 남깁니다.

## 기능

현재 프로토타입은 기술 문서를 쓰기 시작할 때 필요한 기본 구조를 다룹니다. 지원 범위는 편집기가 인식하고 처리할 수 있는 문법으로 일부러 제한했습니다.

### 글쓰기와 문서 구조

편집기는 Tiptap과 ProseMirror로 만들어졌습니다. 단락, 장 제목, 굵게·기울임·밑줄·취소선, 글꼴, 글자 크기, 글자색, 위 첨자·아래 첨자 같은 일반적인 서식을 지원합니다. 번호 목록, 글머리 기호 목록, 설명 목록, 인용 블록, 가로줄, 코드 블록도 사용할 수 있습니다.

표는 문서 안에서 바로 편집할 수 있으며, 기본적인 <code>tabular</code> 구조와 일부 열 지정, 열 병합, <code>booktabs</code> 스타일 괘선을 지원합니다. 정리, 보조정리, 명제, 따름정리, 정의, 비고, 증명 등 일부 정리 환경도 인식합니다.

장 번호, 별표 제목, 짧은 제목, 레이블, 상호 참조, 목차를 지원하고 각주와 문서 전체의 제목·저자 항목도 쓸 수 있습니다. 찾기·바꾸기 패널, 상황별 메뉴, 키보드 단축키, 실행 취소·다시 실행은 일상적인 편집을 뒷받침합니다.

편집 화면은 현재 하나로 이어진 문서 보기입니다. 줄바꿈, 여백, 쪽 나눔이 TeX 컴파일 결과와 일치한다고 보장하지는 않습니다. 이 차이를 좁히는 것이 개발의 핵심 목표입니다.

### 수식 편집

MathLive가 인라인 수식과 디스플레이 수식을 직접 편집하게 해 줍니다. 수식은 별도의 소스 패널이 아니라 문서 안에서 바로 고칩니다. 현재는 일반적인 수식 입력, 행렬 삽입과 행·열 조작, 일부 AMS 환경, 명령 자동 완성, 수식과 앞뒤 본문 사이의 키보드 이동을 지원합니다.

이것은 편집 인터페이스이지 TeX 수식 엔진이 아닙니다. 불러오고 표시하고 내보낼 수 있는 명령과 환경의 범위는 정해져 있으며, 계속 시험하고 있습니다.

### LaTeX 가져오기와 내보내기

Lineae는 UTF-8 <code>.tex</code> 파일을 열고 시각 편집과 소스 모드를 오갈 수 있습니다. 인식한 명령과 환경은 구조화된 편집 노드로 바뀝니다. 지원 범위 밖의 구조는 가능한 한 불투명한 소스 블록으로 남겨 두어, 소스 모드에서 그대로 볼 수 있고 일반 텍스트로 오해되지 않습니다.

불러온 뒤 아무것도 고치지 않은 문서는 원래 소스를 그대로 내보낼 수 있습니다. 그러나 지원하는 부분을 시각적으로 편집하면 그 구간이 다시 직렬화되면서 공백, 주석, 명령 표기 같은 소스 세부 사항이 달라질 수 있습니다. 편집 후에도 완전히 무손실로 왕복하는 기능은 아직 구현되지 않았습니다.

### 이미지, 참조, 파일

로컬 이미지는 파일 선택기로 넣거나 문서로 끌어다 놓을 수 있습니다. 구현된 figure 범위 안에서 캡션, 이미지 너비, 정렬, 배치, 레이블을 지원합니다. 문헌 인용을 넣을 때 로컬 <code>.bib</code> 파일을 읽을 수 있고, 레이블과 상호 참조도 문서 안에서 넣고 해석합니다.

브라우저가 파일 시스템 API를 지원하면 편집기에서 바로 파일을 열고 저장할 수 있습니다. 저장 인터페이스가 없는 브라우저에서는 다운로드로 대체합니다. <code>Ctrl+S</code> 또는 <code>Cmd+S</code>로 저장합니다. 프로젝트 내보내기는 현재 <code>.tex</code> 파일과 편집기가 이미 불러온 로컬 자원을 ZIP으로 묶습니다. 아직 완전한 다중 파일 프로젝트 관리 도구는 아닙니다.

### 문헌 모듈

저장소에는 편집기 화면과 분리된 BibTeX/BibLaTeX 모듈도 들어 있습니다. 공개 API는 구문 분석, 검증, 항목 편집, 직렬화, 진단, <code>.tex</code> 안의 인용 검사, 컴파일 전 사전 검사를 제공합니다.

이 모듈의 인수 보고서에는 **자동 테스트 182개 통과**와 BibTeX/Biber 흐름에서 **실제 컴파일 조합 19가지 성공**이 기록되어 있습니다. 이는 문헌 모듈과 시험한 범위에 대한 결과일 뿐, BibTeX/BibLaTeX를 완전히 지원한다거나 문헌 관리 애플리케이션이 완성되었다는 뜻은 아닙니다. 자세한 내용은 [Bib 엔진 API](docs/bib-engine/API.md)와 [아키텍처](docs/bib-engine/ARCHITECTURE.md)를 참고하세요.

### 인터페이스와 설정

화면은 중국어와 영어를 지원하며, 밝은 테마와 어두운 테마, 문서 확대·축소, 리본 형태 도구 모음, 설정 가능한 수식 단축키를 갖추고 있습니다. 인터페이스 설정은 YAML 형식으로 로컬에 저장됩니다.

## 아키텍처

브라우저 편집기는 ProseMirror 문서 트리를 실시간 편집 모델로 사용하고, 편집기 프레임워크는 Tiptap이 맡습니다. 대화형 수식 입력은 MathLive가 처리합니다. 지원하는 문서 구조의 분석과 직렬화는 전용 LaTeX 모듈이 담당하며, 소스 모드에서는 원문과 지원하지 않는 구조를 그대로 볼 수 있습니다.

경계는 단순합니다.

~~~text
브라우저 화면
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
LaTeX 가져오기와 내보내기
       |
       +---- 인식한 문법 -> 편집 가능한 문서 노드
       |
       +---- 지원하지 않는 문법 -> 소스 블록으로 보존
       |
       v
     .tex 파일

BibTeX / BibLaTeX 엔진
       |
       +---- 구문 분석, 검증, 편집, 직렬화
       +---- .tex 소스에 대한 인용 검사
~~~

구조화된 문서는 대화형 편집을 뒷받침하지만, 공식 문서는 <code>.tex</code> 소스이고 최종 조판의 기준은 TeX 엔진입니다. 대화형 렌더링과 컴파일을 분리하는 것은 구현상의 선택이며, **두 결과가 서로 달라도 된다는 결정이 아닙니다**. 컴파일 연동을 구현하면 그 출력을 기준으로 화면의 글꼴 메트릭, 수식 배치, 여백, 줄바꿈, 나중에는 페이지 레이아웃까지 점검하고 개선합니다. 소스 대응과 부분 쓰기 되돌림도 개발 목표입니다. 현재 구현은 편집한 구조를 통째로 다시 생성할 수 있습니다.

구현 세부 사항은 [편집기 아키텍처](docs/EDITOR_ARCHITECTURE.md)에 정리되어 있습니다.

## 개발 현황

Lineae는 동작하는 프로토타입이지 완성된 편집기가 아닙니다. 지금 쓸 수 있는 것과 앞으로 만들 것을 구분해서 봐야 합니다.

| 영역 | 현황 |
| --- | --- |
| 브라우저 편집기 | 서식 편집, 수식, 문서 구조, 화면 설정을 갖춘 사용 가능한 프로토타입 |
| LaTeX 호환성 | 정해진 범위의 가져오기·내보내기. 지원하지 않는 구조는 가능한 한 보존 |
| 문헌 | 자체 API와 인수 테스트를 갖춘 독립 BibTeX/BibLaTeX 모듈 |
| 소스 보존 | 수정하지 않은 파일은 그대로 보존. 시각 편집 후 안정적인 부분 갱신은 개발 중 |
| 편집 화면과 PDF의 일치 | 핵심 설계 목표. 컴파일 결과와의 체계적인 비교는 아직 미구현 |
| 다중 파일 프로젝트 | 완전한 프로젝트 흐름으로는 미지원 |
| TeX 컴파일과 PDF 미리보기 | 미통합 |
| 데스크톱 앱과 정확한 쪽 나눔 | 미구현 |

당장의 작업은 세 가지에 집중되어 있습니다. 수식 입력과 커서 이동을 더 믿을 수 있게 만드는 일, 소스 보존과 모드 전환, 편집 기록을 개선하는 일, 그리고 선택·클립보드·긴 문서 탐색 같은 일반 편집 동작을 다듬는 일입니다.

이 토대가 안정되면 다중 파일 프로젝트, 독립적인 TeX 컴파일 인터페이스, PDF 미리보기로 나아갑니다. 편집 화면과 컴파일 결과를 비교하며 글꼴, 여백, 줄바꿈, 페이지 크기를 조금씩 맞추는 것은 선택적인 미리보기 기능이 아니라 프로젝트의 중심 방향입니다. 소스와 PDF 사이 이동, 정확한 쪽 나눔, 데스크톱 패키징은 앞으로의 과제입니다. 더 자세한 우선순위와 인수 기준은 [구현 로드맵](docs/IMPLEMENTATION_ROADMAP.md)에 있습니다.

## 시작하기

Lineae는 정적 웹 애플리케이션입니다. 브라우저 편집기를 쓰는 데 애플리케이션 서버나 TeX 배포판은 필요 없지만, 파일은 로컬 HTTP 서버로 제공해야 합니다.

### 준비물

- Node.js와 npm
- 최신 브라우저
- Python 3 또는 다른 로컬 HTTP 서버

### 편집기 빌드

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

MathLive는 별도로 배포되는 브라우저 자산입니다. 로컬에서 준비합니다.

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

로컬 서버를 시작합니다.

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

이제 [http://localhost:8000](http://localhost:8000)을 열면 됩니다.

## 테스트

LaTeX, 설정, 호환성, UI 테스트를 실행합니다.

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

문헌 모듈 테스트를 실행합니다.

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

브라우저 회귀 테스트에는 위에서 준비한 MathLive 자산과 Playwright의 Chromium이 필요합니다.

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

GitHub Actions는 애플리케이션을 빌드하고 LaTeX·문헌 테스트를 실행하며, MathLive를 준비해 브라우저 회귀 테스트를 돌린 뒤 사이트를 GitHub Pages에 배포합니다.

## 데스크톱 미리보기

`apps/desktop`에는 Tauri 2로 만든 Windows x64 미리보기가 있습니다. 브라우저 편집기를 그대로 사용하고, 파일 열기·저장·다른 이름으로 저장을 위한 네이티브 대화상자를 더했으며, 프로젝트 내보내기는 기존 ZIP 처리를 그대로 씁니다. 빌드와 패키징은 GitHub Actions에서만 수행합니다. 산출물과 인수 절차는 [docs/desktop-preview.md](docs/desktop-preview.md)를 참고하세요. 컴파일, 파일 감시, 자동 업데이트는 이 미리보기의 범위가 아닙니다.

## 기여하기

Lineae는 아직 초기 단계라 내부 인터페이스가 바뀔 수 있습니다. 버그나 LaTeX 호환성 문제를 발견하면 최대한 작게 재현되는 <code>.tex</code> 예제를 함께 올려 주세요. 외부 기여 절차는 프로젝트가 성숙하면서 정리할 예정입니다. 자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

별도로 명시하지 않은 한 Lineae의 자체 소스 코드는 **GNU Affero General Public License version 3 only(AGPL-3.0-only)**로 배포됩니다. 전문은 [LICENSE](LICENSE)를 참고하세요.

서드파티 라이브러리와 자산에는 각자의 라이선스가 적용됩니다. 이 프로젝트의 라이선스가 그들의 저작권이나 라이선스 조건을 바꾸지는 않습니다.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
