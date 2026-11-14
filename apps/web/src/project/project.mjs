import {projectPath, fileKind, directoryTree} from './paths.mjs';
import {scanDependencies, resolveMetadata} from './dependencies.mjs';
import {RecoveryStore} from './recovery.mjs';

const editable = kind => kind === 'tex' || kind === 'bib';
const sameBytes = (left, right) => left.length === right.length && left.every((byte, index) => byte === right[index]);
const decode = bytes => new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes);

/** File handles remain in the adapter; source strings are never newline-normalized. */
export class Project {
  constructor(adapter, id = crypto.randomUUID(), storage = globalThis.localStorage) {
    this.id = id;
    this.adapter = adapter;
    this.files = new Map();
    this.directories = [];
    this.mainFileId = null;
    this.activeFileId = null;
    this.treeVisible = false;
    this.config = {};
    this.scans = new Map(); this.dependencies = []; this.pathChanges = [];
    this.recovery = adapter.root && storage ? new RecoveryStore(storage,adapter.root+(adapter.session?':'+adapter.session:'')) : null;
    this.storage=storage;this.metadataKey=adapter.root?'lineae:project-state:v1:'+adapter.root:null;this.persistenceError='';
    this.pendingCheckpoint=Promise.resolve();this.diskRecovery=[];this.recoveryVersions=[];
    this.pendingOperation=Promise.resolve();
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
    let metadata={};
    try {metadata=JSON.parse(this.metadataKey && this.storage?.getItem(this.metadataKey) || '{}');}catch(error){this.persistenceError=error.message;}
    if(this.adapter.loadState){try{const state=await this.adapter.loadState();if(state){if(!state.files || !Array.isArray(state.drafts))throw new Error('Invalid disk checkpoint');metadata=state;this.diskRecovery=state.drafts;this.recoveryVersions=state.recoveryVersions ?? [];}}catch(error){this.diskRecoveryError='Disk recovery failed; checkpoint retained: '+error.message;this.persistenceError=this.diskRecoveryError;}}
    this.savedIdentities=metadata?.files ?? {};
    const identities=new Set();
    for(const file of files.values()){const id=metadata?.files?.[file.path];if(typeof id==='string' && !identities.has(id))file.id=id;identities.add(file.id);}
    for(const file of files.values())this.scan(file);
    this.mainCandidates=[...files.values()].filter(file=>this.scans.get(file.id)?.document);
    const main = this.mainCandidates.find(file=>file.path==='main.tex') ?? this.mainCandidates[0] ?? files.get('main.tex') ?? [...files.values()].find(file => file.kind === 'tex');
    this.mainFileId = main?.id ?? null;
    const selected=files.get(metadata?.main);
    if(selected?.kind==='tex')this.mainFileId=selected.id;
    this.activeFileId = this.mainFileId;
    this.treeVisible = false;
    this.resolveDependencies();
    this.persistMetadata();
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
    file.revision = (file.revision ?? 0) + 1;
    file.dirty = source !== file.saved;
    this.scan(file); this.resolveDependencies();
    this.checkpoint();
  }
  checkpoint() {
    let recoveryError='';
    try {this.recovery?.checkpoint(this.files.values());}
    catch(error){recoveryError='Local draft checkpoint failed: '+error.message;}
    // A local storage quota failure must not block the native durable journal
    // or interrupt model bookkeeping after a successful disk operation.
    this.persistMetadata();
    if(recoveryError)this.persistenceError=[this.persistenceError,recoveryError].filter(Boolean).join(' · ');
  }
  persistMetadata() {
    if(!this.metadataKey)return;
    try {this.storage?.setItem(this.metadataKey,JSON.stringify({main:this.mainFileId?this.file(this.mainFileId).path:null,files:Object.fromEntries([...this.files.values()].map(file=>[file.path,file.id]))}));this.persistenceError=this.diskRecoveryError ?? '';}
    catch(error){this.persistenceError='Project settings could not be persisted: '+error.message;}
    if(this.adapter.checkpoint && !this.diskRecoveryError){
      const state={main:this.mainFileId?this.file(this.mainFileId).path:null,files:Object.fromEntries([...this.files.values()].map(file=>[file.path,file.id])),drafts:[...this.files.values()].filter(file=>file.dirty).map(({path,saved,draft})=>({path,saved,draft}))};
      // Preserve recovered versions until the user has chosen whether to restore.
      if(this.diskRecovery.length)state.drafts=this.diskRecovery;
      this.pendingCheckpoint=this.pendingCheckpoint.then(()=>this.adapter.checkpoint(state)).catch(error=>{this.persistenceError='Disk checkpoint failed: '+error.message;});
    }
  }
  restoreDrafts(drafts) {
    let restored=0;
    for(const draft of drafts){
      const path=projectPath(draft.path);
      if(typeof draft.saved!=='string' || typeof draft.draft!=='string')throw new Error('Invalid recovery draft');
      let file=this.files.get(path);
      if(!file && editable(fileKind(path))){
        const previousId=this.savedIdentities?.[path];
        const id=typeof previousId==='string' && ![...this.files.values()].some(item=>item.id===previousId)?previousId:crypto.randomUUID();
        file={id,path,kind:fileKind(path),missing:true};this.files.set(path,file);
      }
      if(!file || !editable(file.kind))continue;
      Object.assign(file,{saved:draft.saved,draft:draft.draft,bytes:new TextEncoder().encode(draft.saved),dirty:draft.draft!==draft.saved});this.scan(file);restored++;
    }
    if(!this.mainFileId)this.mainFileId=[...this.files.values()].find(file=>file.kind==='tex')?.id ?? null;
    if(!this.activeFileId)this.activeFileId=this.mainFileId;
    this.resolveDependencies();return restored;
  }
  scan(file) { if(file.kind==='tex') { try { this.scans.set(file.id,scanDependencies(file.draft)); } catch { this.scans.set(file.id,{document:false,dependencies:[],status:'pending'}); } } else this.scans.delete(file.id); }
  resolveDependencies() { this.dependencies=resolveMetadata(this.files,this.scans); }
  // Serialize mutations of one project while allowing editing during disk I/O.
  // A rejected operation must not prevent subsequent operations from running.
  operation(action) {
    const result=this.pendingOperation.then(action);
    this.pendingOperation=result.catch(()=>{});
    return result;
  }
  move(source, target) { return this.operation(()=>this.moveNow(source,target)); }
  async moveNow(source, target) {
    source=projectPath(source); target=projectPath(target);
    if(source===target || target.startsWith(source+'/'))throw new Error('Cannot move into itself');
    if(this.files.has(target) || this.directories.includes(target))throw new Error('Target already exists');
    const directory=this.directories.includes(source);
    if(!directory && !this.files.has(source))throw new Error('Source does not exist');
    const parent=target.includes('/')?target.slice(0,target.lastIndexOf('/')):'';
    if(parent && !this.directories.includes(parent))throw new Error('Target directory does not exist');
    const affected=[...this.files.values()].filter(file=>file.path===source || directory && file.path.startsWith(source+'/'));
    // The native boundary receives the original membership and saved bytes,
    // never draft text or a fresh disk snapshot that would hide outside edits.
    const expectedTree=directory?[
      ...this.directories.filter(path=>path===source || path.startsWith(source+'/')).map(path=>({path,kind:'directory'})),
      ...affected.map(file=>({path:file.path,kind:'file',bytes:Array.from(file.bytes)})),
    ].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0):undefined;
    for(const file of affected){
      const kind=fileKind(target+file.path.slice(source.length));
      if(editable(kind)!==editable(file.kind))throw new Error('Cannot rename between editable and resource file types; preserve the extension');
      if(file.id===this.mainFileId && kind!=='tex')throw new Error('Main document must remain a TeX file');
    }
    if(directory){
      const known=[...affected.map(file=>file.path),...this.directories.filter(path=>path===source || path.startsWith(source+'/'))].sort();
      const disk=(await this.adapter.list()).map(entry=>entry.path).filter(path=>path===source || path.startsWith(source+'/')).sort();
      if(JSON.stringify(known)!==JSON.stringify(disk))throw new Error('Directory changed on disk; reopen the project before moving');
    }
    for(const file of affected){const disk=await this.adapter.read(file.path);if(disk.length!==file.bytes.length || disk.some((byte,index)=>byte!==file.bytes[index]))throw new Error('File changed on disk: '+file.path);}
    const outcome=await this.adapter.move(source,target,directory?undefined:affected[0].bytes,expectedTree);
    const changes=affected.map(file=>({fileId:file.id,from:file.path,to:target+file.path.slice(source.length)}));
    for(const change of changes){const file=this.files.get(change.from);this.files.delete(change.from);file.path=change.to;file.kind=fileKind(change.to);this.files.set(change.to,file);this.scan(file);}
    this.directories=this.directories.map(path=>path===source || path.startsWith(source+'/')?target+path.slice(source.length):path);
    const change={source,target,changes,references:'not-rewritten',reconciliationRequired:outcome?.reconciliationRequired===true,warning:outcome?.warning ?? ''};
    this.pathChanges.push(change); this.resolveDependencies();
    this.persistMetadata();
    if(directory){
      // Native success means the rename committed. Publish known path changes
      // first; rescan failures must not pretend it rolled back. Existing editor
      // baselines stay unchanged until an explicit refresh/reload can show them.
      try {
        const result=await this.refreshNow({preserveExisting:true});
        if(result.conflicts.length || result.missing.length || result.added.length || result.removed.length || result.errors.length){
          change.reconciliationRequired=true;
          change.warning=[change.warning,'移动后检测到目录变化，请检查文件树并重新加载冲突文件 / Directory changed during move; review files and reload conflicts',...result.errors.map(item=>`${item.path}: ${item.message}`)].filter(Boolean).join(' · ');
        }
      } catch(error){
        change.reconciliationRequired=true;
        change.warning=[change.warning,'路径已移动，但目录核对失败 / Move committed; reconciliation failed: '+error.message].filter(Boolean).join(' · ');
      }
    }
    try {this.checkpoint();}catch(error){this.persistenceError='Move completed; draft checkpoint failed: '+error.message;}
    return changes;
  }
  activate(id) { this.file(id); this.activeFileId = id; }
  setMain(id) {
    if (this.file(id).kind !== 'tex') throw new TypeError('Main document must be a TeX file');
    this.mainFileId = id;
    this.persistMetadata();
  }
  save(id) { return this.operation(()=>this.saveNow(id)); }
  async saveNow(id) {
    const file = this.file(id);
    if(file.missing)throw new Error('File missing on disk; refresh the project before saving: '+file.path);
    if(file.externalChanged)throw new Error('File changed on disk; reload before saving: '+file.path);
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
  create(value, text) { return this.operation(()=>this.createNow(value,text)); }
  async createNow(value, text) {
    const path = projectPath(value);
    if (this.files.has(path) || this.directories.includes(path)) throw new Error('Path already exists');
    const bytes = new TextEncoder().encode(text);
    await this.adapter.create(path, bytes);
    const file = {id:crypto.randomUUID(), path, kind:fileKind(path), bytes, saved:text, draft:text, dirty:false};
    this.files.set(path, file); this.scan(file); this.resolveDependencies();this.persistMetadata(); return file;
  }
  reload(id) { return this.operation(()=>this.reloadNow(id)); }
  async reloadNow(id) {
    const file = this.file(id), revision = file.revision ?? 0;
    const bytes = await this.adapter.read(file.path);
    const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    if((file.revision ?? 0)!==revision)throw new Error('Draft changed while reloading; kept your edits');
    Object.assign(file,{bytes, saved:text, draft:text, dirty:false, session:null, missing:false, externalChanged:false});
    this.scan(file); this.resolveDependencies();
    this.checkpoint();
  }
  mkdir(value) { return this.operation(()=>this.mkdirNow(value)); }
  async mkdirNow(value) {
    const path = projectPath(value);
    if (this.files.has(path) || this.directories.includes(path)) throw new Error('Path already exists');
    await this.adapter.mkdir(path); this.directories.push(path);
  }
  remove(id) { return this.operation(()=>this.removeNow(id)); }
  async removeNow(id) {
    const file = this.file(id), revision=file.revision ?? 0;
    if (id === this.mainFileId) throw new Error('Cannot delete main document');
    const disk = await this.adapter.read(file.path);
    if (disk.length !== file.bytes.length || disk.some((byte,index) => byte !== file.bytes[index])) throw new Error('File changed on disk');
    if((file.revision ?? 0)!==revision)throw new Error('Draft changed while deleting; kept the file');
    await this.adapter.remove(file.path,file.bytes);
    if((file.revision ?? 0)!==revision){
      file.missing=true;this.checkpoint();
      return {retained:true};
    }
    this.files.delete(file.path);
    this.scans.delete(file.id); this.resolveDependencies();
    if (this.activeFileId === id) this.activeFileId = this.mainFileId;
    this.checkpoint();
    return {retained:false};
  }
  refresh() { return this.operation(()=>this.refreshNow()); }
  async refreshNow({preserveExisting=false}={}) {
    // Paths establish identity. An external rename cannot safely be inferred
    // from matching contents: preserve missing drafts and report the new path.
    const entries=await this.adapter.list(), seen=new Set(), directories=[], pending=[];
    const result={changed:[],added:[],removed:[],missing:[],errors:[],conflicts:[]};
    for(const entry of entries){
      let path;
      try {path=projectPath(entry.path);}catch(error){result.errors.push({path:entry.path,message:error.message});continue;}
      if(entry.kind==='directory'){directories.push(path);continue;}
      seen.add(path);
      const file=this.files.get(path), revision=file?.revision ?? 0;
      try {
        const bytes=await this.adapter.read(path), kind=fileKind(path);
        const text=editable(kind)?decode(bytes):null;
        pending.push({path,file,revision,bytes,kind,text});
      } catch(error){result.errors.push({path,message:error.message});}
    }
    // Publish once, with no further I/O awaits. Until refresh resolves the UI
    // still displays the old source; advancing a baseline during another read
    // would let new typing overwrite external edits without a conflict.
    for(const {path,file,revision,bytes,kind,text} of pending){
      if(!file){
        const added={id:crypto.randomUUID(),path,kind,bytes,saved:text,draft:text,dirty:false};
        this.files.set(path,added);this.scan(added);result.added.push(added.id);
      } else {
        file.missing=false;
        file.externalChanged=!sameBytes(bytes,file.bytes);
        if(!preserveExisting && !file.dirty && (file.revision ?? 0)===revision && file.externalChanged){
          Object.assign(file,{bytes,saved:text,draft:text,session:null,externalChanged:false});
          this.scan(file);result.changed.push(file.id);
        }
        if(file.externalChanged)result.conflicts.push(file.id);
      }
    }
    for(const [path,file] of this.files){
      if(seen.has(path))continue;
      if(file.dirty || file.id===this.activeFileId || file.id===this.mainFileId || file.session){file.missing=true;result.missing.push(file.id);}
      else {this.files.delete(path);this.scans.delete(file.id);result.removed.push(file.id);}
    }
    this.directories=directories;
    this.mainCandidates=[...this.files.values()].filter(file=>this.scans.get(file.id)?.document);
    const ids=new Set([...this.files.values()].map(file=>file.id));
    if(!ids.has(this.mainFileId))this.mainFileId=(this.mainCandidates[0] ?? [...this.files.values()].find(file=>file.kind==='tex'))?.id ?? null;
    if(!ids.has(this.activeFileId))this.activeFileId=this.mainFileId;
    this.resolveDependencies();this.checkpoint();
    return result;
  }
}

/** Browser File System Access adapter. Unsupported browsers must report capability absence. */
export class DirectoryHandleAdapter {
  constructor(handle) { this.handle = handle; }
  async list() {
    const entries = [];
    async function visit(handle, prefix) {
      for await (const [name, child] of handle.entries()) {
        if(name.toLowerCase().startsWith('.lineae-'))continue;
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
    // Windows directory handles can open an existing file through a case alias.
    // Conservatively reject aliases on every browser, before create:true.
    for await (const [entry] of directory.entries()) if (entry.toLowerCase() === name.toLowerCase()) throw new Error('Path already exists on disk');
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
  async write(path, bytes, expected) {
    const stream = await (await this.resolve(path)).createWritable();
    try {
      if(expected && !sameBytes(await this.read(path),expected))throw new Error('File changed on disk: '+path);
      await stream.write(bytes); await stream.close();
    }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
  }
}
