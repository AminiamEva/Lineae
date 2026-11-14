import {projectPath, fileKind, directoryTree} from './paths.mjs';

/** File handles remain in the adapter; source strings are never newline-normalized. */
export class Project {
  constructor(adapter, id = crypto.randomUUID()) {
    this.id = id;
    this.adapter = adapter;
    this.files = new Map();
    this.directories = [];
    this.mainFileId = null;
    this.activeFileId = null;
    this.treeVisible = false;
    this.config = {};
  }
  async open() {
    const entries = await this.adapter.list();
    const files = new Map(), directories = [];
    for (const entry of entries) {
      const path = projectPath(entry.path);
      if (entry.kind === 'directory') { directories.push(path); continue; }
      if (files.has(path)) throw new Error(`Duplicate project path: ${path}`);
      const kind = fileKind(path);
      const bytes = await this.adapter.read(path);
      const text = kind === 'tex' || kind === 'bib' ? new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes) : null;
      files.set(path, {id:crypto.randomUUID(), path, kind, bytes, saved:text, draft:text, dirty:false});
    }
    this.files = files;
    this.directories = directories;
    const main = files.get('main.tex') ?? [...files.values()].find(file => file.kind === 'tex');
    this.mainFileId = main?.id ?? null;
    this.activeFileId = this.mainFileId;
    this.treeVisible = false;
    return this;
  }
  file(id) {
    const file = [...this.files.values()].find(file => file.id === id);
    if (!file) throw new Error('Unknown project file');
    return file;
  }
  edit(id, source) {
    const file = this.file(id);
    if (file.draft === null || typeof source !== 'string') throw new TypeError('Not a text file');
    file.draft = source;
    file.dirty = source !== file.saved;
  }
  activate(id) { this.file(id); this.activeFileId = id; }
  setMain(id) {
    if (this.file(id).kind !== 'tex') throw new TypeError('Main document must be a TeX file');
    this.mainFileId = id;
  }
  async save(id) {
    const file = this.file(id);
    if (!file.dirty) return;
    const disk = await this.adapter.read(file.path);
    if (disk.length !== file.bytes.length || disk.some((value, index) => value !== file.bytes[index])) {
      throw new Error(`File changed on disk: ${file.path}`);
    }
    const draft = file.draft, bytes = new TextEncoder().encode(draft);
    await this.adapter.write(file.path, bytes);
    file.bytes = bytes;
    file.saved = draft;
    file.dirty = file.draft !== draft;
  }
  get tree() { return directoryTree(this.files.values(), this.directories); }
}

/** Browser File System Access adapter. Unsupported browsers must report capability absence. */
export class DirectoryHandleAdapter {
  constructor(handle) { this.handle = handle; }
  async list() {
    const entries = [];
    async function visit(handle, prefix) {
      for await (const [name, child] of handle.entries()) {
        const path = projectPath(prefix + name);
        entries.push({path, kind:child.kind});
        if (child.kind === 'directory') await visit(child, path + '/');
      }
    }
    await visit(this.handle, '');
    return entries;
  }
  async resolve(path) {
    const segments = projectPath(path).split('/');
    let directory = this.handle;
    for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
    return directory.getFileHandle(segments.at(-1));
  }
  async read(path) { return new Uint8Array(await (await (await this.resolve(path)).getFile()).arrayBuffer()); }
  async write(path, bytes) {
    const stream = await (await this.resolve(path)).createWritable();
    try { await stream.write(bytes); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
  }
}
