// Positions in this module count logical line breaks, as CodeMirror does.
export function sourceEndings(source) {
  return source.match(/\r\n|\r|\n/g) ?? [];
}

export function updateEndings(endings, changes) {
  const structural = changes.filter(change => change.from !== change.to || change.inserted);
  if (!structural.length) return endings;
  const result = [];
  let cursor = 0;
  for (const {from, to, inserted} of structural) {
    for (let index = cursor; index < from; index++) result.push(endings[index]);
    const nearby = endings[from] ?? endings[from - 1] ?? '\n';
    for (let index = 0; index < inserted; index++) result.push(nearby);
    cursor = to;
  }
  for (let index = cursor; index < endings.length; index++) result.push(endings[index]);
  return result;
}

export function serializeSource(document, endings) {
  let index = 0;
  const source = document.replace(/\n/g, () => {
    if (index >= endings.length) throw new RangeError('Missing source line ending');
    return endings[index++];
  });
  if (index !== endings.length) throw new RangeError('Extra source line endings');
  return source;
}
