use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Wry};

fn find_submenu(menu: &Menu<Wry>, name: &str) -> tauri::Result<Option<Submenu<Wry>>> {
    for item in menu.items()? {
        if let MenuItemKind::Submenu(existing) = item {
            if existing.text()? == name {
                return Ok(Some(existing));
            }
        }
    }
    Ok(None)
}

fn submenu(
    handle: &AppHandle,
    menu: &Menu<Wry>,
    name: &str,
    position: usize,
) -> tauri::Result<Submenu<Wry>> {
    if let Some(existing) = find_submenu(menu, name)? {
        return Ok(existing);
    }
    let created = Submenu::new(handle, name, true)?;
    menu.insert(&created, position)?;
    Ok(created)
}

fn action(
    handle: &AppHandle,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<Wry>> {
    MenuItem::with_id(handle, format!("lineae:{id}"), label, true, accelerator)
}

pub fn build(handle: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(handle)?;
    let file_position = usize::from(cfg!(target_os = "macos"));
    let file = submenu(handle, &menu, "File", file_position)?;
    file.insert_items(
        &[
            &action(handle, "new", "New Document", Some("CmdOrCtrl+N"))?,
            &action(handle, "open", "Open…", Some("CmdOrCtrl+O"))?,
            &action(handle, "open-project", "Open Project…", Some("CmdOrCtrl+Shift+O"))?,
            &PredefinedMenuItem::separator(handle)?,
            &action(handle, "save", "Save", Some("CmdOrCtrl+S"))?,
            &action(handle, "save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(handle)?,
        ],
        0,
    )?;

    if let Some(default_edit) = find_submenu(&menu, "Edit")? {
        menu.remove(&default_edit)?;
    }
    let edit = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &action(handle, "undo", "Undo", Some("CmdOrCtrl+Z"))?,
            &action(handle, "redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &action(handle, "find", "Find…", None)?,
        ],
    )?;
    menu.insert(&edit, file_position + 1)?;

    let view = submenu(handle, &menu, "View", file_position + 2)?;
    view.insert_items(
        &[
            &action(handle, "document", "Document", None)?,
            &action(handle, "source", "Source", None)?,
            &action(handle, "split", "Split", None)?,
            &PredefinedMenuItem::separator(handle)?,
            &action(handle, "toggle-toolbar", "Show or Hide Toolbar", None)?,
        ],
        0,
    )?;
    Ok(menu)
}

pub fn dispatch(handle: &AppHandle, event: MenuEvent) {
    if let Some(action) = event.id().as_ref().strip_prefix("lineae:") {
        let _ = handle.emit_to("main", "lineae-menu-action", action);
    }
}
