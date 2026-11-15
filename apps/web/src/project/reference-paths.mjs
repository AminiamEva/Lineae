const relative = value => value.startsWith('./') ? value.slice(2) : value;
const hasSuffix = value => /\.[^/]+$/.test(value);
export function dependencyMatchesPath(command,value,path) {
  const candidate = relative(value);
  if (!hasSuffix(candidate)) {
    if (command === 'input' || command === 'include') return candidate + '.tex' === path;
    if (command === 'bibliography') return candidate + '.bib' === path;
    if (command === 'includegraphics') return path.replace(/\.[^/.]+$/,'') === candidate;
  }
  return candidate === path;
}
export function dependencySpelling(command,value,path) {
  let spelling = path;
  if (!hasSuffix(relative(value))) {
    if ((command === 'input' || command === 'include') && path.endsWith('.tex')) spelling = path.slice(0,-4);
    if (command === 'bibliography' && path.endsWith('.bib')) spelling = path.slice(0,-4);
    if (command === 'includegraphics') spelling = path.replace(/\.[^/.]+$/,'');
  }
  return (value.startsWith('./') ? './' : '') + spelling;
}
export function dependencyRanges(command,value,offset,start) {
  const pieces = command === 'bibliography' ? Array.from(value.matchAll(/[^,]+/g)) : [{0:value,index:0}];
  return pieces.flatMap(piece => {
    const path = piece[0].trim();
    if (!path) return [];
    const from = offset + piece.index + piece[0].search(/\S/);
    return [{command,path,from,to:from + path.length,start,status:/[\\{}#%]/.test(path) ? 'pending' : 'literal'}];
  });
}
