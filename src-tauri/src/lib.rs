mod storage;
mod developer_processes;
mod project_folder;
mod project_repository_operation_store;
mod project_registry_store;
mod queue_folder;
mod project_repository;
mod secret_vault_crypto;
mod tray_menu;
mod terminal_catalog;
mod terminal_process;
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
        .manage(terminal_process::TerminalProcessState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            storage_status,
            developer_processes::kill_developer_process,
            developer_processes::list_developer_processes,
            terminal_catalog::list_terminal_catalog,
            terminal_process::read_terminal_session,
            terminal_process::start_terminal_session,
            terminal_process::stop_terminal_session,
            terminal_process::write_terminal_session_input,
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
            workspace_path::validate_workspace_path,
            project_repository::clone_project_repository,
            project_repository::fetch_project_repository_git,
            project_repository::initialize_project_repository_git,
            project_repository::inspect_project_repository_git,
            project_repository::pull_project_repository_git,
            project_repository::prepare_project_repository_for_github_publish,
            project_repository::publish_project_repository_to_github,
            project_repository::push_project_repository_to_github,
            project_repository::push_project_repository_git,
            project_repository_operation_store::read_project_repository_operation_records,
            project_repository_operation_store::write_project_repository_operation_record,
            project_registry_store::read_project_registries,
            project_registry_store::read_project_registry,
            project_registry_store::write_project_registries,
            project_registry_store::write_project_registry,
            project_folder::create_project_folder,
            project_folder::create_project_group_folder,
            project_folder::delete_project_node_folder,
            project_folder::delete_project_repository_folder,
            project_folder::ensure_project_folder_path,
            project_folder::open_project_folder_path,
            project_folder::open_project_node_folder,
            queue_folder::ensure_queue_folder,
            queue_folder::list_queue_files,
            queue_folder::open_queue_folder,
            queue_folder::read_queue_file,
            queue_folder::write_queue_work_order_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Workduck");
}
