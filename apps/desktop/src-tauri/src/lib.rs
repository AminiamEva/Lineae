use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "windows")]
mod project;
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "project_unix.rs"]
mod project;
#[cfg(target_os = "windows")]
mod project_checkpoints;
#[cfg(target_os = "macos")]
mod desktop_menu;
#[cfg(desktop)]
mod window_layout;
mod tex_session;
#[cfg(all(debug_assertions, target_os = "windows"))]
mod hybrid_typing_check;

/// Paths the user has explicitly chosen in a native dialog during this session.
/// Write commands only accept paths from this set, so the webview cannot touch
/// arbitrary files on disk.
#[derive(Default)]
struct AllowedFiles(Mutex<HashSet<PathBuf>>);

#[derive(Default)]
struct FinderFiles(Mutex<VecDeque<PathBuf>>);

#[derive(Default)]
struct WindowLifecycle {
    allow_close: AtomicBool,
    stay_alive: AtomicBool,
}

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
    read_selected_tex(selected, &allowed).map(Some)
}

fn read_selected_tex(selected: PathBuf, allowed: &AllowedFiles) -> Result<OpenedFile, String> {
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
    Ok(OpenedFile {
        path: path.to_string_lossy().into_owned(),
        name,
        contents,
    })
}

#[tauri::command]
async fn take_finder_document(
    pending: State<'_, FinderFiles>,
    allowed: State<'_, AllowedFiles>,
) -> Result<Option<OpenedFile>, String> {
    let next = pending.0.lock().map_err(|error| error.to_string())?.pop_front();
    next.map(|selected| read_selected_tex(selected, &allowed)).transpose()
}

#[tauri::command]
fn set_document_title(window: WebviewWindow, filename: String, dirty: bool) -> Result<(), String> {
    let name: String = filename.chars().filter(|ch| !ch.is_control()).collect();
    let suffix = if dirty { "*" } else { "" };
    window
        .set_title(&format!("Lineae - {name}{suffix}"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn close_main_window(
    window: WebviewWindow,
    lifecycle: State<'_, WindowLifecycle>,
) -> Result<(), String> {
    lifecycle.allow_close.store(true, Ordering::SeqCst);
    lifecycle.stay_alive.store(true, Ordering::SeqCst);
    if let Err(error) = window.close() {
        lifecycle.allow_close.store(false, Ordering::SeqCst);
        lifecycle.stay_alive.store(false, Ordering::SeqCst);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
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

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let native_smoke = cfg!(debug_assertions)
        && std::env::args_os().any(|arg| arg == "--lineae-native-workspace-smoke");
    let native_input_review = cfg!(debug_assertions)
        && std::env::args_os().any(|arg| arg == "--lineae-native-workspace");
    let entry = if native_smoke {
        "index.html?native-only-acceptance=1"
    } else if native_input_review {
        "index.html?native-workspace=1"
    } else {
        "index.html"
    };
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(entry.into()))
        .title("Lineae - lineae.tex*")
        .inner_size(1280.0, 900.0)
        .min_inner_size(960.0, 640.0)
        .center()
        // WebView2 drops ctrl+wheel and trackpad pinch gestures unless
        // zoom control is enabled, so the page would never receive the
        // wheel events that drive the document zoom.
        .zoom_hotkeys_enabled(true)
        .initialization_script(if cfg!(any(target_os = "windows", target_os = "macos", target_os = "linux")) {
            include_str!("bridge.js")
        } else {
            concat!(
                "window.__LINEAE_DESKTOP_NATIVE_PROJECTS__ = false;\n",
                include_str!("bridge.js")
            )
        });
    #[cfg(all(debug_assertions, target_os = "windows"))]
    let window = if std::env::args_os().any(|arg| arg == "--lineae-typing-check") {
        window.initialization_script(include_str!("desktop-typing-check.js"))
            .on_document_title_changed(|window, title| {
                if title == "Lineae typing ready" || title == "Lineae typing equation" {
                    eprintln!("{title}");
                } else if let Some(result) = title.strip_prefix("Lineae typing result: ") {
                    eprintln!("Lineae typing result: {result}");
                    window.app_handle().exit(if result == "ok" { 0 } else { 1 });
                }
            })
    } else {
        window
    };
    #[cfg(all(debug_assertions, target_os = "windows"))]
    let window = if std::env::args_os().any(|arg| arg == "--lineae-hybrid-typing-check") {
        window.initialization_script(concat!(
            include_str!("../../../../tests/native-hybrid-typing-scenario.cjs"), "\n",
            include_str!("hybrid-typing-check.js")
        )).on_document_title_changed(hybrid_typing_check::on_title)
    } else { window };
    let legacy_smoke = std::env::args_os().any(|arg| arg == "--lineae-smoke-test");
    let window = if !native_smoke && !native_input_review && !legacy_smoke {
        window.initialization_script("window.__LINEAE_DESKTOP_ENGINE_TOGGLE__ = true;")
    } else { window };
    let window = if native_smoke || legacy_smoke {
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
    window.build()
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AllowedFiles::default())
        .manage(FinderFiles::default())
        .manage(WindowLifecycle::default())
        .manage(tex_session::NativeTexSessions::default());
    #[cfg(desktop)]
    let builder = builder.manage(window_layout::WindowLayout::default());
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(desktop_menu::build)
        .on_menu_event(desktop_menu::dispatch);
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    let builder = builder
        .manage(project::ProjectRoots::default())
        .invoke_handler(tauri::generate_handler![
            open_tex,
            take_finder_document,
            set_document_title,
            close_main_window,
            quit_app,
            window_layout::window_action,
            pick_save_tex,
            write_tex,
            save_bytes,
            tex_session::native_tex_open,
            tex_session::native_tex_update,
            tex_session::native_tex_poll,
            tex_session::native_tex_font,
            tex_session::native_tex_type_one_font,
            tex_session::native_tex_export,
            tex_session::native_tex_render_pdf,
            tex_session::native_tex_pdf,
            tex_session::native_tex_observe_formula,
            tex_session::native_tex_close,
            project::open_project,
            project::project_operation
        ]);
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        open_tex,
        pick_save_tex,
        write_tex,
        save_bytes,
        tex_session::native_tex_open,
        tex_session::native_tex_update,
        tex_session::native_tex_poll,
        tex_session::native_tex_font,
        tex_session::native_tex_type_one_font,
        tex_session::native_tex_export,
        tex_session::native_tex_render_pdf,
        tex_session::native_tex_pdf,
        tex_session::native_tex_observe_formula,
        tex_session::native_tex_close
    ]);
    let app = builder
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    #[cfg(target_os = "macos")]
                    {
                        let lifecycle = window.state::<WindowLifecycle>();
                        if !lifecycle.allow_close.swap(false, Ordering::SeqCst) {
                            api.prevent_close();
                            let _ = window.emit_to("main", "lineae-close-requested", ());
                        }
                    }
                    #[cfg(not(target_os = "macos"))]
                    let _ = api;
                }
                tauri::WindowEvent::Destroyed => {
                    window.state::<tex_session::NativeTexSessions>().close_all();
                }
                _ => {}
            }
        })
        .setup(|app| {
            if let Ok(resources) = app.path().resource_dir() {
                tex_session::set_bundled_rtex(resources.join("rtex"));
            }
            create_main_window(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Lineae");

    app.run(|handle, event| {
        #[cfg(not(target_os = "macos"))]
        let _ = &handle;
        match event {
            tauri::RunEvent::ExitRequested { code, api, .. } => {
                #[cfg(target_os = "macos")]
                if code.is_none()
                    && handle
                        .state::<WindowLifecycle>()
                        .stay_alive
                        .swap(false, Ordering::SeqCst)
                {
                    api.prevent_exit();
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = (code, api);
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if handle.get_webview_window("main").is_none() {
                    if let Err(error) = create_main_window(handle) {
                        eprintln!("failed to reopen Lineae: {error}");
                    }
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let files = urls.into_iter().filter_map(|url| url.to_file_path().ok()).filter(|path| {
                    path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("tex"))
                });
                if let Ok(mut pending) = handle.state::<FinderFiles>().0.lock() {
                    pending.extend(files);
                }
                let _ = handle.emit_to("main", "lineae-finder-open", ());
            }
            _ => {}
        }
    });
}
