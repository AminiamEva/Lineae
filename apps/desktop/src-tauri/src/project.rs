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
        "remove" => mutate_entry(&path, None, expected.as_deref())?,
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
mod tests {
    use super::*;
    fn fixture() -> (ProjectRoots, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("lineae-原生 验收-{}-{}", std::process::id(), stamp));
        std::fs::create_dir(&directory).unwrap();
        let root = directory.canonicalize().unwrap();
        let roots = ProjectRoots::default();
        roots.0.lock().unwrap().insert(root.clone());
        (roots, root)
    }
    fn call(
        roots: &ProjectRoots,
        root: &Path,
        op: &str,
        path: &str,
        target: Option<&str>,
        bytes: Option<Vec<u8>>,
    ) -> Result<Reply, String> {
        operate(
            roots,
            root.to_string_lossy().into_owned(),
            op.into(),
            Some(path.into()),
            target.map(str::to_string),
            bytes,
        )
    }
    #[test]
    fn native_disk_lifecycle_unicode_binary_and_moves() {
        let (roots, root) = fixture();
        let original = "\u{feff}中文\r\nLF\nCR\r".as_bytes().to_vec();
        call(&roots, &root, "mkdir", "章节", None, None).unwrap();
        call(
            &roots,
            &root,
            "create",
            "章节/a.tex",
            None,
            Some(original.clone()),
        )
        .unwrap();
        call(
            &roots,
            &root,
            "move",
            "章节/a.tex",
            Some("章节/b.tex"),
            None,
        )
        .unwrap();
        let manifest =
            serde_json::to_vec(&move_snapshot(&root, &root.join("章节")).unwrap()).unwrap();
        call(
            &roots,
            &root,
            "move",
            "章节",
            Some("目录 空格"),
            Some(manifest),
        )
        .unwrap();
        assert_eq!(
            call(&roots, &root, "read", "目录 空格/b.tex", None, None)
                .unwrap()
                .bytes,
            original
        );
        assert!(!root.join("章节/a.tex").exists());
        call(
            &roots,
            &root,
            "write",
            "目录 空格/b.tex",
            None,
            Some(vec![0, 255, 13, 10]),
        )
        .unwrap();
        assert_eq!(
            std::fs::read(root.join("目录 空格/b.tex")).unwrap(),
            vec![0, 255, 13, 10]
        );
        let listing = call(&roots, &root, "list", "", None, None).unwrap();
        assert!(listing
            .entries
            .iter()
            .any(|entry| entry.path == "目录 空格/b.tex"));
        call(&roots, &root, "remove", "目录 空格/b.tex", None, None).unwrap();
        assert!(!root.join("目录 空格/b.tex").exists());
    }
    #[test]
    fn directory_move_rejects_stale_bytes_membership_and_missing_manifest() {
        let (roots, root) = fixture();
        let source = root.join("source");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(source.join("empty")).unwrap();
        std::fs::write(source.join("child.tex"), b"original").unwrap();
        let manifest = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
        assert!(call(&roots, &root, "move", "source", Some("target"), None).is_err());
        std::fs::write(source.join("child.tex"), b"external revision").unwrap();
        let result = call(
            &roots,
            &root,
            "move",
            "source",
            Some("target"),
            Some(manifest.clone()),
        );
        assert!(result.unwrap_err().contains("changed on disk"));
        assert_eq!(
            std::fs::read(source.join("child.tex")).unwrap(),
            b"external revision"
        );
        std::fs::write(source.join("child.tex"), b"original").unwrap();
        std::fs::write(source.join("new.tex"), b"new external file").unwrap();
        assert!(call(
            &roots,
            &root,
            "move",
            "source",
            Some("target"),
            Some(manifest.clone())
        )
        .is_err());
        std::fs::remove_file(source.join("new.tex")).unwrap();
        std::fs::remove_dir(source.join("empty")).unwrap();
        assert!(call(
            &roots,
            &root,
            "move",
            "source",
            Some("target"),
            Some(manifest)
        )
        .is_err());
        assert!(source.exists());
        assert!(!root.join("target").exists());
    }
    #[test]
    fn directory_manifest_cannot_move_a_file_replacing_the_source_directory() {
        let (roots, root) = fixture();
        let source = root.join("source");
        std::fs::create_dir(&source).unwrap();
        let manifest = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
        std::fs::rename(&source, root.join("original-directory")).unwrap();
        std::fs::write(&source, b"external replacement file").unwrap();
        let result = call(
            &roots,
            &root,
            "move",
            "source",
            Some("target"),
            Some(manifest),
        );
        assert!(result.unwrap_err().contains("changed on disk"));
        assert_eq!(
            std::fs::read(&source).unwrap(),
            b"external replacement file"
        );
        assert!(!root.join("target").exists());
    }
    #[test]
    fn directory_move_reports_committed_late_changes_without_rollback_or_overwrite() {
        for mutation in ["write", "add", "delete"] {
            let (_roots, root) = fixture();
            let source = root.join("source");
            let target = root.join("target");
            std::fs::create_dir(&source).unwrap();
            std::fs::write(source.join("child.tex"), b"original").unwrap();
            let manifest = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
            let reply = move_directory(&root, &source, &target, &manifest, || {
                match mutation {
                    "write" => {
                        std::fs::write(source.join("child.tex"), b"external revision").unwrap()
                    }
                    "add" => std::fs::write(source.join("new.tex"), b"new external file").unwrap(),
                    _ => std::fs::remove_file(source.join("child.tex")).unwrap(),
                }
                // The root is pinned to the same handle while descendants are checked.
                assert!(std::fs::rename(&source, root.join("hijacked")).is_err());
            })
            .unwrap();
            assert!(reply.reconciliation_required);
            assert!(reply.warning.unwrap().contains("external changes"));
            assert!(!source.exists());
            assert!(target.is_dir());
            match mutation {
                "write" => assert_eq!(
                    std::fs::read(target.join("child.tex")).unwrap(),
                    b"external revision"
                ),
                "add" => assert_eq!(
                    std::fs::read(target.join("new.tex")).unwrap(),
                    b"new external file"
                ),
                _ => assert!(!target.join("child.tex").exists()),
            }
        }
    }
    #[test]
    fn directory_move_reports_committed_snapshot_failure_and_rejects_hidden_entries() {
        let (roots, root) = fixture();
        let source = root.join("source");
        let target = root.join("target");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("child.tex"), b"original").unwrap();
        let manifest = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
        // A new reserved entry was absent from the validated model. No rollback
        // is attempted once the root rename succeeds, and all bytes survive.
        let reply = move_directory(&root, &source, &target, &manifest, || {
            std::fs::write(source.join(".lineae-unknown"), b"do not delete").unwrap();
        })
        .unwrap();
        assert!(reply.reconciliation_required);
        assert!(reply.warning.unwrap().contains("reconciliation failed"));
        assert_eq!(
            std::fs::read(target.join(".lineae-unknown")).unwrap(),
            b"do not delete"
        );
        assert!(call(
            &roots,
            &root,
            "move",
            "target",
            Some("another"),
            Some(manifest)
        )
        .is_err());
        assert!(target.exists());
    }
    #[test]
    fn directory_manifest_rejects_duplicate_outside_and_incomplete_entries() {
        let (roots, root) = fixture();
        std::fs::create_dir(root.join("source")).unwrap();
        for manifest in [
            r#"[]"#,
            r#"[{"path":"source","kind":"directory"},{"path":"source","kind":"directory"}]"#,
            r#"[{"path":"source","kind":"directory"},{"path":"elsewhere","kind":"file","bytes":[]}]"#,
            r#"[{"path":"source","kind":"directory","bytes":[]}]"#,
        ] {
            assert!(call(
                &roots,
                &root,
                "move",
                "source",
                Some("target"),
                Some(manifest.as_bytes().to_vec())
            )
            .is_err());
        }
        assert!(root.join("source").exists());
        assert!(!root.join("target").exists());
    }
    #[test]
    fn directory_move_pins_destination_parent_during_validation() {
        let (_, root) = fixture();
        let source = root.join("source");
        let parent = root.join("destination");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(&parent).unwrap();
        std::fs::write(source.join("child.tex"), b"original").unwrap();
        let manifest = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
        let reply = move_directory(&root, &source, &parent.join("moved"), &manifest, || {
            assert!(std::fs::rename(&parent, root.join("replaced-parent")).is_err());
            assert!(std::fs::rename(&root, root.with_extension("replaced-root")).is_err());
        })
        .unwrap();
        assert!(reply.warning.is_none());
        assert!(!root.join("replaced-parent").exists());
        assert_eq!(
            std::fs::read(parent.join("moved/child.tex")).unwrap(),
            b"original"
        );
    }
    #[test]
    fn stale_move_paths_reject_junction_replacement_without_touching_outside_files() {
        fn junction(link: &Path, target: &Path) {
            let output = std::process::Command::new("cmd.exe")
                .args(["/c", "mklink", "/J"])
                .arg(link)
                .arg(target)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "junction creation failed: {:?}",
                output
            );
        }
        let (_, root) = fixture();
        let (_, outside) = fixture();
        let source = root.join("source");
        let parent = root.join("destination");
        std::fs::create_dir(&source).unwrap();
        std::fs::create_dir(&parent).unwrap();
        std::fs::write(source.join("child.tex"), b"original").unwrap();
        let manifest = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
        // Simulate a destination changed after scoped() but before opening it.
        std::fs::rename(&parent, root.join("old-destination")).unwrap();
        junction(&parent, &outside);
        assert!(move_directory(&root, &source, &parent.join("moved"), &manifest, || {}).is_err());
        assert!(source.exists());
        assert!(!outside.join("moved").exists());
        // Simulate a source ancestor switched to a junction after scoped(). The
        // final file handle path must match the previously scoped canonical path.
        std::fs::write(outside.join("child.tex"), b"outside").unwrap();
        std::fs::rename(&source, root.join("old-source")).unwrap();
        junction(&source, &outside);
        assert!(mutate_entry(
            &source.join("child.tex"),
            Some(&root.join("stolen.tex")),
            Some(b"outside")
        )
        .is_err());
        assert_eq!(
            std::fs::read(outside.join("child.tex")).unwrap(),
            b"outside"
        );
        assert!(!root.join("stolen.tex").exists());
    }
    #[test]
    fn scope_conflicts_and_invalid_payload_preserve_disk() {
        let (roots, root) = fixture();
        call(
            &roots,
            &root,
            "create",
            "a.tex",
            None,
            Some(b"original".to_vec()),
        )
        .unwrap();
        call(
            &roots,
            &root,
            "create",
            "b.tex",
            None,
            Some(b"target".to_vec()),
        )
        .unwrap();
        assert!(call(&roots, &root, "move", "a.tex", Some("b.tex"), None).is_err());
        assert!(call(&roots, &root, "write", "a.tex", None, None).is_err());
        assert_eq!(std::fs::read(root.join("a.tex")).unwrap(), b"original");
        for path in [
            "../outside",
            "/absolute",
            "C:/absolute",
            "",
            "a/../../outside",
        ] {
            assert!(call(&roots, &root, "read", path, None, None).is_err());
        }
        assert!(call(&ProjectRoots::default(), &root, "list", "", None, None).is_err());
        call(&roots, &root, "mkdir", "folder", None, None).unwrap();
        assert!(call(&roots, &root, "move", "folder", Some("folder/inside"), None).is_err());
        assert!(call(&roots, &root, "read", "missing.tex", None, None).is_err());
    }
    #[test]
    fn metadata_case_aliases_and_invalid_windows_names_are_rejected() {
        let (roots, root) = fixture();
        std::fs::write(root.join(".lineae-state-one.json"), b"private checkpoint").unwrap();
        std::fs::write(root.join(".LINEAE-state-two.json"), b"private checkpoint").unwrap();
        assert!(call(&roots, &root, "read", ".LINEAE-state-one.json", None, None).is_err());
        let listing = call(&roots, &root, "list", "", None, None).unwrap();
        assert!(
            listing.entries.is_empty(),
            "Recovery metadata must never enter the file tree"
        );
        for path in [
            "NUL.tex",
            "con",
            "trailing.",
            "trailing ",
            "a//b.tex",
            "a/",
            "bad?.tex",
        ] {
            assert!(
                scoped(&root, path).is_err(),
                "Invalid path was accepted: {path}"
            );
        }
    }
    #[test]
    fn native_remove_rechecks_the_editor_baseline() {
        let (roots, root) = fixture();
        std::fs::write(root.join("a.tex"), b"external edit").unwrap();
        let result = operate_checked(
            &roots,
            root.to_string_lossy().into_owned(),
            "remove".into(),
            Some("a.tex".into()),
            None,
            None,
            Some(b"old editor baseline".to_vec()),
        );
        assert!(
            result.is_err(),
            "Deletion must reject changes after frontend preflight"
        );
        assert_eq!(std::fs::read(root.join("a.tex")).unwrap(), b"external edit");
    }
    #[test]
    fn native_move_rechecks_the_editor_baseline() {
        let (roots, root) = fixture();
        std::fs::write(root.join("a.tex"), b"external edit").unwrap();
        let result = operate_checked(
            &roots,
            root.to_string_lossy().into_owned(),
            "move".into(),
            Some("a.tex".into()),
            Some("b.tex".into()),
            None,
            Some(b"old editor baseline".to_vec()),
        );
        assert!(
            result.is_err(),
            "Move must reject changes after frontend preflight"
        );
        assert_eq!(std::fs::read(root.join("a.tex")).unwrap(), b"external edit");
        assert!(!root.join("b.tex").exists());
    }
    #[test]
    fn concurrent_moves_never_replace_a_new_destination() {
        let (_, root) = fixture();
        std::fs::write(root.join("one.tex"), b"one").unwrap();
        std::fs::write(root.join("two.tex"), b"two").unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let mut threads = Vec::new();
        for (name, expected) in [("one.tex", b"one"), ("two.tex", b"two")] {
            let source = root.join(name);
            let target = root.join("destination.tex");
            let barrier = barrier.clone();
            threads.push(std::thread::spawn(move || {
                // Both callers observed an absent destination before beginning.
                assert!(!target.exists());
                barrier.wait();
                mutate_entry(&source, Some(&target), Some(expected))
            }));
        }
        let succeeded = threads
            .into_iter()
            .filter_map(|thread| thread.join().unwrap().ok())
            .count();
        assert_eq!(succeeded, 1);
        let destination = std::fs::read(root.join("destination.tex")).unwrap();
        if destination == b"one" {
            assert_eq!(std::fs::read(root.join("two.tex")).unwrap(), b"two");
        } else {
            assert_eq!(destination, b"two");
            assert_eq!(std::fs::read(root.join("one.tex")).unwrap(), b"one");
        }
    }
    #[test]
    fn permission_and_exclusive_locks_preserve_original() {
        use std::os::windows::fs::OpenOptionsExt;
        let (roots, root) = fixture();
        let path = root.join("locked.tex");
        std::fs::write(&path, b"original").unwrap();
        let exclusive = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(call(&roots, &root, "read", "locked.tex", None, None).is_err());
        assert!(call(
            &roots,
            &root,
            "write",
            "locked.tex",
            None,
            Some(b"wrong".to_vec())
        )
        .is_err());
        assert!(call(&roots, &root, "move", "locked.tex", Some("moved.tex"), None).is_err());
        drop(exclusive);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions).unwrap();
        let result = safe_write(&path, b"wrong", Some(b"original"));
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(false);
        std::fs::set_permissions(&path, permissions).unwrap();
        assert!(result.is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
    }
    #[test]
    fn competing_expected_writes_and_external_changes() {
        let (_, root) = fixture();
        let path = root.join("race.tex");
        std::fs::write(&path, b"old").unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let mut threads = Vec::new();
        for bytes in [b"one", b"two"] {
            let path = path.clone();
            let barrier = barrier.clone();
            threads.push(std::thread::spawn(move || {
                barrier.wait();
                safe_write(&path, bytes, Some(b"old"))
            }));
        }
        let passed = threads
            .into_iter()
            .map(|thread| thread.join().unwrap().is_ok())
            .filter(|ok| *ok)
            .count();
        assert_eq!(passed, 1);
        assert!(safe_write(&path, b"stale", Some(b"old")).is_err());
        let actual = std::fs::read(path).unwrap();
        assert!(actual == b"one" || actual == b"two");
    }
    #[test]
    fn crash_writer_child() {
        if let Some(root) = std::env::var_os("LINEAE_TEST_MOVING_PROJECT") {
            let root = PathBuf::from(root);
            // Prove this process sees the parent's existing named mutex rather
            // than relying on a timing assumption about whether a write started.
            let handle = ProcessSaveLock::open(&root).unwrap();
            assert_eq!(unsafe { WaitForSingleObject(handle, 0) }, 258);
            unsafe {
                CloseHandle(handle);
            }
            std::fs::write(root.join("child-ready"), b"root lock observed").unwrap();
            let roots = ProjectRoots::default();
            roots.0.lock().unwrap().insert(root.clone());
            let result = operate_checked(
                &roots,
                root.to_string_lossy().into_owned(),
                "write".into(),
                Some("source/child.tex".into()),
                None,
                Some(b"child update".to_vec()),
                Some(b"original".to_vec()),
            );
            std::process::exit(if result.is_ok() { 0 } else { 23 });
        }
        if let Some(root) = std::env::var_os("LINEAE_TEST_CHECKPOINT_ROOT") {
            let id = std::env::var("LINEAE_TEST_CHECKPOINT_SESSION").unwrap();
            for revision in 0..10 {
                let bytes=serde_json::to_vec(&serde_json::json!({"files":{},"drafts":[{"path":"main.tex","saved":"base","draft":format!("{id}-{revision}")}]})).unwrap();
                super::super::project_checkpoints::operate(
                    Path::new(&root),
                    "checkpoint",
                    Some(&id),
                    Some(bytes),
                    None,
                )
                .unwrap();
            }
            return;
        }
        if let Some(path) = std::env::var_os("LINEAE_TEST_COMPETING_PATH") {
            let result = safe_write(
                Path::new(&path),
                std::env::var("LINEAE_TEST_CONTENT").unwrap().as_bytes(),
                Some(b"original"),
            );
            std::process::exit(if result.is_ok() { 0 } else { 23 });
        }
        if let Some(path) = std::env::var_os("LINEAE_TEST_CRASH_PATH") {
            let _ = safe_write(Path::new(&path), b"replacement", Some(b"original"));
            panic!("Crash hook did not exit");
        }
    }
    #[test]
    fn independent_process_checkpoints_survive_saves_and_stale_acknowledgement() {
        let (_, root) = fixture();
        let spawn = |id: &str| {
            std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "project::tests::crash_writer_child"])
                .env("LINEAE_TEST_CHECKPOINT_ROOT", &root)
                .env("LINEAE_TEST_CHECKPOINT_SESSION", id)
                .spawn()
                .unwrap()
        };
        let mut one = spawn("instance-one");
        let mut two = spawn("instance-two");
        assert!(one.wait().unwrap().success());
        assert!(two.wait().unwrap().success());
        let read = || {
            serde_json::from_slice::<serde_json::Value>(
                &super::super::project_checkpoints::operate(&root, "load_state", None, None, None)
                    .unwrap(),
            )
            .unwrap()
        };
        let state = read();
        let versions = state["recoveryVersions"].as_array().unwrap();
        assert_eq!(versions.len(), 2);
        let old = std::fs::read(root.join(".lineae-state-instance-one.json")).unwrap();
        let clean = serde_json::to_vec(&serde_json::json!({"files":{},"drafts":[]})).unwrap();
        super::super::project_checkpoints::operate(
            &root,
            "checkpoint",
            Some("instance-one"),
            Some(clean),
            None,
        )
        .unwrap();
        assert!(super::super::project_checkpoints::operate(
            &root,
            "ack_checkpoint",
            Some("instance-one"),
            None,
            Some(old)
        )
        .is_err());
        let state = read();
        let versions = state["recoveryVersions"].as_array().unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0]["id"], "instance-two");
        let bytes = std::fs::read(root.join(".lineae-state-instance-two.json")).unwrap();
        super::super::project_checkpoints::operate(
            &root,
            "ack_checkpoint",
            Some("instance-two"),
            None,
            Some(bytes),
        )
        .unwrap();
        assert!(read()["recoveryVersions"].as_array().unwrap().is_empty());
        assert!(std::fs::read_dir(&root).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".lineae-archive-instance-two-")));
    }
    #[test]
    fn directory_move_serializes_another_process_saving_a_descendant() {
        let (roots, root) = fixture();
        std::fs::create_dir(root.join("source")).unwrap();
        std::fs::write(root.join("source/child.tex"), b"original").unwrap();
        let manifest =
            serde_json::to_vec(&move_snapshot(&root, &root.join("source")).unwrap()).unwrap();
        let guard = ProcessSaveLock::acquire(&root).unwrap();
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "project::tests::crash_writer_child"])
            .env("LINEAE_TEST_MOVING_PROJECT", &root)
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !root.join("child-ready").exists() {
            if child.try_wait().unwrap().is_some() || std::time::Instant::now() > deadline {
                let _ = child.kill();
                panic!("child did not observe project lock");
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let moved = call(
            &roots,
            &root,
            "move",
            "source",
            Some("target"),
            Some(manifest),
        )
        .unwrap();
        assert!(moved.warning.is_none());
        assert!(moved.reconciliation_required);
        drop(guard);
        assert_eq!(child.wait().unwrap().code(), Some(23));
        assert!(!root.join("source").exists());
        assert_eq!(
            std::fs::read(root.join("target/child.tex")).unwrap(),
            b"original"
        );
    }
    #[test]
    fn separate_processes_do_not_overwrite_the_same_baseline() {
        let (_, root) = fixture();
        let path = root.join("process-race.tex");
        std::fs::write(&path, b"original").unwrap();
        let spawn = |value: &str| {
            std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "project::tests::crash_writer_child",
                    "--nocapture",
                ])
                .env("LINEAE_TEST_COMPETING_PATH", &path)
                .env("LINEAE_TEST_CONTENT", value)
                .spawn()
                .unwrap()
        };
        let mut one = spawn("process one");
        let mut two = spawn("process two");
        let mut codes = vec![
            one.wait().unwrap().code().unwrap(),
            two.wait().unwrap().code().unwrap(),
        ];
        codes.sort();
        assert_eq!(codes, vec![0, 23]);
        let actual = std::fs::read(path).unwrap();
        assert!(actual == b"process one" || actual == b"process two");
    }
    #[test]
    fn terminated_writer_leaves_original_and_can_save_after_restart() {
        let (_, root) = fixture();
        let path = root.join("crash.tex");
        std::fs::write(&path, b"original").unwrap();
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "project::tests::crash_writer_child",
                "--nocapture",
            ])
            .env("LINEAE_TEST_CRASH_PATH", &path)
            .env("LINEAE_TEST_CRASH_AFTER_STAGE", "1")
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(92));
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        safe_write(&path, b"after restart", Some(b"original")).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"after restart");
    }
    #[test]
    fn windows_acl_denial_preserves_disk() {
        let (_, root) = fixture();
        let path = root.join("acl.tex");
        std::fs::write(&path, b"original").unwrap();
        let identity = std::process::Command::new("whoami").output().unwrap();
        assert!(identity.status.success());
        let user = String::from_utf8(identity.stdout)
            .unwrap()
            .trim()
            .to_string();
        let deny = std::process::Command::new("icacls")
            .arg(&path)
            .args(["/deny", &format!("{}:(W,D)", user)])
            .output()
            .unwrap();
        assert!(deny.status.success(), "ACL setup failed: {:?}", deny);
        let result = safe_write(&path, b"wrong", Some(b"original"));
        let restore = std::process::Command::new("icacls")
            .arg(&path)
            .args(["/remove:d", &user])
            .output()
            .unwrap();
        assert!(
            restore.status.success(),
            "ACL restore failed: {:?}",
            restore
        );
        assert!(result.is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"original");
    }
}
