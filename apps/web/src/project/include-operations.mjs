import {scanDependencies,dependencyMatchesPath} from './dependencies.mjs';
import {parseDocument} from '../../latex/document.mjs';

const referenceKinds = new Set(['input','include']);
const directiveEnd = reference => reference.end ?? reference.to + 1;
export const includeEdges = text => scanDependencies(text).dependencies.filter(edge => referenceKinds.has(edge.command)).map(edge=>{
  let end=edge.to;
  while(end<text.length && /\s/.test(text[end]))end++;
  return {...edge,end:text[end]==='}'?end+1:edge.to+1};
});
export function referenceTarget(project, reference) {
  if (!project) return undefined;
  return Array.from(project.files.values()).find(file => file.kind === 'tex' && dependencyMatchesPath(reference.command, reference.path, file.path));
}
export function wouldCycle(project, owner, target) {
  const pending = [target];
  const visited = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (id === owner) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const reference of includeEdges(project.file(id).draft ?? '')) {
      if (reference.status !== 'literal') continue;
      const file = referenceTarget(project, reference);
      if (file && !file.missing) pending.push(file.id);
    }
  }
  return false;
}
export function addReference(text, path, command = 'input', beforeIndex) {
  if (!referenceKinds.has(command) || /[\\{}%#\r\n]/.test(path)) throw new Error('Invalid reference');
  const document = parseDocument(text, {fragment:true});
  if (!document) throw new Error('Invalid TeX');
  const before = includeEdges(text)[beforeIndex];
  const offset = before ? before.start : text.length - document.end.length;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const directive = '\\' + command + '{' + path.replace(/\.tex$/, '') + '}';
  return text.slice(0, offset) + newline + directive + newline + text.slice(offset);
}
export function removeReference(text, index) {
  const reference = includeEdges(text)[index];
  if (!reference || reference.status !== 'literal') return text;
  return text.slice(0, reference.start) + text.slice(directiveEnd(reference));
}
export function setReferenceKind(text, index, command) {
  const reference = includeEdges(text)[index];
  if (!reference || reference.status !== 'literal' || !referenceKinds.has(command)) return text;
  const offset = reference.start + reference.command.length + 1;
  return text.slice(0, reference.start) + '\\' + command + text.slice(offset);
}
export function moveReference(text, from, to) {
  const references = includeEdges(text);
  if (!references[from] || !references[to] || references.some(reference => reference.status !== 'literal')) return text;
  const ordered = references.map(reference => text.slice(reference.start, directiveEnd(reference)));
  ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  return references.reduceRight((result, reference, index) =>
    result.slice(0, reference.start) + ordered[index] + result.slice(directiveEnd(reference)), text);
}
