use tauri::Manager;

pub mod argon2_kdf;
mod agent_api_snapshot;
mod atomic_file_write;
mod autostart_control;
mod chat_completion;
mod git_credential;
mod git_path;
mod llm_chat;
mod path_display;
mod password_envelope_crypto;
mod process_tree;
mod project_folder;
mod project_registry_store;
mod project_repository_failure;
mod project_repository;
mod repository_inspection_scheduler;
mod project_repository_task;
mod project_repository_validation;
mod project_repository_operation_store;
mod project_repository_import_attempt_store;
mod queue_execution_identity;
mod queue_execution_registry;
mod queue_folder;
mod queue_limits;
mod queue_model_catalog;
mod queue_prompt_builder;
mod queue_provider_client;
mod queue_result_report;
mod queue_response_parser;
pub mod queue_execution;
pub mod queue_work_order_execution;
mod secret_vault_crypto;
mod ssealed_scaffold_generated;
mod storage;
pub mod system_environment;
mod terminal_catalog;
mod terminal_process;
mod tray_menu;
mod developer_processes;
mod workspace_password;
mod workspace_path;
pub mod workspace_registry_lock;
pub mod workspace_data_file;
mod workspace_repository_gitignore;
mod workspace_repository_setup;
mod workspace_sync_crypto;
mod workspace_sync_file;
mod workspace_sync_git;
mod windows_filename;

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

fn initialize_storage_or_defer_for_update(
    app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    match storage::initialize_app_storage(&app.handle()) {
        Ok(storage_state) => {
            app.manage(storage_state);
            Ok(())
        }
        Err(error) if is_recoverable_storage_setup_error(&error) => {
            eprintln!(
                "Workduck storage initialization was deferred so the updater can run: {error}"
            );
            Ok(())
        }
        Err(error) => Err(Box::new(error)),
    }
}

fn is_recoverable_storage_setup_error(error: &storage::StorageError) -> bool {
    matches!(
        error,
        storage::StorageError::IncompatibleSchemaVersion { .. }
    )
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.set_theme(Some(tauri::Theme::Dark));
            app.manage(terminal_process::TerminalProcessState::default());
            initialize_storage_or_defer_for_update(app)
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            storage_status,
            agent_api_snapshot::read_agent_api_snapshot,
            autostart_control::read_workduck_autostart_enabled,
            autostart_control::set_workduck_autostart_enabled,
            tray_menu::exit_workduck,
            tray_menu::hide_workduck_main_window,
            tray_menu::hide_workduck_tray_menu,
            tray_menu::show_workduck_main_window,
            tray_menu::show_workduck_tray_menu,
            terminal_process::read_terminal_session,
            terminal_process::start_terminal_session,
            terminal_process::stop_terminal_session,
            terminal_process::write_terminal_session_input,
            developer_processes::kill_developer_process,
            developer_processes::list_developer_processes,
            secret_vault_crypto::decrypt_secret_vault_payload,
            secret_vault_crypto::encrypt_secret_vault_payload,
            system_environment::apply_cli_environment_variables,
            workspace_sync_crypto::decrypt_workspace_sync_payload,
            workspace_sync_crypto::encrypt_workspace_sync_payload,
            workspace_sync_file::read_workspace_sync_file,
            workspace_sync_file::write_workspace_sync_file,
            workspace_sync_git::inspect_workspace_sync_git,
            workspace_sync_git::run_workspace_sync_git,
            workspace_password::create_workspace_password_hash,
            workspace_password::verify_workspace_password,
            workspace_path::validate_workspace_path,
            workspace_data_file::read_workspace_data_file,
            workspace_data_file::write_workspace_data_file,
            workspace_data_file::write_workspace_registry_file,
            workspace_data_file::write_workspace_registry_pair,
            workspace_repository_setup::setup_workspace_repository,
            project_repository::clone_project_repository,
            project_repository::clone_project_repository_fork,
            project_repository::fetch_project_repository_git,
            project_repository::initialize_project_repository_git,
            project_repository::inspect_project_repository_git,
            project_repository::pull_project_repository_git,
            project_repository::prepare_project_repository_for_github_publish,
            project_repository::publish_project_repository_to_github,
            project_repository::push_project_repository_to_github,
            project_repository::push_project_repository_git,
            repository_inspection_scheduler::cancel_project_repositories_git_inspection,
            repository_inspection_scheduler::schedule_project_repositories_git_inspection,
            project_repository_task::read_project_repository_task_run_records,
            project_repository_task::run_project_repository_task,
            project_repository_operation_store::read_project_repository_operation_records,
            project_repository_operation_store::write_project_repository_operation_record,
            project_repository_import_attempt_store::read_project_repository_import_attempt_records,
            project_repository_import_attempt_store::write_project_repository_import_attempt_record,
            project_registry_store::read_project_registries,
            project_registry_store::read_project_registry,
            project_registry_store::write_project_registries,
            project_registry_store::write_project_registry,
            project_folder::create_project_folder,
            project_folder::create_project_group_folder,
            project_folder::apply_ssealed_scaffold_to_repository,
            project_folder::delete_project_node_folder,
            project_folder::delete_project_repository_folder,
            project_folder::ensure_project_folder_path,
            project_folder::open_project_folder_path,
            project_folder::open_project_node_folder,
            project_folder::preview_ssealed_scaffold_for_repository,
            queue_folder::delete_queue_file,
            queue_folder::ensure_queue_folder,
            queue_folder::list_queue_files,
            queue_folder::open_queue_folder,
            queue_folder::read_queue_file,
            queue_folder::summarize_queue_files,
            queue_folder::update_queue_result_report_file,
            queue_folder::update_queue_work_order_file,
            queue_folder::write_queue_work_order_file,
            queue_folder::write_queue_result_report_file,
            queue_execution::cancel_queue_work_order_execution,
            queue_execution::execute_queue_work_order,
            queue_execution::inspect_queue_work_order_executions,
            queue_execution::preview_queue_work_order_prompt,
            llm_chat::run_llm_chat_completion
        ])
        .build(tauri::generate_context!())
        .expect("error while building Workduck");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            terminal_process::shutdown_all_terminal_sessions(
                &app_handle.state::<terminal_process::TerminalProcessState>(),
            );
            process_tree::shutdown_all_process_trees();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_schema_storage_error_is_recoverable_during_setup() {
        let error = storage::StorageError::IncompatibleSchemaVersion {
            database_version: 7,
            current_version: 6,
        };

        assert!(is_recoverable_storage_setup_error(&error));
    }

    #[test]
    fn ordinary_storage_error_is_not_recoverable_during_setup() {
        let error = storage::StorageError::ResolveAppLocalDataDir("missing app path".to_string());

        assert!(!is_recoverable_storage_setup_error(&error));
    }
}
