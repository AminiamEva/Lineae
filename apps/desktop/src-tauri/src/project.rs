use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ProjectRoots(pub Mutex<HashSet<PathBuf>>);
#[derive(Debug, Serialize)]
pub struct Entry {
    path: String,
    kind: String,
}
#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    entries: Vec<Entry>,
    bytes: Vec<u8>,
    reconciliation_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct MoveEntry {
    path: String,
    kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bytes: Option<Vec<u8>>,
}

fn reserved_metadata(name: &str) -> bool {
    name.to_ascii_lowercase().starts_with(".lineae-")
}

fn valid_component(name: &str) -> bool {
    if name.is_empty()
        || name == "."
        || name == ".."
        || reserved_metadata(name)
        || name.ends_with(['.', ' '])
        || name.chars().any(|ch| ch < ' ' || "<>\"|?*".contains(ch))
    {
        return false;
    }
    let stem = name.split('.').next().unwrap().to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str()) {
        return false;
    }
    !["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(prefix).is_some_and(|suffix| {
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].contains(&suffix)
        })
    })
}

fn scoped(root: &Path, path: &str) -> Result<PathBuf, String> {
    if path.contains('\\') || path.contains(':') || path.split('/').any(|p| !valid_component(p)) {
        return Err("Invalid relative path".into());
    }
    let relative = Path::new(path);
    if relative
        .components()
        .any(|p| !matches!(p, Component::Normal(_)))
    {
        return Err("Invalid relative path".into());
    }
    let target = root.join(relative);
    let resolved = if target.exists() {
        target.canonicalize()
    } else {
        target
            .parent()
            .ok_or("Missing parent")?
            .canonicalize()
            .map(|p| p.join(target.file_name().unwrap()))
    }
    .map_err(|e| e.to_string())?;
    if !resolved.starts_with(root) || resolved == root {
        return Err("Path escapes project".into());
    }
    Ok(resolved)
}
fn list(root: &Path, directory: &Path, entries: &mut Vec<Entry>) -> Result<(), String> {
    for item in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let path = item.path();
        if reserved_metadata(&item.file_name().to_string_lossy()) {
            continue;
        }
        if item.file_type().map_err(|e| e.to_string())?.is_symlink() {
            continue;
        }
        let canonical = path.canonicalize().map_err(|e| e.to_string())?;
        if canonical != path {
            continue;
        }
        if !canonical.starts_with(root) {
            return Err("Linked path escapes project".into());
        }
        let directory = canonical.is_dir();
        entries.push(Entry {
            path: path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/"),
            kind: if directory { "directory" } else { "file" }.into(),
        });
        if directory {
            list(root, &path, entries)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn open_project(
    app: AppHandle,
    window: tauri::Window,
    roots: State<'_, ProjectRoots>,
) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().set_parent(&window).pick_folder(move |folder| {
        let _ = sender.send(folder);
    });
    let Some(folder) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = folder
        .into_path()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    roots
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[tauri::command]
pub fn project_operation(
    roots: State<'_, ProjectRoots>,
    root: String,
    operation: String,
    path: Option<String>,
    target: Option<String>,
    bytes: Option<Vec<u8>>,
    expected: Option<Vec<u8>>,
) -> Result<Reply, String> {
    operate_checked(&roots, root, operation, path, target, bytes, expected)
}

// A sibling staging file is flushed before Windows atomically replaces the target.
// The open original denies other writers; delete-sharing is required by ReplaceFileW.
pub(super) fn safe_write(path: &Path, bytes: &[u8], expected: Option<&[u8]>) -> Result<(), String> {
    static WRITES: Mutex<()> = Mutex::new(());
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    let _process_guard = ProcessSaveLock::acquire(path)?;
    use std::io::{Read, Write};
    use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt};
    let mut original = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1 | 4)
        .open(path)
        .map_err(|e| e.to_string())?;
    let mut current = Vec::new();
    original
        .read_to_end(&mut current)
        .map_err(|e| e.to_string())?;
    if let Some(expected) = expected {
        if expected != current {
            return Err("File changed on disk".into());
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let temporary = path.with_file_name(format!(".lineae-save-{}-{}", std::process::id(), stamp));
    let result = (|| {
        let mut staged = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        staged
            .write_all(bytes)
            .and_then(|_| staged.sync_all())
            .map_err(|e| e.to_string())?;
        drop(staged);
        #[cfg(test)]
        if std::env::var_os("LINEAE_TEST_CRASH_AFTER_STAGE").is_some() {
            std::process::exit(92);
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn ReplaceFileW(
                replaced: *const u16,
                replacement: *const u16,
                backup: *const u16,
                flags: u32,
                exclude: *mut std::ffi::c_void,
                reserved: *mut std::ffi::c_void,
            ) -> i32;
        }
        let target: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let source: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe {
            ReplaceFileW(
                target.as_ptr(),
                source.as_ptr(),
                std::ptr::null(),
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    })();
    // Only our uniquely named staging file is removed; a failed save retains target.
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

// Validate and mutate the same open file identity. Denying write/delete sharing
// closes the frontend-preflight race; a pathname lookup after validation would
// allow an external editor to replace the file underneath the operation.
fn mutate_entry(path: &Path, target: Option<&Path>, expected: Option<&[u8]>) -> Result<(), String> {
    mutate_entry_checked(path, target, expected, || Ok(()))
}

fn verify_handle_path(file: &std::fs::File, expected: &Path) -> Result<(), String> {
    use std::os::windows::{ffi::OsStringExt, fs::MetadataExt, io::AsRawHandle};
    if file
        .metadata()
        .map_err(|e| e.to_string())?
        .file_attributes()
        & 0x400
        != 0
    {
        return Err("Linked path replaced a move endpoint; move refused".into());
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetFinalPathNameByHandleW(
            handle: *mut std::ffi::c_void,
            name: *mut u16,
            length: u32,
            flags: u32,
        ) -> u32;
    }
    let size =
        unsafe { GetFinalPathNameByHandleW(file.as_raw_handle(), std::ptr::null_mut(), 0, 0) };
    if size == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut name = vec![0u16; size as usize];
    let length =
        unsafe { GetFinalPathNameByHandleW(file.as_raw_handle(), name.as_mut_ptr(), size, 0) };
    if length == 0 || length >= size {
        return Err("Cannot verify move endpoint handle".into());
    }
    let actual = PathBuf::from(std::ffi::OsString::from_wide(&name[..length as usize]));
    if actual != expected {
        return Err("Move endpoint changed after path validation".into());
    }
    Ok(())
}

fn mutate_entry_checked(
    path: &Path,
    target: Option<&Path>,
    expected: Option<&[u8]>,
    before: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    use std::io::Read;
    use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt, io::AsRawHandle};
    let mut lock_paths = vec![path];
    if let Some(target) = target {
        lock_paths.push(target);
    }
    lock_paths.sort();
    let _locks: Vec<_> = lock_paths
        .into_iter()
        .map(ProcessSaveLock::acquire)
        .collect::<Result<_, _>>()?;
    // Pin the destination directory object, not just its earlier pathname.
    // GENERIC_READ plus deny-delete is required: READ_ATTRIBUTES-only handles
    // do not prevent a parent rename on Windows. Allow data writes so the
    // kernel can add our new child. Retain the handle through the final rename.
    let destination_parent = if let Some(target) = target {
        let parent = target.parent().ok_or("Missing target parent")?;
        let directory = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1 | 2)
            .custom_flags(0x0200_0000 | 0x0020_0000)
            .open(parent)
            .map_err(|e| e.to_string())?;
        verify_handle_path(&directory, parent)?;
        Some(directory)
    } else {
        None
    };
    let mut file = std::fs::OpenOptions::new()
        .access_mode(0x8000_0000 | 0x0001_0000) // GENERIC_READ | DELETE
        .share_mode(1) // FILE_SHARE_READ only
        .custom_flags(0x0200_0000 | 0x0020_0000) // BACKUP_SEMANTICS | OPEN_REPARSE_POINT
        .open(path)
        .map_err(|e| e.to_string())?;
    verify_handle_path(&file, path)?;
    if let Some(expected) = expected {
        let mut current = Vec::new();
        file.read_to_end(&mut current).map_err(|e| e.to_string())?;
        if current != expected {
            return Err("File changed on disk".into());
        }
    }
    // Keep this exact root identity open while validating the subtree. Replacing
    // or deleting the source directory cannot redirect our later rename.
    before()?;
    verify_handle_path(&file, path)?;
    if let (Some(target), Some(parent)) = (target, destination_parent.as_ref()) {
        verify_handle_path(parent, target.parent().unwrap())?;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn SetFileInformationByHandle(
            handle: *mut std::ffi::c_void,
            class: i32,
            info: *const std::ffi::c_void,
            length: u32,
        ) -> i32;
    }
    let success = if let Some(target) = target {
        // FILE_RENAME_INFO uses a variable-length UTF-16 name. The allocation is
        // word aligned and includes the full header and terminating code unit.
        #[repr(C)]
        struct RenameInfo {
            flags: u32,
            root: *mut std::ffi::c_void,
            length: u32,
            name: [u16; 1],
        }
        let name: Vec<u16> = target.as_os_str().encode_wide().collect();
        let offset = std::mem::offset_of!(RenameInfo, name);
        let size = offset + (name.len() + 1) * 2;
        let mut buffer = vec![0usize; size.div_ceil(std::mem::size_of::<usize>())];
        let info = buffer.as_mut_ptr().cast::<RenameInfo>();
        unsafe {
            // Zero flags means ReplaceIfExists = false: the kernel, rather than
            // an earlier exists() probe, rejects a concurrently created target.
            (*info).length = (name.len() * 2) as u32;
            std::ptr::copy_nonoverlapping(
                name.as_ptr(),
                buffer.as_mut_ptr().cast::<u8>().add(offset).cast::<u16>(),
                name.len(),
            );
            SetFileInformationByHandle(file.as_raw_handle(), 3, info.cast(), size as u32)
        }
    } else {
        if file.metadata().map_err(|e| e.to_string())?.is_dir() {
            return Err("Directory deletion is not supported".into());
        }
        let delete: u8 = 1; // FILE_DISPOSITION_INFO.DeleteFile
        unsafe {
            SetFileInformationByHandle(file.as_raw_handle(), 4, (&delete as *const u8).cast(), 1)
        }
    };
    if success == 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}

fn move_snapshot(root: &Path, directory: &Path) -> Result<Vec<MoveEntry>, String> {
    fn visit(root: &Path, path: &Path, result: &mut Vec<MoveEntry>) -> Result<(), String> {
        let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink()
            || path.canonicalize().map_err(|e| e.to_string())? != path
        {
            return Err("Directory contains a linked path; move refused".into());
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if relative.split('/').any(|part| !valid_component(part)) {
            return Err("Directory contains a reserved or unsupported path; move refused".into());
        }
        let directory = metadata.is_dir();
        result.push(MoveEntry {
            path: relative,
            kind: if directory { "directory" } else { "file" }.into(),
            bytes: if directory {
                None
            } else {
                Some(std::fs::read(path).map_err(|e| e.to_string())?)
            },
        });
        if directory {
            for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
                visit(root, &entry.map_err(|e| e.to_string())?.path(), result)?;
            }
        }
        Ok(())
    }
    let mut result = Vec::new();
    visit(root, directory, &mut result)?;
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

fn remove_directory(root: &Path, directory: &Path, manifest: &[u8]) -> Result<Reply, String> {
    let mut expected: Vec<MoveEntry> = serde_json::from_slice(manifest)
        .map_err(|e| format!("Invalid directory removal manifest: {e}"))?;
    expected.sort_by(|a, b| a.path.cmp(&b.path));
    let actual = move_snapshot(root, directory)?;
    if actual != expected {
        return Err("Directory changed on disk; removal refused".into());
    }
    std::fs::remove_dir_all(directory).map_err(|e| e.to_string())?;
    Ok(Reply::default())
}

fn move_directory(
    root: &Path,
    source: &Path,
    target: &Path,
    manifest: &[u8],
    after_validation: impl FnOnce(),
) -> Result<Reply, String> {
    let mut expected: Vec<MoveEntry> = serde_json::from_slice(manifest)
        .map_err(|e| format!("Invalid directory move manifest: {e}"))?;
    let source_relative = source
        .strip_prefix(root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let target_relative = target
        .strip_prefix(root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let mut names = HashSet::new();
    for entry in &expected {
        if !(entry.path == source_relative
            || entry.path.starts_with(&(source_relative.clone() + "/")))
            || !names.insert(entry.path.clone())
            || entry.path.split('/').any(|part| !valid_component(part))
            || !matches!(
                (entry.kind.as_str(), &entry.bytes),
                ("directory", None) | ("file", Some(_))
            )
        {
            return Err("Invalid directory move manifest entry".into());
        }
    }
    if !expected
        .iter()
        .any(|entry| entry.path == source_relative && entry.kind == "directory")
    {
        return Err("Directory move manifest must include the source directory".into());
    }
    expected.sort_by(|a, b| a.path.cmp(&b.path));
    mutate_entry_checked(source, Some(target), None, || {
        if move_snapshot(root, source)? != expected {
            return Err("Directory changed on disk; refresh before moving".into());
        }
        after_validation();
        Ok(())
    })?;
    // Windows refuses directory rename with open descendant handles. Thus this
    // is NOT an atomic subtree snapshot against unrelated external processes.
    // The root rename is committed: never roll it back or return an ordinary
    // failure that would leave the frontend using the old paths. Reconcile and
    // keep original editor baselines so late external changes cannot be saved over.
    for entry in &mut expected {
        entry.path = target_relative.clone() + &entry.path[source_relative.len()..];
    }
    expected.sort_by(|a, b| a.path.cmp(&b.path));
    let mut reply = Reply {
        reconciliation_required: true,
        ..Default::default()
    };
    match move_snapshot(root, target) {
        Ok(actual) => {
            if actual != expected {
                reply.warning=Some("Directory moved, but external changes were detected; refresh and review before saving".into());
            }
            reply.entries = actual
                .into_iter()
                .map(|entry| Entry {
                    path: entry.path,
                    kind: entry.kind,
                })
                .collect();
        }
        Err(error) => {
            reply.warning = Some(format!("Directory moved; reconciliation failed: {error}"))
        }
    }
    Ok(reply)
}

// All Lineae processes on this Windows desktop cooperate on the canonical path.
pub(super) struct ProcessSaveLock(*mut std::ffi::c_void);
#[link(name = "kernel32")]
extern "system" {
    fn CreateMutexW(
        attributes: *mut std::ffi::c_void,
        owner: i32,
        name: *const u16,
    ) -> *mut std::ffi::c_void;
    fn WaitForSingleObject(handle: *mut std::ffi::c_void, milliseconds: u32) -> u32;
    fn ReleaseMutex(handle: *mut std::ffi::c_void) -> i32;
    fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
}
impl ProcessSaveLock {
    fn open(path: &Path) -> Result<*mut std::ffi::c_void, String> {
        let mut hash = 0xcbf29ce484222325u64;
        for byte in path.to_string_lossy().to_lowercase().bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        let name: Vec<u16> = format!("Local\\LineaeSave-{hash:016x}")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(handle)
    }
    pub(super) fn acquire(path: &Path) -> Result<Self, String> {
        let handle = Self::open(path)?;
        let result = unsafe { WaitForSingleObject(handle, 30000) };
        if result != 0 && result != 0x80 {
            unsafe {
                CloseHandle(handle);
            };
            return Err("Project save lock unavailable; retry later".into());
        }
        Ok(Self(handle))
    }
}
impl Drop for ProcessSaveLock {
    fn drop(&mut self) {
        unsafe {
            ReleaseMutex(self.0);
            CloseHandle(self.0);
        }
    }
}

#[cfg(test)]
fn operate(
    roots: &ProjectRoots,
    root: String,
    operation: String,
    path: Option<String>,
    target: Option<String>,
    bytes: Option<Vec<u8>>,
) -> Result<Reply, String> {
    operate_checked(roots, root, operation, path, target, bytes, None)
}
fn operate_checked(
    roots: &ProjectRoots,
    root: String,
    operation: String,
    path: Option<String>,
    target: Option<String>,
    bytes: Option<Vec<u8>>,
    expected: Option<Vec<u8>>,
) -> Result<Reply, String> {
    let root = PathBuf::from(root);
    if !roots.0.lock().map_err(|e| e.to_string())?.contains(&root) {
        return Err("Project was not selected through a native dialog".into());
    }
    let mut reply = Reply::default();
    if ["load_state", "checkpoint", "ack_checkpoint"].contains(&operation.as_str()) {
        reply.bytes = super::project_checkpoints::operate(
            &root,
            &operation,
            target.as_deref(),
            bytes,
            expected,
        )?;
        return Ok(reply);
    }
    // Same canonical root key across Lineae processes. A directory mutation
    // cannot interleave with another Lineae create/read/write/remove operation.
    let _project_guard = ProcessSaveLock::acquire(&root)?;
    if operation == "list" {
        list(&root, &root, &mut reply.entries)?;
        return Ok(reply);
    }
    let path = scoped(&root, &path.ok_or("Missing path")?)?;
    match operation.as_str() {
        "read" => reply.bytes = std::fs::read(path).map_err(|e| e.to_string())?,
        "write" => {
            let bytes = bytes.ok_or("Missing bytes")?;
            safe_write(&path, &bytes, expected.as_deref())?;
        }
        "create" => {
            let bytes = bytes.ok_or("Missing bytes")?;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
                .map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
        }
        "mkdir" => std::fs::create_dir(path).map_err(|e| e.to_string())?,
        "remove" => {
            if path.is_dir() {
                return remove_directory(
                    &root,
                    &path,
                    bytes.as_deref().ok_or("Directory removal requires a manifest")?,
                );
            }
            mutate_entry(&path, None, expected.as_deref())?;
        }
        "move" => {
            let target = scoped(&root, &target.ok_or("Missing target")?)?;
            if target.exists() || target.starts_with(&path) {
                return Err("Target exists or is inside source".into());
            }
            if path.is_dir() || bytes.is_some() {
                return move_directory(
                    &root,
                    &path,
                    &target,
                    bytes
                        .as_deref()
                        .ok_or("Directory move requires a manifest")?,
                    || {},
                );
            }
            mutate_entry(&path, Some(&target), expected.as_deref())?;
        }
        _ => return Err("Unknown project operation".into()),
    }
    Ok(reply)
}

#[cfg(test)]
#[path = "project_tests.rs"]
mod tests;
