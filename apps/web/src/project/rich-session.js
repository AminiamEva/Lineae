export function captureRichSession(editor,composition,project,source) {
  return {
    richState:editor.state,richSource:source,composition,
    compositionSources:composition ? Array.from(project.files.values(),file => [file.id,file.draft]) : null,
  };
}
export function restoreRichSession(editor,session,file,project,documentSession) {
  if (!session?.richState || session.richSource !== file.draft) return false;
  const current = !session.composition || session.compositionSources?.every(([id,text]) => {
    try { return project.file(id).draft === text; } catch { return false; }
  });
  if (!current) return false;
  documentSession.composition = session.composition ?? null;
  editor.view.updateState(session.richState);
  return true;
}
export function copyModeHistory(entry,commits,redos) {
  return {entry,commits:[...commits],redos:[...redos]};
}
export function readModeHistory(history) {
  return {entry:history?.entry,commits:[...(history?.commits ?? [])],redos:[...(history?.redos ?? [])]};
}
