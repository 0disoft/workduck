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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_status])
        .run(tauri::generate_context!())
        .expect("error while running Workduck");
}
