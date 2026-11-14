import {projectPath, fileKind, directoryTree} from './paths.mjs';
import {scanDependencies, resolveMetadata} from './dependencies.mjs';
import {RecoveryStore} from './recovery.mjs';

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
    this.scans = new Map(); this.dependencies = []; this.pathChanges = [];
    this.recovery = adapter.root && globalThis.localStorage ? new RecoveryStore(globalThis.localStorage,adapter.root) : null;
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
    for(const file of files.values())this.scan(file);
    this.mainCandidates=[...files.values()].filter(file=>this.scans.get(file.id)?.document);
    const main = this.mainCandidates.find(file=>file.path==='main.tex') ?? this.mainCandidates[0] ?? files.get('main.tex') ?? [...files.values()].find(file => file.kind === 'tex');
    this.mainFileId = main?.id ?? null;
    this.activeFileId = this.mainFileId;
    this.treeVisible = false;
    this.resolveDependencies();
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
    if(file.draft===source)return;
    file.draft = source;
    file.dirty = source !== file.saved;
    this.scan(file); this.resolveDependencies();
    this.checkpoint();
  }
  checkpoint() { this.recovery?.checkpoint(this.files.values()); }
  restoreDrafts(drafts) {
    let restored=0;
    for(const draft of drafts){const file=this.files.get(draft.path);if(!file || file.draft===null)continue;
      Object.assign(file,{saved:draft.saved,draft:draft.draft,bytes:new TextEncoder().encode(draft.saved),dirty:draft.draft!==draft.saved});this.scan(file);restored++;
    }
    this.resolveDependencies();return restored;
  }
  scan(file) { if(file.kind==='tex') { try { this.scans.set(file.id,scanDependencies(file.draft)); } catch { this.scans.set(file.id,{document:false,dependencies:[],status:'pending'}); } } }
  resolveDependencies() { this.dependencies=resolveMetadata(this.files,this.scans); }
  async move(source, target) {
    source=projectPath(source); target=projectPath(target);
    if(source===target || target.startsWith(source+'/'))throw new Error('Cannot move into itself');
    if(this.files.has(target) || this.directories.includes(target))throw new Error('Target already exists');
    const directory=this.directories.includes(source);
    if(!directory && !this.files.has(source))throw new Error('Source does not exist');
    const parent=target.includes('/')?target.slice(0,target.lastIndexOf('/')):'';
    if(parent && !this.directories.includes(parent))throw new Error('Target directory does not exist');
    const affected=[...this.files.values()].filter(file=>file.path===source || directory && file.path.startsWith(source+'/'));
    if(directory){
      const known=[...affected.map(file=>file.path),...this.directories.filter(path=>path===source || path.startsWith(source+'/'))].sort();
      const disk=(await this.adapter.list()).map(entry=>entry.path).filter(path=>path===source || path.startsWith(source+'/')).sort();
      if(JSON.stringify(known)!==JSON.stringify(disk))throw new Error('Directory changed on disk; reopen the project before moving');
    }
    for(const file of affected){const disk=await this.adapter.read(file.path);if(disk.length!==file.bytes.length || disk.some((byte,index)=>byte!==file.bytes[index]))throw new Error('File changed on disk: '+file.path);}
    await this.adapter.move(source,target);
    const changes=affected.map(file=>({fileId:file.id,from:file.path,to:target+file.path.slice(source.length)}));
    for(const change of changes){const file=this.files.get(change.from);this.files.delete(change.from);file.path=change.to;this.files.set(change.to,file);}
    this.directories=this.directories.map(path=>path===source || path.startsWith(source+'/')?target+path.slice(source.length):path);
    this.pathChanges.push({source,target,changes,references:'not-rewritten'}); this.resolveDependencies();
    this.checkpoint();
    return changes;
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
    await this.adapter.write(file.path, bytes, file.bytes);
    file.bytes = bytes;
    file.saved = draft;
    file.dirty = file.draft !== draft;
    this.checkpoint();
  }
  get tree() { return directoryTree(this.files.values(), this.directories); }
  async create(value, text) {
    const path = projectPath(value);
    if (this.files.has(path) || this.directories.includes(path)) throw new Error('Path already exists');
    const bytes = new TextEncoder().encode(text);
    await this.adapter.create(path, bytes);
    const file = {id:crypto.randomUUID(), path, kind:fileKind(path), bytes, saved:text, draft:text, dirty:false};
    this.files.set(path, file); this.scan(file); this.resolveDependencies(); return file;
  }
  async reload(id) {
    const file = this.file(id), bytes = await this.adapter.read(file.path);
    const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    Object.assign(file,{bytes, saved:text, draft:text, dirty:false, session:null});
    this.scan(file); this.resolveDependencies();
    this.checkpoint();
  }
  async mkdir(value) {
    const path = projectPath(value);
    if (this.files.has(path) || this.directories.includes(path)) throw new Error('Path already exists');
    await this.adapter.mkdir(path); this.directories.push(path);
  }
  async remove(id) {
    const file = this.file(id);
    if (id === this.mainFileId) throw new Error('Cannot delete main document');
    const disk = await this.adapter.read(file.path);
    if (disk.length !== file.bytes.length || disk.some((byte,index) => byte !== file.bytes[index])) throw new Error('File changed on disk');
    await this.adapter.remove(file.path);
    this.files.delete(file.path);
    this.scans.delete(file.id); this.resolveDependencies();
    this.checkpoint();
    if (this.activeFileId === id) this.activeFileId = this.mainFileId;
  }
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
  async parent(path) {
    const segments = projectPath(path).split('/');
    let directory = this.handle;
    for (const segment of segments.slice(0,-1)) directory = await directory.getDirectoryHandle(segment);
    return {directory, name:segments.at(-1)};
  }
  async unused(directory, name) {
    for await (const [entry] of directory.entries()) if (entry === name) throw new Error('Path already exists on disk');
  }
  async create(path, bytes) {
    const {directory,name} = await this.parent(path);
    await this.unused(directory,name);
    const handle = await directory.getFileHandle(name,{create:true});
    const stream = await handle.createWritable();
    try { await stream.write(bytes); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
  }
  async mkdir(path) {
    const {directory,name} = await this.parent(path);
    await this.unused(directory,name); await directory.getDirectoryHandle(name,{create:true});
  }
  async remove(path) { const {directory,name} = await this.parent(path); await directory.removeEntry(name); }
  async read(path) { return new Uint8Array(await (await (await this.resolve(path)).getFile()).arrayBuffer()); }
  async write(path, bytes) {
    const stream = await (await this.resolve(path)).createWritable();
    try { await stream.write(bytes); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
  }
}
