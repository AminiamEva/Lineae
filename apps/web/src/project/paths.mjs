/** Project paths use '/' and are relative to the project root, never OS paths. */
export function projectPath(value, base = '') {
  if (typeof value !== 'string' || !value || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/')) {
    throw new TypeError('Expected a project-relative path');
  }
  const parts = [];
  for (const part of `${base ? base + '/' : ''}${value}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new RangeError('Path escapes project root');
      parts.pop();
    } else {
      if(/[<>"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))throw new TypeError('Invalid filename');
      parts.push(part);
    }
  }
  if (!parts.length) throw new TypeError('Expected a file or directory path');
  return parts.join('/');
}

export function fileKind(path) {
  const extension = path.split('.').at(-1).toLowerCase();
  return extension === 'tex' ? 'tex' : extension === 'bib' ? 'bib' : extension === 'pdf' ? 'pdf'
    : ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(extension) ? 'image' : 'resource';
}

/** The tree is derived from file records; file identity survives a rename. */
export function directoryTree(files, directories = []) {
  const root = {kind: 'directory', path: '', name: '', children: []};
  const nodes = new Map([['', root]]);
  function directory(path) {
    if (nodes.has(path)) return nodes.get(path);
    const cut = path.lastIndexOf('/');
    const node = {kind: 'directory', path, name: path.slice(cut + 1), children: []};
    directory(cut < 0 ? '' : path.slice(0, cut)).children.push(node);
    nodes.set(path, node);
    return node;
  }
  for (const path of directories) directory(projectPath(path));
  for (const file of files) {
    const path = projectPath(file.path), cut = path.lastIndexOf('/');
    directory(cut < 0 ? '' : path.slice(0, cut)).children.push({
      kind: fileKind(path), path, name: path.slice(cut + 1), fileId: file.id, dirty: file.dirty === true,
    });
  }
  function sort(node) {
    node.children.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory')
      || a.name.localeCompare(b.name, 'en'));
    node.children.filter(child => child.kind === 'directory').forEach(sort);
  }
  sort(root);
  return root;
}
