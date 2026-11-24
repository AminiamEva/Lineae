import {projectPath} from '../../project/paths.mjs';

const encoder = new TextEncoder();
const limits = {maxFiles:512, maxSourceBytes:2 * 1024 * 1024, maxFileBytes:16 * 1024 * 1024,
  maxTotalBytes:64 * 1024 * 1024};
const outputDirectories = new Set(['build', 'dist', 'out', 'target', 'node_modules', '__pycache__']);
const generatedFile = /\.(?:aux|log|toc|lof|lot|out|fls|fdb_latexmk|synctex(?:\.gz)?|xdv|dvi|nav|snm|vrb|bcf|run\.xml|blg)$/i;
const cachedFiles=new WeakMap();

/**
 * Read-only snapshot of the current Project model, not a disk export.
 *
 * In main.js, first reject editor.view.composing/sourceView.composing, then:
 *   if (!sourceView.hidden) sourceView.flush();
 *   else editor.view.domObserver.flush();
 *   projectExplorer.changed();
 *   const snapshot = await nativeProjectSnapshot(projectExplorer.model);
 * Recheck model identity/document generation after awaiting, before opening a
 * native session. Pass source, main_file:mainFile, and files to native open.
 * Send changed snapshots to the same trusted project session. A different
 * main file/project requires a new session and trust confirmation.
 *
 * changed() uses the explorer's existing sessions.text()/Project.edit() capture;
 * rich composition edits already update individual dependency drafts. Never use
 * prepareSave()/save(): those format or persist source. This function neither
 * flushes the editor nor changes drafts, baselines, checkpoints, or disk.
 *
 * Text drafts (including resource files with a string draft, e.g. .sty) win over
 * disk. Other files are freshly read via the scoped adapter, retaining its link
 * protections. Membership comes from the model; refresh the explorer explicitly
 * to discover files added outside the application. Options may lower limits.
 */
export async function nativeProjectSnapshot(project, options = {}) {
  if (!(project?.files instanceof Map) || typeof project.adapter?.read !== 'function') {
    throw new TypeError('Expected an open project');
  }
  const bounds = {...limits};
  for (const key of Object.keys(limits)) {
    if (options[key] === undefined) continue;
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > limits[key]) {
      throw new RangeError('Invalid snapshot limit: ' + key);
    }
    bounds[key] = options[key];
  }
  // Moves, saves, and refreshes already serialize through this model promise.
  await project.pendingOperation;
  const mainId = project.mainFileId, membership = project.files, fileCount = membership.size;
  const records = [];
  const paths = new Set();
  let main;
  for (const file of membership.values()) {
    const path = file.path;
    if (typeof path !== 'string') throw new TypeError('Invalid project snapshot path');
    const parts = path.split('/');
    if (parts.some(part => part.startsWith('.') && part !== '..' && part !== '.')
        || (!options.includeGeneratedInputs && (parts.slice(0, -1).some(part => outputDirectories.has(part.toLowerCase()))
        || generatedFile.test(path)))) continue;
    if (projectPath(path) !== path) throw new TypeError('Invalid project snapshot path');
    const portablePath = path.toLowerCase();
    if (paths.has(portablePath)) throw new TypeError('Duplicate project snapshot path');
    paths.add(portablePath);
    if (records.length >= bounds.maxFiles) throw new RangeError('Project snapshot has too many files');
    const record = {file, path, draft:file.draft, revision:file.revision, bytes:file.bytes};
    records.push(record);
    if (file.id === mainId) main = record;
  }
  if (!main || main.file.kind !== 'tex' || typeof main.draft !== 'string') {
    throw new TypeError('Project snapshot requires a TeX main document');
  }
  records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const files = [], manifest = [];
  let total = 0;
  for (const {file,path, draft, bytes:knownBytes} of records) {
    const cached=cachedFiles.get(file);
    if(cached && ((typeof draft==='string'&&cached.draft===draft) ||
        (typeof draft!=='string'&&options.useModelAssets&&cached.asset===knownBytes))){
      total+=cached.length;
      if(total>bounds.maxTotalBytes)throw new RangeError('Project snapshot exceeds total byte limit');
      if(cached.length>bounds.maxFileBytes)throw new RangeError('Project file exceeds snapshot limit: '+path);
      if(typeof draft==='string'&&cached.length>bounds.maxSourceBytes)throw new RangeError('Project source exceeds snapshot limit: '+path);
      manifest.push([path,cached.length,cached.digest]);files.push({path,bytes:cached.bytes});continue;
    }
    let bytes;
    if (typeof draft === 'string') {
      // Reject oversized strings before allocating their UTF-8 representation.
      if (draft.length > bounds.maxSourceBytes) throw new RangeError('Project source exceeds snapshot limit: ' + path);
      bytes = encoder.encode(draft);
      if (bytes.byteLength > bounds.maxSourceBytes) throw new RangeError('Project source exceeds snapshot limit: ' + path);
    } else {
      try { bytes = options.useModelAssets && knownBytes instanceof Uint8Array ? knownBytes : await project.adapter.read(path); }
      catch { throw new Error('Could not read project snapshot file: ' + path); }
      if (!(bytes instanceof Uint8Array)) throw new TypeError('Invalid project snapshot bytes: ' + path);
    }
    if(bytes.byteLength>bounds.maxFileBytes)throw new RangeError('Project file exceeds snapshot limit: '+path);
    total += bytes.byteLength;
    if (total > bounds.maxTotalBytes) throw new RangeError('Project snapshot exceeds total byte limit');
    // Own the bytes before yielding to hashing; adapters may reuse their buffer.
    const copy = bytes.slice();
    const digest = await crypto.subtle.digest('SHA-256', copy);
    const hash=Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const values=Object.freeze(Array.from(copy));
    manifest.push([path, copy.byteLength,hash]);files.push({path,bytes:values});
    cachedFiles.set(file,{draft,asset:typeof draft!=='string'&&options.useModelAssets?knownBytes:null,
      length:copy.byteLength,digest:hash,bytes:values});
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([main.path, manifest])));
  const dependencyDigest=await crypto.subtle.digest('SHA-256',
    encoder.encode(JSON.stringify([main.path,manifest.filter(([path])=>path!==main.path)])));
  if (project.files !== membership || project.mainFileId !== mainId || membership.size !== fileCount
      || records.some(({file, path, draft, revision,bytes}) =>
        membership.get(path) !== file || file.path !== path || file.draft !== draft || file.revision !== revision ||
        (options.useModelAssets && file.bytes!==bytes))) {
    throw new Error('Project changed while preparing native preview; try again');
  }
  const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const dependencySignature=Array.from(new Uint8Array(dependencyDigest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {mainFile:main.path, source:main.draft, files, signature,dependencySignature};
}
