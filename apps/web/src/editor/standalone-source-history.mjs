// ProseMirror decides which transactions form an undo event. Keep the TeX
// spelling at those boundaries: a single undo may join a split and remove
// several typed characters, including an IME commit, in the same step.
export class StandaloneSourceHistory {
  entries = [];

  clear() { this.entries.length = 0; }

  matches(depth, doc) {
    return this.entries[depth]?.doc.eq(doc) === true;
  }

  transition(origin, before, after, depth, replay) {
    if (origin.depth === depth) return;
    const destination = replay ? this.entries[depth] : null;
    let previous = origin.depth;
    if (!replay) {
      // A fresh event discards the redo branch. At its history limit,
      // ProseMirror also evicts a batch of the oldest events.
      if (depth < previous) {
        this.entries.splice(0, previous + 1 - depth);
        previous = depth - 1;
      }
      this.entries.length = depth;
    }
    this.entries[previous] = origin.snapshot === JSON.stringify(before.toJSON())
      ? {doc:before, source:origin.source} : undefined;
    if (destination?.doc.eq(after)) return destination.source;
  }
}
