use std::sync::Mutex;

use tauri::{PhysicalPosition, PhysicalSize, State, WebviewWindow};

#[derive(Clone, Copy)]
struct Frame {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

#[derive(Default)]
pub struct WindowLayout(Mutex<Option<Frame>>);

#[derive(Clone, Copy)]
enum Placement {
    Fill,
    Left,
    Right,
    Top,
    Bottom,
}

fn window_error(error: tauri::Error) -> String {
    error.to_string()
}

fn frame(window: &WebviewWindow) -> Result<Frame, String> {
    Ok(Frame {
        position: window.outer_position().map_err(window_error)?,
        size: window.outer_size().map_err(window_error)?,
    })
}

fn decorations(window: &WebviewWindow) -> Result<(u32, u32), String> {
    let outer = window.outer_size().map_err(window_error)?;
    let inner = window.inner_size().map_err(window_error)?;
    Ok((
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
    ))
}

fn apply_outer(window: &WebviewWindow, target: Frame) -> Result<(), String> {
    let (extra_width, extra_height) = decorations(window)?;
    let inner = PhysicalSize::new(
        target.size.width.saturating_sub(extra_width).max(1),
        target.size.height.saturating_sub(extra_height).max(1),
    );
    window.set_size(inner).map_err(window_error)?;
    window.set_position(target.position).map_err(window_error)?;
    Ok(())
}

fn leave_maximized(window: &WebviewWindow) -> Result<(), String> {
    if window.is_fullscreen().unwrap_or(false) {
        window.set_fullscreen(false).map_err(window_error)?;
    }
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(window_error)?;
    }
    Ok(())
}

fn place(window: &WebviewWindow, layout: &WindowLayout, placement: Placement) -> Result<(), String> {
    leave_maximized(window)?;
    let current = frame(window)?;
    {
        let mut previous = layout
            .0
            .lock()
            .map_err(|_| "Window layout state is unavailable".to_string())?;
        if previous.is_none() {
            *previous = Some(current);
        }
    }
    let monitor = window
        .current_monitor()
        .map_err(window_error)?
        .or(window.primary_monitor().map_err(window_error)?)
        .ok_or_else(|| "The window is not on a monitor".to_string())?;
    let area = *monitor.work_area();
    let half_width = area.size.width / 2;
    let half_height = area.size.height / 2;
    let (position, size) = match placement {
        Placement::Fill => (area.position, area.size),
        Placement::Left => (
            area.position,
            PhysicalSize::new(half_width, area.size.height),
        ),
        Placement::Right => (
            PhysicalPosition::new(area.position.x + half_width as i32, area.position.y),
            PhysicalSize::new(area.size.width - half_width, area.size.height),
        ),
        Placement::Top => (
            area.position,
            PhysicalSize::new(area.size.width, half_height),
        ),
        Placement::Bottom => (
            PhysicalPosition::new(area.position.x, area.position.y + half_height as i32),
            PhysicalSize::new(area.size.width, area.size.height - half_height),
        ),
    };
    apply_outer(
        window,
        Frame {
            position,
            size,
        },
    )
}

fn center(window: &WebviewWindow) -> Result<(), String> {
    leave_maximized(window)?;
    let monitor = window
        .current_monitor()
        .map_err(window_error)?
        .or(window.primary_monitor().map_err(window_error)?)
        .ok_or_else(|| "The window is not on a monitor".to_string())?;
    let area = *monitor.work_area();
    let size = window.outer_size().map_err(window_error)?;
    window
        .set_position(PhysicalPosition::new(
            area.position.x + area.size.width.saturating_sub(size.width) as i32 / 2,
            area.position.y + area.size.height.saturating_sub(size.height) as i32 / 2,
        ))
        .map_err(window_error)
}

fn restore(window: &WebviewWindow, layout: &WindowLayout) -> Result<(), String> {
    let previous = layout
        .0
        .lock()
        .map_err(|_| "Window layout state is unavailable".to_string())?
        .take();
    if let Some(target) = previous {
        leave_maximized(window)?;
        apply_outer(window, target)?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_action(
    window: WebviewWindow,
    layout: State<'_, WindowLayout>,
    action: String,
) -> Result<(), String> {
    match action.as_str() {
        "fill" => place(&window, &layout, Placement::Fill),
        "left" => place(&window, &layout, Placement::Left),
        "right" => place(&window, &layout, Placement::Right),
        "top" => place(&window, &layout, Placement::Top),
        "bottom" => place(&window, &layout, Placement::Bottom),
        "center" => center(&window),
        "restore" => restore(&window, &layout),
        _ => Err(format!("Unknown window action: {action}")),
    }
}