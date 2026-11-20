// The caller supplies a lexically unescaped opener. Consume a whole math span
// so comments, commands and blank lines inside it cannot become block syntax.
export function mathSpan(source,index,opener) {
  const closer={'$':'$','$$':'$$','\\(':'\\)','\\[':'\\]'}[opener];
  if(!closer)return null;
  const pattern=/%[^\r\n]*|\\[\s\S]|\$\$|\$|[{}]/g;
  pattern.lastIndex=index+opener.length;
  let depth=0,match;
  while((match=pattern.exec(source))) {
    const value=match[0];
    if(value.startsWith('%'))continue;
    if(value==='{'){depth++;continue;}
    if(value==='}') {if(!depth)return null;depth--;continue;}
    if(depth)continue;
    if(value===closer)return {end:pattern.lastIndex,latex:source.slice(index+opener.length,match.index),delimiter:opener};
    // Mixed or nested delimiters are ambiguous; preserve their source as Raw.
    if(value==='$'||value==='$$'||value==='\\['||value==='\\]'||value==='\\('||value==='\\)')return null;
  }
  return null;
}
