// Pure TikZ export (testable in Node).
export const PX_PER_CM = 37.7952755906;

export function exportTikz(items, { widthFraction = 0.6, textwidthCm = 15 } = {}) {
  const xs = items.flatMap(item => {
    if (item.kind === 'wire') return item.pts.map(point => point.x);
    if (item.kind === 'path') return [item.start?.x ?? item.x, item.end?.x ?? item.x].filter(Number.isFinite);
    if (item.bbox) { const box = item.bbox(); return [box.x, box.x + box.w]; }
    return [item.x];
  }).filter(Number.isFinite);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(PX_PER_CM * 6, ...xs);
  const bodyW = Math.max(PX_PER_CM * 3, maxX - minX);
  const scale = (widthFraction * textwidthCm) / bodyW;
  const X = x => rnd((x - minX) * scale);
  const Y = y => rnd(-y * scale);
  // name terminals that wires attach to, emit \\coordinate once each
  const names = new Map(); const coords = [];
  const nameOf = ref => {
    const key = ref.comp.uid + '_' + ref.ti;
    if (!names.has(key)) {
      names.set(key, 't' + key);
      const ts = ref.comp.terminals();
      coords.push(`\\coordinate (t${key}) at (${X(ref.comp.x + ts[ref.ti].dx)},${Y(ref.comp.y + ts[ref.ti].dy)});`);
    }
    return names.get(key);
  };
  const lines = [];
  for (const i of items) {
    if (i.kind === 'wire') lines.push(i.toTikZ(X, Y, i.endA && nameOf(i.endA), i.endB && nameOf(i.endB)));
    else lines.push(i.toTikZ(X, Y));
  }
  lines.unshift(...coords);
  const body = `\\begin{tikzpicture}\n${lines.join('\n')}\n\\end{tikzpicture}`;
  return `\\resizebox{${rnd(widthFraction)}\\textwidth}{!}{%\n${body}%\n}`;
}
function rnd(v) { return (Math.round(v * 1000) / 1000).toString(); }
