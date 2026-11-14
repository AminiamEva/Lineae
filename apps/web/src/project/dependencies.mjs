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
    const from=++i;let depth=1;
    while(i<source.length && depth){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='{')depth++;if(source[i]==='}')depth--;if(depth)i++;}
    const value=source.slice(from,i);i++;
    if(command==='begin' && ['verbatim','verbatim*','lstlisting','minted'].includes(value)){const end=source.indexOf('\\end{'+value+'}',i);i=end<0?source.length:end+value.length+6;continue;}
    if(command==='documentclass')document=true;
    if(!['input','include','includegraphics','bibliography','addbibresource'].includes(command))continue;
    for(const path of command==='bibliography'?value.split(','):[value])dependencies.push({command,path:path.trim(),from,to:i-1,start,status:/[\\{}#%]/.test(path)?'pending':'literal'});
  }
  return {document,dependencies};
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
