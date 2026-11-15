// Mode policy is per workspace; content, cursor and history stay per file.
export class ProjectWorkspaceState {
  mode='body';suspended=null;
  begin(capture){this.suspended??=capture();this.mode='body';}
  select(mode,kind='tex'){if(kind!=='bib'&&['body','source','split'].includes(mode))this.mode=mode;}
  modeFor(kind){return kind==='bib'?'source':this.mode;}
  end(){const previous=this.suspended;this.suspended=null;this.mode='body';return previous;}
}
