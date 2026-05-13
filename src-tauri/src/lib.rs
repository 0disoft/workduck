mod storage;
mod secret_vault_crypto;
mod tray_menu;
mod workspace_password;
mod workspace_path;
mod workspace_sync_crypto;
mod workspace_sync_file;
mod workspace_sync_git;

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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.set_theme(Some(tauri::Theme::Dark));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            storage_status,
            tray_menu::exit_workduck,
            tray_menu::hide_workduck_main_window,
            tray_menu::hide_workduck_tray_menu,
            tray_menu::show_workduck_main_window,
            tray_menu::show_workduck_tray_menu,
            secret_vault_crypto::decrypt_secret_vault_payload,
            secret_vault_crypto::encrypt_secret_vault_payload,
            workspace_sync_crypto::decrypt_workspace_sync_payload,
            workspace_sync_crypto::encrypt_workspace_sync_payload,
            workspace_sync_file::read_workspace_sync_file,
            workspace_sync_file::write_workspace_sync_file,
            workspace_sync_git::inspect_workspace_sync_git,
            workspace_sync_git::run_workspace_sync_git,
            workspace_password::create_workspace_password_hash,
            workspace_password::verify_workspace_password,
            workspace_path::validate_workspace_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Workduck");
}
