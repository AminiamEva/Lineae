const files = new Map();
const listeners = new Set();
const BIB_METADATA_PREFIX = '% lineae-bib-state:';

export function rememberAsset(path,file) {
  if (typeof path !== 'string' || !path || !file) return false;
  files.set(path,file);
  for(const listener of listeners)listener();
  return true;
}
export function projectAssets() { return [...files.entries()]; }
export function clearProjectAssets() { files.clear();for(const listener of listeners)listener(); }
export function onAssetsChanged(listener) { listeners.add(listener);return ()=>listeners.delete(listener); }
export function resolveImageAsset(path) {
  if(files.has(path))return files.get(path);
  const matches=[...files].filter(([key])=>key.replace(/\.[^./]+$/,'')===path);
  return matches.length===1?matches[0][1]:null;
}

function encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

function decode(value) {
  if (typeof atob === 'function') {
    const binary = atob(value);
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
  }
  return Buffer.from(value, 'base64').toString('utf8');
}

export function writeBibliographyMetadata(source, state) {
  const marker = `${BIB_METADATA_PREFIX} ${encode(JSON.stringify(state))}`;
  const line = new RegExp(`^${BIB_METADATA_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*(?:\\r?\\n|$)`, 'm');
  if (line.test(source)) return source.replace(line, marker + '\n');
  return source.replace(/\\begin\{document\}/, marker + '\n\\begin{document}');
}

export function readBibliographyMetadata(source) {
  const match = source.match(new RegExp(`^${BIB_METADATA_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([^\\r\\n]+)`, 'm'));
  if (!match) return null;
  try {
    const state = JSON.parse(decode(match[1]));
    return state && Array.isArray(state.sources) ? state : null;
  } catch {
    return null;
  }
}
