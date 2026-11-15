import {projectPath} from './paths.mjs';
const sameBytes=(left,right)=>left.length===right.length&&left.every((value,index)=>value===right[index]);
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
  async remove(path,expected,expectedTree) {
    const {directory,name}=await this.parent(path);
    await directory.removeEntry(name,{recursive:Array.isArray(expectedTree)});
  }
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
