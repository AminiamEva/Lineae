const DOCUMENT_MODES = new Set(['body','source','split']);
export class ProjectWorkspaceState {
  #mode = 'body';
  #suspended = null;
  get mode() { return this.#mode; }
  get suspended() { return this.#suspended; }
  begin(capture) {
    if (this.#suspended === null) this.#suspended = capture();
    this.#mode = 'body';
  }
  select(mode, kind = 'tex') {
    if (kind !== 'bib' && DOCUMENT_MODES.has(mode)) this.#mode = mode;
  }
  modeFor(kind) { return kind === 'bib' ? 'source' : this.#mode; }
  end() {
    const snapshot = this.#suspended;
    this.#suspended = null;
    this.#mode = 'body';
    return snapshot;
  }
}
