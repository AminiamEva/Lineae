use std::{collections::HashSet, path::{Path, PathBuf, Component}, sync::Mutex};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ProjectRoots(pub Mutex<HashSet<PathBuf>>);
#[derive(Debug, Serialize)]
pub struct Entry { path:String, kind:String }
#[derive(Debug, Serialize, Default)]
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
    operate(&roots, root, operation, path, target, bytes)
}

fn operate(roots:&ProjectRoots,root:String,operation:String,path:Option<String>,target:Option<String>,bytes:Option<Vec<u8>>) -> Result<Reply,String> {
    let root=PathBuf::from(root);
    if !roots.0.lock().map_err(|e|e.to_string())?.contains(&root){return Err("Project was not selected through a native dialog".into());}
    let mut reply=Reply::default();
    if operation=="list"{list(&root,&root,&mut reply.entries)?;return Ok(reply);}
    let path=scoped(&root,&path.ok_or("Missing path")?)?;
    match operation.as_str(){
        "read"=>reply.bytes=std::fs::read(path).map_err(|e|e.to_string())?,
        "write"=>{let bytes=bytes.ok_or("Missing bytes")?;let mut file=std::fs::OpenOptions::new().write(true).truncate(true).open(path).map_err(|e|e.to_string())?;std::io::Write::write_all(&mut file,&bytes).map_err(|e|e.to_string())?;},
        "create"=>{let bytes=bytes.ok_or("Missing bytes")?;let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|e.to_string())?;std::io::Write::write_all(&mut file,&bytes).map_err(|e|e.to_string())?;},
        "mkdir"=>std::fs::create_dir(path).map_err(|e|e.to_string())?,
        "remove"=>std::fs::remove_file(path).map_err(|e|e.to_string())?,
        "move"=>{let target=scoped(&root,&target.ok_or("Missing target")?)?;if target.exists() || target.starts_with(&path){return Err("Target exists or is inside source".into());}std::fs::rename(path,target).map_err(|e|e.to_string())?;},
        _=>return Err("Unknown project operation".into()),
    }
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (ProjectRoots, PathBuf) {
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let directory=std::env::temp_dir().join(format!("lineae-原生 验收-{}-{}",std::process::id(),stamp));
        std::fs::create_dir(&directory).unwrap();
        let root=directory.canonicalize().unwrap();
        let roots=ProjectRoots::default();roots.0.lock().unwrap().insert(root.clone());
        (roots,root)
    }
    fn call(roots:&ProjectRoots,root:&Path,op:&str,path:&str,target:Option<&str>,bytes:Option<Vec<u8>>) -> Result<Reply,String>{
        operate(roots,root.to_string_lossy().into_owned(),op.into(),Some(path.into()),target.map(str::to_string),bytes)
    }
    #[test]
    fn native_disk_lifecycle_unicode_binary_and_moves() {
        let (roots,root)=fixture();
        let original="\u{feff}中文\r\nLF\nCR\r".as_bytes().to_vec();
        call(&roots,&root,"mkdir","章节",None,None).unwrap();
        call(&roots,&root,"create","章节/a.tex",None,Some(original.clone())).unwrap();
        call(&roots,&root,"move","章节/a.tex",Some("章节/b.tex"),None).unwrap();
        call(&roots,&root,"move","章节",Some("目录 空格"),None).unwrap();
        assert_eq!(call(&roots,&root,"read","目录 空格/b.tex",None,None).unwrap().bytes,original);
        assert!(!root.join("章节/a.tex").exists());
        call(&roots,&root,"write","目录 空格/b.tex",None,Some(vec![0,255,13,10])).unwrap();
        assert_eq!(std::fs::read(root.join("目录 空格/b.tex")).unwrap(),vec![0,255,13,10]);
        let listing=call(&roots,&root,"list","",None,None).unwrap();
        assert!(listing.entries.iter().any(|entry|entry.path=="目录 空格/b.tex"));
        call(&roots,&root,"remove","目录 空格/b.tex",None,None).unwrap();
        assert!(!root.join("目录 空格/b.tex").exists());
    }
    #[test]
    fn scope_conflicts_and_invalid_payload_preserve_disk() {
        let (roots,root)=fixture();
        call(&roots,&root,"create","a.tex",None,Some(b"original".to_vec())).unwrap();
        call(&roots,&root,"create","b.tex",None,Some(b"target".to_vec())).unwrap();
        assert!(call(&roots,&root,"move","a.tex",Some("b.tex"),None).is_err());
        assert!(call(&roots,&root,"write","a.tex",None,None).is_err());
        assert_eq!(std::fs::read(root.join("a.tex")).unwrap(),b"original");
        for path in ["../outside","/absolute","C:/absolute","", "a/../../outside"] {
            assert!(call(&roots,&root,"read",path,None,None).is_err());
        }
        assert!(call(&ProjectRoots::default(),&root,"list","",None,None).is_err());
        call(&roots,&root,"mkdir","folder",None,None).unwrap();
        assert!(call(&roots,&root,"move","folder",Some("folder/inside"),None).is_err());
        assert!(call(&roots,&root,"read","missing.tex",None,None).is_err());
    }
}
