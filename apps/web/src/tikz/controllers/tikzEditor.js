// TikZ / CircuiTikZ visual editor — main controller.
// Architecture adapted from Circuit2TikZ/CircuiTikZ-Designer (GPL-3.0):
//   controllers (canvas/zoom) + snapDrag (grid & terminal snapping) + components.
import { CanvasController } from './canvasController.js';
import { PX_PER_CM, SnapController } from './snapDrag.js';
import { NodeSymbol, PathComponent, OpenComponent, RectComponent, TextItem, Wire, GroupComponent } from '../components/components.js';
import { parseLibrary, BASIC_COMPONENTS, GROUP_LABELS } from '../components/symbols-meta.js';
import { exportTikz } from './exportController.js';

export class TikzEditor {
  constructor({ getTextwidthCm } = {}) {
    this.getTextwidthCm = getTextwidthCm || (() => 15);
    this.items = []; this.selected = null; this.selection = [];
    this.tool = 'select'; this.placingDef = null;
    this.wirePts = [];
    this.snapEnabled = true;
    this.onDone = null;
    this.history = []; this.future = [];
    this.envSettings = { voltages: 'european', voltageConvention: 'noold', labelOrientation: 'smart' };
    try {
      const saved = JSON.parse(localStorage.getItem('lineae.tikz.environment') || 'null');
      if (saved && typeof saved === 'object') this.envSettings = { ...this.envSettings, ...saved };
    } catch { /* localStorage may be unavailable */ }
  }

  snapshot() {
    const clone = it => ({ ...it, pts: it.pts?.map(q => ({ ...q })) });
    return this.items.map(clone);
  }
  pushHistory() { this.history.push(this.snapshot()); if (this.history.length > 50) this.history.shift(); this.future = []; }
  restore(snap) {
    const byUid = new Map(this.items.map(i => [i.uid, i]));
    this.items = snap.map(s => { const it = byUid.get(s.uid) || s; Object.assign(it, s); return it; });
    this.selected = null; this.selection = []; this.recomputeSnap(); this.render();
  }
  undo() { if (!this.history.length) return; this.future.push(this.snapshot()); this.restore(this.history.pop()); }
  redo() { if (!this.future.length) return; this.history.push(this.snapshot()); this.restore(this.future.pop()); }

  t(zh, en) { return (document.documentElement.lang || '').startsWith('zh') ? zh : en; }

  open(onDone) {
    this.onDone = onDone;
    this.buildDom();
    this.canvas.setTextwidthCm(this.getTextwidthCm());
    this.canvas.fit();
    this.render();
  }
  close() { this.overlay?.remove(); this.overlay = null; }

  buildDom() {
    this.close();
    const o = document.createElement('div');
    o.className = 'tikz-overlay';
    o.innerHTML = `
      <div class="tikz-window">
        <div class="tikz-header">
          <span class="tikz-title">TikZ / CircuiTikZ</span>
          <label class="tikz-zoom-label">${this.t('缩放', 'Zoom')}</label>
          <input type="range" class="tikz-zoom-slider" min="10" max="400" step="5" value="100">
          <input type="number" class="tikz-zoom-input" min="10" max="400" step="5" value="100">
          <span class="tikz-zoom-unit">%</span>
          <span class="tikz-spacer"></span>
          <button class="tikz-finish">${this.t('插入', 'Insert')}</button>
          <button class="tikz-exit">${this.t('退出', 'Exit')}</button>
        </div>
        <div class="tikz-body">
          <div class="tikz-sidebar">
            <input type="search" class="tikz-search" placeholder="${this.t('搜索元件…', 'Search parts…')}">
            <div class="tikz-tree"></div>
          </div>
          <div class="tikz-canvas-wrap">
            <svg class="tikz-canvas" tabindex="0"><defs></defs></svg>
            <div class="tikz-status"></div>
          </div>
          <div class="tikz-side">
            <div class="tikz-tools">
              <button data-tool="select" class="active">${this.t('选择', 'Select')}</button>
              <button data-tool="wire">${this.t('连线', 'Wire')}</button>
              <button data-tool="text">${this.t('文字', 'Text')}</button>
              <button data-tool="rotate">${this.t('旋转90°', 'Rot 90°')}</button>
              <button data-tool="undo">Undo</button><button data-tool="redo">Redo</button>
              <button data-tool="pan">Pan</button>
              <button data-tool="eraser">Erase</button>
              <button data-tool="delete">${this.t('删除', 'Delete')}</button>
              <button data-tool="clear">Clear</button>
              <button data-tool="fit">Fit</button>
            </div>
            <div class="tikz-selection-info"></div>
            <div class="tikz-property-panel"></div>
            <div class="tikz-props">
              <div class="tikz-props-title">${this.t('视图', 'View')}</div>
              <label class="tikz-field">${this.t('网格(cm)', 'Grid (cm)')}
                <select class="tikz-grid-size"><option value="0.25">0.25</option><option value="0.5" selected>0.5</option><option value="1">1</option></select></label>
              <label class="tikz-field tikz-mirror-row"><input type="checkbox" class="tikz-grid-show" checked>${this.t('显示网格', 'Show grid')}</label>
              <label class="tikz-field tikz-mirror-row"><input type="checkbox" class="tikz-snap-show" checked>${this.t('吸附网格/引脚', 'Snap to grid/pins')}</label>
              <div class="tikz-zoom-readout">100%</div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.append(o);
    this.overlay = o;
    this.svg = o.querySelector('.tikz-canvas');
    this.status = o.querySelector('.tikz-status');
    this.canvas = new CanvasController(this.svg);
    this.snap = new SnapController(PX_PER_CM);

    o.querySelector('.tikz-exit').onclick = () => this.close();
    o.querySelector('.tikz-finish').onclick = () => {
      const code = exportTikz(this.items, { environment: this.environmentOptions(), ctikzset: this.environmentPreamble() });
      this.close(); this.onDone?.(code);
    };
    const slider = o.querySelector('.tikz-zoom-slider'), input = o.querySelector('.tikz-zoom-input');
    this.canvas.onZoomChange = (percent) => {
      const value = Math.round(percent);
      slider.value = String(value); input.value = String(value);
      const ro = o.querySelector('.tikz-zoom-readout');
      if (ro) ro.textContent = value + '%';
    };
    o.querySelector('.tikz-grid-size').onchange = e => { this.snap.gridStep = +e.target.value * PX_PER_CM; this.canvas.drawGrid(); };
    o.querySelector('.tikz-grid-show').onchange = e => { this.canvas.layers.grid.style.display = e.target.checked ? '' : 'none'; };
    o.querySelector('.tikz-snap-show').onchange = e => { this.snapEnabled = e.target.checked; };
    const setZoomPercent = value => {
      this.canvas.setZoomPercent(value);
    };
    slider.oninput = () => setZoomPercent(slider.value);
    input.onchange = () => setZoomPercent(input.value);

    o.querySelectorAll('.tikz-tools button').forEach(b => b.onclick = () => this.useTool(b.dataset.tool));
    this.buildTree();
    this.loadSymbolArtwork();

    let pan = null;
    this.svg.addEventListener('pointerdown', e => {
      if (e.button === 1 || e.button === 2) { pan = { x: e.clientX, y: e.clientY, vx: this.canvas.view.x, vy: this.canvas.view.y }; e.preventDefault(); return; }
      this.pointerDown(e);
    });
    this.svg.addEventListener('pointermove', e => {
      if (pan) { this.canvas.view.x = pan.vx + (e.clientX - pan.x); this.canvas.view.y = pan.vy + (e.clientY - pan.y); this.canvas.apply(); return; }
      this.pointerMove(e);
    });
    this.svg.addEventListener('pointerup', e => { pan = null; this.pointerUp(e); });
    this.svg.addEventListener('contextmenu', e => e.preventDefault());
    this.svg.addEventListener('dblclick', () => { if (this.tool === 'wire') this.finishWire(); });
    this.svg.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
      if (e.key === 'Enter' && this.tool === 'wire') this.finishWire();
      if (e.key === 'r' || e.key === 'R') this.rotateSelected();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    });
  }

  async loadSymbolArtwork() {
    try {
      const defs = this.svg.querySelector('defs');
      const res = await fetch('assets/tikz-symbols.svg');
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for assets/tikz-symbols.svg');
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      let { defs: libDefs, order } = parseLibrary(text);
      if (!libDefs.length) {
        // fallback: parse the DOM tree directly (metadata registry)
        libDefs = [];
        order = [];
        for (const c of doc.querySelectorAll('metadata component')) {
          const a = c.attributes;
          const get = n => a.getNamedItem(n)?.value || '';
          const v = c.querySelector('variant');
          const group = get('group') || 'Unsorted components';
          if (!order.includes(group)) order.push(group);
          libDefs.push({
            cat: group, kind: get('type') === 'path' ? 'path' : get('type') === 'open' ? 'open' : 'node',
            name: get('display') || get('tikz'), tikz: get('tikz'), anchor: [parseFloat(v?.getAttribute('x') || 0), parseFloat(v?.getAttribute('y') || 0)],
            id: v?.getAttribute('for') || '', pins: [...c.querySelectorAll('pin')].filter(p => p.getAttribute('x')).map(p => ({ name: p.getAttribute('name') || '', x: parseFloat(p.getAttribute('x')), y: parseFloat(p.getAttribute('y')) })),
          });
        }
        for (const d of libDefs) if ((d.kind === 'path' || d.kind === 'open') && d.pins.length >= 2) { d.pinDist = Math.hypot(d.pins[0].x - d.pins[1].x, d.pins[0].y - d.pins[1].y) || 1; d.length = d.pinDist; }
      }
      this.componentDefs = [...BASIC_COMPONENTS, ...libDefs];
      this.groupOrder = ['Basic', ...order.filter(g => g !== 'Basic')];
      defs.append(...doc.documentElement.children);
      this.buildTree();
      this.setStatus(this.t('已加载 ', 'Loaded ') + this.componentDefs.length + this.t(' 个元件', ' components'));
    } catch (error) {
      console.error(error);
      this.setStatus(this.t('符号库加载失败：', 'Library load failed: ') + (error?.message || error));
      alert('TikZ symbols failed: ' + (error?.message || error));
    }
  }

  buildTree(filter = '') {
    const tree = this.overlay.querySelector('.tikz-tree');
    tree.innerHTML = '';
    const all = this.componentDefs || BASIC_COMPONENTS;
    const zh = (document.documentElement.lang || '').startsWith('zh');
    const groups = this.groupOrder || [...new Set(all.map(d => d.cat))];
    for (const cat of groups) {
      const defs = all.filter(d => d.cat === cat && (!filter || (d.name + ' ' + d.tikz).toLowerCase().includes(filter.toLowerCase())));
      if (!defs.length) continue;
      const det = document.createElement('details');
      det.open = cat === 'Basic' && !filter;
      const sum = document.createElement('summary');
      const lab = GROUP_LABELS[cat] || [cat, cat];
      sum.textContent = zh ? lab[0] : lab[1];
      det.append(sum);
      const grid = document.createElement('div');
      grid.className = 'tikz-icon-grid';
      for (const def of defs) {
        const b = document.createElement('button');
        b.className = 'tikz-sym';
        b.title = def.name;
        b.setAttribute('searchData', (def.name + ' ' + def.tikz).toLowerCase());
        b.append(this.iconFor(def));
        b.onclick = () => {
          if (def.kind === 'text') { this.useTool('text'); return; }
          if (def.kind === 'wire') { this.useTool('wire'); return; }
          this.useTool('select');
          this.placingDef = def;
          this.setStatus(this.t('点击画布放置：', 'Click canvas to place: ') + def.name);
        };
        grid.append(b);
      }
      det.append(grid);
      tree.append(det);
    }
    this.overlay.querySelector('.tikz-search').oninput = e => this.buildTree(e.target.value);
  }

  iconFor(def) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '40'); svg.setAttribute('height', '26');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.append(g);
    if (def.source === 'isVoltage' && !document.getElementById(def.id)) {
      svg.setAttribute('viewBox', '0 0 40 40');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      for (const [key, value] of Object.entries({ cx: 20, cy: 20, r: 15, fill: 'none', stroke: '#333', 'stroke-width': 2 })) circle.setAttribute(key, value);
      g.append(circle);
      for (const [y, plus] of [[13, true], [27, false]]) {
        const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        for (const [key, value] of Object.entries({ x1: 15, y1: y, x2: 25, y2: y, stroke: '#333', 'stroke-width': 2 })) h.setAttribute(key, value);
        g.append(h);
        if (plus) {
          const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          for (const [key, value] of Object.entries({ x1: 20, y1: y - 5, x2: 20, y2: y + 5, stroke: '#333', 'stroke-width': 2 })) v.setAttribute(key, value);
          g.append(v);
        }
      }
      return svg;
    }
    const stroke = { fill: 'none', stroke: '#333', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const setA = (el, attrs) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
    if (def.id && (def.kind === 'node' || def.kind === 'path')) {
      const symEl = document.getElementById(def.id);
      const vbAttr = symEl?.getAttribute('viewBox');
      if (vbAttr) svg.setAttribute('viewBox', vbAttr);
      else {
        const vb = def.viewBox || [0, 0, 40, 20];
        svg.setAttribute('viewBox', `${vb[0]} ${vb[1]} ${vb[2]} ${vb[3]}`);
      }
      const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      u.setAttribute('href', '#' + def.id);
      g.append(u);
      return svg;
    }
    if (def.kind === 'path') {
      svg.setAttribute('viewBox', '0 0 40 20');
      g.append(setA(document.createElementNS('http://www.w3.org/2000/svg', 'line'), { x1: 2, y1: 10, x2: 38, y2: 10, ...stroke }));
      return svg;
    }
    if (def.kind === 'open') {
      svg.setAttribute('viewBox', '0 0 40 20');
      g.append(setA(document.createElementNS('http://www.w3.org/2000/svg', 'line'), { x1: 2, y1: 10, x2: 14, y2: 10, ...stroke }));
      g.append(setA(document.createElementNS('http://www.w3.org/2000/svg', 'line'), { x1: 26, y1: 10, x2: 38, y2: 10, ...stroke }));
      for (const cx of [14, 26]) g.append(setA(document.createElementNS('http://www.w3.org/2000/svg', 'circle'), { cx, cy: 10, r: 3, ...stroke }));
      return svg;
    }
    if (def.kind === 'rect') {
      svg.setAttribute('viewBox', '0 0 40 26');
      const w = 30, h = 18, cx = 20, cy = 13;
      let el;
      if (def.shape === 'trapezoid') el = setA(document.createElementNS('http://www.w3.org/2000/svg', 'path'), { d: `M${cx - w / 2},${cy - h / 2} L${cx + w / 2},${cy - h / 2} L${cx + w / 4},${cy + h / 2} L${cx - w / 4},${cy + h / 2} Z`, ...stroke });
      else if (def.shape === 'arrow') el = setA(document.createElementNS('http://www.w3.org/2000/svg', 'path'), { d: `M${cx - w / 2},${cy - h / 2} L${cx + w / 4},${cy - h / 2} L${cx + w / 4},${cy - h / 2 - 3} L${cx + w / 2},${cy} L${cx + w / 4},${cy + h / 2 + 3} L${cx + w / 4},${cy + h / 2} L${cx - w / 2},${cy + h / 2} Z`, ...stroke });
      else if (def.shape === 'step') el = setA(document.createElementNS('http://www.w3.org/2000/svg', 'path'), { d: `M${cx - w / 2},${cy - h / 2} L${cx + w / 4},${cy - h / 2} L${cx + w / 4},${cy} L${cx + w / 2},${cy} L${cx + w / 2},${cy + h / 2} L${cx - w / 2},${cy + h / 2} Z`, ...stroke });
      else if (def.round) el = setA(document.createElementNS('http://www.w3.org/2000/svg', 'ellipse'), { cx, cy, rx: w / 2, ry: h / 2, ...stroke });
      else el = setA(document.createElementNS('http://www.w3.org/2000/svg', 'rect'), { x: cx - w / 2, y: cy - h / 2, width: w, height: h, ...stroke });
      g.append(el);
      return svg;
    }
    if (def.kind === 'text') {
      svg.setAttribute('viewBox', '0 0 40 26');
      const t = setA(document.createElementNS('http://www.w3.org/2000/svg', 'text'), { x: 20, y: 18, 'text-anchor': 'middle', 'font-size': 14, 'font-family': 'serif', fill: '#333' });
      t.textContent = 'T';
      g.append(t);
      return svg;
    }
    if (def.kind === 'wire') {
      svg.setAttribute('viewBox', '0 0 40 26');
      g.append(setA(document.createElementNS('http://www.w3.org/2000/svg', 'line'), { x1: 4, y1: 20, x2: 36, y2: 6, ...stroke }));
      return svg;
    }
    return svg;
  }

  setStatus(s) { this.status.textContent = s; }
  useTool(tool) {
    if (tool === 'rotate') return this.rotateSelected();
    if (tool === 'delete') return this.deleteSelected();
    if (tool === 'undo') return this.undo();
    if (tool === 'redo') return this.redo();
    if (tool === 'clear') { this.pushHistory(); this.items = []; this.selected = null; this.selection = []; this.recomputeSnap(); this.render(); return; }
    if (tool === 'fit') { this.canvas.fit(); return; }
    this.tool = tool; this.placingDef = null; this.wirePts = [];
    this.svg.style.cursor = tool === 'pan' ? 'grab' : tool === 'eraser' ? 'not-allowed' : 'crosshair';
    this.overlay.querySelectorAll('.tikz-tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    this.render();
  }
  rotateSelected() { if (this.selected && this.selected.rotateBy) { this.pushHistory(); this.selected.rotateBy(90); this.render(); } }
  erase(item) {
    if (!item) return;
    this.pushHistory();
    this.items = this.items.filter(candidate => candidate !== item);
    this.selection = this.selection.filter(candidate => candidate !== item);
    if (this.selected === item) this.selected = this.selection[this.selection.length - 1] || null;
    this._drag = null; this._resize = null;
    this.recomputeSnap();
    this.render();
  }
  deleteSelected() { if (this.selection.length > 1) { this.pushHistory(); this.items = this.items.filter(item => !this.selection.includes(item)); this.selection = []; this.selected = null; this.recomputeSnap(); this.render(); } else this.erase(this.selected); }

  contentBBox() {
    const xs = this.items.flatMap(i => i.kind === 'wire' ? i.pts.map(p => p.x) : [i.x]);
    const ys = this.items.flatMap(i => i.kind === 'wire' ? i.pts.map(p => p.y) : [i.y]);
    const w = xs.length ? Math.max(...xs) - Math.min(0, ...xs) : 0;
    const h = ys.length ? Math.max(...ys) - Math.min(0, ...ys) : 0;
    return { w, h };
  }

  recomputeSnap() {
    this.snap.clearTerminals();
    for (const it of this.items) {
      if (!it.terminals) continue;
      it.terminals().forEach((t, ti) => this.snap.register([{ x: it.x + t.dx, y: it.y + t.dy, owner: it, ti }]));
    }
  }

  // Snap the component as a whole by trying every named pin.  This is the
  // important CircuiTikZ-Designer behaviour: a transistor snaps by B/C/E, a
  // transformer by A1/A2/B1/B2, not merely by its centre.
  snapItem(item, desired) {
    if (!this.snapEnabled) return desired;
    const terminals = item.terminals?.() || [];
    // Node symbols also expose their centre as an additional moving snap
    // point in the reference designer; it is not a fixed anchor of the symbol.
    if (item.kind === 'node') terminals.push({ dx: 0, dy: 0, name: 'center' });
    if (!terminals.length) return this.snap.snap(desired);
    let best = null;
    for (const terminal of terminals) {
      const target = this.snap.snap({ x: desired.x + terminal.dx, y: desired.y + terminal.dy });
      const candidate = { x: target.x - terminal.dx, y: target.y - terminal.dy };
      const dist = Math.hypot(candidate.x - desired.x, candidate.y - desired.y);
      if (!best || dist < best.dist) best = { point: candidate, dist };
    }
    return best.point;
  }

  // ---------- pointer interaction ----------
  pointerDown(e) {
    const raw = this.canvas.toWorld(e.clientX, e.clientY);
    if (this.tool === 'pan' || e.button === 1 || e.button === 2) {
      this._pan = { x: e.clientX, y: e.clientY, vx: this.canvas.view.x, vy: this.canvas.view.y };
      this.svg.classList.add('is-panning');
      e.preventDefault();
      return;
    }
    if (this.tool === 'eraser') {
      const target = e.target?.closest?.('[data-uid]');
      const item = target ? this.items.find(candidate => String(candidate.uid) === target.getAttribute('data-uid')) : this.hitTest(raw);
      this.erase(item);
      return;
    }
    if (this.tool === 'select' || this.placingDef) { /* handled below */ }
    if (this.placingDef) {
      const raw = this.canvas.toWorld(e.clientX, e.clientY);
      const def = this.placingDef;
      const item = def.kind === 'node' ? new NodeSymbol(def, raw.x, raw.y)
        : def.kind === 'open' ? new OpenComponent(def, raw.x, raw.y)
        : def.kind === 'rect' ? new RectComponent(def, raw.x, raw.y)
        : new PathComponent(def, raw.x, raw.y);
      const p = this.snapItem(item, raw);
      item.moveTo(p.x, p.y);
      this.items.push(item); this.selected = item; this.selection = [item]; this.placingDef = null;
      this.pushHistory();
      this.recomputeSnap(); this.render();
      return;
    }
    if (this.tool === 'wire') {
      this.wirePts.push(this.snap.snap(raw));
      this.renderPreview();
      return;
    }
    if (this.tool === 'text') {
      if (!txt.trim()) { this.setStatus(this.t('请先填写文字内容', 'Enter text first')); return; }
      const size = +this.overlay.querySelector('.tikz-text-size').value || 12;
      const textItem = new TextItem(txt, size, raw.x, raw.y); this.items.push(textItem); this.selected = textItem; this.selection = [textItem];
      this.pushHistory(); this.render(); return;
    }
    // select tool: adjustment handles first, then the actual symbol
    const th = this.hitTerminal(raw);
    if (th) { this._resize = th; return; }
    const target = e.target?.closest?.('[data-uid]');
    const targetItem = target ? this.items.find(item => String(item.uid) === target.getAttribute('data-uid')) : null;
    const hit = targetItem || this.hitTest(raw);
    if (hit && e.shiftKey) {
      this.selection = this.selection.includes(hit) ? this.selection.filter(item => item !== hit) : [...this.selection, hit];
      this.selected = this.selection[this.selection.length - 1] || null;
    } else {
      this.selection = hit ? [hit] : [];
      this.selected = hit;
    }
    this.render();
    if (hit && this.selection.length === 1) this._drag = { item: hit, sx: raw.x, sy: raw.y, ox: hit.x, oy: hit.y, opts: hit.pts?.map(p => ({ ...p })) };
  }

  pointerMove(e) {
    const raw = this.canvas.toWorld(e.clientX, e.clientY);
    if (this._pan) {
      this.canvas.view.x = this._pan.vx + (e.clientX - this._pan.x);
      this.canvas.view.y = this._pan.vy + (e.clientY - this._pan.y);
      this.canvas.apply();
      return;
    }
    if (this._resize) {
      const p = this.snapEnabled ? this.snap.snap(raw) : raw;
      if (this._resize.method === 'setAdjustPoint') this._resize.item[this._resize.method](this._resize.key, p);
      else this._resize.item[this._resize.method](p);
      this.recomputeSnap(); this.render();
      return;
    }
    if (this._drag) {
      let p = this.snap.snapIfClose(raw);
      const d = this._drag, it = d.item;
      if (it.kind !== 'wire') {
        // alignment guides: snap origin x/y to other components' axes
        const tol = 4 / this.canvas.view.k; const gx = [], gy = [];
        for (const o of this.items) {
          if (o === it) continue;
          if (Math.abs(o.x - p.x) < tol) { p = { x: o.x, y: p.y }; gx.push(o.x); }
          if (Math.abs(o.y - p.y) < tol) { p = { x: p.x, y: o.y }; gy.push(o.y); }
        }
        this._guides = { gx, gy, y: p.y, x: p.x, item: it };
      } else this._guides = null;
      const dx = p.x - d.sx, dy = p.y - d.sy;
      if (it.kind === 'wire') { it.pts = d.opts.map(q => ({ x: q.x + dx, y: q.y + dy })); it.x = it.pts[0].x; it.y = it.pts[0].y; }
      else {
        const desired = { x: d.ox + dx, y: d.oy + dy };
        const snapped = this.snapItem(it, desired);
        it.moveTo(snapped.x, snapped.y);
      }
      this.recomputeSnap(); this.render();
      this.renderGuides();
      return;
    }
    if (this.placingDef) { this._lastSnap = this.snap.snap(raw); this.canvas.setGhost([...this.ghostNodes(raw), ...this.renderSnapIndicator()]); return; }
    if (this.tool === 'wire' && this.wirePts.length) { this._wirePreview = raw; this._lastSnap = this.snap.snap(raw); this.renderPreview(); return; }
    this.canvas.setGhost([]);
  }

  pointerUp() {
    if (this._pan) { this._pan = null; this.svg.classList.remove('is-panning'); return; }
    if (this._drag || this._resize) this.pushHistory();
    this._drag = null; this._resize = null; this._wirePreview = null; this._guides = null; this._lastSnap = null;
    this.render();
  }

  finishWire() {
    // Double-click/Enter can add the same grid point twice; never emit
    // zero-length wire segments.
    this.wirePts = this.wirePts.filter((point, index, points) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > .01);
    if (this.wirePts.length >= 2) {
      const w = new Wire(this.wirePts.map(p => ({ ...p })));
      const attach = p => {
        const t = this.snap.terminals.find(t => Math.hypot(t.x - p.x, t.y - p.y) < 0.5 / this.canvas.view.k);
        return t ? { comp: t.owner, ti: t.ti } : null;
      };
      w.setEnds(attach(this.wirePts[0]), attach(this.wirePts[this.wirePts.length - 1]));
      this.items.push(w); this.selected = w; this.selection = [w]; this.pushHistory();
    }
    this.wirePts = []; this._wirePreview = null;
    this.recomputeSnap(); this.render();
  }

  hitTerminal(p) {
    if (!this.selected?.adjustPoints) return null;
    const tol = 9 / this.canvas.view.k;
    for (const point of this.selected.adjustPoints()) {
      if (Math.hypot(p.x - point.x, p.y - point.y) < tol) {
        if (this.selected.setAdjustPoint) return { item: this.selected, method: 'setAdjustPoint', key: point.key };
        return { item: this.selected, method: point.key === 'start' ? 'setStartFrom' : point.key === 'end' ? 'setEndFrom' : 'setLengthFrom' };
      }
    }
    return null;
  }

  hitTest(p) {
    const tol = 8 / this.canvas.view.k;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.kind === 'wire') {
        for (let j = 0; j < it.pts.length - 1; j++) if (this.distSeg(p, it.pts[j], it.pts[j + 1]) < tol) return it;
        continue;
      }
      const b = it.bbox?.();
      if (b && p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) return it;
    }
    return null;
  }
  distSeg(p, a, b) {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  }

  ghostNodes(raw) {
    if (!this.placingDef) return [];
    const def = this.placingDef;
    let item = null;
    if (def.kind === 'node') item = new NodeSymbol(def, raw.x, raw.y);
    else if (def.kind === 'open') item = new OpenComponent(def, raw.x, raw.y);
    else if (def.kind === 'rect') item = new RectComponent(def, raw.x, raw.y);
    else if (def.kind !== 'text' && def.kind !== 'wire') item = new PathComponent(def, raw.x, raw.y);
    if (!item) return [];
    const p = this.snapItem(item, raw);
    item.moveTo(p.x, p.y);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('opacity', '0.5');
    g.append(item.toSvg());
    return [g];
  }

  renderGuides() {
    const { SVGNS } = { SVGNS: 'http://www.w3.org/2000/svg' };
    const g = this._guides;
    if (!g || !g.item) { return; }
    const nodes = [];
    const k = this.canvas.view.k;
    const span = 4000;
    for (const x of g.gx) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', x); l.setAttribute('x2', x); l.setAttribute('y1', -span); l.setAttribute('y2', span);
      l.setAttribute('stroke', '#e04fa0'); l.setAttribute('stroke-width', 1 / k); l.setAttribute('stroke-dasharray', `${6 / k},${4 / k}`);
      nodes.push(l);
    }
    for (const y of g.gy) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('y1', y); l.setAttribute('y2', y); l.setAttribute('x1', -span); l.setAttribute('x2', span);
      l.setAttribute('stroke', '#e04fa0'); l.setAttribute('stroke-width', 1 / k); l.setAttribute('stroke-dasharray', `${6 / k},${4 / k}`);
      nodes.push(l);
    }
    this.canvas.setPreview([...nodes, ...this.canvas.layers.preview.childNodes]);
  }

  renderSnapIndicator() {
    const { SVGNS } = { SVGNS: 'http://www.w3.org/2000/svg' };
    const p = this._lastSnap;
    if (!p) return [];
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 5 / this.canvas.view.k);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#18a058'); c.setAttribute('stroke-width', 2 / this.canvas.view.k);
    return [c];
  }

  renderPreview() {
    const { SVGNS } = { SVGNS: 'http://www.w3.org/2000/svg' };
    const nodes = [];
    const pts = [...this.wirePts, ...(this._wirePreview ? [this.snap.snap(this._wirePreview)] : [])];
    if (pts.length >= 2) {
      const pl = document.createElementNS(SVGNS, 'polyline');
      pl.setAttribute('points', pts.map(q => `${q.x},${q.y}`).join(' '));
      pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#2f6fed');
      pl.setAttribute('stroke-width', 2); pl.setAttribute('stroke-dasharray', '6 4');
      nodes.push(pl);
    }
    for (const q of pts) {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', q.x); c.setAttribute('cy', q.y); c.setAttribute('r', 3.5);
      c.setAttribute('fill', '#fff'); c.setAttribute('stroke', '#2f6fed'); c.setAttribute('stroke-width', 1.5);
      nodes.push(c);
    }
    this.canvas.setPreview([...nodes, ...this.renderSnapIndicator()]);
  }

  propertySection(panel, title) {
    const section = document.createElement('section');
    section.className = 'tikz-prop-section';
    const heading = document.createElement('div');
    heading.className = 'tikz-props-title';
    heading.textContent = title;
    const body = document.createElement('div');
    body.className = 'tikz-prop-section-body';
    section.append(heading, body);
    panel.append(section);
    return body;
  }

  propertyButton(parent, label, action, active = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tikz-prop-button' + (active ? ' active' : '');
    button.textContent = label;
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', action);
    parent.append(button);
    return button;
  }

  propertyField(parent, labelText, control) {
    const field = document.createElement('label');
    field.className = 'tikz-field tikz-option-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    field.append(span, control);
    parent.append(field);
    return field;
  }

  reorderItem(item, mode) {
    const index = this.items.indexOf(item);
    if (index < 0) return;
    this.pushHistory();
    const next = [...this.items];
    next.splice(index, 1);
    if (mode === 'front') next.push(item);
    else if (mode === 'back') next.unshift(item);
    else if (mode === 'forward') next.splice(Math.min(next.length, index + 1), 0, item);
    else next.splice(Math.max(0, index - 1), 0, item);
    this.items = next;
    this.render();
  }

  mutateSelected(action) {
    if (!this.selected) return;
    this.pushHistory();
    action(this.selected);
    this.recomputeSnap();
    this.refreshProperties();
  }

  refreshProperties() {
    this._skipPropertyPanel = true;
    this.render();
    this._skipPropertyPanel = false;
  }

  selectionBBox() {
    const boxes = this.selection.map(item => item.bbox?.()).filter(Boolean);
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map(box => box.x));
    const y = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.w));
    const bottom = Math.max(...boxes.map(box => box.y + box.h));
    return { x, y, w: right - x, h: bottom - y };
  }

  groupSelection() {
    if (this.selection.length < 2) return;
    this.pushHistory();
    const selected = [...this.selection];
    const firstIndex = Math.min(...selected.map(item => this.items.indexOf(item)).filter(index => index >= 0));
    const group = new GroupComponent(selected);
    this.items = this.items.filter(item => !selected.includes(item));
    this.items.splice(Math.max(0, firstIndex), 0, group);
    this.selection = [group]; this.selected = group;
    this.recomputeSnap(); this.render();
  }

  ungroupSelection() {
    const group = this.selected;
    if (!group || group.kind !== 'group') return;
    this.pushHistory();
    const index = this.items.indexOf(group);
    if (index >= 0) this.items.splice(index, 1, ...group.items);
    this.selection = [...group.items];
    this.selected = this.selection[this.selection.length - 1] || null;
    this.recomputeSnap(); this.render();
  }

  rotateSelection(degrees) {
    if (!this.selection.length) return;
    this.pushHistory();
    for (const item of this.selection) item.rotateBy?.(degrees);
    this.recomputeSnap(); this.refreshProperties();
  }

  flipSelection(vertical) {
    if (!this.selection.length) return;
    this.pushHistory();
    for (const item of this.selection) {
      if (vertical) item.flipY = !item.flipY;
      else item.mirror = !item.mirror;
    }
    this.recomputeSnap(); this.refreshProperties();
  }

  reorderSelection(mode) {
    const selected = new Set(this.selection);
    if (!selected.size) return;
    this.pushHistory();
    const rest = this.items.filter(item => !selected.has(item));
    if (mode === 'front') rest.push(...this.selection);
    else if (mode === 'back') rest.unshift(...this.selection);
    else {
      const ordered = [...this.items];
      const indices = ordered.map((item, index) => selected.has(item) ? index : -1).filter(index => index >= 0);
      const sorted = indices.sort((a, b) => mode === 'forward' ? b - a : a - b);
      for (const index of sorted) {
        const target = mode === 'forward' ? Math.min(ordered.length - 1, index + 1) : Math.max(0, index - 1);
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      }
      this.items = ordered;
      this.refreshProperties();
      return;
    }
    this.items = rest;
    this.refreshProperties();
  }

  alignSelection(mode, horizontal) {
    const boxes = this.selection.map(item => ({ item, box: item.bbox?.() })).filter(entry => entry.box);
    if (boxes.length < 2) return;
    this.pushHistory();
    const min = Math.min(...boxes.map(entry => horizontal ? entry.box.x : entry.box.y));
    const max = Math.max(...boxes.map(entry => horizontal ? entry.box.x + entry.box.w : entry.box.y + entry.box.h));
    for (const { item, box } of boxes) {
      const target = mode === 'start' ? min : mode === 'end' ? max - (horizontal ? box.w : box.h) : (min + max) / 2 - (horizontal ? box.w : box.h) / 2;
      if (horizontal) item.moveTo?.(target, item.y);
      else item.moveTo?.(item.x, target);
    }
    this.recomputeSnap(); this.refreshProperties();
  }

  distributeSelection(mode, horizontal) {
    const entries = this.selection.map(item => ({ item, box: item.bbox?.() })).filter(entry => entry.box);
    if (entries.length < 3) return;
    this.pushHistory();
    entries.sort((a, b) => horizontal ? a.box.x - b.box.x : a.box.y - b.box.y);
    if (mode === 'center') {
      const first = entries[0], last = entries[entries.length - 1];
      const start = horizontal ? first.box.x + first.box.w / 2 : first.box.y + first.box.h / 2;
      const end = horizontal ? last.box.x + last.box.w / 2 : last.box.y + last.box.h / 2;
      const step = (end - start) / (entries.length - 1);
      entries.forEach((entry, index) => {
        if (index === 0 || index === entries.length - 1) return;
        const target = start + step * index - (horizontal ? entry.box.w : entry.box.h) / 2;
        if (horizontal) entry.item.moveTo?.(target, entry.item.y);
        else entry.item.moveTo?.(entry.item.x, target);
      });
    } else {
      const total = entries.reduce((sum, entry) => sum + (horizontal ? entry.box.w : entry.box.h), 0);
      const span = horizontal
        ? entries[entries.length - 1].box.x + entries[entries.length - 1].box.w - entries[0].box.x
        : entries[entries.length - 1].box.y + entries[entries.length - 1].box.h - entries[0].box.y;
      const gap = (span - total) / (entries.length - 1);
      let cursor = horizontal ? entries[0].box.x : entries[0].box.y;
      for (const entry of entries) {
        if (horizontal) entry.item.moveTo?.(cursor, entry.item.y);
        else entry.item.moveTo?.(entry.item.x, cursor);
        cursor += (horizontal ? entry.box.w : entry.box.h) + gap;
      }
    }
    this.recomputeSnap(); this.refreshProperties();
  }

  environmentOptions() {
    const options = [];
    const voltages = { american: 'american voltages', european: 'european voltages', straight: 'straight voltages', raised: 'raised voltages' };
    if (this.envSettings.voltages && this.envSettings.voltages !== 'european') options.push(voltages[this.envSettings.voltages]);
    const convention = { old: 'voltage dir=old', RP: 'voltage dir=RP', EF: 'voltage dir=EF', noold: 'voltage dir=nold' };
    if (this.envSettings.voltageConvention && this.envSettings.voltageConvention !== 'noold') options.push(convention[this.envSettings.voltageConvention]);
    return options.filter(Boolean);
  }

  environmentPreamble() {
    const preamble = [];
    if (this.envSettings.labelOrientation && this.envSettings.labelOrientation !== 'smart') {
      preamble.push('label/align=' + this.envSettings.labelOrientation);
    }
    return preamble;
  }

  saveEnvironment() {
    try { localStorage.setItem('lineae.tikz.environment', JSON.stringify(this.envSettings)); } catch { /* ignore */ }
  }

  applyEnvironmentPreset(name) {
    if (name === 'american') this.envSettings = { ...this.envSettings, voltages: 'american' };
    else if (name === 'european') this.envSettings = { ...this.envSettings, voltages: 'european' };
    else this.envSettings = { voltages: 'european', voltageConvention: 'noold', labelOrientation: 'smart' };
    this.saveEnvironment();
    this.buildViewPropertyPanel();
  }

  buildViewPropertyPanel() {
    const panel = this.overlay?.querySelector('.tikz-property-panel');
    if (!panel) return;
    panel.replaceChildren();
    const presets = this.propertySection(panel, this.t('环境变量预设', 'Environment Variable Presets'));
    const presetGrid = document.createElement('div'); presetGrid.className = 'tikz-prop-grid cols-3'; presets.append(presetGrid);
    this.propertyButton(presetGrid, 'Default', () => this.applyEnvironmentPreset('default'));
    this.propertyButton(presetGrid, 'American', () => this.applyEnvironmentPreset('american'));
    this.propertyButton(presetGrid, 'European', () => this.applyEnvironmentPreset('european'));
    const environment = this.propertySection(panel, this.t('环境变量', 'Environment Variables'));
    const choices = [
      ['voltages', 'Voltage Style', [['american', 'American Voltages'], ['european', 'European Voltages'], ['straight', 'Straight Voltages'], ['raised', 'Raised Voltages']]],
      ['voltageConvention', 'Voltage Convention', [['old', 'Old'], ['RP', 'RP'], ['EF', 'EF'], ['noold', 'No Old']]],
      ['labelOrientation', 'Label Orientation', [['smart', 'Smart'], ['rotate', 'Rotate'], ['straight', 'Straight']]],
    ];
    for (const [key, label, entries] of choices) {
      const select = document.createElement('select');
      for (const [value, text] of entries) select.append(new Option(text, value));
      select.value = this.envSettings[key];
      select.onchange = () => { this.envSettings[key] = select.value; this.saveEnvironment(); };
      this.propertyField(environment, label, select);
    }
    const info = document.createElement('div');
    info.className = 'tikz-info-line';
    info.textContent = this.t('未选择元件：这里编辑整张图的 CircuiTikZ 环境。', 'No selection: edit the drawing environment.');
    panel.append(info);
  }

  buildMultiPropertyPanel() {
    const panel = this.overlay?.querySelector('.tikz-property-panel');
    if (!panel) return;
    panel.replaceChildren();
    const manipulation = this.propertySection(panel, this.t('操作', 'Manipulation'));
    const grid = document.createElement('div'); grid.className = 'tikz-prop-grid cols-2'; manipulation.append(grid);
    this.propertyButton(grid, '↻ 90°', () => this.rotateSelection(90));
    this.propertyButton(grid, '↺ 90°', () => this.rotateSelection(-90));
    this.propertyButton(grid, '↻ 45°', () => this.rotateSelection(45));
    this.propertyButton(grid, '↺ 45°', () => this.rotateSelection(-45));
    this.propertyButton(grid, 'Flip H', () => this.flipSelection(false));
    this.propertyButton(grid, 'Flip V', () => this.flipSelection(true));

    const ordering = this.propertySection(panel, this.t('层级', 'Ordering'));
    const orderGrid = document.createElement('div'); orderGrid.className = 'tikz-prop-grid cols-2'; ordering.append(orderGrid);
    this.propertyButton(orderGrid, 'Foreground', () => this.reorderSelection('front'));
    this.propertyButton(orderGrid, 'Background', () => this.reorderSelection('back'));
    this.propertyButton(orderGrid, 'Forward', () => this.reorderSelection('forward'));
    this.propertyButton(orderGrid, 'Backward', () => this.reorderSelection('backward'));

    const grouping = this.propertySection(panel, this.t('分组', 'Grouping'));
    this.propertyButton(grouping, 'Group', () => this.groupSelection());

    const align = this.propertySection(panel, this.t('对齐', 'Align'));
    const alignGrid = document.createElement('div'); alignGrid.className = 'tikz-prop-grid cols-3'; align.append(alignGrid);
    for (const [label, mode] of [['Left', 'start'], ['Center', 'center'], ['Right', 'end']]) this.propertyButton(alignGrid, label, () => this.alignSelection(mode, true));
    for (const [label, mode] of [['Top', 'start'], ['Middle', 'center'], ['Bottom', 'end']]) this.propertyButton(alignGrid, label, () => this.alignSelection(mode, false));

    const distribute = this.propertySection(panel, this.t('分布', 'Distribute'));
    const distributeGrid = document.createElement('div'); distributeGrid.className = 'tikz-prop-grid cols-2'; distribute.append(distributeGrid);
    this.propertyButton(distributeGrid, 'Center H', () => this.distributeSelection('center', true));
    this.propertyButton(distributeGrid, 'Spacing H', () => this.distributeSelection('spacing', true));
    this.propertyButton(distributeGrid, 'Center V', () => this.distributeSelection('center', false));
    this.propertyButton(distributeGrid, 'Spacing V', () => this.distributeSelection('spacing', false));

    if (this.selection.every(item => item.def?.id === this.selection[0].def?.id) && this.selection[0].def) {
      const styleSection = this.propertySection(panel, this.t('组件样式', 'Component style'));
      const body = document.createElement('div'); body.className = 'tikz-options'; styleSection.append(body);
      this.populateStyleOptions(body, this.selection[0], this.selection);
    }

    const shared = this.propertySection(panel, this.t('共有属性', 'Shared properties'));
    for (const [key, label] of [['label', 'Label'], ['value', 'Value']]) {
      if (!this.selection.every(item => key in item)) continue;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = this.selection.every(item => (item[key] || '') === (this.selection[0][key] || '')) ? (this.selection[0][key] || '') : '';
      input.placeholder = this.t('批量设置', 'Set all');
      input.oninput = () => { for (const item of this.selection) item[key] = input.value; this.refreshProperties(); };
      this.propertyField(shared, label, input);
    }
    for (const [key, label] of [['strokeColor', 'Stroke'], ['fillColor', 'Fill']]) {
      if (!this.selection.every(item => key in item)) continue;
      const color = document.createElement('input');
      color.type = 'color';
      color.value = this.selection[0][key] || (key === 'strokeColor' ? '#222222' : '#ffffff');
      color.oninput = () => { for (const item of this.selection) item[key] = color.value; this.refreshProperties(); };
      this.propertyField(shared, label, color);
    }
    if (this.selection.every(item => 'scaleValue' in item)) {
      const scale = document.createElement('input');
      scale.type = 'number'; scale.min = '0.1'; scale.max = '10'; scale.step = '0.05';
      const same = this.selection.every(item => item.scaleValue === this.selection[0].scaleValue);
      scale.value = same ? String(this.selection[0].scaleValue || 1) : '';
      scale.placeholder = this.t('批量设置', 'Set all');
      scale.onchange = () => { const value = Math.max(.1, Math.min(10, Number(scale.value) || 1)); for (const item of this.selection) item.scaleValue = value; this.recomputeSnap(); this.refreshProperties(); };
      this.propertyField(shared, 'Scale', scale);
    }
    if (this.selection.every(item => 'lineWidth' in item)) {
      const width = document.createElement('input');
      width.type = 'number'; width.min = '0'; width.max = '10'; width.step = '0.1';
      const same = this.selection.every(item => item.lineWidth === this.selection[0].lineWidth);
      width.value = same ? String(this.selection[0].lineWidth ?? '') : '';
      width.placeholder = this.t('批量设置', 'Set all');
      width.onchange = () => { const value = width.value ? Number(width.value) : null; for (const item of this.selection) item.lineWidth = value; this.refreshProperties(); };
      this.propertyField(shared, 'Line width', width);
    }
    for (const [key, label] of [['mirror', 'Mirror'], ['invert', 'Invert'], ['flipY', 'Flip V']]) {
      if (!this.selection.every(item => key in item)) continue;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selection.every(item => !!item[key]);
      checkbox.indeterminate = this.selection.some(item => !!item[key]) && !checkbox.checked;
      checkbox.onchange = () => { for (const item of this.selection) item[key] = checkbox.checked; this.refreshProperties(); };
      this.propertyField(shared, label, checkbox);
    }

    const info = this.propertySection(panel, this.t('信息', 'Info'));
    const line = document.createElement('div'); line.className = 'tikz-info-line';
    line.textContent = `${this.selection.length} selected · ${this.t('共有属性批量编辑', 'editing shared properties')}`;
    info.append(line);
  }

  populateStyleOptions(container, primary, targets = [primary]) {
    if (!container || !primary?.def) return;
    container.replaceChildren();
    const selected = new Set(primary.options || []);
    const addField = (labelText, control) => {
      const label = document.createElement('label');
      label.className = 'tikz-field tikz-option-field';
      const span = document.createElement('span'); span.textContent = labelText;
      label.append(span, control); container.append(label);
    };
    const apply = () => {
      for (const target of targets) {
        target.options = [...selected];
        this.recompose(target);
      }
    };
    for (const enumDef of primary.def.enums || []) {
      const select = document.createElement('select');
      if (enumDef.selectNone !== false) select.append(new Option(this.t('默认', 'Default'), ''));
      for (const choice of enumDef.options) select.append(new Option(choice.display || choice.name, choice.name));
      const current = enumDef.options.find(choice => selected.has(choice.name));
      select.value = current?.name || (enumDef.selectNone === false ? enumDef.options[0]?.name || '' : '');
      select.onchange = () => {
        for (const choice of enumDef.options) selected.delete(choice.name);
        if (select.value) selected.add(select.value);
        apply();
      };
      addField(enumDef.display || enumDef.name, select);
    }
    for (const option of primary.def.options || []) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = selected.has(option.name);
      checkbox.onchange = () => {
        if (checkbox.checked) selected.add(option.name); else selected.delete(option.name);
        apply();
      };
      addField(option.display || option.name, checkbox);
    }
  }

  buildPropertyPanel(p) {
    const panel = this.overlay?.querySelector('.tikz-property-panel');
    if (!panel) return;
    panel.replaceChildren();
    if (!p) return;

    const manipulation = this.propertySection(panel, this.t('操作', 'Manipulation'));
    const rotation = document.createElement('div');
    rotation.className = 'tikz-prop-grid cols-2';
    manipulation.append(rotation);
    this.propertyButton(rotation, '↻ 90°', () => this.mutateSelected(item => item.rotateBy?.(90)));
    this.propertyButton(rotation, '↺ 90°', () => this.mutateSelected(item => item.rotateBy?.(-90)));
    this.propertyButton(rotation, '↻ 45°', () => this.mutateSelected(item => item.rotateBy?.(45)));
    this.propertyButton(rotation, '↺ 45°', () => this.mutateSelected(item => item.rotateBy?.(-45)));
    this.propertyButton(rotation, 'Flip H', () => this.mutateSelected(item => { item.mirror = !item.mirror; }));
    this.propertyButton(rotation, 'Flip V', () => this.mutateSelected(item => { item.flipY = !item.flipY; }));
    const scale = document.createElement('input');
    scale.type = 'number'; scale.min = '0.1'; scale.max = '10'; scale.step = '0.05'; scale.value = String(p.scaleValue || 1);
    scale.onchange = () => { p.scaleValue = Math.max(.1, Math.min(10, Number(scale.value) || 1)); this.recomputeSnap(); this.refreshProperties(); };
    this.propertyField(manipulation, 'Scale', scale);
    const positionGrid = document.createElement('div');
    positionGrid.className = 'tikz-prop-grid cols-2';
    manipulation.append(positionGrid);
    for (const [key, label] of [['x', 'X'], ['y', 'Y']]) {
      const input = document.createElement('input');
      input.type = 'number'; input.step = '0.1'; input.value = Number(p[key] || 0).toFixed(2);
      input.onchange = () => { p.moveTo?.(key === 'x' ? Number(input.value) || 0 : p.x, key === 'y' ? Number(input.value) || 0 : p.y); this.recomputeSnap(); this.refreshProperties(); };
      this.propertyField(positionGrid, label, input);
    }

    const ordering = this.propertySection(panel, this.t('层级', 'Ordering'));
    const orderGrid = document.createElement('div');
    orderGrid.className = 'tikz-prop-grid cols-2';
    ordering.append(orderGrid);
    this.propertyButton(orderGrid, 'Foreground', () => this.reorderItem(p, 'front'));
    this.propertyButton(orderGrid, 'Background', () => this.reorderItem(p, 'back'));
    this.propertyButton(orderGrid, 'Forward', () => this.reorderItem(p, 'forward'));
    this.propertyButton(orderGrid, 'Backward', () => this.reorderItem(p, 'backward'));

    if (p.def?.name || p.def?.id) {
      const options = this.propertySection(panel, this.t('选项', 'Options'));
      if (p.def.kind === 'path' && p.def.pins?.some(pin => pin.name === 'START')) {
        const poleChoices = [['none', 'none'], ['*', 'circ'], ['o', 'ocirc'], ['d', 'diamond'], ['od', 'odiamond'], ['square', 'square']];
        for (const [key, label] of [['poleStart', 'Start'], ['poleEnd', 'End']]) {
          const select = document.createElement('select');
          for (const [value, text] of poleChoices) select.append(new Option(text, value));
          select.value = p[key] || 'none';
          select.onchange = () => { p[key] = select.value === 'none' ? null : select.value; this.refreshProperties(); };
          this.propertyField(options, label, select);
        }
      }
      const mirror = document.createElement('input');
      mirror.type = 'checkbox'; mirror.checked = !!p.mirror;
      mirror.onchange = () => { p.mirror = mirror.checked; this.refreshProperties(); };
      this.propertyField(options, 'Mirror', mirror);
      const invert = document.createElement('input');
      invert.type = 'checkbox'; invert.checked = !!p.invert;
      invert.onchange = () => { p.invert = invert.checked; this.refreshProperties(); };
      this.propertyField(options, 'Invert', invert);
    }

    if (p.kind === 'wire') {
      const arrows = this.propertySection(panel, this.t('箭头', 'Arrows'));
      for (const [key, label] of [['arrowStart', 'Start'], ['arrowEnd', 'End']]) {
        const select = document.createElement('select');
        for (const [value, text] of [['none', 'none'], ['->', 'latex'], ['-o', 'circle'], ['-*', 'dot'], ['-|', 'bar']]) select.append(new Option(text, value));
        select.value = p[key] || 'none';
        select.onchange = () => { p[key] = select.value === 'none' ? null : select.value; this.refreshProperties(); };
        this.propertyField(arrows, label, select);
      }
    }

    const labelSection = this.propertySection(panel, this.t('标签', 'Label'));
    for (const [key, label] of [['label', 'Label'], ['value', 'Value']]) {
      const input = document.createElement('input');
      input.type = 'text'; input.value = p[key] || '';
      input.oninput = () => { p[key] = input.value; this.refreshProperties(); };
      this.propertyField(labelSection, label, input);
    }
    if (p.kind === 'path') {
      for (const [sectionTitle, key, label] of [['电压', 'voltage', 'Voltage v'], ['电流', 'current', 'Current i']]) {
        const section = this.propertySection(panel, this.t(sectionTitle, sectionTitle === '电压' ? 'Voltage' : 'Current'));
        const input = document.createElement('input');
        input.type = 'text'; input.value = p[key] || '';
        input.oninput = () => { p[key] = input.value; this.refreshProperties(); };
        this.propertyField(section, label, input);
      }
    }
    const textSection = this.propertySection(panel, this.t('文本', 'Text'));
    if (p.kind === 'text') {
      const content = document.createElement('input');
      content.type = 'text'; content.value = p.text || '';
      content.oninput = () => { p.text = content.value; this.refreshProperties(); };
      this.propertyField(textSection, 'Text content', content);
      const align = document.createElement('select');
      for (const value of ['left', 'center', 'right']) align.append(new Option(value, value));
      align.value = p.align || 'center';
      align.onchange = () => { p.align = align.value; this.refreshProperties(); };
      this.propertyField(textSection, 'Align', align);
    }
    if (p.kind === 'rect') {
      const area = document.createElement('textarea');
      area.rows = 2; area.value = p.label || '';
      area.oninput = () => { p.label = area.value; this.refreshProperties(); };
      this.propertyField(textSection, 'Text area', area);
      const fontSize = document.createElement('input');
      fontSize.type = 'number'; fontSize.min = '5'; fontSize.max = '96'; fontSize.step = '0.5'; fontSize.value = String(p.fontSize || 12);
      fontSize.onchange = () => { p.fontSize = Math.max(5, Number(fontSize.value) || 12); this.refreshProperties(); };
      this.propertyField(textSection, 'Font size', fontSize);
      for (const [key, label, values] of [['align', 'Align', ['left', 'center', 'right', 'justify']], ['justify', 'Justify', ['top', 'center', 'bottom']]]) {
        const select = document.createElement('select');
        for (const value of values) select.append(new Option(value, value));
        select.value = p[key] || values[1];
        select.onchange = () => { p[key] = select.value; this.refreshProperties(); };
        this.propertyField(textSection, label, select);
      }
      const innerSep = document.createElement('input');
      innerSep.type = 'number'; innerSep.min = '0'; innerSep.max = '20'; innerSep.step = '0.5'; innerSep.value = String(p.innerSep ?? 5);
      innerSep.onchange = () => { p.innerSep = Math.max(0, Number(innerSep.value) || 0); this.refreshProperties(); };
      this.propertyField(textSection, 'Inner sep', innerSep);
      const textColor = document.createElement('input');
      textColor.type = 'color'; textColor.value = p.textColor || '#222222';
      textColor.oninput = () => { p.textColor = textColor.value; this.refreshProperties(); };
      this.propertyField(textSection, 'Text color', textColor);
      const hyphen = document.createElement('input');
      hyphen.type = 'checkbox'; hyphen.checked = !!p.useHyphenation;
      hyphen.onchange = () => { p.useHyphenation = hyphen.checked; this.refreshProperties(); };
      this.propertyField(textSection, 'Hyphenation', hyphen);
      const placeholder = document.createElement('input');
      placeholder.type = 'checkbox'; placeholder.checked = !!p.showPlaceholder;
      placeholder.onchange = () => { p.showPlaceholder = placeholder.checked; this.refreshProperties(); };
      this.propertyField(textSection, 'Placeholder', placeholder);
    }
    if ('size' in p) {
      const size = document.createElement('input');
      size.type = 'number'; size.min = '6'; size.max = '96'; size.value = String(p.size || 12);
      size.onchange = () => { p.size = Math.max(6, Number(size.value) || 12); this.refreshProperties(); };
      this.propertyField(textSection, 'Font size', size);
    }

    const stroke = this.propertySection(panel, this.t('描边', 'Stroke'));
    const strokeColor = document.createElement('input');
    strokeColor.type = 'color'; strokeColor.value = p.strokeColor || '#222222';
    strokeColor.oninput = () => { p.strokeColor = strokeColor.value; this.refreshProperties(); };
    this.propertyField(stroke, 'Color', strokeColor);
    const lineWidth = document.createElement('input');
    lineWidth.type = 'number'; lineWidth.min = '0'; lineWidth.max = '10'; lineWidth.step = '0.1'; lineWidth.value = String(p.lineWidth || '');
    lineWidth.onchange = () => { p.lineWidth = lineWidth.value ? Number(lineWidth.value) : null; this.refreshProperties(); };
    this.propertyField(stroke, 'Width', lineWidth);
    const fill = this.propertySection(panel, this.t('填充', 'Fill'));
    const fillColor = document.createElement('input');
    fillColor.type = 'color'; fillColor.value = p.fillColor || '#ffffff';
    fillColor.oninput = () => { p.fillColor = fillColor.value; this.refreshProperties(); };
    this.propertyField(fill, 'Color', fillColor);

    if (p.def) {
      const styleSection = this.propertySection(panel, this.t('组件样式', 'Component style'));
      const styleBody = document.createElement('div');
      styleBody.className = 'tikz-options';
      styleSection.append(styleBody);
    }

    if (p.kind === 'group') {
      const grouping = this.propertySection(panel, this.t('分组', 'Grouping'));
      this.propertyButton(grouping, 'Ungroup', () => this.ungroupSelection());
    }

    const info = this.propertySection(panel, this.t('信息', 'Info'));
    const id = document.createElement('div');
    id.className = 'tikz-info-line';
    id.textContent = 'ID: ' + (p.def?.tikz || p.kind || '');
    const pins = document.createElement('div');
    pins.className = 'tikz-info-line';
    pins.textContent = 'Anchors: ' + (p.terminals?.().length || 0) + ' · Adjust: ' + (p.adjustPoints?.().length || 0);
    info.append(id, pins);
  }

  syncProps() {
    if (!this.overlay) return;
    const p = this.selected;
    const selection = this.overlay.querySelector('.tikz-selection-info');
    if (selection) {
      if (this.selection.length > 1) {
        const box = this.selectionBBox();
        const size = box ? '  ' + (box.w / PX_PER_CM).toFixed(2) + '×' + (box.h / PX_PER_CM).toFixed(2) + ' cm' : '';
        selection.textContent = this.selection.length + this.t(' 个元件', ' selected') + size;
      } else {
        const box = p?.bbox?.();
        const size = box ? '  ' + (box.w / PX_PER_CM).toFixed(2) + '×' + (box.h / PX_PER_CM).toFixed(2) + ' cm' : '';
        selection.textContent = p
          ? (p.def?.name || p.kind) + '  x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1) + size
          : this.t('未选择元件', 'No selection');
      }
    }
    if (this.selection.length > 1) {
      if (!this._skipPropertyPanel) this.buildMultiPropertyPanel();
      return;
    }
    if (!p) {
      if (!this._skipPropertyPanel) this.buildViewPropertyPanel();
      return;
    }
    if (!this._skipPropertyPanel) this.buildPropertyPanel(p);
    const options = this.overlay.querySelector('.tikz-options');
    if (!options || !p?.def) return;
    this.populateStyleOptions(options, p);
  }

  recompose(item) {
    // Keep the two reference endpoints, but refresh natural symbol geometry
    // after changing a component style/variant.
    this.recomputeSnap();
    this.pushHistory();
    this.render();
  }

  render() {
    for (const item of this.items) item.selected = this.selection.includes(item);
    this.syncProps();
    const nodes = [];
    for (const it of this.items) nodes.push(it.toSvg(PX_PER_CM));
    if (this.selected) {
      const { SVGNS } = { SVGNS: 'http://www.w3.org/2000/svg' };
      const adjust = this.selected.adjustPoints?.() || [];
      for (const point of adjust) {
        const c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('cx', point.x); c.setAttribute('cy', point.y);
        c.setAttribute('r', 5 / this.canvas.view.k);
        c.setAttribute('fill', '#ffb020'); c.setAttribute('stroke', '#d68900'); c.setAttribute('stroke-width', 1.5);
        nodes.push(c);
      }
      for (const t of this.selected.terminals?.() || []) {
        const x = this.selected.x + t.dx, y = this.selected.y + t.dy;
        if (adjust.some(point => Math.hypot(point.x - x, point.y - y) < .5)) continue;
        const c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y);
        c.setAttribute('r', 3.5 / this.canvas.view.k);
        c.setAttribute('fill', '#fff'); c.setAttribute('stroke', '#2f6fed'); c.setAttribute('stroke-width', 1.3);
        nodes.push(c);
      }
    }
    this.canvas.layers.items.replaceChildren(...nodes);
    this.canvas.setPreview([]);
    if (!this.placingDef) this.canvas.setGhost([]);
  }
}
