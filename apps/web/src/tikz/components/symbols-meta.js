// Symbol library: parses the <metadata> component registry inside
// assets/tikz-symbols.svg (from CircuiTikZ-Designer, GPL-3.0) and builds the
// component definitions + category structure, mirroring the reference sidebar.
//
// The important part of this file is intentionally data-driven: every symbol
// variant keeps its own pins, text position and style options.  CircuiTikZ
// anchors are not all `center`; transistors, transformer dots, logic ports,
// chips, etc. have several named pins.  A missing `x` or `y` on a pin means 0
// (not NaN), which is the convention used by the reference SVG metadata.
export const SVGNS = 'http://www.w3.org/2000/svg';

function attrsOf(tag) {
  const out = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function viewBoxOf(value, fallback = [0, 0, 40, 40]) {
  if (!value) return fallback;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : fallback;
}

function optionList(inner) {
  return [...inner.matchAll(/<option\b([^>]*?)\/?>/g)]
    .map(match => {
      const attrs = attrsOf(match[1]);
      return attrs.name ? { name: attrs.name, display: attrs.display || attrs.name, active: attrs.active === 'true' } : null;
    })
    .filter(Boolean);
}

function parseOptions(inner) {
  const options = [];
  const enums = [];
  if (!inner) return { options, enums };
  const enumRe = /<enumopt\b([^>]*)>([\s\S]*?)<\/enumopt>/g;
  let enumMatch;
  const enumRanges = [];
  while ((enumMatch = enumRe.exec(inner))) {
    const attrs = attrsOf(enumMatch[1]);
    enums.push({
      name: attrs.name || 'Style',
      display: attrs.display || attrs.name || 'Style',
      selectNone: (attrs.selectNone || '').toLowerCase() !== 'false',
      options: optionList(enumMatch[2]),
    });
    enumRanges.push([enumMatch.index, enumRe.lastIndex]);
  }
  // Boolean options are the <option> elements outside <enumopt> blocks.
  let offset = 0;
  for (const [start, end] of enumRanges) {
    for (const option of optionList(inner.slice(offset, start))) options.push(option);
    offset = end;
  }
  for (const option of optionList(inner.slice(offset))) options.push(option);
  // De-duplicate by name while preserving order.
  const seen = new Set();
  return {
    options: options.filter(option => !seen.has(option.name) && seen.add(option.name)),
    enums,
  };
}

function parseVariant(attrsText, inner = '') {
  const attrs = attrsOf(attrsText);
  const pins = [...inner.matchAll(/<pin\b([^>]*?)\/?>/g)].map(match => {
    const pin = attrsOf(match[1]);
    return {
      name: pin.name || pin.anchorname || '',
      x: number(pin.x, 0),
      y: number(pin.y, 0),
      isDefault: pin.isDefault === 'true' || pin.isdefault === 'true' || pin.isDefault === '' || pin.isdefault === '',
    };
  });
  const textMatch = /<textpos\b([^>]*?)\/?>/.exec(inner);
  const textAttrs = textMatch ? attrsOf(textMatch[1]) : {};
  return {
    id: attrs.for || '',
    mid: [number(attrs.x, 0), number(attrs.y, 0)],
    viewBox: viewBoxOf(attrs.viewBox),
    pins,
    textPosition: { x: number(textAttrs.x, 0), y: number(textAttrs.y, 0) },
    options: optionList(inner).map(option => option.name),
  };
}

export function variantFor(def, selectedOptions = []) {
  if (!def?.variants?.length) {
    return {
      id: def?.id || '',
      mid: def?.anchor || [0, 0],
      viewBox: def?.viewBox || [0, 0, 40, 40],
      pins: def?.pins || [],
      textPosition: { x: 0, y: 0 },
      options: [],
    };
  }
  const wanted = [...new Set(selectedOptions)].sort();
  const exact = def.variants.find(variant => {
    const names = [...new Set(variant.options)].sort();
    return names.length === wanted.length && names.every((name, index) => name === wanted[index]);
  });
  if (exact) return exact;
  // A selected subset can still identify a specific variant when no exact
  // combination exists; prefer the first variant carrying all selected names.
  return def.variants.find(variant => wanted.every(name => variant.options.includes(name))) || def.variants[0];
}

export function parseLibrary(svgText) {
  const defs = [];
  const order = [];
  const compRe = /<component\s+([^>]*)>([\s\S]*?)<\/component>/g;
  let match;
  while ((match = compRe.exec(svgText))) {
    const attrs = attrsOf(match[1]);
    const inner = match[2];
    const groupsRe = /<options\b[^>]*>([\s\S]*?)<\/options>/;
    const optionsBlock = groupsRe.exec(inner);
    const { options, enums } = parseOptions(optionsBlock?.[1] || '');

    const variants = [];
    const variantRe = /<variant\b([^>]*?)(?:\/>|>([\s\S]*?)<\/variant>)/g;
    let variantMatch;
    while ((variantMatch = variantRe.exec(inner))) {
      variants.push(parseVariant(variantMatch[1], variantMatch[2] || ''));
    }
    if (!variants.length) variants.push(parseVariant(''));
    if (!variants.some(variant => variant.pins.length)) {
      // Legacy/unit-test metadata may place pins directly after a self-closing
      // <variant/> element; accept it as the first variant's pin list.
      const directPins = [...inner.matchAll(/<pin\b([^>]*?)\/?>/g)].map(match => {
        const pin = attrsOf(match[1]);
        return { name: pin.name || '', x: number(pin.x, 0), y: number(pin.y, 0), isDefault: pin.isDefault === 'true' || pin.isdefault === 'true' };
      });
      if (directPins.length) variants[0].pins = directPins;
    }

    const group = attrs.group || 'Unsorted components';
    if (!order.includes(group)) order.push(group);
    const first = variants[0];
    const kind = attrs.type === 'path' ? 'path' : attrs.type === 'open' ? 'open' : attrs.type === 'ellipse' ? 'ellipse' : 'node';
    const startPin = first.pins.find(pin => pin.name === 'START') || first.pins[0];
    const endPin = first.pins.find(pin => pin.name === 'END') || first.pins[first.pins.length - 1];
    const pinDist = startPin && endPin ? Math.hypot(startPin.x - endPin.x, startPin.y - endPin.y) : first.viewBox[2];
    const def = {
      cat: group,
      kind,
      name: attrs.display || attrs.tikz || attrs.tikzName || '',
      tikz: attrs.tikz || attrs.tikzName || '',
      cls: attrs.class || '',
      fillable: attrs.fillable === 'True' || attrs.fillable === 'true',
      source: attrs.source || false,
      variants,
      options,
      enums,
      id: first.id,
      anchor: first.mid,
      viewBox: first.viewBox,
      pins: first.pins,
      textPosition: first.textPosition,
      pinDist: pinDist || 1,
      length: pinDist || 1,
    };
    defs.push(def);
  }
  return { defs, order };
}

// --- Basic group shapes (mirrors reference "Basic"): drawn with primitives ---
function el(name, attrs = {}) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
const stroke = { fill: 'none', stroke: '#222', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const CM = 37.7952755906;

export const BASIC_COMPONENTS = [
  { cat: 'Basic', kind: 'wire', name: 'Short', tikz: 'short' },
  { cat: 'Basic', kind: 'open', name: 'Open', tikz: 'open', gap: CM * 0.6, drawKind: 'open' },
  { cat: 'Basic', kind: 'text', name: 'Text', tikz: '' },
  { cat: 'Basic', kind: 'rect', name: 'Rectangle', tikz: 'rectangle', w: CM * 1.2, h: CM * 0.8 },
  { cat: 'Basic', kind: 'rect', name: 'Ellipse', tikz: 'ellipse', w: CM * 1.2, h: CM * 0.8, round: true },
  { cat: 'Basic', kind: 'rect', name: 'Trapezoid', tikz: 'trapezium, trapezium angle=60', w: CM * 1.2, h: CM * 0.9, shape: 'trapezoid' },
  { cat: 'Basic', kind: 'rect', name: 'Single arrow', tikz: 'single arrow', w: CM * 1.4, h: CM * 0.6, shape: 'arrow' },
  { cat: 'Basic', kind: 'rect', name: 'Step', tikz: 'chamfered rectangle, chamfered rectangle xsep=8pt', w: CM * 1.2, h: CM * 0.7, shape: 'step' },
];

export const GROUP_LABELS = {
  'Basic': ['基础', 'Basic'],
  'Grounds and supply voltages': ['接地与电源', 'Grounds and supply voltages'],
  'Wiring': ['连线', 'Wiring'],
  'Block diagram': ['框图', 'Block diagram'],
  'Transistors': ['晶体管', 'Transistors'],
  'Tubes': ['电子管', 'Tubes'],
  'RF components': ['射频元件', 'RF components'],
  'Inductors': ['电感', 'Inductors'],
  'Miscellaneous': ['杂项', 'Miscellaneous'],
  'Amplifiers': ['放大器', 'Amplifiers'],
  'Switches, buttons and jumpers': ['开关与跳线', 'Switches, buttons and jumpers'],
  'Logic gates': ['逻辑门', 'Logic gates'],
  'Flipflops': ['触发器', 'Flipflops'],
  'Resistive bipoles': ['电阻类双端元件', 'Resistive bipoles'],
  'Capacitive and dynamic bipoles': ['电容与动态双端元件', 'Capacitive and dynamic bipoles'],
  'Diodes': ['二极管', 'Diodes'],
  'Sources and generators': ['电源与信号源', 'Sources and generators'],
  'Instruments': ['仪器', 'Instruments'],
  'Mechanical': ['机械元件', 'Mechanical'],
  'Unsorted components': ['未分类', 'Unsorted components'],
};

// Kept for callers that want primitive SVG drawing helpers.
export { el, stroke, CM };
