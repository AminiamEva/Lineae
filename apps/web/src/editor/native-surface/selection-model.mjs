// Shared caret and range mechanics for geometry-backed editing adapters.
export function createSelectionModel(sameOwner) {
  let stops = [], index = -1, anchor = -1, pendingOffset = null, lastEdit = null;
  return {
    get stops() { return stops; },
    get index() { return index; },
    get caret() { return stops[index] ?? null; },
    get anchor() { return stops[anchor] ?? null; },
    get pendingOffset() { return pendingOffset; },
    get lastEdit() { return lastEdit; },
    setStops(next) {
      const previousHead = stops[index]?.docOffset;
      const previousAnchor = stops[anchor]?.docOffset;
      stops = next;
      if (!stops.length) { index = anchor = -1; return false; }
      if (pendingOffset !== null) {
        const nextIndex = stops.findIndex(stop => stop.docOffset === pendingOffset);
        pendingOffset = null;
        if (nextIndex >= 0) { index = anchor = nextIndex; return true; }
      }
      const headIndex = stops.findIndex(stop => stop.docOffset === previousHead);
      index = headIndex >= 0 ? headIndex : Math.max(0, Math.min(index, stops.length - 1));
      const anchorIndex = stops.findIndex(stop => stop.docOffset === previousAnchor);
      anchor = anchorIndex >= 0 && sameOwner(stops[anchorIndex], stops[index]) ? anchorIndex : index;
      return true;
    },
    nearest(page, x, y) {
      let best = -1, distance = Infinity;
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.page !== page) continue;
        const height = Math.max(1, stop.bottom - stop.top);
        const center = (stop.top + stop.bottom) / 2;
        const value = (stop.x - x) ** 2 + ((center - y) / height) ** 2;
        if (value < distance) { distance = value; best = i; }
      }
      if (best < 0) return null;
      index = anchor = best;
      return stops[best];
    },
    move(delta, extend = false) {
      const own = stops.filter(stop => sameOwner(stop, stops[index]));
      if (!own.length) return null;
      const position = own.findIndex(stop => stop === stops[index]);
      const next = Math.max(0, Math.min(own.length - 1, position + delta));
      index = stops.indexOf(own[next]);
      if (!extend) anchor = index;
      return stops[index];
    },
    selectBetween(fromOffset, toOffset) {
      const from = stops.findIndex(stop => stop.docOffset === fromOffset);
      const to = stops.findIndex(stop => stop.docOffset === toOffset);
      if (from < 0 || to < 0 || !sameOwner(stops[from], stops[to])) return false;
      anchor = from; index = to;
      return true;
    },
    get range() {
      return [stops[Math.min(anchor, index)], stops[Math.max(anchor, index)]];
    },
    record(edit, nextOffset) {
      lastEdit = edit;
      pendingOffset = nextOffset;
      return edit;
    },
    clearPending() { pendingOffset = null; lastEdit = null; },
    reset() { stops = []; index = anchor = -1; pendingOffset = null; lastEdit = null; },
  };
}
