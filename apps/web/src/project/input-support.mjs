import {parseDocument} from '../../latex/document.mjs';
import {includeEdges,referenceTarget} from './include-operations.mjs';

// Complete standalone children need their preambles muted when input by a root.
export function projectInputSource(project,rootId,text){
  const parsed=parseDocument(text);
  if(!parsed)return text;
  const seen=new Set([rootId]);
  function needsMute(id,source){
    for(const edge of includeEdges(source)){
      if(edge.status!=='literal')continue;
      const file=referenceTarget(project,edge);
      if(!file||file.missing||typeof file.draft!=='string'||seen.has(file.id))continue;
      seen.add(file.id);
      if(parseDocument(file.draft))return true;
      if(needsMute(file.id,file.draft))return true;
    }
    return false;
  }
  if(!needsMute(rootId,text))return text;
  const withoutComments=parsed.start.replace(/%[^\n]*/g,'');
  if(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bdocmute\b[^}]*\}/.test(withoutComments))return text;
  const marker=parsed.start.lastIndexOf('\\begin{document}');
  if(marker<0)return text;
  const eol=text.includes('\r\n')?'\r\n':'\n';
  return text.slice(0,marker)+'\\usepackage{docmute}'+eol+text.slice(marker);
}
