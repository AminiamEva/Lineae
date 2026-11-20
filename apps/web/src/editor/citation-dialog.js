import { createCitationLibrary, openCitationPanel } from './citation-library.js';

export async function insertCitationDialog() {
  const library = createCitationLibrary();
  const entry = await openCitationPanel({ library });
  return entry ? { key: entry.key, file: entry.blob } : null;
}
