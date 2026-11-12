[![Build](https://img.shields.io/github/actions/workflow/status/AminiamEva/Lineae/pages.yml?branch=main&style=flat-square&label=build)](https://github.com/AminiamEva/Lineae/actions/workflows/pages.yml)
[![Stars](https://img.shields.io/github/stars/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/stargazers)
[![Forks](https://img.shields.io/github/forks/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/forks)
[![Issues](https://img.shields.io/github/issues/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/issues)
[![Contributors](https://img.shields.io/github/contributors/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/graphs/contributors)
[![Last Commit](https://img.shields.io/github/last-commit/AminiamEva/Lineae?style=flat-square)](https://github.com/AminiamEva/Lineae/commits/main/)

<p align="center"><img src="apps/web/assets/brand/lineae-lockup.svg" alt="Lineæ" width="540"></p>

# Lineae

**Escreva com naturalidade. Componha com beleza.**

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.ru.md">Русский</a></p>

O Lineae é um **editor LaTeX WYSIWYG** experimental que roda no navegador e se destina à escrita acadêmica e técnica. O objetivo não é apenas tornar documentos LaTeX editáveis por uma interface gráfica: **o que aparece no editor deve chegar o mais perto possível do resultado de compilar o mesmo documento com um motor TeX.** LaTeX continua sendo o formato nativo, e o dia a dia gira em torno de arquivos <code>.tex</code> comuns.

O projeto ainda está no começo. O protótipo para navegador já permite editar o conteúdo e cobre uma parte crescente do LaTeX, mas ainda não reproduz com exatidão as quebras de linha, a paginação nem o layout final do PDF gerado pelo TeX. Fazer a tela de edição coincidir com o resultado compilado é a meta, **não um recurso já entregue**.

## Por que o Lineae existe

Conseguir mexer no documento diretamente não é o mesmo que compor em WYSIWYG. Um editor visual pode deixar você alterar fórmulas, tabelas e títulos enquanto mostra um layout bem diferente do que o TeX vai produzir no fim. O Lineae quer diminuir essa distância: a área de edição deve ser uma visão confiável do documento composto, não apenas uma representação prática da sua estrutura.

Os editores científicos que já existem fazem escolhas diferentes. O [LyX](https://www.lyx.org/) segue a abordagem WYSIWYM (*What You See Is What You Mean*, “o que você vê é o que você quer dizer”) e prioriza a estrutura do documento em vez da reprodução exata do layout final. O [GNU TeXmacs](https://www.texmacs.org/) oferece edição científica WYSIWYG com um sistema de composição próprio e um formato nativo, em vez de usar LaTeX como motor por baixo. O Lineae busca outra combinação: **arquivos LaTeX nativos, edição direta e uma renderização calibrada por compilações reais de TeX**.

Por isso a fidelidade tipográfica importa tanto quanto os controles de edição: fontes, espaçamento, notação matemática, quebra de linhas, geometria da página e, mais adiante, a paginação devem coincidir com o resultado compilado sempre que possível. Igualar pixel a pixel qualquer pacote ou macro personalizada não é uma promessa realista no curto prazo; divergências e construções não suportadas precisam continuar visíveis e inspecionáveis, em vez de escondidas.

O projeto segue quatro princípios:

- **Buscar WYSIWYG de verdade.** A qualidade da tela de edição é medida pela semelhança com a saída do TeX, não apenas pela possibilidade de editar algo com o mouse.
- **Manter o LaTeX como formato do documento.** O trabalho usa arquivos <code>.tex</code> comuns; o que não é suportado fica preservado, em vez de ser trocado por uma representação proprietária ou ter o sentido alterado em silêncio.
- **Separar renderização e compilação, mas conectar os resultados.** A renderização interativa precisa continuar fluida, enquanto um motor TeX real serve de referência para a saída final e, no futuro, para medir e melhorar a fidelidade visual. O Lineae não pretende reimplementar o TeX inteiro no navegador.
- **Deixar as limitações explícitas.** É melhor preservar o código-fonte com segurança e oferecer um caminho claro de volta ao original do que exibir prévias imprecisas ou conversões com perdas.

## Recursos

O protótipo atual cobre as estruturas do dia a dia para começar um documento técnico. O suporte é limitado de propósito à sintaxe que o editor reconhece e consegue tratar.

### Escrita e estrutura do documento

O editor é construído sobre Tiptap e ProseMirror. Ele suporta parágrafos, títulos de seção e formatação comum: negrito, itálico, sublinhado, tachado, família tipográfica, tamanho da fonte, cor, sobrescrito e subscrito. Listas numeradas, com marcadores e descritivas, citações em bloco, linhas horizontais e blocos de código também estão disponíveis.

Tabelas podem ser editadas no próprio documento, com suporte a estruturas <code>tabular</code> básicas, algumas especificações de coluna, colunas mescladas e linhas no estilo <code>booktabs</code>. O editor também reconhece alguns ambientes de teorema: teorema, lema, proposição, corolário, definição, observação e demonstração.

Numeração de seções, títulos com asterisco, títulos curtos, rótulos, referências cruzadas e sumário são suportados. Notas de rodapé e campos de título e autor no nível do documento também estão disponíveis. Um painel de localizar e substituir, menus de contexto, atalhos de teclado, desfazer e refazer acompanham o trabalho diário.

A visualização atual é um documento contínuo. Quebras de linha, espaçamento e paginação ainda não têm garantia de coincidir com a saída do TeX; reduzir essa diferença é um dos objetivos centrais do desenvolvimento.

### Edição matemática

O MathLive oferece fórmulas editáveis em linha e destacadas. As equações são editadas no lugar, sem abrir um painel de código separado. A implementação atual inclui entrada matemática comum, inserção de matrizes e operações de linha ou coluna, alguns ambientes AMS, autocompletar de comandos e navegação por teclado entre as fórmulas e o texto ao redor.

Isso é uma interface de edição, não um motor matemático TeX. O conjunto de comandos e ambientes que podem ser importados, exibidos e exportados é finito e continua sendo testado.

### Importação e exportação de LaTeX

O Lineae abre arquivos <code>.tex</code> em UTF-8 e alterna entre a edição visual e o modo de código-fonte. Comandos e ambientes reconhecidos são convertidos em nós estruturados do editor. Construções fora do subconjunto suportado são mantidas como blocos de código opacos sempre que possível, para continuarem disponíveis no modo fonte e não serem confundidas com texto comum.

Um documento importado e não modificado pode ser exportado com o código original intacto. Já uma seção suportada que passa por edição visual pode ser serializada de novo, alterando espaços, comentários, escolha de comandos ou outros detalhes do código. A ida e volta geral sem perdas depois de editar ainda não está implementada.

### Imagens, referências e arquivos

Imagens locais podem ser inseridas por um seletor de arquivos ou arrastadas para o documento. Dentro do subconjunto de figuras implementado, há suporte a legendas, largura da imagem, alinhamento, posicionamento e rótulos. Ao inserir uma citação, é possível ler um arquivo <code>.bib</code> local, e rótulos e referências cruzadas podem ser inseridos e resolvidos no documento.

O editor abre e salva arquivos pelas APIs de sistema de arquivos do navegador quando elas existem; se o navegador não tiver a interface de salvamento, o arquivo é baixado. <code>Ctrl+S</code> ou <code>Cmd+S</code> aciona o salvamento. A exportação de projeto gera um ZIP com o arquivo <code>.tex</code> ativo e os recursos locais já carregados pelo editor; ainda não é um gerenciador completo de projetos com vários arquivos.

### Módulo de bibliografia

O repositório também inclui um módulo BibTeX/BibLaTeX independente, separado da interface do editor. Sua API pública cobre análise, validação, edição de entradas, serialização, diagnósticos, varredura de citações em arquivos <code>.tex</code> e uma verificação antes da compilação.

O relatório de aceitação do módulo registra **182 testes automatizados aprovados** e **19 combinações reais de compilação bem-sucedidas** em fluxos BibTeX/Biber. Esses resultados valem para o módulo de bibliografia e seu escopo de teste; não devem ser lidos como compatibilidade completa com BibTeX/BibLaTeX nem como um aplicativo de gerenciamento bibliográfico pronto. Veja a [API do motor Bib](docs/bib-engine/API.md) e a [arquitetura](docs/bib-engine/ARCHITECTURE.md).

### Interface e preferências

O aplicativo oferece interface em chinês e inglês, temas claro e escuro, zoom do documento, uma faixa de opções e atalhos matemáticos configuráveis. As preferências de interface ficam armazenadas localmente em formato YAML.

## Arquitetura

O editor do navegador usa uma árvore de documentos do ProseMirror como modelo de edição ao vivo, com o Tiptap fornecendo a estrutura do editor. O MathLive cuida da entrada matemática interativa. Módulos LaTeX dedicados analisam e serializam as estruturas suportadas, enquanto o modo fonte dá acesso ao texto original e às construções não suportadas.

A fronteira é simples:

~~~text
Interface do navegador
       |
       v
Tiptap / ProseMirror  <---->  MathLive
       |
       v
Importação e exportação de LaTeX
       |
       +---- sintaxe reconhecida -> nós editáveis do documento
       |
       +---- sintaxe não suportada -> blocos de código preservados
       |
       v
     arquivos .tex

Motor BibTeX / BibLaTeX
       |
       +---- análise, validação, edição e serialização
       +---- verificação de citações no código .tex
~~~

O documento estruturado sustenta a edição interativa; o código <code>.tex</code> continua sendo o documento de referência, e um motor TeX segue como autoridade para a composição final. Separar a renderização interativa da compilação é uma decisão de implementação, **não** a de aceitar resultados visuais diferentes. Quando a compilação for integrada, sua saída servirá de referência para avaliar e melhorar as métricas de fonte na tela, a composição matemática, o espaçamento, as quebras de linha e, por fim, o layout de página. A representação fiel ao código e as atualizações locais no fonte também são metas de desenvolvimento; a implementação atual ainda pode regenerar estruturas editadas inteiras.

Os detalhes de implementação estão em [Arquitetura do editor](docs/EDITOR_ARCHITECTURE.md).

## Estado do desenvolvimento

O Lineae é um protótipo funcional, não um editor concluído. É importante separar o que já dá para usar do que ainda é plano.

| Área | Estado |
| --- | --- |
| Editor no navegador | Protótipo utilizável com edição de texto rico, equações, estruturas de documento e preferências |
| Interoperabilidade com LaTeX | Importação e exportação para um subconjunto definido; construções não suportadas são preservadas quando possível |
| Bibliografia | Módulo BibTeX/BibLaTeX independente, com API e testes de aceitação próprios |
| Fidelidade do código | Arquivos não modificados são preservados; atualizações locais confiáveis após edição visual ainda estão em desenvolvimento |
| Fidelidade visual entre editor e PDF | Objetivo central de projeto; a comparação sistemática com a saída compilada ainda não existe |
| Projetos com vários arquivos | Ainda sem um fluxo completo de projeto |
| Compilação TeX e prévia em PDF | Não integradas |
| Aplicativo para desktop e paginação precisa | Não implementados |

O trabalho imediato se concentra em três frentes: tornar a entrada de equações e a navegação mais confiáveis; melhorar a preservação do código, a troca de modo e o histórico de edição; e ajustar o comportamento da edição comum, incluindo seleção, área de transferência e navegação em documentos longos.

Com essas bases estáveis, o projeto poderá avançar para projetos com vários arquivos, uma interface independente de compilação TeX e a prévia em PDF. Comparar a tela de edição com a saída compilada e alinhar aos poucos fontes, espaçamento, quebras de linha e geometria da página é uma direção central, não um extra opcional de prévia. Navegação entre código e PDF, paginação exata e empacotamento para desktop continuam sendo trabalho futuro. O [roteiro de implementação](docs/IMPLEMENTATION_ROADMAP.md) registra prioridades e critérios de aceitação mais detalhados.

## Primeiros passos

O Lineae roda como aplicação web estática. Para usar o editor no navegador não é preciso servidor de aplicação nem distribuição TeX, mas os arquivos precisam ser servidos por um servidor HTTP local.

### Requisitos

- Node.js e npm
- Um navegador moderno
- Python 3 ou outro servidor HTTP local

### Compilar o editor

~~~bash
git clone https://github.com/AminiamEva/Lineae.git
cd Lineae
npm ci
npm run build
~~~

O MathLive é distribuído como um recurso separado para o navegador. Prepare-o localmente com:

~~~bash
archive="$(npm pack mathlive@0.108.0 --silent)"
mkdir -p apps/web/vendor/mathlive
tar -xzf "$archive" -C apps/web/vendor/mathlive --strip-components=1 package/mathlive.min.js package/fonts
rm "$archive"
~~~

Inicie um servidor local:

~~~bash
python3 -m http.server 8000 --directory apps/web
~~~

Depois abra [http://localhost:8000](http://localhost:8000).

## Testes

Execute os testes de LaTeX, configuração, compatibilidade e interface com:

~~~bash
node --test tests/latex.test.mjs tests/config.test.mjs tests/tex-compat-parse.test.mjs tests/ui/*.test.mjs
~~~

Execute os testes do módulo de bibliografia com:

~~~bash
node --test tests/bib/*.test.mjs tests/bib/*/*.test.mjs
~~~

A suíte de regressão no navegador exige os recursos do MathLive acima e o Chromium do Playwright:

~~~bash
npx playwright install chromium
node tests/editor.cjs
~~~

O fluxo do GitHub Actions compila o aplicativo, executa as suítes de LaTeX e bibliografia, prepara o MathLive, roda a regressão no navegador e publica o site no GitHub Pages.

## Prévia para desktop

Em `apps/desktop` há uma prévia para Windows x64 feita com Tauri 2. Ela reaproveita o editor do navegador, acrescenta diálogos nativos para abrir, salvar e salvar como, e exporta projetos pelo fluxo ZIP existente. A compilação e o empacotamento só rodam no GitHub Actions; consulte [docs/desktop-preview.md](docs/desktop-preview.md) para ver os artefatos e os passos de aceitação. Compilação, monitoramento de arquivos e atualizações automáticas ficam de fora do escopo desta prévia.

## Como contribuir

O Lineae ainda está no início, e as interfaces internas podem mudar. Se você encontrar um bug ou um problema de compatibilidade com LaTeX, uma issue com um exemplo <code>.tex</code> pequeno e reproduzível ajuda muito. O processo formal para contribuições externas será documentado conforme o projeto amadurecer; veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

Salvo indicação em contrário, o código-fonte original do Lineae é distribuído sob a **GNU Affero General Public License version 3 only (AGPL-3.0-only)**. O texto completo está em [LICENSE](LICENSE).

Bibliotecas e recursos de terceiros mantêm suas próprias licenças. A licença do projeto não substitui os direitos autorais nem os termos de licença deles.

# Contributors

<a href="https://github.com/AminiamEva/lineae/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AminiamEva/lineae" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

*Lineae — where writing meets typesetting.*
