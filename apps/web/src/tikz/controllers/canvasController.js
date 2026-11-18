// Canvas controller: layered SVG (grid/items/preview/ghost), unified zoom model.
// Reference: CircuiTikZ-Designer/src/scripts/controllers/canvasController.ts (GPL-3.0).
const SVGNS = 'http://www.w3.org/2000/svg';

export class CanvasController {
  constructor(svg) {
    this.svg = svg;
    this.layers = {};
    for (const name of ['grid', 'items', 'preview', 'ghost']) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'tikz-layer-' + name);
      svg.append(g);
      this.layers[name] = g;
    }
    this.view = { x: 60, y: 60, k: 1 };   // single source of truth for zoom
    this.contentWidthPx = 600;            // logical content width (grows with content)
    this.textwidthCm = 15;
    this.onZoomChange = null;             // slider sync callback
    svg.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e); }, { passive: false });
  }

  // zoom fraction shown in the top slider: physical width of content / textwidth
  widthFraction() { return this.contentWidthCm() / this.textwidthCm; }
  contentWidthCm() { return this.contentWidthPx / this.PX_PER_CM * this.view.k; }
  get PX_PER_CM() { return 37.7952755906; }

  setTextwidthCm(v) { this.textwidthCm = v || 15; this.emitZoom(); }
  emitZoom() { this.onZoomChange?.(this.view.k, this.widthFraction()); }

  zoom(f, e) {
    const before = e ? this.toWorld(e.clientX, e.clientY) : null;
    this.view.k = Math.min(16, Math.max(0.08, this.view.k * f));
    if (before) {
      const after = this.toWorld(e.clientX, e.clientY);
      this.view.x += (after.x - before.x) * this.view.k;
      this.view.y += (after.y - before.y) * this.view.k;
    }
    this.apply(); this.emitZoom();
  }
  setZoom(k) { this.view.k = Math.min(16, Math.max(0.08, k)); this.apply(); this.emitZoom(); }

  toWorld(clientX, clientY) {
    const pt = this.svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const m = this.layers.items.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  }

  apply() {
    const t = `translate(${this.view.x},${this.view.y}) scale(${this.view.k})`;
    this.layers.items.setAttribute('transform', t);
    this.layers.preview.setAttribute('transform', t);
    this.layers.ghost.setAttribute('transform', t);
    this.drawGrid();
  }

  fit() {
    const r = this.svg.getBoundingClientRect();
    this.svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    // Keep the default exported width at 0.6\textwidth.  The canvas viewport
    // and the exported width are two different things: changing this factor
    // changes the physical content size, while the grid scrolled around it
    // remains in centimetres.
    const initialFraction = 0.6;
    this.contentWidthPx = initialFraction * this.textwidthCm * this.PX_PER_CM;
    this.view = {
      x: 80,
      y: 80,
      k: 1,
    };
    this.apply(); this.emitZoom();
  }

  drawGrid() {
    const vb = this.svg.viewBox.baseVal;
    const k = this.view.k;
    const minor = this.PX_PER_CM / 2, major = this.PX_PER_CM;
    let s = '';
    const x0 = -this.view.x / k, y0 = -this.view.y / k;
    const x1 = x0 + vb.width / k, y1 = y0 + vb.height / k;
    for (let x = Math.floor(x0 / minor) * minor; x <= x1; x += minor)
      for (let y = Math.floor(y0 / minor) * minor; y <= y1; y += minor) {
        const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6 && Math.abs(y / major - Math.round(y / major)) < 1e-6;
        s += `<circle cx="${x}" cy="${y}" r="${(isMajor ? 1.4 : 0.8) / k}" fill="${isMajor ? '#9aa4b5' : '#d4dae4'}"/>`;
      }
    this.layers.grid.setAttribute('transform', `translate(${this.view.x},${this.view.y}) scale(${k})`);
    this.layers.grid.innerHTML = s;
  }

  setGhost(nodes) { this.layers.ghost.replaceChildren(...nodes); }
  setPreview(nodes) { this.layers.preview.replaceChildren(...nodes); }
}
