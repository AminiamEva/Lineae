// TeX paragraph commands can end at a non-ASCII character or an empty group.
// Keep the user's exact prefix when editing text; do not relax unknown macros.
export function paragraphSpelling(raw,canonical,nodes){
  if(nodes.length!==1||nodes[0].type!=='paragraph')return null;
  const source=raw.trim();
  const match=source.match(/^\\(indent|noindent)(?![a-zA-Z])(?:\{\})?[ \t]*/);
  if(!match)return null;
  const prefix='\\'+match[1]+' ';
  return canonical===prefix+source.slice(match[0].length)
    ? {canonical:prefix,original:match[0]} : null;
}
