//! macOS project capabilities. Wire this file as `project`, not as a second
//! project module. All ambient access ends at the native folder selection.
//!
//! macOS has no rename-by-verified-file-handle or mandatory Windows sharing
//! locks. `flock` serializes Lineae processes, not unrelated editors. Saves use
//! RENAME_SWAP and retain the displaced inode; a late external change therefore
//! produces an explicit conflict with a recovery location, never lost bytes.
//! Removal is an archival rename, never recursive unlink. Recovery material is
//! deliberately not garbage-collected: deleting it safely needs a separate,
//! user-confirmed retention policy.
use cap_std::fs::Dir;
use rustix::fs::{self, FlockOperation, Mode, OFlags, RenameFlags};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct ProjectRoots(Mutex<HashMap<PathBuf, Dir>>);

#[derive(Debug, Serialize)]
pub struct Entry {
    path: String,
    kind: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    entries: Vec<Entry>,
    bytes: Vec<u8>,
    reconciliation_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct MoveEntry {
    path: String,
    kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bytes: Option<Vec<u8>>,
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn reserved_metadata(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name == ".lineae" || name.starts_with(".lineae-")
}

fn valid_component(name: &str) -> bool {
    if name.is_empty()
        || name == "."
        || name == ".."
        || reserved_metadata(name)
        || name.ends_with(['.', ' '])
        || name.chars().any(|ch| ch < ' ' || "\\:<>\"|?*/".contains(ch))
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

fn validate(path: &str) -> Result<(), String> {
    if path.split('/').all(valid_component) {
        Ok(())
    } else {
        Err("Invalid relative path".into())
    }
}

// Every rustix pathname below is exactly one checked component. NOFOLLOW is
// applied at every traversal step, not a racy canonicalize/starts_with check.
fn child_dir(parent: &Dir, name: &str) -> Result<Dir, String> {
    fs::openat(
        parent,
        name,
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )
    .map(Dir::from)
    .map_err(error)
}

fn parent(root: &Dir, path: &str) -> Result<(Dir, String), String> {
    validate(path)?;
    let mut components = path.split('/').collect::<Vec<_>>();
    let name = components.pop().ok_or("Missing filename")?.to_owned();
    let mut directory = root.try_clone().map_err(error)?;
    for component in components {
        directory = child_dir(&directory, component)?;
    }
    Ok((directory, name))
}

fn read_file(directory: &Dir, name: &str) -> Result<(File, Vec<u8>), String> {
    let fd = fs::openat(
        directory,
        name,
        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
        Mode::empty(),
    )
    .map_err(error)?;
    let mut file = File::from(fd);
    if !file.metadata().map_err(error)?.is_file() {
        return Err("Not a regular project file".into());
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(error)?;
    Ok((file, bytes))
}

fn create_file(directory: &Dir, name: &str, bytes: &[u8]) -> Result<File, String> {
    let fd = fs::openat(
        directory,
        name,
        OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::RUSR | Mode::WUSR,
    )
    .map_err(error)?;
    let mut file = File::from(fd);
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(error)?;
    Ok(file)
}

fn nonce() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

struct ProjectLock<'a>(&'a Dir);
impl<'a> ProjectLock<'a> {
    fn acquire(directory: &'a Dir) -> Result<Self, String> {
        fs::flock(directory, FlockOperation::NonBlockingLockExclusive)
            .map_err(|e| format!("Project is busy; retry later: {e}"))?;
        Ok(Self(directory))
    }
}
impl Drop for ProjectLock<'_> {
    fn drop(&mut self) {
        let _ = fs::flock(self.0, FlockOperation::Unlock);
    }
}

fn list(directory: &Dir, prefix: &str, entries: &mut Vec<Entry>) -> Result<(), String> {
    for item in directory.entries().map_err(error)? {
        let item = item.map_err(error)?;
        let name = item.file_name().into_string().map_err(|_| "Non-UTF-8 project path")?;
        if reserved_metadata(&name) {
            continue;
        }
        if !valid_component(&name) {
            return Err(format!("Unsupported project filename: {name}"));
        }
        let kind = item.file_type().map_err(error)?;
        if kind.is_symlink() {
            continue;
        }
        let path = format!("{prefix}{name}");
        if kind.is_dir() {
            let child = child_dir(directory, &name)?;
            entries.push(Entry { path: path.clone(), kind: "directory".into() });
            list(&child, &(path + "/"), entries)?;
        } else if kind.is_file() {
            entries.push(Entry { path, kind: "file".into() });
        } else {
            return Err(format!("Unsupported project entry: {path}"));
        }
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(())
}

fn snapshot(directory: &Dir, name: &str, relative: &str) -> Result<Vec<MoveEntry>, String> {
    fn visit(
        directory: &Dir,
        name: &str,
        relative: &str,
        result: &mut Vec<MoveEntry>,
    ) -> Result<(), String> {
        let metadata = directory.symlink_metadata(name).map_err(error)?;
        if metadata.is_dir() {
            let child = child_dir(directory, name)?;
            result.push(MoveEntry { path: relative.into(), kind: "directory".into(), bytes: None });
            for entry in child.entries().map_err(error)? {
                let name = entry.map_err(error)?.file_name().into_string()
                    .map_err(|_| "Non-UTF-8 project path")?;
                if !valid_component(&name) {
                    return Err("Directory contains a reserved or unsupported path; mutation refused".into());
                }
                visit(&child, &name, &format!("{relative}/{name}"), result)?;
            }
        } else {
            // NOFOLLOW also rejects a symlink substituted after metadata().
            let (_, bytes) = read_file(directory, name)?;
            result.push(MoveEntry { path: relative.into(), kind: "file".into(), bytes: Some(bytes) });
        }
        Ok(())
    }
    let mut result = Vec::new();
    visit(directory, name, relative, &mut result)?;
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

fn baseline(
    directory: &Dir,
    name: &str,
    path: &str,
    manifest: Option<&[u8]>,
    expected: Option<&[u8]>,
) -> Result<Vec<MoveEntry>, String> {
    let actual = snapshot(directory, name, path)?;
    let mut requested = if actual.first().is_some_and(|entry| entry.kind == "directory") {
        serde_json::from_slice::<Vec<MoveEntry>>(manifest.ok_or("Directory mutation requires a manifest")?)
            .map_err(|e| format!("Invalid directory manifest: {e}"))?
    } else {
        if manifest.is_some() {
            return Err("Directory changed on disk; mutation refused".into());
        }
        vec![MoveEntry {
            path: path.into(),
            kind: "file".into(),
            bytes: Some(expected.ok_or("File mutation requires expected bytes")?.to_vec()),
        }]
    };
    requested.sort_by(|a, b| a.path.cmp(&b.path));
    if actual != requested {
        return Err("File or directory changed on disk; mutation refused".into());
    }
    Ok(requested)
}

// Persist intent before mutation. Retain both this manifest and the displaced
// object indefinitely; neither a crash nor a late external writer can make us
// unlink somebody else's replacement as part of temporary-file cleanup.
fn journal(root: &Dir, id: &str, value: Value) -> Result<(), String> {
    create_file(root, &format!(".lineae-journal-{id}.json"), &serde_json::to_vec(&value).map_err(error)?)?;
    fs::fsync(root).map_err(error)
}

fn write(
    root: &Dir,
    directory: &Dir,
    name: &str,
    path: &str,
    bytes: &[u8],
    expected: &[u8],
) -> Result<(), String> {
    let (original, current) = read_file(directory, name)?;
    if current != expected {
        return Err("File changed on disk".into());
    }
    let metadata = original.metadata().map_err(error)?;
    if metadata.permissions().readonly() {
        return Err("File is read-only".into());
    }
    // Replacing a directory entry can otherwise bypass a file-level write ACL.
    // Check write access without truncating or writing the original inode.
    let writable = File::from(fs::openat(
        directory, name,
        OFlags::RDWR | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
        Mode::empty(),
    ).map_err(error)?);
    {
        use std::os::unix::fs::MetadataExt;
        let writable = writable.metadata().map_err(error)?;
        if writable.dev() != metadata.dev() || writable.ino() != metadata.ino() {
            return Err("File changed before save".into());
        }
    }
    let id = nonce();
    let backup = format!(".lineae-save-{id}");
    // Keep recovery objects at the project root, not inside editable subtrees:
    // otherwise our own metadata would make future subtree manifests inexact.
    let staged = create_file(root, &backup, bytes)?;
    staged.set_permissions(metadata.permissions()).map_err(error)?;
    staged.sync_all().map_err(error)?;
    journal(root, &id, json!({
        "operation":"write", "path":path, "backup":backup,
        "note":"Before commit backup contains proposed bytes; after commit it contains displaced bytes"
    }))?;
    fs::fsync(directory).map_err(error)?;
    fs::renameat_with(root, &backup, directory, name, RenameFlags::EXCHANGE).map_err(error)?;
    // Do not attempt rollback: another editor may already have replaced target.
    // Returning an error keeps the frontend's old baseline/draft intact.
    let checked = (|| {
        let (displaced, actual) = read_file(root, &backup)?;
        use std::os::unix::fs::MetadataExt;
        let displaced = displaced.metadata().map_err(error)?;
        if displaced.dev() != metadata.dev() || displaced.ino() != metadata.ino() || actual != expected {
            return Err("File changed during atomic save".to_string());
        }
        let (published, actual) = read_file(directory, name)?;
        let published = published.metadata().map_err(error)?;
        let staged = staged.metadata().map_err(error)?;
        if published.dev() != staged.dev() || published.ino() != staged.ino() || actual != bytes {
            return Err("File changed immediately after atomic save".into());
        }
        fs::fsync(root).and_then(|_| fs::fsync(directory)).map_err(error)
    })();
    checked.map_err(|e| format!(
        "Save committed but requires review: {e}; displaced entry retained at project root as {backup}. Reload {path} before saving again"
    ))
}

fn remove(
    root: &Dir,
    directory: &Dir,
    name: &str,
    path: &str,
    manifest: Option<&[u8]>,
    expected: Option<&[u8]>,
) -> Result<(), String> {
    let requested = baseline(directory, name, path, manifest, expected)?;
    let id = nonce();
    let archive = format!(".lineae-trash-{id}");
    journal(root, &id, json!({"operation":"remove","path":path,"backup":archive}))?;
    fs::renameat_with(directory, name, root, &archive, RenameFlags::NOREPLACE).map_err(error)?;
    if snapshot(root, &archive, path).as_ref().ok() != Some(&requested) {
        // Restoration is also exclusive: never clobber an external replacement.
        let restored = fs::renameat_with(root, &archive, directory, name, RenameFlags::NOREPLACE).is_ok();
        return Err(if restored {
            "Entry changed during removal; restored without deleting bytes".into()
        } else {
            format!("Entry changed during removal; retained at project root as {archive}; refresh {path} before continuing")
        });
    }
    fs::fsync(root).and_then(|_| fs::fsync(directory))
        .map_err(|e| format!("Removal archived at {archive}, but directory sync failed: {e}"))
}

fn move_entry(
    source: &Dir,
    name: &str,
    destination: &Dir,
    target_name: &str,
    path: &str,
    target: &str,
    manifest: Option<&[u8]>,
    expected: Option<&[u8]>,
) -> Result<Reply, String> {
    if target == path || target.starts_with(&(path.to_owned() + "/")) {
        return Err("Target exists or is inside source".into());
    }
    let requested = baseline(source, name, path, manifest, expected)?;
    fs::renameat_with(source, name, destination, target_name, RenameFlags::NOREPLACE).map_err(error)?;
    let mut reply = Reply {
        reconciliation_required: requested[0].kind == "directory",
        ..Default::default()
    };
    match snapshot(destination, target_name, path) {
        Ok(actual) => {
            if actual != requested {
                reply.reconciliation_required = true;
                reply.warning = Some("Move committed, but external changes were detected; refresh before saving".into());
            }
            reply.entries = actual.into_iter().map(|entry| Entry {
                path: target.to_owned() + &entry.path[path.len()..],
                kind: entry.kind,
            }).collect();
        }
        Err(e) => {
            reply.reconciliation_required = true;
            reply.warning = Some(format!("Move committed; reconciliation failed: {e}"));
        }
    }
    if let Err(e) = fs::fsync(source).and_then(|_| fs::fsync(destination)) {
        reply.reconciliation_required = true;
        reply.warning = Some(format!("Move committed; directory sync failed: {e}; refresh before saving"));
    }
    Ok(reply)
}

fn session(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 80 || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
        Err("Invalid checkpoint session".into())
    } else {
        Ok(())
    }
}

struct Checkpoint {
    id: String,
    revision: u64,
    raw: Vec<u8>,
    state: Value,
    modified: std::time::SystemTime,
}

fn checkpoint_state(raw: &[u8]) -> Result<Value, String> {
    let state: Value = serde_json::from_slice(raw).map_err(error)?;
    if !state["files"].is_object() || !state["drafts"].is_array() {
        return Err("Invalid checkpoint payload; retained".into());
    }
    Ok(state)
}

// Immutable revisions avoid both overwrite races and acknowledgement races.
// Older revisions are retained but never resurrected after a newer clean state.
// Existing Windows/legacy state files are imported read-only as revision zero.
fn checkpoints(root: &Dir) -> Result<(HashMap<String, Checkpoint>, u64), String> {
    let mut names: HashMap<String, (String, u64)> = HashMap::new();
    let mut maximum = 0;
    for entry in root.entries().map_err(error)? {
        let name = entry.map_err(error)?.file_name().into_string()
            .map_err(|_| "Non-UTF-8 project path")?;
        let (id, revision) = if let Some(tail) = name.strip_prefix(".lineae-macos-state-").and_then(|s| s.strip_suffix(".json")) {
            let (id, revision) = tail.rsplit_once('-').ok_or("Invalid checkpoint filename; retained")?;
            session(id)?;
            (id.to_owned(), revision.parse::<u64>().map_err(error)?)
        } else if name == ".lineae-state.json" {
            ("legacy".into(), 0)
        } else if let Some(id) = name.strip_prefix(".lineae-state-").and_then(|s| s.strip_suffix(".json")) {
            session(id)?;
            (id.to_owned(), 0)
        } else {
            continue;
        };
        maximum = maximum.max(revision);
        if names.get(&id).map_or(true, |(_, old)| revision > *old) {
            names.insert(id, (name, revision));
        }
    }
    // Do not deserialize every historical draft on every keystroke. Only the
    // newest committed revision of each session participates in recovery.
    let mut latest = HashMap::new();
    for (id, (name, revision)) in names {
        let (file, raw) = read_file(root, &name)
            .map_err(|e| format!("Checkpoint {name} retained: {e}"))?;
        let state = checkpoint_state(&raw)?;
        let checkpoint = Checkpoint {
            id: id.clone(), revision, raw, state,
            modified: file.metadata().map_err(error)?.modified().map_err(error)?,
        };
        latest.insert(id, checkpoint);
    }
    Ok((latest, maximum))
}

fn publish_checkpoint(root: &Dir, id: &str, revision: u64, raw: &[u8]) -> Result<(), String> {
    let stage = format!(".lineae-checkpoint-stage-{}", nonce());
    create_file(root, &stage, raw)?;
    fs::fsync(root).map_err(error)?;
    let target = format!(".lineae-macos-state-{id}-{revision}.json");
    fs::renameat_with(root, &stage, root, &target, RenameFlags::NOREPLACE).map_err(error)?;
    fs::fsync(root).map_err(error)
}

fn checkpoint_operation(
    root: &Dir,
    operation: &str,
    id: Option<&str>,
    bytes: Option<Vec<u8>>,
    expected: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    let (latest, revision) = checkpoints(root)?;
    if operation == "load_state" {
        let mut versions = latest.values().collect::<Vec<_>>();
        versions.sort_by(|a, b| a.id.cmp(&b.id));
        let mut state = versions.iter().max_by_key(|v| (v.modified, v.revision))
            .map(|v| v.state.clone()).unwrap_or(json!({"files":{},"main":null}));
        state["drafts"] = json!([]);
        state["recoveryVersions"] = json!(versions.iter()
            .filter(|v| !v.state["drafts"].as_array().unwrap().is_empty())
            .map(|v| json!({"id":v.id,"drafts":v.state["drafts"],"expected":v.raw}))
            .collect::<Vec<_>>());
        return serde_json::to_vec(&state).map_err(error);
    }
    let id = id.ok_or("Missing checkpoint session")?;
    session(id)?;
    let raw = if operation == "ack_checkpoint" {
        let old = latest.get(id).ok_or("Checkpoint not found; retained")?;
        if Some(&old.raw) != expected.as_ref() {
            return Err("Checkpoint changed; the newer version was retained".into());
        }
        let mut state = old.state.clone();
        state["drafts"] = json!([]);
        serde_json::to_vec(&state).map_err(error)?
    } else {
        let raw = bytes.ok_or("Missing checkpoint bytes")?;
        checkpoint_state(&raw)?;
        raw
    };
    publish_checkpoint(root, id, revision.checked_add(1).ok_or("Checkpoint revision exhausted")?, &raw)?;
    Ok(Vec::new())
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
    let Some(folder) = receiver.await.map_err(error)? else { return Ok(None); };
    let path = folder.into_path().map_err(error)?.canonicalize().map_err(error)?;
    let key = path.to_str().ok_or("Non-UTF-8 project root")?.to_owned();
    // The canonical string is an IPC lookup key only; never reopen it later.
    let directory = Dir::open_ambient_dir(&path, cap_std::ambient_authority()).map_err(error)?;
    roots.0.lock().map_err(error)?.entry(path).or_insert(directory);
    Ok(Some(key))
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

fn operate_checked(
    roots: &ProjectRoots,
    root: String,
    operation: String,
    path: Option<String>,
    target: Option<String>,
    bytes: Option<Vec<u8>>,
    expected: Option<Vec<u8>>,
) -> Result<Reply, String> {
    let roots = roots.0.lock().map_err(error)?;
    let root = roots.get(Path::new(&root)).ok_or("Project was not selected through a native dialog")?;
    let _guard = ProjectLock::acquire(root)?;
    let mut reply = Reply::default();
    if ["load_state", "checkpoint", "ack_checkpoint"].contains(&operation.as_str()) {
        reply.bytes = checkpoint_operation(root, &operation, target.as_deref(), bytes, expected)?;
        return Ok(reply);
    }
    if operation == "list" {
        list(root, "", &mut reply.entries)?;
        return Ok(reply);
    }
    let path = path.ok_or("Missing path")?;
    let (directory, name) = parent(root, &path)?;
    match operation.as_str() {
        "read" => reply.bytes = read_file(&directory, &name)?.1,
        "write" => write(
            root, &directory, &name, &path,
            &bytes.ok_or("Missing bytes")?,
            expected.as_deref().ok_or("Save requires expected bytes")?,
        )?,
        "create" => {
            create_file(&directory, &name, &bytes.ok_or("Missing bytes")?)?;
            fs::fsync(&directory).map_err(error)?;
        }
        "mkdir" => {
            directory.create_dir(&name).map_err(error)?;
            fs::fsync(&directory).map_err(error)?;
        }
        "remove" => remove(root, &directory, &name, &path, bytes.as_deref(), expected.as_deref())?,
        "move" => {
            let target = target.ok_or("Missing target")?;
            let (destination, target_name) = parent(root, &target)?;
            return move_entry(
                &directory, &name, &destination, &target_name, &path, &target,
                bytes.as_deref(), expected.as_deref(),
            );
        }
        _ => return Err("Unknown project operation".into()),
    }
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (ProjectRoots, PathBuf) {
        let path = std::env::temp_dir().join(format!("lineae-macos-原生 {}", nonce()));
        std::fs::create_dir(&path).unwrap();
        let path = path.canonicalize().unwrap();
        let roots = ProjectRoots::default();
        roots.0.lock().unwrap().insert(
            path.clone(), Dir::open_ambient_dir(&path, cap_std::ambient_authority()).unwrap(),
        );
        (roots, path)
    }

    fn call(
        roots: &ProjectRoots, root: &Path, operation: &str, path: Option<&str>,
        target: Option<&str>, bytes: Option<&[u8]>, expected: Option<&[u8]>,
    ) -> Result<Reply, String> {
        operate_checked(
            roots, root.to_str().unwrap().into(), operation.into(),
            path.map(str::to_owned), target.map(str::to_owned),
            bytes.map(<[u8]>::to_vec), expected.map(<[u8]>::to_vec),
        )
    }

    #[test]
    fn rejects_unscoped_roots_paths_and_metadata() {
        let (roots, root) = fixture();
        for path in ["", "../x", "/tmp/x", "a//b", "a/./b", "a\\b", "a:b", ".LINEAE-state.json",
            ".lineae/x", "x/.lineae-save-a", "CON.tex", "a.", "a ", "bad?.tex", "a\0b"] {
            assert!(call(&roots, &root, "read", Some(path), None, None, None).is_err(), "{path}");
        }
        assert!(call(&ProjectRoots::default(), &root, "list", None, None, None, None).is_err());
        assert!(validate("章节 空格/正文.tex").is_ok());
    }

    #[test]
    fn binary_roundtrip_stale_writes_and_create_new() {
        let (roots, root) = fixture();
        let original = b"\xef\xbb\xbfTeX\r\n\0\xff";
        call(&roots, &root, "create", Some("main.tex"), None, Some(original), None).unwrap();
        assert!(call(&roots, &root, "create", Some("main.tex"), None, Some(b"clobber"), None).is_err());
        assert!(call(&roots, &root, "write", Some("main.tex"), None, Some(b"new"), Some(b"stale")).is_err());
        assert_eq!(std::fs::read(root.join("main.tex")).unwrap(), original);
        call(&roots, &root, "write", Some("main.tex"), None, Some(b"new"), Some(original)).unwrap();
        assert_eq!(call(&roots, &root, "read", Some("main.tex"), None, None, None).unwrap().bytes, b"new");
        let listing = call(&roots, &root, "list", None, None, None, None).unwrap();
        assert_eq!(listing.entries.len(), 1);
        assert!(std::fs::read_dir(&root).unwrap().any(|e| {
            let e = e.unwrap();
            e.file_name().to_string_lossy().starts_with(".lineae-save-")
                && std::fs::read(e.path()).unwrap() == original
        }));
    }

    #[test]
    fn outside_and_metadata_symlinks_are_never_followed() {
        use std::os::unix::fs::symlink;
        let (roots, root) = fixture();
        let (_, outside) = fixture();
        std::fs::write(outside.join("secret.tex"), b"outside").unwrap();
        symlink(&outside, root.join("linked")).unwrap();
        symlink(outside.join("secret.tex"), root.join("secret.tex")).unwrap();
        std::fs::write(root.join(".lineae-state-private.json"), b"private").unwrap();
        symlink(".lineae-state-private.json", root.join("alias.tex")).unwrap();
        for path in ["linked/secret.tex", "secret.tex", "alias.tex"] {
            for op in ["read", "write", "remove", "move"] {
                assert!(call(&roots, &root, op, Some(path), Some("moved.tex"), Some(b"x"), Some(b"outside")).is_err());
            }
        }
        assert!(call(&roots, &root, "create", Some("linked/new.tex"), None, Some(b"x"), None).is_err());
        assert!(call(&roots, &root, "list", None, None, None, None).unwrap().entries.is_empty());
        assert_eq!(std::fs::read(outside.join("secret.tex")).unwrap(), b"outside");
        assert!(!outside.join("new.tex").exists());
    }

    #[test]
    fn remove_and_move_require_exact_baselines_and_never_overwrite() {
        let (roots, root) = fixture();
        std::fs::create_dir(root.join("source")).unwrap();
        std::fs::write(root.join("source/a.tex"), b"old").unwrap();
        std::fs::write(root.join("occupied.tex"), b"unrelated").unwrap();
        call(&roots, &root, "write", Some("source/a.tex"), None, Some(b"saved"), Some(b"old")).unwrap();
        assert_eq!(std::fs::read_dir(root.join("source")).unwrap().count(), 1);
        assert!(call(&roots, &root, "move", Some("source/a.tex"), Some("occupied.tex"), None, Some(b"saved")).is_err());
        assert!(call(&roots, &root, "remove", Some("source/a.tex"), None, None, Some(b"stale")).is_err());
        let dir = Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap();
        let manifest = serde_json::to_vec(&snapshot(&dir, "source", "source").unwrap()).unwrap();
        std::fs::write(root.join("source/late.tex"), b"unrelated").unwrap();
        assert!(call(&roots, &root, "remove", Some("source"), None, Some(&manifest), None).is_err());
        assert!(call(&roots, &root, "move", Some("source"), Some("destination"), Some(&manifest), None).is_err());
        assert!(root.join("source/late.tex").exists());
        let manifest = serde_json::to_vec(&snapshot(&dir, "source", "source").unwrap()).unwrap();
        let reply = call(&roots, &root, "move", Some("source"), Some("destination"), Some(&manifest), None).unwrap();
        assert!(reply.reconciliation_required);
        assert_eq!(std::fs::read(root.join("occupied.tex")).unwrap(), b"unrelated");
        let manifest = serde_json::to_vec(&snapshot(&dir, "destination", "destination").unwrap()).unwrap();
        call(&roots, &root, "remove", Some("destination"), None, Some(&manifest), None).unwrap();
        assert!(!root.join("destination").exists());
        let archived = std::fs::read_dir(&root).unwrap().map(Result::unwrap)
            .find(|e| e.file_name().to_string_lossy().starts_with(".lineae-trash-")).unwrap();
        assert_eq!(std::fs::read(archived.path().join("late.tex")).unwrap(), b"unrelated");
    }

    #[test]
    fn journal_restart_preserves_versions_rejects_stale_ack_and_never_resurrects() {
        let (roots, root) = fixture();
        let dirty = br#"{"files":{"main.tex":"id"},"main":"main.tex","drafts":[{"path":"main.tex","saved":"base","draft":"draft\r\n"}]}"#;
        let clean = br#"{"files":{},"drafts":[]}"#;
        for id in ["one", "two"] {
            call(&roots, &root, "checkpoint", None, Some(id), Some(dirty), None).unwrap();
        }
        // Simulate an interrupted checkpoint publication: immutable committed
        // revisions, not a partial staging file, determine recovery.
        std::fs::write(root.join(".lineae-checkpoint-stage-crash"), b"{partial").unwrap();
        let load = || {
            serde_json::from_slice::<Value>(&call(&roots, &root, "load_state", None, None, None, None).unwrap().bytes).unwrap()
        };
        assert_eq!(load()["recoveryVersions"].as_array().unwrap().len(), 2);
        call(&roots, &root, "checkpoint", None, Some("one"), Some(clean), None).unwrap();
        assert!(call(&roots, &root, "ack_checkpoint", None, Some("one"), None, Some(dirty)).is_err());
        call(&roots, &root, "ack_checkpoint", None, Some("two"), None, Some(dirty)).unwrap();
        assert!(load()["recoveryVersions"].as_array().unwrap().is_empty());
        drop(roots);
        let reopened = ProjectRoots::default();
        reopened.0.lock().unwrap().insert(root.clone(), Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap());
        let state: Value = serde_json::from_slice(&call(&reopened, &root, "load_state", None, None, None, None).unwrap().bytes).unwrap();
        assert!(state["recoveryVersions"].as_array().unwrap().is_empty());
    }

    #[test]
    fn legacy_recovery_is_imported_without_following_linked_checkpoints() {
        let (roots, root) = fixture();
        let raw = br#"{"files":{},"drafts":[{"path":"main.tex","saved":"a","draft":"b"}]}"#;
        std::fs::write(root.join(".lineae-state.json"), raw).unwrap();
        let loaded: Value = serde_json::from_slice(
            &call(&roots, &root, "load_state", None, None, None, None).unwrap().bytes,
        ).unwrap();
        assert_eq!(loaded["recoveryVersions"][0]["id"], "legacy");
        call(&roots, &root, "ack_checkpoint", None, Some("legacy"), None, Some(raw)).unwrap();
        // Original journal bytes are archived by retention, not destroyed.
        assert_eq!(std::fs::read(root.join(".lineae-state.json")).unwrap(), raw);
        let loaded: Value = serde_json::from_slice(
            &call(&roots, &root, "load_state", None, None, None, None).unwrap().bytes,
        ).unwrap();
        assert!(loaded["recoveryVersions"].as_array().unwrap().is_empty());
        let (_, outside) = fixture();
        std::fs::write(outside.join("private.json"), raw).unwrap();
        std::os::unix::fs::symlink(
            outside.join("private.json"), root.join(".lineae-state-linked.json"),
        ).unwrap();
        assert!(call(&roots, &root, "load_state", None, None, None, None).is_err());
        assert_eq!(std::fs::read(outside.join("private.json")).unwrap(), raw);
    }
}
