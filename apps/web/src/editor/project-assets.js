const files = new Map();
export function rememberAsset(path,file) { files.set(path,file); }
export function projectAssets() { return [...files.entries()]; }
