# Windows / macOS 快捷键

默认值位于 `apps/web/config.yaml`。本次按
`lineae-shortcuts-macos-2026-11-20.json` 应用：

- `keep` 使用导出的 `requestedBindings`，不是可能残留的输入框内容。
- `custom` 应用填写的快捷键。
- `none` 禁用对应命令；不会因为输入框还有 `meta+m` 就启用。
- `pending` 保留现状，不替用户作决定。

`docs/shortcut-planner.html` 是收集此方案时的历史快照，不随当前默认值变化。

## YAML

```yaml
keybindings:
  global:
    save: [mod+s, ctrl+s]
  editor:
    insertDisplayMath: mod+f
    insertInlineMath: mod+shift+f
    dollar: '$'
    toggleItalic: null
  math:
    nextSlot: tab
    previousSlot: shift+tab
    palette: backslash
  source:
    find: mod+f
    indent: tab
    outdent: shift+tab
  system:
    copy: mod+c
    cut: mod+x
    paste: mod+v
    selectAll: mod+a
```

- `mod`：macOS 为 Command，Windows 为 Ctrl。方案中的 `meta` 默认转为 `mod`，
  明确填写的 `ctrl` 别名仍在 Mac 保留；Windows 上同一命令的重复别名会自动合并。
- `meta` / `cmd`：明确指定 Command / Meta，不做平台转换。
- `alt` / `option`：Option / Alt；`ctrl`：Control；`shift`：Shift。
- 大写字母表示 Shift + 对应小写字母；例如 `mod+e L` 与 `mod+e shift+l` 等价。
- 第一段、第二段均可使用普通键；组合键中的反斜杠可写 `backslash`，逗号可写 `comma`。
- 两段连按用空格分隔，多个候选键用 YAML 列表，`null` 禁用。
- 支持保持第一段修饰键后再按第二段；例如按住 Command 输入 E，再按 Shift+C。
- 同一作用域的重复键和单键 / 两段前缀冲突会拒绝导入，原配置不会被破坏。

已有用户 YAML 覆盖项继续生效；新默认值不会覆盖用户保存的自定义设置。
如要切换到全部新默认值，可先备份旧配置，再导入仓库的完整 `apps/web/config.yaml`。

## 本次新增的入口

| 配置项 | 功能 |
| --- | --- |
| `global.open` / `global.saveAs` | 打开文档 / 另存为 |
| `global.newProject` / `global.openProject` | 新建 / 打开工程 |
| `global.toggleFiles` | 显示 / 折叠工程侧栏 |
| `global.documentMode` / `sourceMode` / `splitMode` | 切换编辑模式 |
| `global.settings` / `toggleRibbon` / `formattingMarks` | 设置 / 工具栏 / 格式标记 |
| `editor.insertInlineMath` / `insertEquation` / `insertCases` | 行内 / 编号 / 分段公式 |
| `editor.toggleSuperscript` / `toggleSubscript` | 正文上下标 |
| `editor.codeLanguage` / `insertTable` / `openTikz` | 代码语言 / 表格 / TikZ |
| `table.deleteRow` / `deleteColumn` | 删除当前表格行 / 列 |

表中明确选择“不绑定”且原本没有快捷键的工具栏功能，仍保留工具栏入口，不新增快捷键。
`editor.toggleUnderline` 也作为未绑定命令保留，方便以后配置。

## 原内建操作

配置表中列出的全部 19 项内建操作现已接入 YAML：

- `editor.dollar`：正文 `$` 输入规则。设为 `null` 后输入 `$` 是普通字符；
  改为组合键也可以插入公式。公式内 `$` 的退出行为不属于这个正文输入规则。
- `math.palette`、`nextSlot`、`previousSlot`、`enterLine`、`eraseObject`：
  命令补全、占位导航、显示公式换行、逐字符删除及结构块两次删除。
  `nextSlot` 在刚插入箭头后仍优先旋转箭头。
  默认 Backspace / Delete 只删除当前方向的单个字符；遇到分式、根式、矩阵、
  积分主体等结构边界时，先选中当前结构，再按一次才删除，不扩大到外层公式。
  左右箭头逐字符进入结构和数学字体文本，不跳过整段内容。
- `source.find`、`replace`、`undo`、`redo`、`zoomIn`、`zoomOut`、`zoomReset`、
  `indent`、`complete`：源码编辑器的相应操作，另增加 `source.outdent`。
  缩进命令仍优先接受当前补全 / 导航片段占位，然后才缩进。
- `system.copy`、`cut`、`paste`、`selectAll`：在正文、源码、公式编辑区内配置；
  标准复制 / 剪切 / 粘贴键保留原生剪贴板流程，自定义别名走已有剪贴板实现。
  不是编辑区的设置输入框等控件不受禁用影响。

重映射后，原生默认键不会偷偷继续执行相同命令。`null` 禁用应用命令，
不等于禁用整个操作系统的按键：例如禁用 `math.eraseObject` 会关闭应用提供的
精确删除及结构确认策略，Backspace / Delete 仍由 MathLive 原生删除处理。

## 作用域及备注

- 公式动作优先于全局动作，所以公式里的 Command+Shift+S 是求和，而不是另存为。
- 正文 / 公式 / 源码的查找、历史、缩放有各自作用域；源码不会因全局查找键被改而创建公式。
- 普通单元格复用正文对齐键时设置单元格对齐；整张表格被选中时仍设置表格对齐。
- 文件树、引用文件导航和标题大纲是同一侧栏的不同分区。
  引用导航的未决定项不新增绑定，大纲按“不绑定”处理。
- 列表标记切换继续使用 `editor.toggleContextMarker`。
  “整行选择下 Tab / Shift+Tab”“`---`+回车”等备注不作为组合键绑定；
  对于明确选择“不绑定”的条目，没有据备注擅自新增键位或更改结构输入规则。

## 平台限制与验证

浏览器 / 操作系统可能优先占用 Command+P、Command+Shift+T、Command+H 等键。
网页不能保证收到这些事件，也不能改变应用外的系统快捷键。
自定义剪贴板键仍受安全上下文、权限和浏览器能力限制，失败会显示错误。

### 网页快捷键优先（Edge / Chrome）

状态栏的“快捷键优先”按钮会主动请求网页全屏及 Keyboard Lock，
尽量让浏览器先把现有快捷键发给 Lineae；不修改上述 JSON 方案或保存的键位，
也不会在打开页面、点击编辑区或返回窗口时自动全屏／捕获。
这不是浏览器菜单或 F11 进入的普通全屏，需由此按钮发起。

- 需要安全连接和浏览器支持；不支持时按钮禁用，失败时显示原因。
- 开启后按钮变为“退出快捷键优先”；点击或使用浏览器的 Esc 退出全屏。
- 切换窗口、隐藏页面或更换 YAML 键位后释放捕获；仍在全屏时可点击“恢复快捷键优先”。
- 只请求当前绑定所需的物理键，不捕获 Escape，不使用“锁定全部按键”。
  Keyboard Lock 按物理键生效，包含其不同修饰键组合，不是只锁 Command 组合。
- API 调用成功不代表所有系统快捷键都已送达。macOS 系统保留键仍可能被截走，
  需要在真实 Mac 上验证；Windows 自动化或模拟 Mac 平台不能代替这项验收。
- 桌面应用不显示此网页模式入口；没有 Keyboard Lock 的浏览器不会偷偷替换键位。

`global.shortcutPriority` 默认不绑定，可在 YAML 中配置切换键，例如：

```yaml
keybindings:
  global:
    shortcutPriority: ctrl+alt+k
```

`tests/keybindings.test.mjs` 验证配置、别名、冲突和所有内建命令的禁用。
`tests/shortcuts-browser.cjs` 在 Windows Chromium 上分别模拟 Windows / macOS 平台，
验证默认键位、作用域、实时 YAML 重映射和禁用；不替代真实 Mac 的系统占用键测试。
