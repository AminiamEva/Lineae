// Literal-command metadata only. Macro-generated paths and TeX execution remain unresolved.
export function scanDependencies(source) {
  const dependencies = []; let document = false;
  for (let i=0;i<source.length;) {
    if (source[i] === '%') { while(i<source.length && source[i] !== '\n') i++; continue; }
    if (source[i++] !== '\\') continue;
    const start=i-1, match=/^[a-zA-Z]+/.exec(source.slice(i));
    if (!match) { i++; continue; }
    const command=match[0]; i+=command.length;
    if (command==='verb') { if(source[i]==='*')i++;const delimiter=source[i++];while(i<source.length && source[i]!==delimiter)i++;i++;continue; }
    while (/\s/.test(source[i] ?? '') && i<source.length) i++;
    if(source[i]==='[') { let depth=1;i++;while(i<source.length && depth){if(source[i]==='[')depth++;if(source[i]===']')depth--;i++;} }
    while(i<source.length && /\s/.test(source[i]))i++;
    if(source[i]!=='{')continue;
    const argumentFrom=++i;let depth=1;
    while(i<source.length && depth){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='{')depth++;if(source[i]==='}')depth--;if(depth)i++;}
    const value=source.slice(argumentFrom,i);i++;
    if(command==='begin' && ['verbatim','verbatim*','lstlisting','minted'].includes(value)){const end=source.indexOf('\\end{'+value+'}',i);i=end<0?source.length:end+value.length+6;continue;}
    if(command==='documentclass')document=true;
    if(!['input','include','includegraphics','bibliography','addbibresource'].includes(command))continue;
    const parts=command==='bibliography'?[...value.matchAll(/[^,]+/g)].map(match=>({value:match[0],index:match.index})):[{value,index:0}];
    for(const part of parts){
      const leading=part.value.match(/^\s*/)[0].length,path=part.value.trim();
      if(!path)continue;
      const from=argumentFrom+part.index+leading;
      dependencies.push({command,path,from,to:from+path.length,start,status:/[\\{}#%]/.test(path)?'pending':'literal'});
    }
  }
  return {document,dependencies};
}

const withoutDot = path => path.replace(/^\.\//,'');
const hasExtension = path => /\.[^/]+$/.test(path);

export function dependencyMatchesPath(command,value,path) {
  const candidate=withoutDot(value);
  if(['input','include'].includes(command) && !hasExtension(candidate))return candidate+'.tex'===path;
  if(command==='bibliography' && !hasExtension(candidate))return candidate+'.bib'===path;
  if(command==='includegraphics' && !hasExtension(candidate))return path.replace(/\.[^/.]+$/,'')===candidate;
  return candidate===path;
}

export function dependencySpelling(command,value,path) {
  const prefix=value.startsWith('./')?'./':'';
  let next=path;
  if(['input','include'].includes(command) && !hasExtension(withoutDot(value)) && next.endsWith('.tex'))next=next.slice(0,-4);
  if(command==='bibliography' && !hasExtension(withoutDot(value)) && next.endsWith('.bib'))next=next.slice(0,-4);
  if(command==='includegraphics' && !hasExtension(withoutDot(value)))next=next.replace(/\.[^/.]+$/,'');
  return prefix+next;
}

export function resolveMetadata(files, scans) {
  const dependencies=[];
  for(const [fileId,scan] of scans)for(const raw of scan.dependencies){
    const dependency={...raw,fileId};
    if(raw.status==='literal'){
      let path=raw.path.replace(/^\.\//,'');
      if(['input','include'].includes(raw.command) && !/\.[^/]+$/.test(path))path+='.tex';
      if(raw.command==='bibliography' && !path.endsWith('.bib'))path+='.bib';
      const candidate=files.get(path) ?? (raw.command==='includegraphics'?[...files.values()].find(file=>file.path?.replace(/\.[^/.]+$/,'')===path):null);
      dependency.targetId=candidate && !candidate.missing?candidate.id:null;dependency.status=candidate && !candidate.missing?'resolved':'missing';
      dependency.resolution='project-root-literal';
    }
    dependencies.push(dependency);
  }
  return dependencies;
}
