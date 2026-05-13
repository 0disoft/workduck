mod storage;
mod workspace_path;

#[derive(serde::Serialize)]
struct RuntimeStatus {
    app: &'static str,
    shell: &'static str,
    command_boundary: &'static str,
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        app: "workduck",
        shell: "tauri",
        command_boundary: "ready",
    }
}

#[tauri::command]
fn storage_status(app: tauri::AppHandle) -> Result<storage::StorageStatus, String> {
    storage::storage_status(&app).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            storage_status,
            workspace_path::validate_workspace_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Workduck");
}
