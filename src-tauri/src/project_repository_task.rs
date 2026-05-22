use std::{
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
};

use base64::{Engine as _, engine::general_purpose};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryTaskRequest {
    workspace_path: String,
    repository_path: String,
    task: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryTaskResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryTaskError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_record: Option<ProjectRepositoryTaskRunRecord>,
}

#[derive(serde::Serialize)]
pub enum ProjectRepositoryTaskError {
    #[serde(rename = "project-repository-task-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "project-repository-task-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "project-repository-task-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "project-repository-task-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "project-repository-task-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "project-repository-task-path-required")]
    RepositoryPathRequired,
    #[serde(rename = "project-repository-task-path-not-absolute")]
    RepositoryPathNotAbsolute,
    #[serde(rename = "project-repository-task-path-not-found")]
    RepositoryPathNotFound,
    #[serde(rename = "project-repository-task-path-not-directory")]
    RepositoryPathNotDirectory,
    #[serde(rename = "project-repository-task-path-outside-workspace")]
    RepositoryPathOutsideWorkspace,
    #[serde(rename = "project-repository-task-path-unreadable")]
    RepositoryPathUnreadable,
    #[serde(rename = "project-repository-task-invalid")]
    TaskInvalid,
    #[serde(rename = "project-repository-task-command-unavailable")]
    CommandUnavailable,
    #[serde(rename = "project-repository-task-terminal-unavailable")]
    TerminalUnavailable,
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    #[serde(rename = "project-repository-task-terminal-unsupported-platform")]
    TerminalUnsupportedPlatform,
    #[serde(rename = "project-repository-task-launch-failed")]
    LaunchFailed,
    #[serde(rename = "project-repository-task-record-write-failed")]
    RecordWriteFailed,
    #[serde(rename = "project-repository-task-record-read-failed")]
    RecordReadFailed,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryTaskRunRecord {
    id: String,
    task: String,
    repository_path: String,
    command: String,
    state: String,
    exit_code: Option<i32>,
    started_at: String,
    finished_at: Option<String>,
    output_tail: Option<String>,
    record_path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryTaskRunRecordsResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    records: Option<Vec<ProjectRepositoryTaskRunRecord>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryTaskError>,
}

#[derive(Clone, Copy)]
enum ProjectRepositoryTask {
    OpenTerminal,
    InstallDependencies,
    UpdateDependencies,
    StartDevServer,
    Build,
}

const DEPENDENCY_DISCOVERY_MAX_DEPTH: usize = 3;
const DEPENDENCY_DISCOVERY_IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".svelte-kit",
    "build",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

#[tauri::command]
pub fn run_project_repository_task(
    request: ProjectRepositoryTaskRequest,
) -> ProjectRepositoryTaskResult {
    let task = match parse_task(&request.task) {
        Some(task) => task,
        None => return failed(ProjectRepositoryTaskError::TaskInvalid),
    };
    let workspace_path = match validate_workspace_path(&request.workspace_path) {
        Ok(path) => path,
        Err(error) => return failed(error),
    };
    let repository_path =
        match validate_repository_path(&workspace_path, &request.repository_path) {
            Ok(path) => path,
            Err(error) => return failed(error),
        };
    let commands = match resolve_repository_task_commands(task, &repository_path) {
        Ok(commands) => commands,
        Err(error) => return failed(error),
    };
    let command = if commands.is_empty() {
        None
    } else {
        Some(commands.join("\n"))
    };
    let (launch_result, run_record) = if commands.is_empty() {
        (launch_repository_terminal(&repository_path, None, None), None)
    } else if matches!(task, ProjectRepositoryTask::StartDevServer) && commands.len() > 1 {
        match launch_repository_task_terminals(&workspace_path, &repository_path, task, &commands) {
            Ok(records) => (Ok(()), records.into_iter().next()),
            Err(error) => (Err(error), None),
        }
    } else {
        let run_record = match create_task_run_record(
            &workspace_path,
            &repository_path,
            task,
            command.as_deref().unwrap_or(""),
        ) {
            Ok(record) => record,
            Err(error) => return failed(error),
        };
        (
            launch_repository_terminal(&repository_path, command.as_deref(), Some(&run_record)),
            Some(run_record),
        )
    };

    match launch_result {
        Ok(()) => ProjectRepositoryTaskResult {
            ok: true,
            error: None,
            command,
            run_record,
        },
        Err(error) => {
            if let Some(record) = run_record.as_ref() {
                let _ = write_task_run_record(
                    &PathBuf::from(&record.record_path),
                    &failed_launch_task_run_record(record),
                );
            }

            failed(error)
        }
    }
}

#[tauri::command]
pub fn read_project_repository_task_run_records(
    workspace_path: String,
) -> ProjectRepositoryTaskRunRecordsResult {
    let workspace_path = match validate_workspace_path(&workspace_path) {
        Ok(path) => path,
        Err(error) => {
            return ProjectRepositoryTaskRunRecordsResult {
                ok: false,
                records: None,
                error: Some(error),
            };
        }
    };
    let record_dir = task_run_record_dir(&workspace_path);
    let entries = match fs::read_dir(&record_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return ProjectRepositoryTaskRunRecordsResult {
                ok: true,
                records: Some(Vec::new()),
                error: None,
            };
        }
        Err(_) => {
            return ProjectRepositoryTaskRunRecordsResult {
                ok: false,
                records: None,
                error: Some(ProjectRepositoryTaskError::RecordReadFailed),
            };
        }
    };
    let mut records = Vec::new();
    let visible_workspace_path = crate::git_path::git_process_path(&workspace_path);

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        let Ok(record_json) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(record) = serde_json::from_str::<ProjectRepositoryTaskRunRecord>(&record_json) else {
            continue;
        };
        let repository_path = PathBuf::from(&record.repository_path);

        if repository_path.starts_with(&visible_workspace_path) {
            records.push(record);
        }
    }

    records.sort_by(|left, right| right.started_at.cmp(&left.started_at).then(right.id.cmp(&left.id)));

    ProjectRepositoryTaskRunRecordsResult {
        ok: true,
        records: Some(records),
        error: None,
    }
}

fn parse_task(task: &str) -> Option<ProjectRepositoryTask> {
    match task.trim() {
        "open-terminal" => Some(ProjectRepositoryTask::OpenTerminal),
        "install-dependencies" => Some(ProjectRepositoryTask::InstallDependencies),
        "update-dependencies" => Some(ProjectRepositoryTask::UpdateDependencies),
        "start-dev-server" => Some(ProjectRepositoryTask::StartDevServer),
        "build" => Some(ProjectRepositoryTask::Build),
        _ => None,
    }
}

fn validate_workspace_path(path: &str) -> Result<PathBuf, ProjectRepositoryTaskError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryTaskError::WorkspaceRequired);
    }

    let path = PathBuf::from(trimmed_path);

    if !path.is_absolute() {
        return Err(ProjectRepositoryTaskError::WorkspaceNotAbsolute);
    }

    let metadata = fs::metadata(&path).map_err(|_| ProjectRepositoryTaskError::WorkspaceNotFound)?;

    if !metadata.is_dir() {
        return Err(ProjectRepositoryTaskError::WorkspaceNotDirectory);
    }

    let canonical_path =
        fs::canonicalize(&path).map_err(|_| ProjectRepositoryTaskError::WorkspaceUnreadable)?;
    fs::read_dir(&canonical_path)
        .map_err(|_| ProjectRepositoryTaskError::WorkspaceUnreadable)?;

    Ok(canonical_path)
}

fn validate_repository_path(
    workspace_path: &Path,
    path: &str,
) -> Result<PathBuf, ProjectRepositoryTaskError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryTaskError::RepositoryPathRequired);
    }

    let path = PathBuf::from(trimmed_path);

    if !path.is_absolute() {
        return Err(ProjectRepositoryTaskError::RepositoryPathNotAbsolute);
    }

    let metadata =
        fs::metadata(&path).map_err(|_| ProjectRepositoryTaskError::RepositoryPathNotFound)?;

    if !metadata.is_dir() {
        return Err(ProjectRepositoryTaskError::RepositoryPathNotDirectory);
    }

    let canonical_path =
        fs::canonicalize(&path).map_err(|_| ProjectRepositoryTaskError::RepositoryPathUnreadable)?;
    fs::read_dir(&canonical_path)
        .map_err(|_| ProjectRepositoryTaskError::RepositoryPathUnreadable)?;

    if !canonical_path.starts_with(workspace_path) {
        return Err(ProjectRepositoryTaskError::RepositoryPathOutsideWorkspace);
    }

    Ok(canonical_path)
}

fn resolve_repository_task_commands(
    task: ProjectRepositoryTask,
    repository_path: &Path,
) -> Result<Vec<String>, ProjectRepositoryTaskError> {
    if matches!(task, ProjectRepositoryTask::OpenTerminal) {
        return Ok(Vec::new());
    }

    let mut commands = Vec::new();

    match task {
        ProjectRepositoryTask::InstallDependencies => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
            add_python_task_commands(repository_path, task, &mut commands);
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["composer.json"],
                "composer install",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Gemfile"],
                "bundle install",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["mix.exs"],
                "mix deps.get",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Package.swift"],
                "swift package resolve",
            );
        }
        ProjectRepositoryTask::UpdateDependencies => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_deno_dependency_update_commands(repository_path, &mut commands);
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
            add_python_task_commands(repository_path, task, &mut commands);
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["composer.json"],
                "composer update",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Gemfile"],
                "bundle update",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["mix.exs"],
                "mix deps.update --all",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Package.swift"],
                "swift package update",
            );
        }
        ProjectRepositoryTask::StartDevServer => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_deno_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
        }
        ProjectRepositoryTask::Build => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_deno_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Package.swift"],
                "swift build",
            );
        }
        ProjectRepositoryTask::OpenTerminal => {}
    }

    if commands.is_empty() {
        return Err(ProjectRepositoryTaskError::CommandUnavailable);
    }

    Ok(commands)
}

struct PackageProject {
    package_manager: PackageManager,
    scripts: Vec<String>,
    dev_script: Option<String>,
}

#[derive(Clone, Copy)]
enum PackageManager {
    Bun,
    Npm,
    Pnpm,
    Yarn,
}

fn read_package_project_at(project_path: &Path) -> Option<PackageProject> {
    let package_json_path = project_path.join("package.json");
    let package_json = fs::read_to_string(package_json_path).ok()?;
    let package_json: serde_json::Value = serde_json::from_str(&package_json).ok()?;
    let scripts = package_json
        .get("scripts")
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();
    let script_names = scripts.keys().map(String::from).collect();
    let dev_script = scripts
        .get("dev")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let package_manager = package_json
        .get("packageManager")
        .and_then(serde_json::Value::as_str)
        .and_then(parse_package_manager)
        .unwrap_or_else(|| detect_package_manager_from_locks(project_path));

    Some(PackageProject {
        package_manager,
        scripts: script_names,
        dev_script,
    })
}

fn parse_package_manager(value: &str) -> Option<PackageManager> {
    if value.starts_with("bun@") {
        Some(PackageManager::Bun)
    } else if value.starts_with("pnpm@") {
        Some(PackageManager::Pnpm)
    } else if value.starts_with("yarn@") {
        Some(PackageManager::Yarn)
    } else if value.starts_with("npm@") {
        Some(PackageManager::Npm)
    } else {
        None
    }
}

fn detect_package_manager_from_locks(repository_path: &Path) -> PackageManager {
    if repository_path.join("bun.lock").is_file() || repository_path.join("bun.lockb").is_file() {
        PackageManager::Bun
    } else if repository_path.join("pnpm-lock.yaml").is_file() {
        PackageManager::Pnpm
    } else if repository_path.join("yarn.lock").is_file() {
        PackageManager::Yarn
    } else {
        PackageManager::Npm
    }
}

fn add_package_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) -> Result<(), ProjectRepositoryTaskError> {
    for project_path in discover_package_project_paths(repository_path) {
        let Some(package_project) = read_package_project_at(&project_path) else {
            continue;
        };
        let Some(command) = resolve_package_task_command(task, &package_project)? else {
            continue;
        };

        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, &command),
        );
    }

    Ok(())
}

fn discover_package_project_paths(repository_path: &Path) -> Vec<PathBuf> {
    let mut project_paths = Vec::new();

    if read_package_project_at(repository_path).is_some() {
        project_paths.push(repository_path.to_path_buf());
    }

    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["package.json"],
    )) {
        if !project_paths.contains(&project_path) {
            project_paths.push(project_path);
        }
    }

    project_paths
}

fn resolve_package_task_command(
    task: ProjectRepositoryTask,
    project: &PackageProject,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    match task {
        ProjectRepositoryTask::InstallDependencies => Ok(Some(format!(
            "{} install",
            project.package_manager.executable()
        ))),
        ProjectRepositoryTask::UpdateDependencies => Ok(Some(
            project.package_manager.update_command().to_owned(),
        )),
        ProjectRepositoryTask::StartDevServer => resolve_package_dev_server_command(project),
        ProjectRepositoryTask::Build => resolve_optional_package_script_command(project, "build"),
        ProjectRepositoryTask::OpenTerminal => Ok(None),
    }
}

fn resolve_package_dev_server_command(
    project: &PackageProject,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    let command = resolve_optional_package_script_command(project, "dev")?;

    if !project
        .dev_script
        .as_deref()
        .is_some_and(is_vite_strict_port_script)
    {
        return Ok(command);
    }

    let port =
        find_available_local_port(5173, 40).ok_or(ProjectRepositoryTaskError::CommandUnavailable)?;
    let Some(command) = command else {
        return Ok(None);
    };

    Ok(Some(format!("{command} -- --port {port}")))
}

fn resolve_optional_package_script_command(
    project: &PackageProject,
    script: &str,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    if !project.scripts.iter().any(|candidate| candidate == script) {
        return Ok(None);
    }

    Ok(Some(format!(
        "{} run {}",
        project.package_manager.executable(),
        script
    )))
}

fn is_vite_strict_port_script(script: &str) -> bool {
    let script = script.to_ascii_lowercase();
    let flags = script.split_whitespace().map(normalize_cli_flag);

    script.contains("vite")
        && flags.clone().any(|flag| flag == "strictport")
        && flags.clone().any(|flag| flag == "port")
}

fn normalize_cli_flag(token: &str) -> String {
    let trimmed = token.trim_matches(|character: char| {
        matches!(
            character,
            '"' | '\'' | '`' | ',' | ';' | '(' | ')' | '[' | ']'
        )
    });

    trimmed
        .split_once('=')
        .map(|(flag, _)| flag)
        .unwrap_or(trimmed)
        .to_ascii_lowercase()
        .replace('-', "")
}

fn find_available_local_port(start: u16, attempts: u16) -> Option<u16> {
    (0..attempts)
        .filter_map(|offset| start.checked_add(offset))
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

impl PackageManager {
    fn executable(self) -> &'static str {
        match self {
            PackageManager::Bun => "bun",
            PackageManager::Npm => "npm",
            PackageManager::Pnpm => "pnpm",
            PackageManager::Yarn => "yarn",
        }
    }

    fn update_command(self) -> &'static str {
        match self {
            PackageManager::Bun => "bun update",
            PackageManager::Npm => "npm update",
            PackageManager::Pnpm => "pnpm update",
            PackageManager::Yarn => "yarn upgrade",
        }
    }
}

fn add_deno_dependency_update_commands(repository_path: &Path, commands: &mut Vec<String>) {
    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["deno.json", "deno.jsonc", "deno.lock"],
    )) {
        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, "deno update"),
        );
    }
}

fn add_deno_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    let task_name = match task {
        ProjectRepositoryTask::StartDevServer => "dev",
        ProjectRepositoryTask::Build => "build",
        _ => return,
    };

    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["deno.json", "deno.jsonc"],
    )) {
        if deno_task_exists(&project_path, task_name) {
            push_unique_command(
                commands,
                command_in_directory(repository_path, &project_path, &format!("deno task {task_name}")),
            );
        }
    }
}

fn deno_task_exists(project_path: &Path, task_name: &str) -> bool {
    let Ok(deno_json) = fs::read_to_string(project_path.join("deno.json")) else {
        return false;
    };
    let Ok(deno_json) = serde_json::from_str::<serde_json::Value>(&deno_json) else {
        return false;
    };

    deno_json
        .get("tasks")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|tasks| tasks.contains_key(task_name))
}

fn add_cargo_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    for cargo_manifest_path in discover_root_or_nested_manifest_paths(repository_path, &["Cargo.toml"]) {
        if let Some(command) = resolve_cargo_task_command(task, repository_path, &cargo_manifest_path) {
            push_unique_command(commands, command);
        }
    }
}

fn resolve_cargo_task_command(
    task: ProjectRepositoryTask,
    repository_path: &Path,
    cargo_manifest_path: &Path,
) -> Option<String> {
    let command = match task {
        ProjectRepositoryTask::InstallDependencies => "cargo fetch",
        ProjectRepositoryTask::UpdateDependencies => "cargo update",
        ProjectRepositoryTask::StartDevServer => "cargo run",
        ProjectRepositoryTask::Build => "cargo build",
        ProjectRepositoryTask::OpenTerminal => return None,
    };

    if cargo_manifest_path
        .parent()
        .is_some_and(|project_path| project_path == repository_path)
    {
        return Some(command.to_owned());
    }

    Some(format!(
        "{command} --manifest-path '{}'",
        escape_powershell_single_quoted(&relative_shell_path(repository_path, cargo_manifest_path))
    ))
}

fn add_pub_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    for pubspec_path in discover_root_or_nested_manifest_paths(repository_path, &["pubspec.yaml"]) {
        let Some(project_path) = pubspec_path.parent() else {
            continue;
        };
        let Some(command) = resolve_pub_task_command(task, project_path) else {
            continue;
        };

        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn resolve_pub_task_command(task: ProjectRepositoryTask, project_path: &Path) -> Option<&'static str> {
    let is_flutter = is_flutter_project(project_path);

    match task {
        ProjectRepositoryTask::InstallDependencies if is_flutter => Some("flutter pub get"),
        ProjectRepositoryTask::InstallDependencies => Some("dart pub get"),
        ProjectRepositoryTask::UpdateDependencies if is_flutter => Some("flutter pub upgrade"),
        ProjectRepositoryTask::UpdateDependencies => Some("dart pub upgrade"),
        ProjectRepositoryTask::StartDevServer if is_flutter => Some("flutter run"),
        ProjectRepositoryTask::Build if is_flutter => Some("flutter build"),
        _ => None,
    }
}

fn add_go_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    for go_mod_path in discover_root_or_nested_manifest_paths(repository_path, &["go.mod"]) {
        let Some(project_path) = go_mod_path.parent() else {
            continue;
        };

        match task {
            ProjectRepositoryTask::InstallDependencies => push_unique_command(
                commands,
                command_in_directory(repository_path, project_path, "go mod download"),
            ),
            ProjectRepositoryTask::UpdateDependencies => {
                push_unique_command(
                    commands,
                    command_in_directory(repository_path, project_path, "go get -u ./..."),
                );
                push_unique_command(
                    commands,
                    command_in_directory(repository_path, project_path, "go mod tidy"),
                );
            }
            ProjectRepositoryTask::StartDevServer => push_unique_command(
                commands,
                command_in_directory(repository_path, project_path, "go run ./..."),
            ),
            ProjectRepositoryTask::Build => push_unique_command(
                commands,
                command_in_directory(repository_path, project_path, "go build ./..."),
            ),
            ProjectRepositoryTask::OpenTerminal => {}
        }
    }
}

fn add_python_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    if !matches!(
        task,
        ProjectRepositoryTask::InstallDependencies | ProjectRepositoryTask::UpdateDependencies
    ) {
        return;
    }

    for project_path in discover_root_or_nested_manifest_directories(
        repository_path,
        &["uv.lock", "poetry.lock", "pdm.lock"],
    ) {
        let command = match task {
            ProjectRepositoryTask::InstallDependencies if project_path.join("uv.lock").is_file() => {
                "uv sync"
            }
            ProjectRepositoryTask::InstallDependencies if project_path.join("poetry.lock").is_file() => {
                "poetry install"
            }
            ProjectRepositoryTask::InstallDependencies if project_path.join("pdm.lock").is_file() => {
                "pdm install"
            }
            ProjectRepositoryTask::UpdateDependencies if project_path.join("uv.lock").is_file() => {
                "uv lock --upgrade"
            }
            ProjectRepositoryTask::UpdateDependencies if project_path.join("poetry.lock").is_file() => {
                "poetry update"
            }
            ProjectRepositoryTask::UpdateDependencies if project_path.join("pdm.lock").is_file() => {
                "pdm update"
            }
            _ => continue,
        };

        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn add_manifest_directory_task_commands(
    repository_path: &Path,
    commands: &mut Vec<String>,
    manifest_file_names: &[&str],
    command: &str,
) {
    for project_path in discover_root_or_nested_manifest_directories(repository_path, manifest_file_names) {
        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn discover_root_or_nested_manifest_paths(
    repository_path: &Path,
    file_names: &[&str],
) -> Vec<PathBuf> {
    if file_names
        .iter()
        .any(|file_name| repository_path.join(file_name).is_file())
    {
        return file_names
            .iter()
            .map(|file_name| repository_path.join(file_name))
            .filter(|path| path.is_file())
            .collect();
    }

    discover_manifest_paths(repository_path, file_names)
}

fn discover_root_or_nested_manifest_directories(
    repository_path: &Path,
    file_names: &[&str],
) -> Vec<PathBuf> {
    unique_manifest_directories(discover_root_or_nested_manifest_paths(
        repository_path,
        file_names,
    ))
}

fn discover_manifest_paths(repository_path: &Path, file_names: &[&str]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    discover_manifest_paths_inner(repository_path, file_names, 0, &mut paths);
    paths.sort();
    paths
}

fn discover_manifest_paths_inner(
    current_path: &Path,
    file_names: &[&str],
    depth: usize,
    paths: &mut Vec<PathBuf>,
) {
    for file_name in file_names {
        let manifest_path = current_path.join(file_name);

        if manifest_path.is_file() {
            paths.push(manifest_path);
        }
    }

    if depth >= DEPENDENCY_DISCOVERY_MAX_DEPTH {
        return;
    }

    let Ok(entries) = fs::read_dir(current_path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() && !should_skip_dependency_discovery_dir(&path) {
            discover_manifest_paths_inner(&path, file_names, depth + 1, paths);
        }
    }
}

fn should_skip_dependency_discovery_dir(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    DEPENDENCY_DISCOVERY_IGNORED_DIRS
        .iter()
        .any(|ignored| file_name.eq_ignore_ascii_case(ignored))
}

fn unique_manifest_directories(manifest_paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut directories = Vec::new();

    for manifest_path in manifest_paths {
        let Some(directory) = manifest_path.parent() else {
            continue;
        };

        if !directories.iter().any(|candidate| candidate == directory) {
            directories.push(directory.to_path_buf());
        }
    }

    directories
}

fn command_in_directory(repository_path: &Path, directory: &Path, command: &str) -> String {
    if directory == repository_path {
        return command.to_owned();
    }

    format!(
        "Push-Location -LiteralPath '{}'; {}; Pop-Location",
        escape_powershell_single_quoted(&relative_shell_path(repository_path, directory)),
        command
    )
}

fn relative_shell_path(repository_path: &Path, path: &Path) -> String {
    path.strip_prefix(repository_path)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_flutter_project(project_path: &Path) -> bool {
    let pubspec = fs::read_to_string(project_path.join("pubspec.yaml")).unwrap_or_default();

    pubspec.contains("sdk: flutter")
        || pubspec.lines().any(|line| line.trim_start() == "flutter:")
        || ["android", "ios", "linux", "macos", "web", "windows"]
            .iter()
            .any(|directory| project_path.join(directory).is_dir())
}

fn push_unique_command(commands: &mut Vec<String>, command: String) {
    if !commands.iter().any(|candidate| candidate == &command) {
        commands.push(command);
    }
}

fn launch_repository_task_terminals(
    workspace_path: &Path,
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &[String],
) -> Result<Vec<ProjectRepositoryTaskRunRecord>, ProjectRepositoryTaskError> {
    let mut run_records = Vec::new();

    for command in commands {
        let run_record = create_task_run_record(workspace_path, repository_path, task, command)?;
        launch_repository_terminal(repository_path, Some(command), Some(&run_record))?;
        run_records.push(run_record);
    }

    Ok(run_records)
}

fn create_task_run_record(
    workspace_path: &Path,
    repository_path: &Path,
    task: ProjectRepositoryTask,
    command: &str,
) -> Result<ProjectRepositoryTaskRunRecord, ProjectRepositoryTaskError> {
    let started_at = current_task_run_timestamp();
    let id = format!(
        "repo_task_{}_{}",
        started_at
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>(),
        task.as_str()
    );
    let record_path = task_run_record_dir(workspace_path).join(format!("{id}.json"));
    let record = ProjectRepositoryTaskRunRecord {
        id,
        task: task.as_str().to_owned(),
        repository_path: crate::git_path::git_process_path(repository_path)
            .to_string_lossy()
            .to_string(),
        command: command.to_owned(),
        state: "running".to_owned(),
        exit_code: None,
        started_at,
        finished_at: None,
        output_tail: None,
        record_path: crate::git_path::git_process_path(&record_path)
            .to_string_lossy()
            .to_string(),
    };

    write_task_run_record(&record_path, &record)?;

    Ok(record)
}

fn write_task_run_record(
    record_path: &Path,
    record: &ProjectRepositoryTaskRunRecord,
) -> Result<(), ProjectRepositoryTaskError> {
    let Some(parent) = record_path.parent() else {
        return Err(ProjectRepositoryTaskError::RecordWriteFailed);
    };
    fs::create_dir_all(parent).map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)?;
    let record_json = serde_json::to_string_pretty(record)
        .map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)?;

    fs::write(record_path, record_json).map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)
}

fn failed_launch_task_run_record(
    record: &ProjectRepositoryTaskRunRecord,
) -> ProjectRepositoryTaskRunRecord {
    ProjectRepositoryTaskRunRecord {
        state: "failed".to_owned(),
        exit_code: None,
        finished_at: Some(current_task_run_timestamp()),
        output_tail: Some("Terminal launch failed before the command could run.".to_owned()),
        ..record.clone()
    }
}

fn task_run_record_dir(workspace_path: &Path) -> PathBuf {
    workspace_path.join(".workduck").join("repository-task-runs")
}

fn current_task_run_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

impl ProjectRepositoryTask {
    fn as_str(self) -> &'static str {
        match self {
            ProjectRepositoryTask::OpenTerminal => "open-terminal",
            ProjectRepositoryTask::InstallDependencies => "install-dependencies",
            ProjectRepositoryTask::UpdateDependencies => "update-dependencies",
            ProjectRepositoryTask::StartDevServer => "start-dev-server",
            ProjectRepositoryTask::Build => "build",
        }
    }
}

#[cfg(target_os = "windows")]
fn launch_repository_terminal(
    repository_path: &Path,
    command: Option<&str>,
    run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<(), ProjectRepositoryTaskError> {
    use std::os::windows::process::CommandExt;

    const CREATE_NEW_CONSOLE: u32 = 0x00000010;

    let terminal = crate::terminal_catalog::find_available_terminal_entry("powershell-core")
        .or_else(|| crate::terminal_catalog::find_available_terminal_entry("windows-powershell"))
        .ok_or(ProjectRepositoryTaskError::TerminalUnavailable)?;
    let executable = terminal
        .executable_path
        .as_deref()
        .unwrap_or(terminal.command);
    let shell_repository_path = crate::git_path::git_process_path(repository_path);
    let script = create_powershell_script(&shell_repository_path, command, run_record);
    let encoded_script = encode_powershell_command(&script);

    Command::new(executable)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NoExit",
            "-EncodedCommand",
            &encoded_script,
        ])
        .current_dir(&shell_repository_path)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map(|_| ())
        .map_err(|_| ProjectRepositoryTaskError::LaunchFailed)
}

#[cfg(not(target_os = "windows"))]
fn launch_repository_terminal(
    _repository_path: &Path,
    _command: Option<&str>,
    _run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<(), ProjectRepositoryTaskError> {
    Err(ProjectRepositoryTaskError::TerminalUnsupportedPlatform)
}

#[cfg(target_os = "windows")]
fn create_powershell_script(
    repository_path: &Path,
    command: Option<&str>,
    run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> String {
    let path = escape_powershell_single_quoted(&repository_path.to_string_lossy());
    let mut script = format!(
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Set-Location -LiteralPath '{}'",
        path
    );

    for command in command
        .into_iter()
        .flat_map(|command| command.lines())
        .map(str::trim)
        .filter(|command| !command.is_empty())
    {
        let escaped_command = escape_powershell_single_quoted(command);

        if let Some(run_record) = run_record {
            script.push_str(&create_tracked_powershell_command(&escaped_command, run_record));
        } else {
            script.push_str(&format!(
                "; Write-Host 'Workduck: {}'; {}; if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {{ Write-Host ('Workduck exit code: ' + $LASTEXITCODE); return }}",
                escaped_command, command
            ));
        }
    }

    script
}

#[cfg(target_os = "windows")]
fn create_tracked_powershell_command(
    escaped_command: &str,
    run_record: &ProjectRepositoryTaskRunRecord,
) -> String {
    let record_path = escape_powershell_single_quoted(&run_record.record_path);
    let log_path = escape_powershell_single_quoted(&format!("{}.log", run_record.record_path));
    let id = escape_powershell_single_quoted(&run_record.id);
    let task = escape_powershell_single_quoted(&run_record.task);
    let repository_path = escape_powershell_single_quoted(&run_record.repository_path);
    let command_json = escape_powershell_single_quoted(&run_record.command);
    let started_at = escape_powershell_single_quoted(&run_record.started_at);

    format!(
        r#";
$workduckRecordPath = '{record_path}';
$workduckLogPath = '{log_path}';
$workduckCommand = '{command_json}';
function Write-WorkduckTaskRunRecord {{
    param([string]$State, [Nullable[int]]$ExitCode, [string]$OutputTail)
    $record = [ordered]@{{
        id = '{id}';
        task = '{task}';
        repositoryPath = '{repository_path}';
        command = $workduckCommand;
        state = $State;
        exitCode = $ExitCode;
        startedAt = '{started_at}';
        finishedAt = if ($State -eq 'running') {{ $null }} else {{ (Get-Date).ToUniversalTime().ToString('o') }};
        outputTail = if ([string]::IsNullOrWhiteSpace($OutputTail)) {{ $null }} else {{ $OutputTail }};
        recordPath = $workduckRecordPath
    }};
    $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $workduckRecordPath -Encoding UTF8
}}
Write-Host 'Workduck: {escaped_command}';
$workduckExitCode = 0;
try {{
    Invoke-Expression $workduckCommand 2>&1 | Tee-Object -FilePath $workduckLogPath -Append;
    if ($LASTEXITCODE -ne $null) {{
        $workduckExitCode = [int]$LASTEXITCODE;
    }} elseif (-not $?) {{
        $workduckExitCode = 1;
    }}
}} catch {{
    $workduckExitCode = 1;
    $_ | Out-String | Tee-Object -FilePath $workduckLogPath -Append;
}}
$workduckTail = if (Test-Path -LiteralPath $workduckLogPath) {{ (Get-Content -LiteralPath $workduckLogPath -Tail 40) -join [Environment]::NewLine }} else {{ '' }};
if ($workduckExitCode -eq 0) {{
    Write-WorkduckTaskRunRecord -State 'succeeded' -ExitCode $workduckExitCode -OutputTail $workduckTail;
}} else {{
    Write-WorkduckTaskRunRecord -State 'failed' -ExitCode $workduckExitCode -OutputTail $workduckTail;
    Write-Host ('Workduck exit code: ' + $workduckExitCode);
    return
}}"#
    )
}

#[cfg(target_os = "windows")]
fn encode_powershell_command(script: &str) -> String {
    let bytes = script
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();

    general_purpose::STANDARD.encode(bytes)
}

fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn failed(error: ProjectRepositoryTaskError) -> ProjectRepositoryTaskResult {
    ProjectRepositoryTaskResult {
        ok: false,
        error: Some(error),
        command: None,
        run_record: None,
    }
}
