# 命令覆盖核对（只读审计）

- 范围：`apps/web/latex/command-catalog.mjs` 中的 **82 条**命令元数据。
- 不包含：`apps/web/latex/math-symbols.mjs` 的扩展符号表（另一份列表，本次不逐项审计）。
- 不新增命令、不修改解析器或包管理器；本文只核对现状。
- 行号/文件基于本次审计；命令目录的元数据测试为 `tests/command-catalog.test.mjs`（2 个测试通过）。
- 解析验证：用 `importBlocks('$\\name$')` 逐条检查，**82/82** 返回 math 节点且 `latex` 与 `'\\' + name` 一致；因此 P 列可写“已验证”，但这只证明“数学源码被当作 math 保留”，不等于 AST 级语义解析。

## 状态图例（务必区分）

| 代码 | 含义 | 本次证据 |
|---|---|---|
| C | 目录存在 | `command-catalog.mjs` 中有该条元数据 |
| P | 可解析 | 82/82 用 `importBlocks` 验证；数学源码原样保留，不是 AST 解析 |
| R? | 可渲染 = **未知** | MathLive 命令文档列出（M），但没有逐条做浏览器渲染实测 |
| E? | 可编辑 = **未知** | 没有逐条做 MathLive 编辑实测 |
| 是 | 仅用于 C/P 的明确结论 | 不把 R?/E? 写成“是” |
| — | 不适用/无 | 例如包依赖为空 |

- `R?` 与 `E?` 是未知，不是通过；不能据此宣称“TeX 兼容”。
- 出处代码：`M` = MathLive 命令参考；`A` = CTAN amsfonts/amssymb；`K` = LaTeX2e 标准命令（本次未逐条重新查证，仅用于“标准拼写”判断）。
- `packages.mjs` 的自动包解析不同于目录的 `packages` 元数据：导出时按正文特征追加 `ulem/amsmath/xcolor/booktabs/enumitem/zhnumber/graphicx/hyperref/fix-cm`；目录里只有 `varnothing → amssymb`。

## 权威出处（本次实际查阅）

- MathLive LaTeX commands：<https://mathlive.io/mathfield/reference/commands/>
- CTAN AMS fonts：<https://ctan.org/pkg/amsfonts>
- CTAN amssymb 单独页面：<https://ctan.org/pkg/amssymb>（404；`amssymb.sty` 随 `amsfonts` 套件分发）
- LaTeX2e 标准命令：本文以 `K` 标注“标准拼写”，未逐条重新抓取官方文档；如需逐条官方出处，应补 `source2e`/LaTeX2e 参考手册。

## 关系符号（10）

| 命令 | 参数 | 包 | 出处 | C | P | R | E | 备注 |
|---|---|---|---|---|---|---|---|---|
| `\leq` | 无 | — | M / K | C | P | R? | E? | — |
| `\geq` | 无 | — | M / K | C | P | R? | E? | — |
| `\neq` | 无 | — | M / K | C | P | R? | E? | — |
| `\approx` | 无 | — | M / K | C | P | R? | E? | — |
| `\equiv` | 无 | — | M / K | C | P | R? | E? | — |
| `\sim` | 无 | — | M / K | C | P | R? | E? | — |
| `\simeq` | 无 | — | M / K | C | P | R? | E? | — |
| `\propto` | 无 | — | M / K | C | P | R? | E? | — |
| `\ll` | 无 | — | M / K | C | P | R? | E? | — |
| `\gg` | 无 | — | M / K | C | P | R? | E? | — |

## 集合符号（12）

| 命令 | 参数 | 包 | 出处 | C | P | R | E | 备注 |
|---|---|---|---|---|---|---|---|---|
| `\in` | 无 | — | M / K | C | P | R? | E? | — |
| `\notin` | 无 | — | M / K | C | P | R? | E? | — |
| `\ni` | 无 | — | M / K | C | P | R? | E? | 别名：`\ni = \owns`（反向属于） |
| `\subset` | 无 | — | M / K | C | P | R? | E? | — |
| `\supset` | 无 | — | M / K | C | P | R? | E? | — |
| `\subseteq` | 无 | — | M / K | C | P | R? | E? | — |
| `\supseteq` | 无 | — | M / K | C | P | R? | E? | — |
| `\cup` | 无 | — | M / K | C | P | R? | E? | — |
| `\cap` | 无 | — | M / K | C | P | R? | E? | — |
| `\setminus` | 无 | — | M / K | C | P | R? | E? | 标准集合差 |
| `\emptyset` | 无 | — | M / K | C | P | R? | E? | — |
| `\varnothing` | 无 | `amssymb` | A / M | C | P | R? | E? | `amssymb` 提供；MathLive 文档列出 |

## 箭头（10）

| 命令 | 参数 | 包 | 出处 | C | P | R | E | 备注 |
|---|---|---|---|---|---|---|---|---|
| `\to` | 无 | — | M / K | C | P | R? | E? | 别名：`\to = \rightarrow` |
| `\leftarrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\rightarrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\leftrightarrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\Leftarrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\Rightarrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\Leftrightarrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\mapsto` | 无 | — | M / K | C | P | R? | E? | — |
| `\uparrow` | 无 | — | M / K | C | P | R? | E? | — |
| `\downarrow` | 无 | — | M / K | C | P | R? | E? | — |

## 运算符（19）

| 命令 | 参数 | 包 | 出处 | C | P | R | E | 备注 |
|---|---|---|---|---|---|---|---|---|
| `\sin` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\cos` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\tan` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\cot` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\sec` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\csc` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\sinh` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\cosh` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\tanh` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\log` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\ln` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\exp` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\lim` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\sup` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\inf` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\max` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\min` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\det` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |
| `\gcd` | 无（运算符） | — | M / K | C | P | R? | E? | 标准数学运算符；可接表达式/上下限 |

## 希腊字母（31）

| 命令 | 参数 | 包 | 出处 | C | P | R | E | 备注 |
|---|---|---|---|---|---|---|---|---|
| `\alpha` | 无 | — | M / K | C | P | R? | E? | — |
| `\beta` | 无 | — | M / K | C | P | R? | E? | — |
| `\gamma` | 无 | — | M / K | C | P | R? | E? | — |
| `\delta` | 无 | — | M / K | C | P | R? | E? | — |
| `\epsilon` | 无 | — | M / K | C | P | R? | E? | — |
| `\varepsilon` | 无 | — | M / K | C | P | R? | E? | — |
| `\theta` | 无 | — | M / K | C | P | R? | E? | — |
| `\vartheta` | 无 | — | M / K | C | P | R? | E? | — |
| `\lambda` | 无 | — | M / K | C | P | R? | E? | — |
| `\mu` | 无 | — | M / K | C | P | R? | E? | — |
| `\nu` | 无 | — | M / K | C | P | R? | E? | — |
| `\xi` | 无 | — | M / K | C | P | R? | E? | — |
| `\pi` | 无 | — | M / K | C | P | R? | E? | — |
| `\rho` | 无 | — | M / K | C | P | R? | E? | — |
| `\sigma` | 无 | — | M / K | C | P | R? | E? | — |
| `\tau` | 无 | — | M / K | C | P | R? | E? | — |
| `\phi` | 无 | — | M / K | C | P | R? | E? | — |
| `\varphi` | 无 | — | M / K | C | P | R? | E? | — |
| `\chi` | 无 | — | M / K | C | P | R? | E? | — |
| `\psi` | 无 | — | M / K | C | P | R? | E? | — |
| `\omega` | 无 | — | M / K | C | P | R? | E? | — |
| `\Gamma` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Delta` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Theta` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Lambda` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Xi` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Pi` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Sigma` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Phi` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Psi` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |
| `\Omega` | 无 | — | M / K | C | P | R? | E? | 标准大写希腊字母 |

## 结论与边界

- **目录存在**：82/82（C）。
- **可解析**：82/82 的数学源码被保留为 math 节点（P，已用 `importBlocks` 验证）。
- **可渲染**：全部为未知（R?）；仅能说 MathLive 文档列出了这些命令，不能说我方逐条验证过浏览器渲染。
- **可编辑**：全部为未知（E?）；未逐条验证 MathLive 的编辑/占位/选区行为。
- 已知依赖例外：`varnothing` 需要 `amssymb`；`to`、`ni` 是别名；`sin/cos/.../gcd` 是运算符而非带固定参数的宏。
- 未覆盖：`math-symbols.mjs`、宏/自定义命令、`unified-latex` 等 AST 级解析、逐条 MathLive 渲染/编辑回归。

## 建议的后续验收

1. 为 R/E 两列建立浏览器自动化：每条命令插入 MathLive，检查无错误、生成可见字形、可进入/退出编辑；未实际跑过的仍保持未知。
2. 用 `unified-latex` 或等价 AST 解析器补齐“可解析”的语义层，而不是只看源码保留。
3. 把目录的 `packages` 与 `packages.mjs` 的导出规则统一核对，避免“目录说无包、导出却需要包”的偏差。
4. 逐条补官方出处（LaTeX2e/AMS/MathLive），不要用推测替代。
