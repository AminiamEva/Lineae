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
    this.view = { x: 0, y: 20, k: 1 };    // single source of truth for zoom
    this.zoomPercent = 100;
    this.textwidthCm = 15;
    this.onZoomChange = null;             // slider sync callback
    svg.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e); }, { passive: false });
  }

  // 100% means exactly one textwidth fits in the canvas viewport.  This is a
  // page zoom, not the old "fraction of textwidth" export setting.
  get PX_PER_CM() { return 37.7952755906; }
  baseScale() {
    const width = this.svg.getBoundingClientRect().width;
    return width > 2 ? width / (this.textwidthCm * this.PX_PER_CM) : 1;
  }
  setTextwidthCm(v) { this.textwidthCm = v || 15; this.setZoomPercent(this.zoomPercent); }
  emitZoom() { this.onZoomChange?.(this.zoomPercent, this.view.k); }
  setZoomPercent(percent) {
    this.zoomPercent = Math.min(400, Math.max(10, Number(percent) || 100));
    this.view.k = this.baseScale() * this.zoomPercent / 100;
    this.apply(); this.emitZoom();
  }
  zoom(f, e) {
    const before = e ? this.toWorld(e.clientX, e.clientY) : null;
    this.setZoomPercent(this.zoomPercent * f);
    if (before) {
      const after = this.toWorld(e.clientX, e.clientY);
      this.view.x += (after.x - before.x) * this.view.k;
      this.view.y += (after.y - before.y) * this.view.k;
    }
    this.apply();
  }
  setZoom(k) { this.setZoomPercent(k / this.baseScale() * 100); }

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
    // At 100% the visible canvas spans exactly one textwidth.
    this.view = { x: 0, y: 20, k: 1 };
    this.setZoomPercent(100);
    this.apply();
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
