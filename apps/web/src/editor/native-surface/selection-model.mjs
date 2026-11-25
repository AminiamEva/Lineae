// Shared caret and range mechanics for geometry-backed editing adapters.
export function createSelectionModel(sameOwner, fileOf = () => undefined) {
  const address = stop => stop && {offset:stop.docOffset,file:fileOf(stop)};
  const matches = (stop, target) => target && stop.docOffset===target.offset && fileOf(stop)===target.file;
  let pendingAddress = null;
  let stops = [], index = -1, anchor = -1, pendingOffset = null, lastEdit = null;
  return {
    get stops() { return stops; },
    get index() { return index; },
    get caret() { return stops[index] ?? null; },
    get anchor() { return stops[anchor] ?? null; },
    get pendingOffset() { return pendingOffset; },
    get lastEdit() { return lastEdit; },
    setStops(next) {
      const previousHead = address(stops[index]);
      const previousAnchor = address(stops[anchor]);
      stops = next;
      if (!stops.length) { index = anchor = -1; return false; }
      if (pendingOffset !== null) {
        const nextIndex = stops.findIndex(stop => matches(stop,pendingAddress));
        pendingOffset = null;
        pendingAddress = null;
        if (nextIndex >= 0) { index = anchor = nextIndex; return true; }
      }
      const headIndex = stops.findIndex(stop => matches(stop,previousHead));
      index = headIndex >= 0 ? headIndex : Math.max(0, Math.min(index, stops.length - 1));
      const anchorIndex = stops.findIndex(stop => matches(stop,previousAnchor));
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
    selectBetween(fromOffset, toOffset, fromFile, toFile = fromFile) {
      const from = stops.findIndex(stop => stop.docOffset === fromOffset && fileOf(stop)===fromFile);
      const to = stops.findIndex(stop => stop.docOffset === toOffset && fileOf(stop)===toFile);
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
      pendingAddress = {offset:nextOffset,file:fileOf(stops[index])};
      return edit;
    },
    clearPending() { pendingOffset = null; pendingAddress = null; lastEdit = null; },
    reset() { stops = []; index = anchor = -1; pendingOffset = null; pendingAddress = null; lastEdit = null; },
  };
}
