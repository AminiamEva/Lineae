use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};

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

#[cfg(target_os = "macos")]
fn replace_quit(handle: &AppHandle, menu: &Menu<Wry>) -> tauri::Result<()> {
    let Some(app_menu) = menu.items()?.into_iter().find_map(|item| match item {
        MenuItemKind::Submenu(submenu) => Some(submenu),
        _ => None,
    }) else {
        return Ok(());
    };
    let quit = app_menu.items()?.into_iter().find_map(|item| match item {
        MenuItemKind::Predefined(item)
            if item.text().unwrap_or_default().starts_with("Quit") =>
        {
            Some(item)
        }
        _ => None,
    });
    if let Some(quit) = quit {
        app_menu.remove(&quit)?;
    }
    app_menu.append(&action(handle, "quit", "Quit Lineae", Some("CmdOrCtrl+Q"))?)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn customize_window_menu(
    handle: &AppHandle,
    menu: &Menu<Wry>,
) -> tauri::Result<()> {
    let window = submenu(handle, menu, "Window", 4)?;
    for _ in 0..window.items()?.len() {
        window.remove_at(0)?;
    }
    let resize = Submenu::with_items(
        handle,
        "Move & Resize",
        true,
        &[
            &action(handle, "window-left", "Left", Some("Ctrl+Left"))?,
            &action(handle, "window-right", "Right", Some("Ctrl+Right"))?,
            &action(handle, "window-top", "Top", Some("Ctrl+Up"))?,
            &action(handle, "window-bottom", "Bottom", Some("Ctrl+Down"))?,
            &PredefinedMenuItem::separator(handle)?,
            &action(
                handle,
                "window-restore",
                "Return to Previous Size",
                Some("Ctrl+R"),
            )?,
        ],
    )?;
    window.append_items(&[
        &PredefinedMenuItem::minimize(handle, None)?,
        &PredefinedMenuItem::maximize(handle, None)?,
        &PredefinedMenuItem::separator(handle)?,
        &action(handle, "window-fill", "Fill", Some("Ctrl+F"))?,
        &action(handle, "window-center", "Center", Some("Ctrl+C"))?,
        &resize,
        &PredefinedMenuItem::separator(handle)?,
        &PredefinedMenuItem::bring_all_to_front(handle, None)?,
    ])?;
    Ok(())
}

pub fn build(handle: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(handle)?;
    let file_position = usize::from(cfg!(target_os = "macos"));
    #[cfg(target_os = "macos")]
    {
        replace_quit(handle, &menu)?;
        if let Some(default_file) = find_submenu(&menu, "File")? {
            menu.remove(&default_file)?;
        }
    }
    let file = submenu(handle, &menu, "File", file_position)?;
    file.insert_items(
        &[
            &action(handle, "new", "New Document", Some("CmdOrCtrl+N"))?,
            &action(handle, "open", "Open…", Some("CmdOrCtrl+O"))?,
            &action(
                handle,
                "open-project",
                "Open Project…",
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &action(handle, "save", "Save", Some("CmdOrCtrl+S"))?,
            &action(handle, "save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?,
        ],
        0,
    )?;
    #[cfg(target_os = "macos")]
    {
        file.append(&PredefinedMenuItem::separator(handle)?)?;
        file.append(&action(
            handle,
            "close-window",
            "Close Window",
            Some("CmdOrCtrl+W"),
        )?)?;
    }

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
    #[cfg(target_os = "macos")]
    customize_window_menu(handle, &menu)?;
    Ok(menu)
}

pub fn dispatch(handle: &AppHandle, event: MenuEvent) {
    if let Some(action) = event.id().as_ref().strip_prefix("lineae:") {
        if action == "quit" && handle.get_webview_window("main").is_none() {
            handle.exit(0);
            return;
        }
        let _ = handle.emit_to("main", "lineae-menu-action", action);
    }
}
