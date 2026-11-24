use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "windows")]
mod project;
#[cfg(target_os = "macos")]
#[path = "project_macos.rs"]
mod project;
#[cfg(target_os = "windows")]
mod project_checkpoints;
mod tex_session;

/// Paths the user has explicitly chosen in a native dialog during this session.
/// Write commands only accept paths from this set, so the webview cannot touch
/// arbitrary files on disk.
#[derive(Default)]
struct AllowedFiles(Mutex<HashSet<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedFile {
    path: String,
    name: String,
    contents: String,
}

fn normalize(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path.canonicalize().map_err(|error| error.to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "The selected file has no parent directory".to_string())?;
    let name = path
        .file_name()
        .ok_or_else(|| "The selected file has no name".to_string())?;
    Ok(parent
        .canonicalize()
        .map_err(|error| error.to_string())?
        .join(name))
}

async fn pick_file(
    app: &AppHandle,
    filters: &[(&str, &[&str])],
) -> Result<Option<PathBuf>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file();
    for (name, extensions) in filters {
        dialog = dialog.add_filter(*name, *extensions);
    }
    dialog.pick_file(move |path| {
        let _ = sender.send(path);
    });
    receiver
        .await
        .map_err(|error| error.to_string())?
        .map(|file| file.into_path().map_err(|error| error.to_string()))
        .transpose()
}

async fn pick_save(
    app: &AppHandle,
    suggested_name: &str,
    filters: &[(&str, &[&str])],
) -> Result<Option<PathBuf>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file().set_file_name(suggested_name);
    for (name, extensions) in filters {
        dialog = dialog.add_filter(*name, *extensions);
    }
    dialog.save_file(move |path| {
        let _ = sender.send(path);
    });
    receiver
        .await
        .map_err(|error| error.to_string())?
        .map(|file| file.into_path().map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command]
async fn open_tex(
    app: AppHandle,
    allowed: State<'_, AllowedFiles>,
) -> Result<Option<OpenedFile>, String> {
    const TEX_FILTER: (&str, &[&str]) = ("LaTeX", &["tex"]);
    let Some(selected) = pick_file(&app, &[TEX_FILTER]).await? else {
        return Ok(None);
    };
    let path = normalize(&selected)?;
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    let contents = String::from_utf8(bytes)
        .map_err(|_| "The selected file is not UTF-8 text".to_string())?;
    allowed
        .0
        .lock()
        .map_err(|_| "The file scope is unavailable".to_string())?
        .insert(path.clone());
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.tex")
        .to_string();
    Ok(Some(OpenedFile {
        path: path.to_string_lossy().into_owned(),
        name,
        contents,
    }))
}

#[tauri::command]
async fn pick_save_tex(
    app: AppHandle,
    allowed: State<'_, AllowedFiles>,
    suggested_name: Option<String>,
) -> Result<Option<String>, String> {
    const TEX_FILTER: (&str, &[&str]) = ("LaTeX", &["tex"]);
    let name = suggested_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "lineae.tex".to_string());
    let Some(selected) = pick_save(&app, &name, &[TEX_FILTER]).await? else {
        return Ok(None);
    };
    let path = normalize(&selected)?;
    allowed
        .0
        .lock()
        .map_err(|_| "The file scope is unavailable".to_string())?
        .insert(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn write_tex(
    allowed: State<'_, AllowedFiles>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let target = normalize(Path::new(&path))?;
    let permitted = allowed
        .0
        .lock()
        .map_err(|_| "The file scope is unavailable".to_string())?
        .contains(&target);
    if !permitted {
        return Err("The file was not selected through a native dialog".to_string());
    }
    std::fs::write(&target, contents.as_bytes()).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_bytes(
    app: AppHandle,
    suggested_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let name = if suggested_name.trim().is_empty() {
        "lineae.bin".to_string()
    } else {
        suggested_name
    };
    let extension = Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin")
        .to_string();
    let Some(selected) = pick_save(&app, &name, &[]).await? else {
        return Ok(None);
    };
    let mut path = normalize(&selected)?;
    if path.extension().is_none() {
        path.set_extension(&extension);
    }
    std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AllowedFiles::default())
        .manage(tex_session::NativeTexSessions::default());
    #[cfg(any(target_os = "windows",target_os = "macos"))]
    let builder = builder
        .manage(project::ProjectRoots::default())
        .invoke_handler(tauri::generate_handler![
            open_tex,
            pick_save_tex,
            write_tex,
            save_bytes,
            tex_session::native_tex_open,
            tex_session::native_tex_update,
            tex_session::native_tex_poll,
            tex_session::native_tex_font,
            tex_session::native_tex_export,
            tex_session::native_tex_render_pdf,
            tex_session::native_tex_close,
            project::open_project,
            project::project_operation
        ]);
    #[cfg(not(any(target_os = "windows",target_os = "macos")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        open_tex,
        pick_save_tex,
        write_tex,
        save_bytes,
        tex_session::native_tex_open,
        tex_session::native_tex_update,
        tex_session::native_tex_poll,
        tex_session::native_tex_font,
        tex_session::native_tex_export,
        tex_session::native_tex_render_pdf,
        tex_session::native_tex_close
    ]);
    builder
        .on_window_event(|window,event| {
            if matches!(event,tauri::WindowEvent::Destroyed) {
                window.state::<tex_session::NativeTexSessions>().close_all();
            }
        })
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Lineae")
                .inner_size(1280.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .center()
                // WebView2 drops ctrl+wheel and trackpad pinch gestures unless
                // zoom control is enabled, so the page would never receive the
                // wheel events that drive the document zoom.
                .zoom_hotkeys_enabled(true)
                .initialization_script(if cfg!(any(target_os = "windows",target_os = "macos")) {
                    include_str!("bridge.js")
                } else {
                    concat!(
                        "window.__LINEAE_DESKTOP_NATIVE_PROJECTS__ = false;\n",
                        include_str!("bridge.js")
                    )
                });
            let window = if std::env::args_os().any(|arg| arg == "--lineae-smoke-test") {
                window
                    .initialization_script(format!("window.__LINEAE_SMOKE_UNAUTHORIZED_PATH__={};",
                        serde_json::to_string(&std::env::temp_dir().join("lineae-smoke-not-authorized.tex").to_string_lossy()).unwrap()))
                    .initialization_script(include_str!("macos-smoke.js"))
                    .on_document_title_changed(|window, title| {
                        if let Some(result) = title.strip_prefix("Lineae smoke: ") {
                            eprintln!("Lineae smoke: {result}");
                            window.app_handle().exit(if result == "ok" { 0 } else { 1 });
                        }
                    })
            } else {
                window
            };
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Lineae");
}
