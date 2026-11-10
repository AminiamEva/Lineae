export function parseImageBlock(source) {
  const match = /^\\includegraphics(?:\[(width=(?:\d+(?:\.\d+)?)(?:\\linewidth|cm|mm|pt))\])?\{([^{}\\\r\n%]+)\}$/.exec(source);
  return match ? { type: 'documentImage', attrs: { path:match[2], width:match[1]?.slice(6) ?? null } } : null;
}

export function serializeImage({ path, width }) {
  return '\\includegraphics' + (width ? '[width='+width+']' : '') + '{'+path+'}\n\n';
}
