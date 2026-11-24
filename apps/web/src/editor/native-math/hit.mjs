const CSS_PER_SP = (96 / 72) / 65781.76;

// Coordinates from a page display list are already in page space. Do not
// apply a paragraph fragment offset or the Canvas backing-store DPR again.
export function hitMathField(fields, rect, point, zoom, frame, current) {
  if (!frame || !current || !['sessionId','sourceRevision','layoutVersion']
    .every(key => frame[key] != null && frame[key] === current[key])) return null;
  if (!Number.isFinite(zoom) || zoom <= 0 ||
      ![rect.left,rect.top,rect.width,rect.height,point.x,point.y].every(Number.isFinite)) return null;
  const x = point.x - rect.left, y = point.y - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  const scale = CSS_PER_SP * zoom;
  const hits = new Map();
  for (const field of fields) {
    const {owner,role,bbox,empty} = field;
    if (!Number.isSafeInteger(owner) || typeof role !== 'string' || bbox?.length !== 4 ||
        !bbox.every(Number.isSafeInteger)) continue;
    const [left,top,right,bottom] = bbox.map(value => value * scale);
    if (right < left || bottom < top) continue;
    // Keep the geometry unchanged for drawing; use a larger, CSS-pixel hit
    // region only for the point anchors LuaTeX emits for empty fields.
    const padding = empty ? 6 : 0;
    if (x >= left - padding && x <= right + padding && y >= top - padding && y <= bottom + padding) {
      hits.set(`${owner}/${role}`,{owner,role});
    }
  }
  // Multiple observations of the same field are fine. Distinct overlapping
  // fields must not choose a source target by render order.
  return hits.size === 1 ? hits.values().next().value : null;
}
