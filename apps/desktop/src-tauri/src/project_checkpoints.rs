use serde_json::{json, Value};
use std::path::Path;

fn session(value: Option<&str>) -> Result<&str, String> {
    let value = value.ok_or("Missing checkpoint session")?;
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("Invalid checkpoint session".into());
    }
    Ok(value)
}
pub fn operate(
    root: &Path,
    operation: &str,
    id: Option<&str>,
    bytes: Option<Vec<u8>>,
    expected: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    let _guard = super::project::ProcessSaveLock::acquire(root)?;
    let preference_path = root.join(".lineae-engine.json");
    let preference = match std::fs::symlink_metadata(&preference_path) {
        Ok(meta) if meta.is_file() && !meta.is_symlink() => {
            let raw = std::fs::read(&preference_path).map_err(|e| e.to_string())?;
            serde_json::from_slice::<Value>(&raw).map_err(|e| e.to_string())?
        }
        Ok(_) => return Err("Invalid engine preference file".into()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Value::Null,
        Err(err) => return Err(err.to_string()),
    };
    if operation == "load_state" {
        let mut versions = Vec::new();
        let mut latest = None;
        for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name != ".lineae-state.json"
                && !(name.starts_with(".lineae-state-") && name.ends_with(".json"))
            {
                continue;
            }
            if entry.file_type().map_err(|e| e.to_string())?.is_symlink() {
                return Err("Linked checkpoint rejected".into());
            }
            let raw = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            let state: Value = serde_json::from_slice(&raw)
                .map_err(|e| format!("Checkpoint {name} retained: {e}"))?;
            if !state["files"].is_object() || !state["drafts"].is_array() {
                return Err(format!("Invalid checkpoint {name}; retained"));
            }
            let modified = entry
                .metadata()
                .map_err(|e| e.to_string())?
                .modified()
                .map_err(|e| e.to_string())?;
            if latest.as_ref().map_or(true, |(time, _)| modified > *time) {
                latest = Some((modified, state.clone()));
            }
            if !state["drafts"].as_array().unwrap().is_empty() {
                let id = if name == ".lineae-state.json" {
                    "legacy".to_string()
                } else {
                    name.trim_start_matches(".lineae-state-")
                        .trim_end_matches(".json")
                        .to_string()
                };
                versions.push(json!({"id":id,"drafts":state["drafts"],"expected":raw}));
            }
        }
        let mut state = latest
            .map(|(_, state)| state)
            .unwrap_or(json!({"files":{},"main":null}));
        if !preference.is_null() {
            state["engineChoice"] = preference["engineChoice"].clone();
            state["engineRevision"] = preference["engineRevision"].clone();
        }
        state["drafts"] = json!([]);
        state["recoveryVersions"] = json!(versions);
        return serde_json::to_vec(&state).map_err(|e| e.to_string());
    }
    let id = session(id)?;
    let path = if id == "legacy" {
        root.join(".lineae-state.json")
    } else {
        root.join(format!(".lineae-state-{id}.json"))
    };
    if operation == "ack_checkpoint" {
        let expected = expected.ok_or("Missing checkpoint version")?;
        if std::fs::read(&path).map_err(|e| e.to_string())? != expected {
            return Err("Checkpoint changed; the newer version was retained".into());
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        return std::fs::rename(
            path,
            root.join(format!(".lineae-archive-{id}-{stamp}.json")),
        )
        .map(|_| Vec::new())
        .map_err(|e| e.to_string());
    }
    let bytes = bytes.ok_or("Missing checkpoint bytes")?;
    let state: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if !state["files"].is_object() || !state["drafts"].is_array() {
        return Err("Invalid checkpoint payload".into());
    }
    if state["engineRevision"].as_u64().unwrap_or(0) > preference["engineRevision"].as_u64().unwrap_or(0) {
        if !matches!(state["engineChoice"].as_str(), Some("auto" | "xelatex" | "lualatex")) {
            return Err("Invalid engine choice".into());
        }
        let data = serde_json::to_vec(&json!({"engineChoice":state["engineChoice"],"engineRevision":state["engineRevision"]})).map_err(|e| e.to_string())?;
        write_state(root, &preference_path, "preference", &data)?;
    }
    write_state(root, &path, id, &bytes)?;
    Ok(Vec::new())
}

fn write_state(root: &Path, path: &Path, id: &str, bytes: &[u8]) -> Result<(), String> {
    if !path.exists() {
        use std::io::Write;
        let temporary = root.join(format!(".lineae-save-initial-{id}"));
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        std::fs::rename(temporary, path).map_err(|e| e.to_string())?;
    } else {
        super::project::safe_write(&path, &bytes, None)?;
    }
    Ok(())
}
