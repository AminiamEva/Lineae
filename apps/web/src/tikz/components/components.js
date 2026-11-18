// Component model for the TikZ editor.
//
// Geometry follows CircuiTikZ-Designer rather than a simple "scale one SVG to
// the mouse" model:
//   * node symbols keep their natural size and rotate around their anchor;
//   * path symbols keep their natural size, sit between two adjustable
//     reference points, and use short leads to those endpoints;
//   * every named pin in the selected symbol variant is a snap point;
//   * only the two path endpoints (and rect corners/wire vertices) are
//     adjustment points.
import { variantFor } from './symbols-meta.js';

const SVGNS = 'http://www.w3.org/2000/svg';
let nextId = 1;

function svg(name, attrs = {}) {
  const element = document.createElementNS(SVGNS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  }
  return element;
}

function rotatePoint(x, y, degrees) {
  const r = degrees * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

function optionWords(options) {
  return [...new Set((options || []).filter(Boolean))];
}

function variantOf(def, options) {
  return variantFor(def, options);
}

function variantStartEnd(variant) {
  const start = variant.pins.find(pin => pin.name === 'START') || variant.pins[0] || null;
  const end = variant.pins.find(pin => pin.name === 'END') || variant.pins[variant.pins.length - 1] || null;
  return { start, end };
}

export class Component {
  constructor(kind, x, y) {
    this.uid = nextId++;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.rotate = 0;
    this.selected = false;
    this.scaleValue = 1;
    this.flipY = false;
    this.strokeColor = null;
    this.fillColor = null;
    this.lineWidth = null;
  }
  moveTo(x, y) { this.x = x; this.y = y; }
  moveBy(dx, dy) { this.moveTo(this.x + dx, this.y + dy); }
  rotateBy(d = 90) { this.rotate = (this.rotate + d) % 360; }
  terminals() { return []; }
  adjustPoints() { return []; }
  bbox() {
    return { x: this.x - 8, y: this.y - 8, w: 16, h: 16 };
  }
}

export class NodeSymbol extends Component {
  constructor(def, x, y) {
    super('node', x, y);
    this.def = def;
    this.options = [...(variantOf(def, []).options || [])];
    this.scale = { x: 1, y: 1 };
    this.mirror = false;
    this.label = '';
    this.value = '';
  }
  variant() { return variantOf(this.def, this.options); }
  localToWorld(point) {
    const sx = (this.mirror ? -1 : 1) * this.scaleValue;
    const sy = (this.flipY ? -1 : 1) * this.scaleValue;
    const rotated = rotatePoint(point.x * sx, point.y * sy, this.rotate);
    return { x: this.x + rotated.x, y: this.y + rotated.y };
  }
  pinWorld(pin) {
    // The metadata pin coordinates are relative to the symbol midpoint; the
    // <use> is translated by -midpoint and then rotated around the anchor.
    const variant = this.variant();
    return this.localToWorld({ x: pin.x, y: pin.y });
  }
  terminals() {
    const variant = this.variant();
    const pins = variant.pins.length ? variant.pins : [{ name: 'center', x: 0, y: 0 }];
    return pins.map((pin, ti) => {
      const world = this.pinWorld(pin);
      return { dx: world.x - this.x, dy: world.y - this.y, name: pin.name, comp: this, ti };
    });
  }
  adjustPoints() { return []; }
  bbox() {
    const variant = this.variant();
    const [vx, vy, vw, vh] = variant.viewBox;
    const corners = [
      { x: vx - variant.mid[0], y: vy - variant.mid[1] },
      { x: vx + vw - variant.mid[0], y: vy - variant.mid[1] },
      { x: vx - variant.mid[0], y: vy + vh - variant.mid[1] },
      { x: vx + vw - variant.mid[0], y: vy + vh - variant.mid[1] },
    ].map(point => this.localToWorld(point));
    const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  toSvg() {
    const variant = this.variant();
    const g = svg('g', { 'data-uid': this.uid });
    g.setAttribute('transform', `translate(${this.x},${this.y})${this.rotate ? ` rotate(${this.rotate})` : ''}${this.mirror || this.flipY || this.scaleValue !== 1 ? ` scale(${this.mirror ? -this.scaleValue : this.scaleValue},${this.flipY ? -this.scaleValue : this.scaleValue})` : ''}`);
    const use = svg('use');
    use.setAttribute('href', '#' + (variant.id || this.def.id));
    use.setAttribute('transform', `translate(${-variant.mid[0]},${-variant.mid[1]})`);
    if (this.def.fillable && !this.fillColor) use.setAttribute('fill', 'none');
    if (this.strokeColor) use.setAttribute('stroke', this.strokeColor);
    if (this.fillColor) use.setAttribute('fill', this.fillColor);
    if (this.lineWidth) use.setAttribute('stroke-width', String(this.lineWidth));
    if (this.selected) use.setAttribute('color', '#2f6fed');
    g.append(use);
    if (this.selected) g.setAttribute('opacity', '0.88');
    if (this.label || this.value) {
      const text = svg('text', {
        x: 0,
        y: variant.viewBox[3] - variant.mid[1] + 13,
        'text-anchor': 'middle',
        'font-size': 11,
        'font-family': 'serif',
        fill: this.selected ? '#2f6fed' : '#222',
      });
      text.textContent = this.label || this.value;
      g.append(text);
    }
    return g;
  }
  toTikZ(X, Y) {
    const words = optionWords([...this.def.tikz ? [this.def.tikz] : [], ...this.variant().options]);
    if (this.label) words.push(`label={$${this.label}$}`);
    if (this.rotate) words.push('rotate=' + this.rotate);
    if (this.mirror) words.push('xscale=' + (-this.scaleValue));
    if (this.flipY) words.push('yscale=' + (-this.scaleValue));
    if (this.scaleValue !== 1 && !this.mirror && !this.flipY) words.push('scale=' + this.scaleValue);
    if (this.strokeColor) words.push('draw=' + this.strokeColor);
    if (this.fillColor) words.push('fill=' + this.fillColor);
    if (this.lineWidth) words.push('line width=' + this.lineWidth + 'pt');
    return `\\node[${words.join(', ')}] at (${X(this.x)},${Y(this.y)}) {};`;
  }
}


function isAmericanVoltage(def) {
  return def?.source === 'isVoltage' && /american.*voltage source|american controlled voltage source/i.test(def.tikz || '');
}

function sourceFallback(variant, def) {
  const [vx, vy, vw, vh] = variant.viewBox;
  const cx = variant.mid[0], cy = variant.mid[1];
  const radius = Math.max(6, Math.min(vw, vh) / 2 - 1);
  const g = svg('g', { transform: `translate(${-cx},${-cy})` });
  g.append(svg('circle', { cx, cy, r: radius, fill: 'none', stroke: '#222', 'stroke-width': 1.1 }));
  const signSize = radius * .42;
  const margin = 8;
  for (const [y, plus] of [[cy - margin, true], [cy + margin, false]]) {
    g.append(svg('line', { x1: cx - signSize, y1: y, x2: cx + signSize, y2: y, stroke: '#222', 'stroke-width': 1.2 }));
    if (plus) g.append(svg('line', { x1: cx, y1: y - signSize, x2: cx, y2: y + signSize, stroke: '#222', 'stroke-width': 1.2 }));
  }
  return g;
}

export class PathComponent extends Component {
  constructor(def, x, y) {
    super('path', x, y);
    this.def = def;
    this.options = [...(variantOf(def, []).options || [])];
    this.label = '';
    this.value = '';
    this.voltage = '';
    this.current = '';
    this.mirror = false;
    this.invert = false;
    const variant = this.variant();
    const { start, end } = variantStartEnd(variant);
    const distance = Math.hypot((end?.x || 0) - (start?.x || 0), (end?.y || 0) - (start?.y || 0)) || def.pinDist || 1;
    this.end = { x: x + distance, y };
    this.start = { x, y };
  }
  variant() { return variantOf(this.def, this.options); }
  get length() { return Math.hypot(this.end.x - this.start.x, this.end.y - this.start.y); }
  get angle() {
    return Math.atan2(this.start.y - this.end.y, this.end.x - this.start.x) * 180 / Math.PI;
  }
  get midpoint() { return { x: (this.start.x + this.end.x) / 2, y: (this.start.y + this.end.y) / 2 }; }
  localToWorld(point) {
    const x = (this.mirror ? -point.x : point.x) * this.scaleValue;
    const y = (this.flipY ? -point.y : point.y) * this.scaleValue;
    const rotated = rotatePoint(x, y, -this.angle);
    const mid = this.midpoint;
    return { x: mid.x + rotated.x, y: mid.y + rotated.y };
  }
  pinWorld(pin) {
    const variant = this.variant();
    return this.localToWorld({ x: pin.x, y: pin.y });
  }
  terminals() {
    const variant = this.variant();
    const { start, end } = variantStartEnd(variant);
    const points = [
      { dx: 0, dy: 0, name: start?.name || 'START', comp: this, ti: 0 },
      { dx: this.end.x - this.start.x, dy: this.end.y - this.start.y, name: end?.name || 'END', comp: this, ti: 1 },
    ];
    variant.pins.forEach((pin, index) => {
      if (pin === start || pin === end) return;
      const world = this.pinWorld(pin);
      points.push({ dx: world.x - this.start.x, dy: world.y - this.start.y, name: pin.name, comp: this, ti: index + 2 });
    });
    if (isAmericanVoltage(this.def) && !variant.pins.some(pin => pin.name === '+' || pin.name === '-')) {
      for (const [name, y] of [['+', -8], ['-', 8]]) {
        const world = this.localToWorld({ x: 0, y });
        points.push({ dx: world.x - this.start.x, dy: world.y - this.start.y, name, comp: this, ti: points.length });
      }
    }
    return points;
  }
  adjustPoints() {
    return [
      { key: 'start', x: this.start.x, y: this.start.y },
      { key: 'end', x: this.end.x, y: this.end.y },
    ];
  }
  moveTo(x, y) {
    const dx = x - this.start.x, dy = y - this.start.y;
    this.start = { x, y };
    this.end = { x: this.end.x + dx, y: this.end.y + dy };
    this.x = x; this.y = y;
  }
  moveBy(dx, dy) { this.moveTo(this.start.x + dx, this.start.y + dy); }
  rotateBy(degrees) {
    const mid = this.midpoint;
    const rotate = point => {
      const p = rotatePoint(point.x - mid.x, point.y - mid.y, degrees);
      return { x: mid.x + p.x, y: mid.y + p.y };
    };
    this.start = rotate(this.start); this.end = rotate(this.end);
    this.x = this.start.x; this.y = this.start.y;
  }
  setStartFrom(point) { this.start = { x: point.x, y: point.y }; this.x = point.x; this.y = point.y; }
  setEndFrom(point) { this.end = { x: point.x, y: point.y }; }
  setLengthFrom(point) { this.setEndFrom(point); }
  bbox() {
    const variant = this.variant();
    const mid = this.midpoint;
    const [vx, vy, vw, vh] = variant.viewBox;
    const corners = [
      { x: vx - variant.mid[0], y: vy - variant.mid[1] },
      { x: vx + vw - variant.mid[0], y: vy - variant.mid[1] },
      { x: vx - variant.mid[0], y: vy + vh - variant.mid[1] },
      { x: vx + vw - variant.mid[0], y: vy + vh - variant.mid[1] },
    ].map(point => this.localToWorld(point));
    corners.push(this.start, this.end);
    const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  symbolPoint(pin) {
    const variant = this.variant();
    return this.localToWorld({ x: pin.x, y: pin.y });
  }
  toSvg() {
    const variant = this.variant();
    const g = svg('g', { 'data-uid': this.uid });
    const mid = this.midpoint;
    const transform = `translate(${mid.x},${mid.y})${this.angle ? ` rotate(${-this.angle})` : ''}${this.mirror || this.flipY || this.scaleValue !== 1 ? ` scale(${this.mirror ? -this.scaleValue : this.scaleValue},${this.flipY ? -this.scaleValue : this.scaleValue})` : ''}`;
    const symbol = svg('g', { transform });
    const use = svg('use');
    use.setAttribute('href', '#' + (variant.id || this.def.id));
    use.setAttribute('transform', `translate(${-variant.mid[0]},${-variant.mid[1]})`);
    if (this.def.fillable && !this.fillColor) use.setAttribute('fill', 'none');
    if (this.strokeColor) use.setAttribute('stroke', this.strokeColor);
    if (this.fillColor) use.setAttribute('fill', this.fillColor);
    if (this.lineWidth) use.setAttribute('stroke-width', String(this.lineWidth));
    if (this.selected) use.setAttribute('color', '#2f6fed');
    const hasArtwork = variant.id && document.getElementById(variant.id);
    if (hasArtwork && !isAmericanVoltage(this.def)) symbol.append(use);
    else if (isAmericanVoltage(this.def)) symbol.append(sourceFallback(variant, this.def));
    g.append(symbol);
    const { start, end } = variantStartEnd(variant);
    const stroke = this.selected ? '#2f6fed' : '#222';
    if (this.label || this.value) {
      const text = svg('text', {
        x: mid.x, y: mid.y - 9,
        'text-anchor': 'middle', 'font-size': 11, 'font-family': 'serif',
        fill: this.selected ? '#2f6fed' : '#222',
      });
      text.textContent = this.label || this.value;
      g.append(text);
    }
    if (start && end) {
      const a = this.symbolPoint(start), b = this.symbolPoint(end);
      const startLine = this.mirror ? b : a;
      const endLine = this.mirror ? a : b;
      for (const [from, to] of [[this.start, startLine], [this.end, endLine]]) {
        const line = svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke, 'stroke-width': 1.5 });
        g.insertBefore(line, symbol);
      }
    }
    return g;
  }
  optionsText() {
    const words = [...this.variant().options];
    if (this.label) words.push(`l=$${this.label}$`);
    if (this.value) words.push(`v=$${this.value}$`);
    if (this.mirror) words.push('mirror');
    if (this.invert) words.push('invert');
    if (this.scaleValue !== 1) words.push('scale=' + this.scaleValue);
    if (this.strokeColor) words.push('draw=' + this.strokeColor);
    if (this.fillColor) words.push('fill=' + this.fillColor);
    if (this.lineWidth) words.push('line width=' + this.lineWidth + 'pt');
    if (this.voltage) words.push(`v={$${this.voltage}$}`);
    if (this.current) words.push(`i={$${this.current}$}`);
    if (this.poleStart || this.poleEnd) words.push(`${this.poleStart || ''}-${this.poleEnd || ''}`);
    return words.length ? ', ' + words.join(', ') : '';
  }
  toTikZ(X, Y) {
    return `\\draw (${X(this.start.x)},${Y(this.start.y)}) to[${this.def.tikz || 'short'}${this.optionsText()}] (${X(this.end.x)},${Y(this.end.y)});`;
  }
}

export class OpenComponent extends Component {
  constructor(def, x, y) {
    super('open', x, y);
    this.def = def;
    this.gap = def.gap || 30;
    this.label = '';
    this.value = '';
    this.mirror = false;
    this.start = { x, y };
    this.end = { x: x + this.gap, y };
  }
  terminals() {
    return [
      { dx: 0, dy: 0, name: 'START', comp: this, ti: 0 },
      { dx: this.gap, dy: 0, name: 'END', comp: this, ti: 1 },
    ];
  }
  adjustPoints() {
    return [
      { key: 'start', x: this.start.x, y: this.start.y },
      { key: 'end', x: this.end.x, y: this.end.y },
    ];
  }
  rotateBy(degrees) {
    const mid = this.midpoint;
    const rotate = point => {
      const p = rotatePoint(point.x - mid.x, point.y - mid.y, degrees);
      return { x: mid.x + p.x, y: mid.y + p.y };
    };
    this.start = rotate(this.start); this.end = rotate(this.end);
    this.x = this.start.x; this.y = this.start.y;
  }
  setStartFrom(point) { this.start = { x: point.x, y: point.y }; this.x = point.x; this.y = point.y; }
  setEndFrom(point) { this.end = { x: point.x, y: point.y }; this.gap = Math.hypot(point.x - this.start.x, point.y - this.start.y); }
  setGapFrom(point) { this.setEndFrom(point); }
  setLengthFrom(point) { this.setEndFrom(point); }
  moveTo(x, y) {
    const dx = x - this.start.x, dy = y - this.start.y;
    this.start = { x, y };
    this.end = { x: this.end.x + dx, y: this.end.y + dy };
    this.x = x; this.y = y;
  }
  moveBy(dx, dy) { this.moveTo(this.start.x + dx, this.start.y + dy); }
  toSvg() {
    const g = svg('g', { 'data-uid': this.uid });
    const stroke = this.selected ? '#2f6fed' : '#222';
    const line = (x1, x2) => svg('line', { x1, y1: this.start.y, x2, y2: this.start.y, stroke, 'stroke-width': 2 });
    g.append(line(this.start.x - 4, this.start.x), line(this.end.x, this.end.x + 4));
    for (const x of [this.start.x, this.end.x]) {
      g.append(svg('circle', { cx: x, cy: this.start.y, r: 4, fill: 'none', stroke, 'stroke-width': 2 }));
    }
    return g;
  }
  toTikZ(X, Y) {
    const options = [];
    if (this.label) options.push(`l=$${this.label}$`);
    if (this.value) options.push(`v=$${this.value}$`);
    return `\\draw (${X(this.start.x)},${Y(this.start.y)}) to[${this.def.tikz || 'open'}${options.length ? ', ' + options.join(', ') : ''}] (${X(this.end.x)},${Y(this.end.y)});`;
  }
}

export class RectComponent extends Component {
  constructor(def, x, y) {
    super('rect', x, y);
    this.def = def;
    this.w = def.w;
    this.h = def.h;
    this.label = '';
    this.round = !!def.round;
    this.shape = def.shape || '';
  }
  terminals() { return []; }
  adjustPoints() {
    return [
      { key: 'nw', x: this.x - this.w / 2, y: this.y - this.h / 2 },
      { key: 'ne', x: this.x + this.w / 2, y: this.y - this.h / 2 },
      { key: 'se', x: this.x + this.w / 2, y: this.y + this.h / 2 },
      { key: 'sw', x: this.x - this.w / 2, y: this.y + this.h / 2 },
    ];
  }
  setAdjustPoint(key, point) {
    const opposite = {
      nw: { x: this.x + this.w / 2, y: this.y + this.h / 2 },
      ne: { x: this.x - this.w / 2, y: this.y + this.h / 2 },
      se: { x: this.x - this.w / 2, y: this.y - this.h / 2 },
      sw: { x: this.x + this.w / 2, y: this.y - this.h / 2 },
    }[key];
    if (!opposite) return;
    this.w = Math.max(16, Math.abs(point.x - opposite.x));
    this.h = Math.max(12, Math.abs(point.y - opposite.y));
    this.x = (point.x + opposite.x) / 2;
    this.y = (point.y + opposite.y) / 2;
  }
  setLengthFrom(point) {
    this.w = Math.max(16, 2 * Math.abs(point.x - this.x));
    this.h = Math.max(12, 2 * Math.abs(point.y - this.y));
  }
  bodyShape() {
    const { w, h } = this;
    if (this.shape === 'trapezoid') return `M${-w / 2},${-h / 2} L${w / 2},${-h / 2} L${w / 4},${h / 2} L${-w / 4},${h / 2} Z`;
    if (this.shape === 'arrow') return `M${-w / 2},${-h / 2} L${w / 4},${-h / 2} L${w / 4},${-h / 2 - 4} L${w / 2},0 L${w / 4},${h / 2 + 4} L${w / 4},${h / 2} L${-w / 2},${h / 2} Z`;
    if (this.shape === 'step') return `M${-w / 2},${-h / 2} L${w / 4},${-h / 2} L${w / 4},0 L${w / 2},0 L${w / 2},${h / 2} L${-w / 2},${h / 2} Z`;
    return null;
  }
  toSvg() {
    const g = svg('g', { 'data-uid': this.uid, transform: `translate(${this.x},${this.y})${this.rotate ? ` rotate(${this.rotate})` : ''}` });
    const path = this.bodyShape();
    const style = { fill: this.fillColor || 'none', stroke: this.strokeColor || (this.selected ? '#2f6fed' : '#222'), 'stroke-width': this.lineWidth || 2 };
    let element;
    if (path) element = svg('path', { d: path, ...style });
    else if (this.round) element = svg('ellipse', { rx: this.w / 2, ry: this.h / 2, ...style });
    else element = svg('rect', { x: -this.w / 2, y: -this.h / 2, width: this.w, height: this.h, ...style });
    g.append(element);
    if (this.label) {
      g.append(svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 12, 'font-family': 'serif', fill: '#222' }));
      g.lastChild.textContent = this.label;
    }
    return g;
  }
  bbox() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  toTikZ(X, Y) {
    const cm = value => (value / 37.7952755906).toFixed(3);
    return `\\node[draw, ${this.def.tikz}, minimum width=${cm(this.w)}cm, minimum height=${cm(this.h)}cm${this.rotate ? `, rotate=${this.rotate}` : ''}] at (${X(this.x)},${Y(this.y)}) {${this.label ? '$' + this.label + '$' : ''}};`;
  }
}

export class TextItem extends Component {
  constructor(text, size, x, y) { super('text', x, y); this.text = text; this.size = size || 12; this.align = 'center'; }
  toSvg() {
    const t = svg('text', { x: this.x, y: this.y, 'text-anchor': this.align === 'left' ? 'start' : this.align === 'right' ? 'end' : 'middle', 'font-size': `${this.size}pt`, 'font-family': '"Latin Modern Roman", serif', fill: this.selected ? '#2f6fed' : '#111', 'data-uid': this.uid });
    t.textContent = this.text;
    return t;
  }
  bbox() { return { x: this.x - 4, y: this.y - this.size, w: Math.max(12, this.text.length * this.size * .55), h: this.size * 1.3 }; }
  toTikZ(X, Y) {
    return `\\node[font=\\fontsize{${this.size}}{${(this.size * 1.2).toFixed(1)}}\\selectfont] at (${X(this.x)},${Y(this.y)}) {$${this.text}$};`;
  }
}

export class Wire extends Component {
  constructor(pts) {
    super('wire', pts[0].x, pts[0].y);
    this.pts = pts;
    this.endA = null;
    this.endB = null;
    this.arrowStart = null;
    this.arrowEnd = null;
  }
  moveBy(dx, dy) { this.pts = this.pts.map(p => ({ x: p.x + dx, y: p.y + dy })); this.x = this.pts[0].x; this.y = this.pts[0].y; }
  adjustPoints() { return this.pts.map((point, index) => ({ key: 'vertex-' + index, x: point.x, y: point.y })); }
  setAdjustPoint(key, point) { const index = Number(String(key).replace('vertex-', '')); if (Number.isInteger(index) && this.pts[index]) { this.pts[index] = { x: point.x, y: point.y }; this.x = this.pts[0].x; this.y = this.pts[0].y; } }
  setEnds(a, b) { this.endA = a; this.endB = b; }
  bbox() {
    const xs = this.pts.map(p => p.x), ys = this.pts.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  toSvg() {
    const pl = svg('polyline', {
      points: this.pts.map(p => `${p.x},${p.y}`).join(' '),
      fill: this.fillColor || 'none',
      stroke: this.strokeColor || (this.selected ? '#2f6fed' : '#222'),
      'stroke-width': this.lineWidth || 2,
      'stroke-linejoin': 'round',
      'data-uid': this.uid,
    });
    return pl;
  }
  toTikZ(X, Y, nameA, nameB) {
    const segments = [];
    const n = this.pts.length;
    for (let i = 0; i < n - 1; i++) {
      const pa = i === 0 && nameA ? `(${nameA})` : `(${X(this.pts[i].x)},${Y(this.pts[i].y)})`;
      const pb = i === n - 2 && nameB ? `(${nameB})` : `(${X(this.pts[i + 1].x)},${Y(this.pts[i + 1].y)})`;
      segments.push(`${pa} to[short] ${pb}`);
    }
    return `\\draw ${segments.join(' ')};`;
  }
}
