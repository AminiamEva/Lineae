use std::{collections::HashSet, path::{Path, PathBuf, Component}, sync::Mutex};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ProjectRoots(pub Mutex<HashSet<PathBuf>>);
#[derive(Serialize)]
pub struct Entry { path:String, kind:String }
#[derive(Serialize, Default)]
pub struct Reply { entries:Vec<Entry>, bytes:Vec<u8> }

fn scoped(root:&Path, path:&str) -> Result<PathBuf,String> {
    if path.contains('\\') || path.contains(':') || path.split('/').any(|p|p==".." || p==".") { return Err("Invalid relative path".into()); }
    let relative=Path::new(path);
    if relative.components().any(|p|!matches!(p,Component::Normal(_))) { return Err("Invalid relative path".into()); }
    let target=root.join(relative);
    let resolved=if target.exists(){target.canonicalize()}else{target.parent().ok_or("Missing parent")?.canonicalize().map(|p|p.join(target.file_name().unwrap()))}.map_err(|e|e.to_string())?;
    if !resolved.starts_with(root) || resolved==root {return Err("Path escapes project".into());}
    Ok(resolved)
}
fn list(root:&Path, directory:&Path, entries:&mut Vec<Entry>) -> Result<(),String> {
    for item in std::fs::read_dir(directory).map_err(|e|e.to_string())? {
        let item=item.map_err(|e|e.to_string())?;let path=item.path();
        if item.file_type().map_err(|e|e.to_string())?.is_symlink(){continue;}
        let canonical=path.canonicalize().map_err(|e|e.to_string())?;
        if canonical != path {continue;}
        if !canonical.starts_with(root){return Err("Linked path escapes project".into());}
        let directory=canonical.is_dir();
        entries.push(Entry{path:path.strip_prefix(root).map_err(|e|e.to_string())?.to_string_lossy().replace('\\',"/"),kind:if directory{"directory"}else{"file"}.into()});
        if directory {list(root,&path,entries)?;}
    }
    Ok(())
}
#[tauri::command]
pub async fn open_project(app:AppHandle, roots:State<'_,ProjectRoots>) -> Result<Option<String>,String> {
    let (sender,receiver)=tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder|{let _=sender.send(folder);});
    let Some(folder)=receiver.await.map_err(|e|e.to_string())? else{return Ok(None)};
    let path=folder.into_path().map_err(|e|e.to_string())?.canonicalize().map_err(|e|e.to_string())?;
    roots.0.lock().map_err(|e|e.to_string())?.insert(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[tauri::command]
pub fn project_operation(roots:State<'_,ProjectRoots>,root:String,operation:String,path:Option<String>,target:Option<String>,bytes:Option<Vec<u8>>) -> Result<Reply,String> {
    let root=PathBuf::from(root);
    if !roots.0.lock().map_err(|e|e.to_string())?.contains(&root){return Err("Project was not selected through a native dialog".into());}
    let mut reply=Reply::default();
    if operation=="list"{list(&root,&root,&mut reply.entries)?;return Ok(reply);}
    let path=scoped(&root,&path.ok_or("Missing path")?)?;
    match operation.as_str(){
        "read"=>reply.bytes=std::fs::read(path).map_err(|e|e.to_string())?,
        "write"=>{let mut file=std::fs::OpenOptions::new().write(true).truncate(true).open(path).map_err(|e|e.to_string())?;std::io::Write::write_all(&mut file,&bytes.ok_or("Missing bytes")?).map_err(|e|e.to_string())?;},
        "create"=>{let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|e.to_string())?;std::io::Write::write_all(&mut file,&bytes.ok_or("Missing bytes")?).map_err(|e|e.to_string())?;},
        "mkdir"=>std::fs::create_dir(path).map_err(|e|e.to_string())?,
        "remove"=>std::fs::remove_file(path).map_err(|e|e.to_string())?,
        "move"=>{let target=scoped(&root,&target.ok_or("Missing target")?)?;if target.exists() || target.starts_with(&path){return Err("Target exists or is inside source".into());}std::fs::rename(path,target).map_err(|e|e.to_string())?;},
        _=>return Err("Unknown project operation".into()),
    }
    Ok(reply)
}
