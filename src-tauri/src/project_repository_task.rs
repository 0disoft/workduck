use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

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
    #[serde(rename = "project-repository-task-launch-failed")]
    LaunchFailed,
}

#[derive(Clone, Copy)]
enum ProjectRepositoryTask {
    OpenTerminal,
    InstallDependencies,
    StartDevServer,
    Build,
}

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
    let command = match resolve_repository_task_command(task, &repository_path) {
        Ok(command) => command,
        Err(error) => return failed(error),
    };

    match launch_repository_terminal(&repository_path, command.as_deref()) {
        Ok(()) => ProjectRepositoryTaskResult {
            ok: true,
            error: None,
        },
        Err(error) => failed(error),
    }
}

fn parse_task(task: &str) -> Option<ProjectRepositoryTask> {
    match task.trim() {
        "open-terminal" => Some(ProjectRepositoryTask::OpenTerminal),
        "install-dependencies" => Some(ProjectRepositoryTask::InstallDependencies),
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

fn resolve_repository_task_command(
    task: ProjectRepositoryTask,
    repository_path: &Path,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    if matches!(task, ProjectRepositoryTask::OpenTerminal) {
        return Ok(None);
    }

    if let Some(package_project) = read_package_project(repository_path) {
        return resolve_package_task_command(task, &package_project);
    }

    if repository_path.join("Cargo.toml").is_file() {
        return resolve_cargo_task_command(task);
    }

    if repository_path.join("pubspec.yaml").is_file() {
        return resolve_flutter_task_command(task);
    }

    Err(ProjectRepositoryTaskError::CommandUnavailable)
}

struct PackageProject {
    package_manager: PackageManager,
    scripts: Vec<String>,
}

#[derive(Clone, Copy)]
enum PackageManager {
    Bun,
    Npm,
    Pnpm,
    Yarn,
}

fn read_package_project(repository_path: &Path) -> Option<PackageProject> {
    let package_json_path = repository_path.join("package.json");
    let package_json = fs::read_to_string(package_json_path).ok()?;
    let package_json: serde_json::Value = serde_json::from_str(&package_json).ok()?;
    let scripts = package_json
        .get("scripts")
        .and_then(serde_json::Value::as_object)
        .map(|scripts| scripts.keys().map(String::from).collect())
        .unwrap_or_default();
    let package_manager = package_json
        .get("packageManager")
        .and_then(serde_json::Value::as_str)
        .and_then(parse_package_manager)
        .unwrap_or_else(|| detect_package_manager_from_locks(repository_path));

    Some(PackageProject {
        package_manager,
        scripts,
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

fn resolve_package_task_command(
    task: ProjectRepositoryTask,
    project: &PackageProject,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    match task {
        ProjectRepositoryTask::InstallDependencies => Ok(Some(format!(
            "{} install",
            project.package_manager.executable()
        ))),
        ProjectRepositoryTask::StartDevServer => resolve_package_script_command(project, "dev"),
        ProjectRepositoryTask::Build => resolve_package_script_command(project, "build"),
        ProjectRepositoryTask::OpenTerminal => Ok(None),
    }
}

fn resolve_package_script_command(
    project: &PackageProject,
    script: &str,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    if !project.scripts.iter().any(|candidate| candidate == script) {
        return Err(ProjectRepositoryTaskError::CommandUnavailable);
    }

    Ok(Some(format!(
        "{} run {}",
        project.package_manager.executable(),
        script
    )))
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
}

fn resolve_cargo_task_command(
    task: ProjectRepositoryTask,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    match task {
        ProjectRepositoryTask::InstallDependencies => Ok(Some("cargo fetch".to_owned())),
        ProjectRepositoryTask::StartDevServer => Ok(Some("cargo run".to_owned())),
        ProjectRepositoryTask::Build => Ok(Some("cargo build".to_owned())),
        ProjectRepositoryTask::OpenTerminal => Ok(None),
    }
}

fn resolve_flutter_task_command(
    task: ProjectRepositoryTask,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    match task {
        ProjectRepositoryTask::InstallDependencies => Ok(Some("flutter pub get".to_owned())),
        ProjectRepositoryTask::StartDevServer => Ok(Some("flutter run".to_owned())),
        ProjectRepositoryTask::Build => Ok(Some("flutter build".to_owned())),
        ProjectRepositoryTask::OpenTerminal => Ok(None),
    }
}

#[cfg(target_os = "windows")]
fn launch_repository_terminal(
    repository_path: &Path,
    command: Option<&str>,
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
    let script = create_powershell_script(repository_path, command);

    Command::new(executable)
        .args(["-NoLogo", "-NoProfile", "-NoExit", "-Command", &script])
        .current_dir(repository_path)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map(|_| ())
        .map_err(|_| ProjectRepositoryTaskError::LaunchFailed)
}

#[cfg(not(target_os = "windows"))]
fn launch_repository_terminal(
    _repository_path: &Path,
    _command: Option<&str>,
) -> Result<(), ProjectRepositoryTaskError> {
    Err(ProjectRepositoryTaskError::TerminalUnavailable)
}

#[cfg(target_os = "windows")]
fn create_powershell_script(repository_path: &Path, command: Option<&str>) -> String {
    let path = escape_powershell_single_quoted(&repository_path.to_string_lossy());
    let mut script = format!(
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Set-Location -LiteralPath '{}'",
        path
    );

    if let Some(command) = command {
        script.push_str("; ");
        script.push_str(command);
    }

    script
}

#[cfg(target_os = "windows")]
fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn failed(error: ProjectRepositoryTaskError) -> ProjectRepositoryTaskResult {
    ProjectRepositoryTaskResult {
        ok: false,
        error: Some(error),
    }
}
