// llmnav/1 module
// id=workduck.system.autostart-native
// role=Read and update operating-system login autostart through Tauri, verifying actual state after each mutation.
// owns=autostart command boundary|post-write verification|autostart error mapping
// excludes=frontend toggle state|autostart plugin initialization
// search=workduck autostart|login startup toggle|verify autolaunch state
// invariant=A successful mutation reports the plugin's re-read state rather than assuming the requested state was applied.
// stability=contract
// /llmnav
use tauri_plugin_autostart::ManagerExt;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkduckAutostartResult {
    ok: bool,
    enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkduckAutostartError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkduckAutostartError {
    AutostartReadFailed,
    AutostartWriteFailed,
}

#[tauri::command]
pub fn read_workduck_autostart_enabled(app: tauri::AppHandle) -> WorkduckAutostartResult {
    match app.autolaunch().is_enabled() {
        Ok(enabled) => WorkduckAutostartResult {
            ok: true,
            enabled,
            error: None,
        },
        Err(error) => {
            eprintln!("Failed to read Workduck autostart state: {error}");
            WorkduckAutostartResult {
                ok: false,
                enabled: false,
                error: Some(WorkduckAutostartError::AutostartReadFailed),
            }
        }
    }
}

#[tauri::command]
pub fn set_workduck_autostart_enabled(
    app: tauri::AppHandle,
    enabled: bool,
) -> WorkduckAutostartResult {
    let manager = app.autolaunch();
    let write_result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };

    if let Err(error) = write_result {
        eprintln!("Failed to write Workduck autostart state: {error}");
        return WorkduckAutostartResult {
            ok: false,
            enabled,
            error: Some(WorkduckAutostartError::AutostartWriteFailed),
        };
    }

    match manager.is_enabled() {
        Ok(actual_enabled) => WorkduckAutostartResult {
            ok: true,
            enabled: actual_enabled,
            error: None,
        },
        Err(error) => {
            eprintln!("Failed to verify Workduck autostart state after write: {error}");
            WorkduckAutostartResult {
                ok: false,
                enabled,
                error: Some(WorkduckAutostartError::AutostartReadFailed),
            }
        }
    }
}
