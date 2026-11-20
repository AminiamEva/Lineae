// Snapping: grid points + component terminals (priority: terminal > grid).
// Structure adapted from CircuiTikZ-Designer/src/scripts/snapDrag (GPL-3.0).
export const PX_PER_CM = 37.7952755906; // 96 dpi: canvas px <-> physical cm

export class SnapPoint {
  constructor(x, y, owner = null) { this.x = x; this.y = y; this.owner = owner; }
}

export class SnapController {
  constructor(pxPerCm = PX_PER_CM) {
    this.pxPerCm = pxPerCm;
    this.gridStep = pxPerCm / 2;      // minor grid = 0.5 cm
    this.snapDistance = pxPerCm / 4;  // ~0.25 cm snap radius
    this.terminals = [];              // SnapPoint[] registered by components
  }
  clearTerminals() { this.terminals = []; }
  register(points) { for (const p of points) this.terminals.push(p); }

  nearestTerminal(p) {
    let best = null, bd = this.snapDistance;
    for (const t of this.terminals) {
      if (t.owner && t.owner === p.owner) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  gridPoint(p) {
    const s = this.gridStep;
    return new SnapPoint(Math.round(p.x / s) * s, Math.round(p.y / s) * s);
  }
  // Main entry: terminal snap wins over grid snap.
  snap(p) {
    const t = this.nearestTerminal(p);
    return t || this.gridPoint(p);
  }
  snapIfClose(p) { // for drags: only snap when within radius, else free position
    const t = this.nearestTerminal(p);
    return t || p;
  }
}
