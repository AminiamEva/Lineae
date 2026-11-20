# 新 UI 模块接入说明

- 任务来源：工程内现有 `docs/tasks/delegation-backlog.md` 只有 A–D 资料任务，没有本次“标题样式控件 / 键盘导航 / 统一工具提示 / 深浅主题 / 轻量动画”的任务文件；按指示直接完成并交付本说明。
- 交付范围：**只新增独立 UI 模块、独立测试和本说明**。
- 未修改：`apps/web/src/main.js`、公式节点/渲染、解析器、光标/选区、撤销、矩阵、文档模型、包管理、现有 CSS、`index.html`、工作流、依赖、`package.json`。
- 未接入主编辑器、未提交、未部署。当前 `apps/web` 的公式/主编辑器仍在被负责人编辑，本模块不触碰。
- 模块均放在 `apps/web/src/ui/`，使用 `.mjs`，无第三方依赖，可由 esbuild/浏览器直接 import，也可被 Node 测试直接 import。

## 文件清单

| 文件 | 职责 |
|---|---|
| `apps/web/src/ui/title-styles.mjs` | 标题/副标题/作者/1–3 级标题/正文/图注的样式数据、校验、应用、循环、标题样式控件 |
| `apps/web/src/ui/keyboard-nav.mjs` | 水平/垂直/网格的方向键、Home/End、RTL、循环、禁用项跳过；roving tabindex 安装器 |
| `apps/web/src/ui/tooltips.mjs` | 双语 tooltip 文本/数据属性解析、视口夹取/翻转、统一 tooltip 安装器 |
| `apps/web/src/ui/theme.mjs` | light/dark/system 主题偏好、系统解析、`color-scheme` 应用、持久化、系统变化监听 |
| `apps/web/src/ui/motion.mjs` | 时长计算、`prefers-reduced-motion`、Web Animations API 轻量动画（fade/slide/pop） |
| `tests/ui/title-styles.test.mjs` | 标题样式数据、校验、应用、控件/模型/键盘选择 |
| `tests/ui/keyboard-nav.test.mjs` | 方向键/网格/RTL/禁用/roving focus |
| `tests/ui/tooltips.test.mjs` | 双语选择、dataset、视口夹取/翻转 |
| `tests/ui/tooltips-dom.test.mjs` | tooltip 安装器：显示/定位/语言切换/隐藏（fake DOM） |
| `tests/ui/theme.test.mjs` | 偏好归一化、system 解析、控制器持久化/切换/监听 |
| `tests/ui/motion.test.mjs` | 时长夹取、减速动画、关键帧 |

## 1. 标题样式控件

### 数据与纯函数

```js
import {
  TITLE_STYLES, TITLE_STYLE_IDS, titleStyleOptions,
  resolveTitleStyle, applyTitleStyle, nextTitleStyleId,
  validateTitleStyles, titleStyleControlModel,
  createTitleStyleControl,
} from './ui/title-styles.mjs';
```

- `TITLE_STYLES`：8 个预设（`document-title`、`subtitle`、`author`、`heading-1/2/3`、`body`、`caption`），含 `id/zh/en/tag/style`。
- `titleStyleOptions(language)`：返回 `{id,label}`，`language === 'zh-CN'` 用中文，否则英文。
- `resolveTitleStyle(id)`：返回样式副本，未知返回 `null`。
- `applyTitleStyle(element, id)`：把 `fontSize/fontWeight/lineHeight/margin/letterSpacing/textTransform/textAlign/color` 写入 `element.style`，并设置 `data-title-style`；未知 id 返回 `false`。
- `nextTitleStyleId(id, direction)`：循环切换。
- `validateTitleStyles(styles?)`：检查重复 id、缺失中英文、非法 tag、空/不支持的样式属性；返回错误数组。
- `titleStyleControlModel({value,language,open,activeId})`：纯模型，便于测试/渲染。

### DOM 控件

```js
const control = createTitleStyleControl({
  document,
  language: 'zh-CN',
  value: 'body',
  onChange: id => { /* 仅用户选择时触发 */ },
});
container.append(control.element);
control.getValue();            // 'body'
control.setValue('heading-1'); // 程序化设置，不触发 onChange
control.setLanguage('en');
control.handleKey('ArrowDown'); // 打开/移动
control.handleKey('Enter');     // 选择
control.getModel();
control.destroy();
```

- 无障碍：触发器 `aria-haspopup="listbox"`、`aria-expanded`、`aria-label`；选项 `role="option"`、`aria-selected`、roving `tabIndex`。
- 默认样式：使用内联系统色（`Canvas`/`CanvasText`/`GrayText`/`Highlight`/`HighlightText`），适配深浅主题；宿主可用 CSS 覆盖。
- 接入建议：放在文档标题/作者区域或工具栏；应用样式时调用 `applyTitleStyle`，不要改正文节点模型。
- 现有 `main.js` 的 meta bar 未接线；负责人接入前不会影响现有 UI。

## 2. 键盘导航

```js
import { nextIndex, isActivationKey, installRovingFocus } from './ui/keyboard-nav.mjs';

const cleanup = installRovingFocus(toolbar, {
  itemSelector: '[data-roving-item]',
  orientation: 'horizontal', // 'vertical' | 'grid'
  columns: 1,
  wrap: true,
  rtl: false,
  onActivate: (element, index) => {},
});
```

- `nextIndex({current,length,key,orientation,columns,wrap,rtl,disabled})`：纯函数；支持 `ArrowLeft/Right/Up/Down/Home/End`，水平 RTL 反转，禁用索引跳过，无可用项返回 `-1`。
- `installRovingFocus`：为匹配项维护 `tabIndex`，方向键移动焦点，Enter/Space 激活；返回清理函数。
- 接入建议：给工具栏/标签页/命令菜单的按钮加 `data-roving-item`；不要把公式 MathLive 内部键位绑定到这里。
- 不改变现有公式光标/选区逻辑。

## 3. 统一工具提示

```js
import { installTooltips, tooltipText, parseTooltipDataset } from './ui/tooltips.mjs';

const tooltips = installTooltips(document.body, {
  document,
  language: 'zh-CN',
  selector: '[data-tooltip-zh],[data-tooltip]',
});
tooltips.setLanguage('en');
tooltips.destroy();
```

- 控制元素写法：
  ```html
  <button data-tooltip-zh="合并单元格" data-tooltip-en="Merge cells">merge</button>
  <button data-tooltip="仅一种语言时两语共用">…</button>
  ```
- `tooltipText({zh,en}, language)` 会回退到另一语言；`parseTooltipDataset(dataset)` 读取 `data-tooltip-zh/-en/-tooltip`。
- `clampTooltipPosition`：把 tooltip 夹在视口内，空间不足时翻到上方并返回 `placement`。
- 安装器会设置 `aria-describedby`，但**控件本身仍应有 `aria-label`**；tooltip 不替代可访问名称。
- 默认样式：tooltip 使用内联系统色与背景/边框/圆角/阴影，适配深浅主题；宿主可覆盖。
- 不修改现有 `icons.js`/按钮；接入时给控件加 data 属性即可。

## 4. 深浅主题

```js
import { createThemeController } from './ui/theme.mjs';

const theme = createThemeController({
  root: document.documentElement,
  storage: localStorage,
  media: matchMedia('(prefers-color-scheme: dark)'),
  key: 'lineae.theme',
  preference: 'system',
});
theme.set('dark');   // 持久化并应用
theme.toggle();
theme.getPreference(); // 'dark' | 'light' | 'system'
theme.getResolved();   // 'dark' | 'light'
theme.destroy();
```

- 解析：`system` 根据 `media.matches` 解析为 `light/dark`；非法值回退 `system`。
- 应用：在根元素写 `data-theme` 和 `style.colorScheme`。现有 `pages.css` 使用 `light-dark()`，会随 `color-scheme` 响应，因此**不需要改现有 CSS**。
- 监听 `prefers-color-scheme` 变化；仅在偏好为 `system` 时重新应用。
- 可选：监听 `lineae-theme-change` 事件同步自定义控件。
- 接入建议：在编辑器初始化前创建控制器，避免闪烁；把当前偏好写入 `config.yaml`/localStorage（由负责人决定持久化策略）。

## 5. 轻量动画

```js
import { fadeIn, fadeOut, slideIn, popIn, animate, motionDuration, shouldAnimate } from './ui/motion.mjs';

popIn(dialog, { prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
slideIn(menu, { offset: 6, duration: 160 });
animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: motionDuration(200) });
```

- 使用 Web Animations API，无 CSS 依赖。
- `prefersReducedMotion: true` 时把时长设为 0（仍完成状态变化）。
- `motionDuration` 将距离换算为夹取后的时长（默认 80–260ms）。
- 接入建议：只用于对话框/菜单/tooltip 的出现/消失，不用于正文/公式布局。

## 6. 测试与验证

```bash
node --test tests/ui/*.test.mjs
```

本次结果：**21 tests pass / 0 fail**（6 个测试文件）。

- 纯函数已覆盖：标题样式数据/校验/应用/循环、键盘索引/RTL/网格/禁用、tooltip 双语/夹取、主题归一化/system/持久化/监听、动画时长/减速/关键帧。
- fake DOM 已覆盖：标题控件点击/键盘选择、roving focus 方向键/Enter、tooltip 安装器显示/定位/语言切换/隐藏。
- 真实浏览器级 DOM 行为（真实布局、真实 tooltip 定位、系统主题媒体查询、File System Access）未做 Playwright 单测；接入时建议补浏览器/人工验收。
- 未运行全量应用测试，未修改应用源码，未提交/部署。

## 7. 接入边界与顺序建议

1. 先接主题控制器（独立、风险最低）。
2. 再接 tooltip 安装器，给现有按钮补 `data-tooltip-zh/en`（只加属性，不改动作）。
3. 给工具栏/标签页接入 roving focus；不改 MathLive 内部键盘。
4. 在 meta bar 接入标题样式控件；应用样式只作用于标题/作者元素，不进入文档模型。
5. 最后用 motion 包裹现有对话框/菜单出现动画，并尊重 `prefers-reduced-motion`。
6. 任何接入都不得修改公式节点、解析器、光标/选区、撤销或矩阵逻辑；这些仍由负责人处理。

## 8. 已知限制

- 标题样式控件的 `onChange` 只由用户选择触发，`setValue` 不触发；接入方需自行决定是否同步外部状态。
- 标题样式只写内联样式，不生成 LaTeX；导出仍由现有文档模型/序列化负责。
- tooltip 安装器使用单例 tooltip；`aria-describedby` 会临时指向 tooltip，隐藏时移除；如控件已有 `aria-describedby`，接入时需合并。
- 主题控制器只写 `data-theme`/`color-scheme`；若未来新增 CSS 变量，需要另行定义。
- 动画使用 `element.animate`，不支持 Web Animations 的环境返回 `null`（无动画，功能不受影响）。
- 全部模块是**未接线**的独立交付物；在负责人接入前，线上行为不变。
