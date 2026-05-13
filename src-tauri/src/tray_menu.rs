use tauri::{
    Manager, PhysicalPosition, Position, WebviewUrl, WebviewWindowBuilder,
};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_MENU_WINDOW_LABEL: &str = "tray-menu";
const TRAY_MENU_URL: &str = "tray-menu";
const TRAY_MENU_WIDTH: f64 = 236.0;
const TRAY_MENU_HEIGHT: f64 = 150.0;
const TRAY_MENU_GAP: f64 = 8.0;
const TRAY_MENU_SCREEN_MARGIN: f64 = 8.0;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayMenuPosition {
    x: f64,
    y: f64,
}

#[tauri::command]
pub async fn show_workduck_tray_menu(
    app: tauri::AppHandle,
    position: Option<TrayMenuPosition>,
) -> Result<(), String> {
    let cursor_position = match position {
        Some(position) if position.x.is_finite() && position.y.is_finite() => {
            PhysicalPosition::new(position.x, position.y)
        }
        _ => app.cursor_position().map_err(|error| error.to_string())?,
    };
    let menu_position = calculate_tray_menu_position(&app, cursor_position)?;

    if let Some(window) = app.get_webview_window(TRAY_MENU_WINDOW_LABEL) {
        window
            .set_position(Position::Logical(menu_position))
            .map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        TRAY_MENU_WINDOW_LABEL,
        WebviewUrl::App(TRAY_MENU_URL.into()),
    )
    .title("Workduck")
    .inner_size(TRAY_MENU_WIDTH, TRAY_MENU_HEIGHT)
    .position(menu_position.x, menu_position.y)
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .focused(true)
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hide_workduck_tray_menu(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(TRAY_MENU_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn show_workduck_main_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_workduck_tray_menu(app.clone()).await?;

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn hide_workduck_main_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_workduck_tray_menu(app.clone()).await?;

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn exit_workduck(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

fn calculate_tray_menu_position(
    app: &tauri::AppHandle,
    cursor_position: PhysicalPosition<f64>,
) -> Result<tauri::LogicalPosition<f64>, String> {
    let monitors = app.available_monitors().map_err(|error| error.to_string())?;
    let active_monitor = monitors
        .iter()
        .find(|monitor| {
            let area = monitor.work_area();
            let left = f64::from(area.position.x);
            let top = f64::from(area.position.y);
            let right = left + f64::from(area.size.width);
            let bottom = top + f64::from(area.size.height);

            cursor_position.x >= left
                && cursor_position.x <= right
                && cursor_position.y >= top
                && cursor_position.y <= bottom
        })
        .or_else(|| monitors.first());
    let scale_factor = active_monitor
        .map(|monitor| monitor.scale_factor())
        .filter(|scale_factor| scale_factor.is_finite() && *scale_factor > 0.0)
        .unwrap_or(1.0);
    let cursor_x = cursor_position.x / scale_factor;
    let cursor_y = cursor_position.y / scale_factor;
    let mut x = cursor_x - TRAY_MENU_WIDTH + TRAY_MENU_GAP;
    let mut y = cursor_y - TRAY_MENU_HEIGHT - TRAY_MENU_GAP;

    if let Some(monitor) = active_monitor {
        let work_area = monitor.work_area();
        let left = f64::from(work_area.position.x) / scale_factor;
        let top = f64::from(work_area.position.y) / scale_factor;
        let right = left + f64::from(work_area.size.width) / scale_factor;
        let bottom = top + f64::from(work_area.size.height) / scale_factor;

        x = clamp_to_range(
            x,
            left + TRAY_MENU_SCREEN_MARGIN,
            right - TRAY_MENU_WIDTH - TRAY_MENU_SCREEN_MARGIN,
        );

        if y < top + TRAY_MENU_SCREEN_MARGIN {
            y = cursor_y + TRAY_MENU_GAP;
        }

        y = clamp_to_range(
            y,
            top + TRAY_MENU_SCREEN_MARGIN,
            bottom - TRAY_MENU_HEIGHT - TRAY_MENU_SCREEN_MARGIN,
        );
    }

    Ok(tauri::LogicalPosition::new(x, y))
}

fn clamp_to_range(value: f64, min: f64, max: f64) -> f64 {
    if min > max {
        return min;
    }

    value.clamp(min, max)
}
