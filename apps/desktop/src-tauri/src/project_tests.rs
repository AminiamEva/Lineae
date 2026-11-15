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
fn directory_removal_requires_an_exact_manifest() {
    let (roots, root) = fixture();
    let source = root.join("trash");
    std::fs::create_dir(&source).unwrap();
    std::fs::create_dir(source.join("empty")).unwrap();
    std::fs::write(source.join("child.tex"), b"original").unwrap();
    assert!(call(&roots, &root, "remove", "trash", None, None).is_err());
    let stale = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
    std::fs::write(source.join("child.tex"), b"external").unwrap();
    assert!(call(&roots, &root, "remove", "trash", None, Some(stale)).is_err());
    assert!(source.exists());
    let current = serde_json::to_vec(&move_snapshot(&root, &source).unwrap()).unwrap();
    call(&roots, &root, "remove", "trash", None, Some(current)).unwrap();
    assert!(!source.exists());
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
