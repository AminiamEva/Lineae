# TikZ 元件完整规格（判定/吸附点 + adjustment points + 目录归属）

> 本文档由参考工程 CircuiTikZ-Designer 的 symbols.svg 内嵌元数据 + 组件类源码生成，
> 作为逐件实现的**冻结规格**：生成后不再修改。实现顺序 = 本文档条目顺序。
> 吸附判定（snap）：放置/连线/拖动时参与网格与端点吸附的点。
> adjustment points：选中后可用鼠标拖动、改变元件几何样式的点。

## 类型规则（adjustment points 总表）

| 类型 | 吸附判定 | adjustment points |
|---|---|---|
| node | 锚点 | 无拖调点；旋转 90° 步进（R 键/按钮） |
| path | START/END 引脚 | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| open | START/END 引脚 | 开距：拖动远端引脚（两极间距） |
| Basic rect 图形 | 无（块图） | 宽/高角柄拖动 |
| wire | 顶点 | 顶点拖动（折线逐点） |
| text | 无 | 无（字号属性） |

## Basic（基础图形，硬编码组）

| 显示名 | tikz | 类型 | adjustment points |
|---|---|---|---|
| Short | short | wire | 顶点拖动 |
| Open | open | open | 开距 |
| Text | — | text | — |
| Rectangle | rectangle | rect | 宽/高角柄 |
| Ellipse | ellipse | rect | 宽/高角柄 |
| Trapezoid | trapezium, trapezium angle=60 | rect | 宽/高角柄 |
| Single arrow | single arrow | rect | 宽/高角柄 |
| Step | chamfered rectangle, chamfered rectangle xsep=8pt | rect | 宽/高角柄 |

## 符号库元件（按目录分组，共 402 件）


### Grounds and supply voltages

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Ground | ground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Ground (tailless) | tlground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Reference ground | rground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Signal ground | sground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Thicker tailless reference ground | tground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Noiseless ground | nground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Protective ground | pground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | Chassis ground | cground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | European style ground | eground | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | European style ground (v2) | eground2 | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 11 | VCC/VDD | vcc | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 12 | VEE/VSS | vee | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |

### Wiring

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Jumper-style crossing node | jump crossing | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Plain style crossing node | plain crossing | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Connected terminal | circ | node | 锚点 (2.38, 2.38)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Arrow for current and voltage | currarrow | node | 锚点 (2.58, 2.91)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Arrow that is anchored at its tip | inputarrow | node | 锚点 (5.58, 2.61)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Arrow the same size of currarrow but only filled | trarrow | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Arrow used for the flows | flowarrow | node | 锚点 (13.49, 2.91)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | Unconnected terminal | ocirc | node | 锚点 (2.38, 2.38)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | Diamond-square terminal | diamondpole | node | 锚点 (3.26, 3.26)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | Open diamond-square terminal | odiamondpole | node | 锚点 (3.26, 3.26)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 11 | Square-shape terminal | squarepole | node | 锚点 (2.38, 2.38)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 12 | Open square-shape terminal | osquarepole | node | 锚点 (2.38, 2.38)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 13 | BNC connector | bnc | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 14 | IEC 60617 connector | iecconnshape | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 15 | IEC 60617 female socket (left side) | iecsocketL | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 16 | IEC 60617 male plug (right side) | iecplugR | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 17 | IEC 60617 male plug (left side) | iecplugL | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 18 | IEC 60617 female socket (right side) | iecsocketR | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 19 | Single line multiple wires | multiwire | path | START(-5.29,NaN)；END(5.29,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Double line multiple wires | bmultiwire | path | START(-5.29,NaN)；END(5.29,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Triple line multiple wires | tmultiwire | path | START(-5.29,NaN)；END(5.29,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 22 | IEC 60617 connector (path) | iec connector | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Block diagram

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Mixer | mixer | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Adder | adder | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Oscillator | oscillator | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Circulator | circulator | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Wilkinson divider | wilkinson | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Resistive splitter | splitter | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Generic splitter | genericsplitter | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | Grid node | gridnode | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | Mach Zehnder Modulator | mzm | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | Generic fourport | fourport | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 11 | Coupler | coupler | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 12 | Coupler (rounded arrows) | coupler2 | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 13 | Generic two port | twoport | path | START(-18.52,NaN)；END(18.52,NaN)；w(-18.52,NaN)；e(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 14 | Generic two port split | twoportsplit | path | START(-18.52,NaN)；END(18.52,NaN)；left up(-18.52,-9.26)；left down(-18.52,9.26)；right up(18.52,-9.26)；right down(18.52,9.26) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 15 | VCO | vco | path | START(-18.52,NaN)；END(18.52,NaN)；START(-18.52,NaN)；END(18.52,NaN)；left up(-18.52,-9.26)；left down(-18.52,9.26)；right up(18.52,-9.26)；right down(18.52,9.26) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Bandpass | bandpass | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 17 | Bandstop | bandstop | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 18 | Highpass | highpass | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 19 | Lowpass | lowpass | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Allpass | allpass | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Variable allpass | vallpass | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 22 | Block generator | bgenerator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 23 | Crystal generator | qgenerator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 24 | Clock generator | cgenerator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 25 | Generic generator | ngenerator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 26 | Highpass (two waves) | highpass2 | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 27 | Lowpass (two waves) | lowpass2 | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 28 | A/D converter | adc | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 29 | D/A converter | dac | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 30 | DSP | dsp | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 31 | FFT | fft | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 32 | Amplifier | amp | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 33 | Instrumentation amplifier | iamp | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 34 | VGA | vamp | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 35 | PI attenuator | piattenuator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 36 | Var. PI attenuator | vpiattenuator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 37 | T attenuator | tattenuator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 38 | Var. T attenuator | vtattenuator | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 39 | Phase shifter | phaseshifter | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 40 | Var. phase shifter | vphaseshifter | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 41 | BIAS-T circuit as block | biast | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 42 | Sine lookup table | sinetable | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 43 | Register | register | path | START(-18.52,NaN)；END(18.52,NaN)；clk(-18.52,-9.26) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 44 | Detector | detector | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 45 | Saturation | saturation | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 46 | Sigmoid | sigmoid | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 47 | Comparison (all-or-nothing) | allornothing | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 48 | Optical fiber | fiber | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 49 | Single wire DC/DC converter | sdcdc | path | START(-18.52,NaN)；END(18.52,NaN)；dc up in(-18.52,-7.41)；dc up out(18.52,-7.41)；dc down in(-18.52,7.41)；dc down out(18.52,7.41) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 50 | Single phase AC/DC converter | sacdc | path | START(-18.52,NaN)；END(18.52,NaN)；ac up in(-18.52,-7.41)；dc up out(18.52,-7.41)；ac down in(-18.52,7.41)；dc down out(18.52,7.41) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 51 | Single phase DC/AC converter | sdcac | path | START(-18.52,NaN)；END(18.52,NaN)；dc up in(-18.52,-7.41)；ac up out(18.52,-7.41)；dc down in(-18.52,7.41)；ac down out(18.52,7.41) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 52 | Single phase AC/AC converter | sacac | path | START(-18.52,NaN)；END(18.52,NaN)；ac up in(-18.52,-7.41)；ac up out(18.52,-7.41)；ac down in(-18.52,7.41)；ac down out(18.52,7.41) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 53 | Three phases AC/DC converter | tacdc | path | START(-18.52,NaN)；END(18.52,NaN)；ac up in(-18.52,-11.11)；dc up out(18.52,-7.41)；ac down in(-18.52,11.11)；dc down out(18.52,7.41) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 54 | Three phases DC/AC converter | tdcac | path | START(-18.52,NaN)；END(18.52,NaN)；dc up in(-18.52,-7.41)；ac up out(18.52,-11.11)；dc down in(-18.52,7.41)；ac down out(18.52,11.11) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 55 | Three phases AC/AC converter | tacac | path | START(-18.52,NaN)；END(18.52,NaN)；ac up in(-18.52,-11.11)；ac up out(18.52,-11.11)；ac down in(-18.52,11.11)；ac down out(18.52,11.11) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 56 | Videocamera | camera | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 57 | Television (TV) | tvset | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 58 | Radio tranceiver (HAM-Radio) | trx | path | START(-26.46,NaN)；END(26.46,NaN)；plus(-26.46,-5.29)；minus(-26.46,5.29) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 59 | Standing Wave Ratio (SWR) meter | swr | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 60 | Power Supply | power | path | START(-26.46,NaN)；END(26.46,NaN)；u1(-26.46,-5.29)；u2(-26.46,5.29)；plus(19.84,-5.29)；minus(19.84,5.29) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Transistors

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | NPN | npn | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | PNP | pnp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | NIGBT | nigbt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | PIGBT | pigbt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | LNIGBT | Lnigbt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | LPIGBT | Lpigbt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | NMOS | nmos | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | PMOS | pmos | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | NMOS (depletion) | nmosd | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | PMOS (depletion) | pmosd | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 11 | HEMT | hemt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 12 | GaN HEMT | GaN hemt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 13 | NFET | nfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 14 | NFET (depletion) | nfetd | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 15 | NIGFET | nigfete | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 16 | NIGFET (bulk) | nigfetebulk | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 17 | NIGFET (depletion) | nigfetd | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 18 | PFET | pfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 19 | PFET (depletion) | pfetd | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 20 | PIGFET | pigfete | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 21 | PIGFET (bulk) | pigfetebulk | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 22 | PIGFET (depletion) | pigfetd | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 23 | n-type JFET | njfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 24 | p-type JFET | pjfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 25 | n-type UJT | nujt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 26 | p-type UJT | pujt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 27 | ISFET | isfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 28 | n-type graphene FET | ngfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 29 | p-type graphene FET | pgfet | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |

### Tubes

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Tube diode | diodetube | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Triode | triode | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Tetrode | tetrode | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Pentode | pentode | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Pentode with suppressor grid connected to cathode | pentode suppressor to cathode | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Magnetron | magnetron | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Dynode | dynode | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |

### RF components

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Bare Antenna | bareantenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | DIN Antenna | dinantenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Bare TX Antenna | bareTXantenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Bare RX Antenna | bareRXantenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Waves | waves | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Harmonics | harmonics | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Microstrip linear stub | mslstub | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | Microstrip port | msport | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | Microstrip radial stub | msrstub | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | Legacy antenna (with tails) | antenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 11 | Legacy receiving antenna (with tails) | rxantenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 12 | Legacy transmitting antenna (with tails) | txantenna | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 13 | Transmission line stub | tlinestub | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 14 | Match | match | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 15 | Microstrip transmission line | mstline | path | START(-31.75,NaN)；END(31.75,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Transmission line | tline | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Inductors

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Transformer | transformer | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Transformer core | transformer core | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Gyrator | gyrator | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Inductor (cute) | cute inductor | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Variable inductor (cute) | variable cute inductor | path | START(-15.87,NaN)；END(15.87,NaN)；wiper(-6.35,7.94) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Inductive sensor (cute) | cute inductive sensor | path | START(-15.87,NaN)；END(15.87,NaN)；wiper(-25.40,10.32)；label(-12.70,10.32) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | Inductor (american) | american inductor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | Variable inductor (american) | variable american inductor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-8.47,5.29) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 9 | Inductive sensor (american) | american inductive sensor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-33.86,6.88)；label(-16.93,6.88) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Inductor (european) | european inductor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Variable inductor (european) | variable european inductor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-10.58,18.52) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Inductive sensor (european) | european inductive sensor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-21.17,15.87)；label(-8.47,15.87) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Choke | cute choke | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Miscellaneous

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Generic double bipole (configure in TikZ) | double bipole | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Thermocouple | thermocouple | path | START(-3.70,NaN)；END(3.70,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Fuse | fuse | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Fuse (asymetric) | afuse | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Fuse (wiggly) | wfuse | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Relais | relais | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | Squid | squid | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | Barrier | barrier | path | 无 | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 9 | Open barrier | openbarrier | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Gas filled surge arrester (european) | european gas filled surge arrester | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Gas filled surge arrester (american) | american gas filled surge arrester | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Lamp | lamp | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Bulb | bulb | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 14 | Neon lamp (double cathode style), | neonlampcc | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 15 | Neon lamp (anode and cathode style) | neonlampac | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Spark gap (unenclosed) | sparkgap | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 17 | Loudspeaker | loudspeaker | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 18 | Microphone | mic | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 19 | Microphone (tailless) | tlmic | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Buzzer | buzzer | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Buzzer (reversed) | rbuzzer | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Amplifiers

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Operational amplifier | op amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Operational amplifier compliant to DIN/EN 60617 | en amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Fully differential operational amplifier | fd op amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Transconductance amplifier | gm amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Plain instrumentation amplifier | inst amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Fully differential instrumentation amplifier | fd inst amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Instrumentation amplifier with amplification resistance terminals | inst amp ra | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | Plain amplifier (two inputs) | plain amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | Plain amplifier (one inputs) | plain mono amp | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | Buffer | buffer | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |

### Switches, buttons and jumpers

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | SPDT | spdt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Cute SPDT up | cute spdt up | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Cute SPDT mid | cute spdt mid | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Cute SPDT down | cute spdt down | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Cute SPDT up with arrow | cute spdt up arrow | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | Cute SPDT mid with arrow | cute spdt mid arrow | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Cute SPDT down with arrow | cute spdt down arrow | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | Proximeter | proximeter | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | Switch | switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Closing switch | closing switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Opening switch | opening switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Normally open switch | normal open switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Normally closed switch | normal closed switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 14 | Opening normally closed switch | opening normal closed switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 15 | Closing normally closed switch | closing normal closed switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Opening normally open switch | opening normal open switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 17 | Closing normally open switch | closing normal open switch | path | START(-9.26,NaN)；END(9.26,NaN)；left(-9.26,NaN)；right(9.26,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 18 | Normally open push button | push button | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 19 | Normally closed push button | normally closed push button | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Normally open push button (in closed position) | normally open push button closed | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Normally closed push button (in open position) | normally closed push button open | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 22 | Toggle switch | toggle switch | path | START(-21.17,NaN)；END(21.17,NaN)；in(-21.17,NaN)；out 1(21.17,NaN)；out 2(21.17,-16.93) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 23 | Reed switch | reed | path | START(-21.17,NaN)；END(21.17,NaN)；left(-21.17,NaN)；right(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 24 | Cute closed switch | cute closed switch | path | START(-13.23,NaN)；END(13.23,NaN)；in(-15.34,NaN)；out(15.34,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 25 | Cute open switch | cute open switch | path | START(-13.23,NaN)；END(13.23,NaN)；in(-15.34,NaN)；out(15.34,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 26 | Cute closing switch | cute closing switch | path | START(-13.23,NaN)；END(13.23,NaN)；in(-15.34,NaN)；out(15.34,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 27 | Cute opening switch | cute opening switch | path | START(-13.23,NaN)；END(13.23,NaN)；in(-15.34,NaN)；out(15.34,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 28 | Proximeter inline | inline proximeter | path | START(-15.87,NaN)；END(15.87,NaN)；hlines nw(-11.11,-4.76)；hlines sw(-11.11,4.76)；hlines ne(11.11,-4.76)；hlines se(11.11,4.76) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 29 | Bare jumper | bare jumper | path | START(-10.58,NaN)；END(10.58,NaN)；in(-12.70,NaN)；out(12.70,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 30 | Open jumper | open jumper | path | START(-10.58,NaN)；END(10.58,NaN)；in(-12.70,NaN)；out(12.70,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 31 | Closed jumper | closed jumper | path | START(-10.58,NaN)；END(10.58,NaN)；left(-10.58,NaN)；right(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 32 | Open solder jumper | open solder jumper | path | START(-9.52,NaN)；END(9.52,NaN)；in(-9.52,NaN)；out(9.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 33 | Closed solder jumper | closed solder jumper | path | START(-9.52,NaN)；END(9.52,NaN)；left(-9.52,NaN)；right(9.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 34 | Open double solder jumper | open double solder jumper | path | START(-15.08,NaN)；END(15.08,NaN)；in(-15.08,NaN)；out(15.08,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 35 | Left double solder jumper | left double solder jumper | path | START(-15.08,NaN)；END(15.08,NaN)；left(-15.08,NaN)；right(15.08,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 36 | Right double solder jumper | right double solder jumper | path | START(-15.08,NaN)；END(15.08,NaN)；left(-15.08,NaN)；right(15.08,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 37 | Closed double solder jumper | closed double solder jumper | path | START(-15.08,NaN)；END(15.08,NaN)；left(-15.08,NaN)；right(15.08,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Logic gates

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | AND gate (american) | american and port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | OR gate (american) | american or port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | NAND gate (american) | american nand port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | NOR gate (american) | american nor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | XOR gate (american) | american xor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 6 | XNOR gate (american) | american xnor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 7 | Buffer port (american) | american buffer port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 8 | NOT gate (american) | american not port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 9 | AND gate (IEEE) | ieeestd and port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 10 | OR gate (IEEE) | ieeestd or port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 11 | NAND gate (IEEE) | ieeestd nand port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 12 | NOR gate (IEEE) | ieeestd nor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 13 | XOR gate (IEEE) | ieeestd xor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 14 | XNOR gate (IEEE) | ieeestd xnor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 15 | Buffer port (IEEE) | ieeestd buffer port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 16 | NOT gate (IEEE) | ieeestd not port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 17 | Transmission gate (IEEE) | ieee tgate | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 18 | Double Transmission gate (IEEE) | ieee double tgate | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 19 | Inverting dot for IEEE ports | notcirc | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 20 | Schmitt symbol for input pins | schmitt symbol | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 21 | AND gate (european) | european and port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 22 | OR gate (european) | european or port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 23 | NAND gate (european) | european nand port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 24 | NOR gate (european) | european nor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 25 | XOR gate (european) | european xor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 26 | XNOR gate (european) | european xnor port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 27 | Buffer port (european) | european buffer port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 28 | NOT gate (european) | european not port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 29 | Blank port (european) | european blank port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 30 | Blank not port (european) | european blank not port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 31 | Non-Inverting Schmitt trigger | schmitt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 32 | Inverting Schmitt trigger | invschmitt | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 33 | Non-Inverting Schmitt trigger (IEEE) | ieeestd schmitt port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 34 | Inverting Schmitt trigger (IEEE) | ieeestd invschmitt port | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |

### Flipflops

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | D-type latch | latch | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 2 | Flip-flop SR | flipflop SR | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 3 | Edge-triggered synchronous flip-flop D | flipflop D | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 4 | Edge-triggered synchronous flip-flop T | flipflop T | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |
| 5 | Edge-triggered synchronous flip-flop JK | flipflop JK | node | 锚点 (0.00, 0.00)（元件连接点） | 无拖调点；旋转 90° 步进（R 键/按钮） |

### Resistive bipoles

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Generic (symmetric) bipole | generic | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 2 | Crossed generic (symmetric) bipole | xgeneric | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Slashed generic bipole | sgeneric | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Tunable generic bipole | tgeneric | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Generic asymmetric bipole | ageneric | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Memristor | memristor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | Resistor (american) | american resistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | Variable resistor (american) | variable american resistor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-8.47,15.87) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 9 | Potentiometer (american) | american potentiometer | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Resistive sensor (american) | american resistive sensor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-19.05,15.87)；label(-8.47,15.87) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Ligth-Dependent resistor (american) | american light dependent resistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Resistor (european) | european resistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Variable resistor (european) | variable european resistor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-10.58,18.52) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 14 | Potentiometer (european) | european potentiometer | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 15 | Resistive sensor (european) | european resistive sensor | path | START(-21.17,NaN)；END(21.17,NaN)；wiper(-21.17,13.59)；label(-8.47,13.59) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Ligth-Dependent resistor (european) | european light dependent resistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 17 | Varistor | varistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 18 | Metal-Oxide varistor | mov | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 19 | Photoresistor | photoresistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Thermistor | thermistor | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Thermistor (PTC) | thermistor ptc | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 22 | Thermistor (NTC) | thermistor ntc | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Capacitive and dynamic bipoles

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Capacitor | capacitor | path | START(-5.29,NaN)；END(5.29,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 2 | Curved (polarized) capacitor | curved capacitor | path | START(-5.29,NaN)；END(5.29,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Electrolytic capacitor | ecapacitor | path | START(-5.29,NaN)；END(5.29,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Variable capacitor | variable capacitor | path | START(-5.29,NaN)；END(5.29,NaN)；wiper(-15.87,15.87) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Capacitive sensor | capacitive sensor | path | START(-5.29,NaN)；END(5.29,NaN)；wiper(-23.28,19.05)；label(-13.76,19.05) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Piezoelectric element | piezoelectric | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | Constant phase element | cpe | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | Ferroelectric capacitor | ferrocap | path | START(-5.29,NaN)；END(5.29,NaN)；curve left(-9.52,-15.87)；curve right(9.52,15.87)；kink left(-9.52,-7.94)；kink right(9.52,7.94) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Diodes

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Empty diode | empty diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 2 | Empty Schottky diode | empty Schottky diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Empty Zener diode | empty Zener diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Empty ZZener diode | empty ZZener diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Empty tunnel diode | empty tunnel diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Empty photodiode | empty photodiode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | Empty LED | empty led | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | Empty laser diode | empty laser diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 9 | Empty varcap | empty varcap | path | START(-11.91,NaN)；END(11.91,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Empty TVS diode | empty TVS diode | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Empty Shockley diode | empty Shockley diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Empty bidirectional diode | empty bidirectionaldiode | path | START(-26.46,NaN)；END(26.46,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Full diode | full diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 14 | Full Schottky diode | full Schottky diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 15 | Full Zener diode | full Zener diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Full ZZener diode | full ZZener diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 17 | Full tunnel diode | full tunnel diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 18 | Full photodiode | full photodiode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 19 | Full LED | full led | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Full laser diode | full laser diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Full varcap | full varcap | path | START(-11.91,NaN)；END(11.91,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 22 | Full TVS diode | full TVS diode | path | START(-21.17,NaN)；END(21.17,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 23 | Full Shockley diode | full Shockley diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 24 | Full bidirectional diode | full bidirectionaldiode | path | START(-26.46,NaN)；END(26.46,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 25 | Stroke diode | stroke diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 26 | Stroke Schottky diode | stroke Schottky diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 27 | Stroke Zener diode | stroke Zener diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 28 | Stroke ZZener diode | stroke ZZener diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 29 | Stroke tunnel diode | stroke tunnel diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 30 | Stroke photodiode | stroke photodiode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 31 | Stroke LED | stroke led | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 32 | Stroke laser diode | stroke laser diode | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 33 | Stroke varcap | stroke varcap | path | START(-11.91,NaN)；END(11.91,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 34 | Empty triac | empty triac | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 35 | Empty thyristor | empty thyristor | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 36 | Empty PUT | empty put | path | START(-26.46,NaN)；END(26.46,NaN)；gate(-26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 37 | Empty GTO | empty gto | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 38 | Empty GTO (bar-type) | empty gtobar | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 39 | Empty GTO (bar-type on anode) | empty agtobar | path | START(-26.46,NaN)；END(26.46,NaN)；gate(-26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 40 | Full triac | full triac | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 41 | Full thyristor | full thyristor | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 42 | Full PUT | full put | path | START(-26.46,NaN)；END(26.46,NaN)；gate(-26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 43 | Full GTO | full gto | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 44 | Full GTO (bar-type) | full gtobar | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 45 | Full GTO  (bar-type on anode) | full agtobar | path | START(-26.46,NaN)；END(26.46,NaN)；gate(-26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 46 | Stroke triac | stroke triac | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 47 | Stroke thyristor | stroke thyristor | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 48 | Stroke PUT | stroke put | path | START(-26.46,NaN)；END(26.46,NaN)；gate(-26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 49 | Stroke GTO | stroke gto | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 50 | Stroke GTO (bar-type) | stroke gtobar | path | START(-26.46,NaN)；END(26.46,NaN)；gate(26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 51 | Stroke GTO  (bar-type on anode) | stroke agtobar | path | START(-26.46,NaN)；END(26.46,NaN)；gate(-26.46,-29.10) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Sources and generators

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Battery | battery | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 2 | Battery (single cell) | battery1 | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Battery (single cell) | battery2 | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Solar-driven battery | solar | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Randall Munroe's baertty | baertty | path | START(-7.94,NaN)；END(7.94,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Voltage source (european) | european voltage source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | Current source (european) | european current source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | Voltage source (cute) | cute european voltage source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 9 | Current source (cute) | cute european current source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Voltage source (american) | american voltage source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Current source (american) | american current source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Sinusoidal voltage source | sinusoidal voltage source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Sinusoidal current source | sinusoidal current source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 14 | Controlled voltage source (european) | european controlled voltage source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 15 | Controlled current source (european) | european controlled current source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 16 | Controlled voltage source (cute) | cute european controlled voltage source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 17 | Controlled current source (cute) | cute european controlled current source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 18 | Controlled voltage source (american) | american controlled voltage source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 19 | Controlled current source (american) | american controlled current source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 20 | Empty controlled source | empty controlled source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 21 | Controlled sinusoidal voltage source | controlled sinusoidal voltage source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 22 | Controlled sinusoidal current source (european) | controlled sinusoidal current source | path | START(-18.52,NaN)；END(18.52,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 23 | Noise voltage source | noise voltage source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 24 | Noise current source | noise current source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 25 | Square voltage source | square voltage source | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 26 | Triangle voltage source | vsourcetri | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 27 | Empty voltage source | esource | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 28 | Photovoltaic-voltage source | pvsource | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 29 | Photovoltaic module source | pvmodule | path | START(-31.75,NaN)；END(31.75,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 30 | Double Zero style current source | ioosource | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 31 | Double Zero style voltage source | voosource | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 32 | Auto-transformer source | oosourcetrans | path | START(-15.87,NaN)；END(15.87,NaN)；START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 33 | Transformer with three windings | ooosource | path | START(-14.92,NaN)；END(14.92,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 34 | Nullator | nullator | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 35 | Norator | norator | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 36 | DC voltage source | dcvsource | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 37 | DC current source | dcisource | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Instruments

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Ampere meter | ammeter | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 2 | Volt meter | voltmeter | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Ohm meter | ohmmeter | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Generic round meter | rmeter | path | START(-15.87,NaN)；END(15.87,NaN)；START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Generic round meter with arrow | rmeterwa | path | START(-15.87,NaN)；END(15.87,NaN)；START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 6 | Generic square meter | smeter | path | START(-15.87,NaN)；END(15.87,NaN)；in 1(-6.35,11.91)；in 2(6.35,11.91)；START(-15.87,NaN)；END(15.87,NaN)；in 1(-6.35,11.91)；in 2(6.35,11.91) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 7 | QUCS-style current probe | qiprobe | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 8 | QUCS-style voltage probe | qvprobe | path | START(-15.87,NaN)；END(15.87,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 9 | QUCS-style power probe | qpprobe | path | START(-15.87,NaN)；END(15.87,NaN)；v+(-9.52,10.58)；v-(9.52,10.58) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 10 | Oscilloscope | oscope | path | START(-15.87,NaN)；END(15.87,NaN)；in 1(-6.35,11.91)；in 2(6.35,11.91)；START(-15.87,NaN)；END(15.87,NaN)；in 1(-6.35,11.91)；in 2(6.35,11.91) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 11 | Current loop (symbolic) | iloop | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 12 | Current loop (real) | iloop2 | path | START(-10.58,NaN)；END(10.58,NaN)；i+(-1.10,-15.87)；i-(1.10,-15.87) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 13 | Current tap (probe) | currtap | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |

### Mechanical

| # | 显示名 | tikz | 类型 | 吸附判定（snap points） | adjustment points |
|---|---|---|---|---|---|
| 1 | Mechanical damping | damper | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 2 | Mechanical inerter | inerter | path | START(-4.63,NaN)；END(4.63,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 3 | Mechanical stiffness | spring | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 4 | Mechanical viscoelastic element | viscoe | path | START(-10.58,NaN)；END(10.58,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
| 5 | Mechanical mass | mass | path | START(-13.23,NaN)；END(13.23,NaN) | 主体长度：拖动远端引脚（引脚间距实时拉伸图稿） |
