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
        if item.file_name().to_string_lossy().starts_with(".lineae-save-") || item.file_name()==".lineae-state.json" {continue;}
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
pub fn project_operation(roots:State<'_,ProjectRoots>,root:String,operation:String,path:Option<String>,target:Option<String>,bytes:Option<Vec<u8>>,expected:Option<Vec<u8>>) -> Result<Reply,String> {
    operate_checked(&roots, root, operation, path, target, bytes,expected)
}

// A sibling staging file is flushed before Windows atomically replaces the target.
// The open original denies other writers; delete-sharing is required by ReplaceFileW.
fn safe_write(path:&Path, bytes:&[u8], expected:Option<&[u8]>) -> Result<(),String> {
    static WRITES:Mutex<()> = Mutex::new(());
    let _guard=WRITES.lock().map_err(|e|e.to_string())?;
    let _process_guard=ProcessSaveLock::acquire(path)?;
    use std::io::{Read,Write};
    use std::os::windows::{fs::OpenOptionsExt,ffi::OsStrExt};
    let mut original=std::fs::OpenOptions::new().read(true).share_mode(1|4).open(path).map_err(|e|e.to_string())?;
    let mut current=Vec::new();original.read_to_end(&mut current).map_err(|e|e.to_string())?;
    if let Some(expected)=expected {if expected!=current{return Err("File changed on disk".into());}}
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let temporary=path.with_file_name(format!(".lineae-save-{}-{}",std::process::id(),stamp));
    let result=(||{
        let mut staged=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?;
        staged.write_all(bytes).and_then(|_|staged.sync_all()).map_err(|e|e.to_string())?;drop(staged);
        #[cfg(test)]
        if std::env::var_os("LINEAE_TEST_CRASH_AFTER_STAGE").is_some(){std::process::exit(92);}
        #[link(name="kernel32")]
        extern "system" {fn ReplaceFileW(replaced:*const u16,replacement:*const u16,backup:*const u16,flags:u32,exclude:*mut std::ffi::c_void,reserved:*mut std::ffi::c_void)->i32;}
        let target:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
        let source:Vec<u16>=temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe{ReplaceFileW(target.as_ptr(),source.as_ptr(),std::ptr::null(),0,std::ptr::null_mut(),std::ptr::null_mut())}==0{return Err(std::io::Error::last_os_error().to_string());}
        Ok(())
    })();
    // Only our uniquely named staging file is removed; a failed save retains target.
    if result.is_err(){let _=std::fs::remove_file(&temporary);}
    result
}

// All Lineae processes on this Windows desktop cooperate on the canonical path.
struct ProcessSaveLock(*mut std::ffi::c_void);
#[link(name="kernel32")]
extern "system" {
    fn CreateMutexW(attributes:*mut std::ffi::c_void,owner:i32,name:*const u16)->*mut std::ffi::c_void;
    fn WaitForSingleObject(handle:*mut std::ffi::c_void,milliseconds:u32)->u32;
    fn ReleaseMutex(handle:*mut std::ffi::c_void)->i32;
    fn CloseHandle(handle:*mut std::ffi::c_void)->i32;
}
impl ProcessSaveLock {
    fn acquire(path:&Path)->Result<Self,String>{
        let mut hash=0xcbf29ce484222325u64;
        for byte in path.to_string_lossy().to_lowercase().bytes(){hash^=byte as u64;hash=hash.wrapping_mul(0x100000001b3);}
        let name:Vec<u16>=format!("Local\\LineaeSave-{hash:016x}").encode_utf16().chain(Some(0)).collect();
        let handle=unsafe{CreateMutexW(std::ptr::null_mut(),0,name.as_ptr())};
        if handle.is_null(){return Err(std::io::Error::last_os_error().to_string());}
        let result=unsafe{WaitForSingleObject(handle,30000)};
        if result!=0 && result!=0x80 {unsafe{CloseHandle(handle);};return Err("Project save lock unavailable; retry later".into());}
        Ok(Self(handle))
    }
}
impl Drop for ProcessSaveLock {fn drop(&mut self){unsafe{ReleaseMutex(self.0);CloseHandle(self.0);}}}

#[cfg(test)]
fn operate(roots:&ProjectRoots,root:String,operation:String,path:Option<String>,target:Option<String>,bytes:Option<Vec<u8>>) -> Result<Reply,String> {
    operate_checked(roots,root,operation,path,target,bytes,None)
}
fn operate_checked(roots:&ProjectRoots,root:String,operation:String,path:Option<String>,target:Option<String>,bytes:Option<Vec<u8>>,expected:Option<Vec<u8>>) -> Result<Reply,String> {
    let root=PathBuf::from(root);
    if !roots.0.lock().map_err(|e|e.to_string())?.contains(&root){return Err("Project was not selected through a native dialog".into());}
    let mut reply=Reply::default();
    if operation=="list"{list(&root,&root,&mut reply.entries)?;return Ok(reply);}
    if operation=="load_state" {let state=root.join(".lineae-state.json");if state.exists(){reply.bytes=std::fs::read(state).map_err(|e|e.to_string())?;}return Ok(reply);}
    if operation=="checkpoint" {
        let state=root.join(".lineae-state.json");let bytes=bytes.ok_or("Missing checkpoint bytes")?;
        if !state.exists(){let file=std::fs::OpenOptions::new().write(true).create_new(true).open(&state).map_err(|e|e.to_string())?;drop(file);}
        safe_write(&state,&bytes,None)?;return Ok(reply);
    }
    let path=scoped(&root,&path.ok_or("Missing path")?)?;
    match operation.as_str(){
        "read"=>reply.bytes=std::fs::read(path).map_err(|e|e.to_string())?,
        "write"=>{let bytes=bytes.ok_or("Missing bytes")?;safe_write(&path,&bytes,expected.as_deref())?;},
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
    #[test]
    fn permission_and_exclusive_locks_preserve_original() {
        use std::os::windows::fs::OpenOptionsExt;
        let (roots,root)=fixture();let path=root.join("locked.tex");std::fs::write(&path,b"original").unwrap();
        let exclusive=std::fs::OpenOptions::new().read(true).write(true).share_mode(0).open(&path).unwrap();
        assert!(call(&roots,&root,"read","locked.tex",None,None).is_err());
        assert!(call(&roots,&root,"write","locked.tex",None,Some(b"wrong".to_vec())).is_err());
        assert!(call(&roots,&root,"move","locked.tex",Some("moved.tex"),None).is_err());
        drop(exclusive);assert_eq!(std::fs::read(&path).unwrap(),b"original");
        let mut permissions=std::fs::metadata(&path).unwrap().permissions();permissions.set_readonly(true);std::fs::set_permissions(&path,permissions).unwrap();
        let result=safe_write(&path,b"wrong",Some(b"original"));
        let mut permissions=std::fs::metadata(&path).unwrap().permissions();permissions.set_readonly(false);std::fs::set_permissions(&path,permissions).unwrap();
        assert!(result.is_err());assert_eq!(std::fs::read(&path).unwrap(),b"original");
    }
    #[test]
    fn competing_expected_writes_and_external_changes() {
        let (_,root)=fixture();let path=root.join("race.tex");std::fs::write(&path,b"old").unwrap();
        let barrier=std::sync::Arc::new(std::sync::Barrier::new(2));
        let mut threads=Vec::new();
        for bytes in [b"one",b"two"] {let path=path.clone();let barrier=barrier.clone();threads.push(std::thread::spawn(move||{barrier.wait();safe_write(&path,bytes,Some(b"old"))}));}
        let passed=threads.into_iter().map(|thread|thread.join().unwrap().is_ok()).filter(|ok|*ok).count();
        assert_eq!(passed,1);
        assert!(safe_write(&path,b"stale",Some(b"old")).is_err());
        let actual=std::fs::read(path).unwrap();assert!(actual==b"one" || actual==b"two");
    }
    #[test]
    fn crash_writer_child() {
        if let Some(path)=std::env::var_os("LINEAE_TEST_COMPETING_PATH") {
            let result=safe_write(Path::new(&path),std::env::var("LINEAE_TEST_CONTENT").unwrap().as_bytes(),Some(b"original"));
            std::process::exit(if result.is_ok(){0}else{23});
        }
        if let Some(path)=std::env::var_os("LINEAE_TEST_CRASH_PATH") {let _=safe_write(Path::new(&path),b"replacement",Some(b"original"));panic!("Crash hook did not exit");}
    }
    #[test]
    fn separate_processes_do_not_overwrite_the_same_baseline() {
        let (_,root)=fixture();let path=root.join("process-race.tex");std::fs::write(&path,b"original").unwrap();
        let spawn=|value:&str|std::process::Command::new(std::env::current_exe().unwrap()).args(["--exact","project::tests::crash_writer_child","--nocapture"])
            .env("LINEAE_TEST_COMPETING_PATH",&path).env("LINEAE_TEST_CONTENT",value).spawn().unwrap();
        let mut one=spawn("process one");let mut two=spawn("process two");
        let mut codes=vec![one.wait().unwrap().code().unwrap(),two.wait().unwrap().code().unwrap()];codes.sort();
        assert_eq!(codes,vec![0,23]);let actual=std::fs::read(path).unwrap();assert!(actual==b"process one" || actual==b"process two");
    }
    #[test]
    fn terminated_writer_leaves_original_and_can_save_after_restart() {
        let (_,root)=fixture();let path=root.join("crash.tex");std::fs::write(&path,b"original").unwrap();
        let status=std::process::Command::new(std::env::current_exe().unwrap()).args(["--exact","project::tests::crash_writer_child","--nocapture"])
            .env("LINEAE_TEST_CRASH_PATH",&path).env("LINEAE_TEST_CRASH_AFTER_STAGE","1").status().unwrap();
        assert_eq!(status.code(),Some(92));assert_eq!(std::fs::read(&path).unwrap(),b"original");
        safe_write(&path,b"after restart",Some(b"original")).unwrap();
        assert_eq!(std::fs::read(path).unwrap(),b"after restart");
    }
    #[test]
    fn windows_acl_denial_preserves_disk() {
        let (_,root)=fixture();let path=root.join("acl.tex");std::fs::write(&path,b"original").unwrap();
        let identity=std::process::Command::new("whoami").output().unwrap();assert!(identity.status.success());
        let user=String::from_utf8(identity.stdout).unwrap().trim().to_string();
        let deny=std::process::Command::new("icacls").arg(&path).args(["/deny",&format!("{}:(W,D)",user)]).output().unwrap();
        assert!(deny.status.success(),"ACL setup failed: {:?}",deny);
        let result=safe_write(&path,b"wrong",Some(b"original"));
        let restore=std::process::Command::new("icacls").arg(&path).args(["/remove:d",&user]).output().unwrap();
        assert!(restore.status.success(),"ACL restore failed: {:?}",restore);
        assert!(result.is_err());assert_eq!(std::fs::read(path).unwrap(),b"original");
    }
}
