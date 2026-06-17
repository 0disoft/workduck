use std::{
    collections::{HashMap, HashSet},
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::SystemTime,
};

use base64::{Engine as _, engine::general_purpose};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::workspace_path::{
    WorkspacePathValidationError, validate_absolute_directory_path, validate_workspace_directory_path,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    process_id: Option<u32>,
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
    Preview,
}

#[derive(Clone)]
struct CachedTaskRunRecordFile {
    len: u64,
    modified_at: Option<SystemTime>,
    record: Option<ProjectRepositoryTaskRunRecord>,
}

#[derive(Default)]
struct WorkspaceTaskRunRecordCache {
    files: HashMap<String, CachedTaskRunRecordFile>,
    dir_len: u64,
    dir_modified_at: Option<SystemTime>,
    latest_records: Vec<ProjectRepositoryTaskRunRecord>,
}

#[derive(Default)]
struct TaskRunRecordCache {
    record_dirs: HashMap<PathBuf, WorkspaceTaskRunRecordCache>,
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
        (
            launch_repository_terminal(&repository_path, None, None).map(|_| ()),
            None,
        )
    } else if matches!(
        task,
        ProjectRepositoryTask::StartDevServer | ProjectRepositoryTask::Preview
    ) && commands.len() > 1
    {
        match launch_repository_task_terminals(&workspace_path, &repository_path, task, &commands) {
            Ok(records) => (Ok(()), records.into_iter().next()),
            Err(error) => (Err(error), None),
        }
    } else {
        let mut run_record = match create_task_run_record(
            &workspace_path,
            &repository_path,
            task,
            command.as_deref().unwrap_or(""),
        ) {
            Ok(record) => record,
            Err(error) => return failed(error),
        };
        let launch_result =
            launch_repository_terminal(&repository_path, command.as_deref(), Some(&run_record))
                .and_then(|process_id| attach_task_process_id(&mut run_record, process_id));

        (launch_result, Some(run_record))
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
    let visible_workspace_path = crate::git_path::git_process_path(&workspace_path);
    let records = match read_latest_cached_task_run_records(&record_dir, &visible_workspace_path) {
        Ok(records) => records,
        Err(error) => {
            return ProjectRepositoryTaskRunRecordsResult {
                ok: false,
                records: None,
                error: Some(error),
            };
        }
    };

    ProjectRepositoryTaskRunRecordsResult {
        ok: true,
        records: Some(records),
        error: None,
    }
}

fn read_latest_cached_task_run_records(
    record_dir: &Path,
    visible_workspace_path: &Path,
) -> Result<Vec<ProjectRepositoryTaskRunRecord>, ProjectRepositoryTaskError> {
    let metadata = match fs::metadata(record_dir) {
        Ok(metadata) if metadata.is_dir() => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            clear_cached_task_run_records(record_dir);
            return Ok(Vec::new());
        }
        Err(_) => return Err(ProjectRepositoryTaskError::RecordReadFailed),
        Ok(_) => return Err(ProjectRepositoryTaskError::RecordReadFailed),
    };
    let dir_len = metadata.len();
    let dir_modified_at = metadata.modified().ok();
    let mut cache = task_run_record_cache()
        .lock()
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;
    let workspace_cache = cache.record_dirs.entry(record_dir.to_path_buf()).or_default();

    if workspace_cache.is_fresh(dir_len, dir_modified_at) {
        return Ok(workspace_cache.latest_records.clone());
    }

    let entries = fs::read_dir(record_dir)
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;
    let mut seen_files = HashSet::new();

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        if !metadata.is_file() {
            continue;
        }

        seen_files.insert(file_name.clone());

        let len = metadata.len();
        let modified_at = metadata.modified().ok();
        let cached_file = workspace_cache.files.get(&file_name);

        if cached_file.is_some_and(|cached| {
            modified_at.is_some() && cached.len == len && cached.modified_at == modified_at
        })
        {
            continue;
        }

        workspace_cache.files.insert(
            file_name,
            CachedTaskRunRecordFile {
                len,
                modified_at,
                record: read_visible_task_run_record(&path, visible_workspace_path),
            },
        );
    }

    workspace_cache
        .files
        .retain(|file_name, _| seen_files.contains(file_name));

    let records = workspace_cache
        .files
        .values()
        .filter_map(|cached| cached.record.clone())
        .collect();
    let live_processes = collect_live_task_processes().ok();
    let records = reconcile_running_task_run_records(records, live_processes.as_deref());
    persist_reconciled_task_run_records(&records);
    workspace_cache.dir_len = dir_len;
    workspace_cache.dir_modified_at = dir_modified_at;
    workspace_cache.latest_records = latest_task_run_records_by_repository(records);

    Ok(workspace_cache.latest_records.clone())
}

fn task_run_record_cache() -> &'static Mutex<TaskRunRecordCache> {
    static TASK_RUN_RECORD_CACHE: OnceLock<Mutex<TaskRunRecordCache>> = OnceLock::new();

    TASK_RUN_RECORD_CACHE.get_or_init(|| Mutex::new(TaskRunRecordCache::default()))
}

fn clear_cached_task_run_records(record_dir: &Path) {
    if let Ok(mut cache) = task_run_record_cache().lock() {
        cache.record_dirs.remove(record_dir);
    }
}

impl WorkspaceTaskRunRecordCache {
    fn is_fresh(&self, dir_len: u64, dir_modified_at: Option<SystemTime>) -> bool {
        if dir_modified_at.is_none()
            || self.dir_len != dir_len
            || self.dir_modified_at != dir_modified_at
        {
            return false;
        }

        !self
            .latest_records
            .iter()
            .any(|record| record.state == "running")
    }
}

fn read_visible_task_run_record(
    path: &Path,
    visible_workspace_path: &Path,
) -> Option<ProjectRepositoryTaskRunRecord> {
    let record_json = fs::read_to_string(path).ok()?;
    let record = serde_json::from_str::<ProjectRepositoryTaskRunRecord>(&record_json).ok()?;
    let repository_path = PathBuf::from(&record.repository_path);

    repository_path
        .starts_with(visible_workspace_path)
        .then_some(record)
}

fn latest_task_run_records_by_repository(
    records: Vec<ProjectRepositoryTaskRunRecord>,
) -> Vec<ProjectRepositoryTaskRunRecord> {
    let mut latest_records = HashMap::new();

    for record in records {
        let repository_path = record.repository_path.clone();

        if latest_records
            .get(&repository_path)
            .is_some_and(|existing| !is_newer_task_run_record(&record, existing))
        {
            continue;
        }

        latest_records.insert(repository_path, record);
    }

    let mut records = latest_records.into_values().collect::<Vec<_>>();
    records.sort_by(compare_task_run_records_descending);
    records
}

fn is_newer_task_run_record(
    candidate: &ProjectRepositoryTaskRunRecord,
    current: &ProjectRepositoryTaskRunRecord,
) -> bool {
    candidate.started_at > current.started_at
        || (candidate.started_at == current.started_at && candidate.id > current.id)
}

fn compare_task_run_records_descending(
    left: &ProjectRepositoryTaskRunRecord,
    right: &ProjectRepositoryTaskRunRecord,
) -> std::cmp::Ordering {
    right
        .started_at
        .cmp(&left.started_at)
        .then(right.id.cmp(&left.id))
}

fn parse_task(task: &str) -> Option<ProjectRepositoryTask> {
    match task.trim() {
        "open-terminal" => Some(ProjectRepositoryTask::OpenTerminal),
        "install-dependencies" => Some(ProjectRepositoryTask::InstallDependencies),
        "update-dependencies" => Some(ProjectRepositoryTask::UpdateDependencies),
        "start-dev-server" => Some(ProjectRepositoryTask::StartDevServer),
        "build" => Some(ProjectRepositoryTask::Build),
        "preview" => Some(ProjectRepositoryTask::Preview),
        _ => None,
    }
}

fn validate_workspace_path(path: &str) -> Result<PathBuf, ProjectRepositoryTaskError> {
    validate_workspace_directory_path(path).map_err(map_workspace_path_error)
}

fn map_workspace_path_error(error: WorkspacePathValidationError) -> ProjectRepositoryTaskError {
    match error {
        WorkspacePathValidationError::Required => ProjectRepositoryTaskError::WorkspaceRequired,
        WorkspacePathValidationError::NotAbsolute => ProjectRepositoryTaskError::WorkspaceNotAbsolute,
        WorkspacePathValidationError::NotFound => ProjectRepositoryTaskError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => {
            ProjectRepositoryTaskError::WorkspaceNotDirectory
        }
        WorkspacePathValidationError::PermissionDenied | WorkspacePathValidationError::Unreadable => {
            ProjectRepositoryTaskError::WorkspaceUnreadable
        }
    }
}

fn validate_repository_path(
    workspace_path: &Path,
    path: &str,
) -> Result<PathBuf, ProjectRepositoryTaskError> {
    let canonical_path =
        validate_absolute_directory_path(path).map_err(map_repository_path_error)?;

    if !canonical_path.starts_with(workspace_path) {
        return Err(ProjectRepositoryTaskError::RepositoryPathOutsideWorkspace);
    }

    Ok(canonical_path)
}

fn map_repository_path_error(error: WorkspacePathValidationError) -> ProjectRepositoryTaskError {
    match error {
        WorkspacePathValidationError::Required => ProjectRepositoryTaskError::RepositoryPathRequired,
        WorkspacePathValidationError::NotAbsolute => {
            ProjectRepositoryTaskError::RepositoryPathNotAbsolute
        }
        WorkspacePathValidationError::NotFound => ProjectRepositoryTaskError::RepositoryPathNotFound,
        WorkspacePathValidationError::NotDirectory => {
            ProjectRepositoryTaskError::RepositoryPathNotDirectory
        }
        WorkspacePathValidationError::PermissionDenied | WorkspacePathValidationError::Unreadable => {
            ProjectRepositoryTaskError::RepositoryPathUnreadable
        }
    }
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
        ProjectRepositoryTask::Preview => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_deno_task_commands(repository_path, task, &mut commands);
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
    scripts: HashMap<String, String>,
    local_dependency_paths: Vec<PathBuf>,
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
    let scripts = scripts
        .into_iter()
        .filter_map(|(name, command)| command.as_str().map(|command| (name, command.to_owned())))
        .collect();
    let package_manager = package_json
        .get("packageManager")
        .and_then(serde_json::Value::as_str)
        .and_then(parse_package_manager)
        .unwrap_or_else(|| detect_package_manager_from_locks(project_path));

    Some(PackageProject {
        package_manager,
        scripts,
        local_dependency_paths: collect_local_package_dependency_paths(project_path, &package_json),
    })
}

fn collect_local_package_dependency_paths(
    project_path: &Path,
    package_json: &serde_json::Value,
) -> Vec<PathBuf> {
    let mut local_dependency_paths = Vec::new();

    for section in [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
    ] {
        let Some(dependencies) = package_json
            .get(section)
            .and_then(serde_json::Value::as_object)
        else {
            continue;
        };

        for dependency in dependencies.values().filter_map(serde_json::Value::as_str) {
            let Some(dependency_path) =
                resolve_local_package_dependency_path(project_path, dependency)
            else {
                continue;
            };

            if !local_dependency_paths
                .iter()
                .any(|existing_path| existing_path == &dependency_path)
            {
                local_dependency_paths.push(dependency_path);
            }
        }
    }

    local_dependency_paths
}

fn resolve_local_package_dependency_path(project_path: &Path, dependency: &str) -> Option<PathBuf> {
    let relative_path = dependency.strip_prefix("file:")?.trim();

    if relative_path.is_empty() {
        return None;
    }

    let dependency_path = project_path.join(relative_path);

    if !dependency_path.join("package.json").is_file() {
        return None;
    }

    Some(fs::canonicalize(&dependency_path).unwrap_or(dependency_path))
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
    for project_path in discover_package_project_paths(repository_path, task) {
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

fn discover_package_project_paths(
    repository_path: &Path,
    task: ProjectRepositoryTask,
) -> Vec<PathBuf> {
    let mut project_paths = Vec::new();
    let root_project = read_package_project_at(repository_path);

    if root_project.is_some() {
        project_paths.push(repository_path.to_path_buf());
    }

    if root_project_has_task_script(task, root_project.as_ref()) {
        return project_paths;
    }

    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["package.json"],
    )) {
        if !project_paths.contains(&project_path) {
            project_paths.push(project_path);
        }
    }

    filter_local_dependency_package_project_paths(project_paths)
}

fn root_project_has_task_script(
    task: ProjectRepositoryTask,
    root_project: Option<&PackageProject>,
) -> bool {
    if !matches!(
        task,
        ProjectRepositoryTask::StartDevServer
            | ProjectRepositoryTask::Build
            | ProjectRepositoryTask::Preview
    ) {
        return false;
    }

    root_project
        .and_then(|project| resolve_package_task_command(task, project).ok().flatten())
        .is_some()
}

fn filter_local_dependency_package_project_paths(project_paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let local_dependency_paths = project_paths
        .iter()
        .filter_map(|project_path| read_package_project_at(project_path))
        .flat_map(|project| project.local_dependency_paths)
        .collect::<Vec<_>>();

    if local_dependency_paths.is_empty() {
        return project_paths;
    }

    project_paths
        .into_iter()
        .enumerate()
        .filter_map(|(index, project_path)| {
            if index == 0
                || !is_local_dependency_package_project_path(&project_path, &local_dependency_paths)
            {
                Some(project_path)
            } else {
                None
            }
        })
        .collect()
}

fn is_local_dependency_package_project_path(
    project_path: &Path,
    local_dependency_paths: &[PathBuf],
) -> bool {
    let normalized_project_path =
        fs::canonicalize(project_path).unwrap_or_else(|_| project_path.to_path_buf());

    local_dependency_paths
        .iter()
        .any(|dependency_path| dependency_path == &normalized_project_path)
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
        ProjectRepositoryTask::Preview => resolve_optional_package_script_command(project, "preview"),
        ProjectRepositoryTask::OpenTerminal => Ok(None),
    }
}

fn resolve_package_dev_server_command(
    project: &PackageProject,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    let Some((script, script_command)) = resolve_package_dev_server_script(project) else {
        return Ok(None);
    };

    let command = resolve_optional_package_script_command(project, script)?;

    if script != "dev" || !is_vite_strict_port_script(script_command) {
        return Ok(command);
    }

    let port =
        find_available_local_port(5173, 40).ok_or(ProjectRepositoryTaskError::CommandUnavailable)?;
    let Some(command) = command else {
        return Ok(None);
    };

    Ok(Some(format!("{command} -- --port {port}")))
}

fn resolve_package_dev_server_script(project: &PackageProject) -> Option<(&'static str, &str)> {
    for script in ["dev", "start"] {
        if let Some(command) = project.scripts.get(script) {
            return Some((script, command));
        }
    }

    None
}

fn resolve_optional_package_script_command(
    project: &PackageProject,
    script: &str,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    if !project.scripts.contains_key(script) {
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
        ProjectRepositoryTask::Preview => "preview",
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
        ProjectRepositoryTask::Preview => return None,
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
            ProjectRepositoryTask::Preview => {}
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
    let mut seen = HashSet::new();
    let mut directories = Vec::new();

    for manifest_path in manifest_paths {
        let Some(directory) = manifest_path.parent() else {
            continue;
        };
        let directory = directory.to_path_buf();

        if seen.insert(directory.clone()) {
            directories.push(directory);
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
        let mut run_record = create_task_run_record(workspace_path, repository_path, task, command)?;
        let process_id = launch_repository_terminal(repository_path, Some(command), Some(&run_record))?;
        attach_task_process_id(&mut run_record, process_id)?;
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
        process_id: None,
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

fn attach_task_process_id(
    record: &mut ProjectRepositoryTaskRunRecord,
    process_id: Option<u32>,
) -> Result<(), ProjectRepositoryTaskError> {
    let Some(process_id) = process_id else {
        return Ok(());
    };

    record.process_id = Some(process_id);
    write_task_run_record(&PathBuf::from(&record.record_path), record)
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

#[derive(Clone)]
struct LiveTaskProcess {
    pid: u32,
    parent_process_id: Option<u32>,
    command_line: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLiveTaskProcessPayload {
    #[serde(default)]
    processes: Vec<RawLiveTaskProcessRecord>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLiveTaskProcessRecord {
    pid: u32,
    parent_process_id: Option<u32>,
    name: Option<String>,
    executable_path: Option<String>,
    command_line: Option<String>,
}

fn reconcile_running_task_run_records(
    records: Vec<ProjectRepositoryTaskRunRecord>,
    live_processes: Option<&[LiveTaskProcess]>,
) -> Vec<ProjectRepositoryTaskRunRecord> {
    let Some(live_processes) = live_processes else {
        return records;
    };

    records
        .into_iter()
        .map(|record| {
            if is_stale_running_task_record(&record, live_processes) {
                stopped_task_run_record(&record)
            } else {
                record
            }
        })
        .collect()
}

fn is_stale_running_task_record(
    record: &ProjectRepositoryTaskRunRecord,
    live_processes: &[LiveTaskProcess],
) -> bool {
    if record.state != "running" {
        return false;
    }

    if is_long_running_task(record.task.as_str()) {
        return !is_long_running_task_process_alive(record, live_processes);
    }

    if is_terminal_task(record.task.as_str()) {
        return !is_tracked_task_process_alive(record, live_processes);
    }

    false
}

fn is_terminal_task(task: &str) -> bool {
    task == ProjectRepositoryTask::InstallDependencies.as_str()
        || task == ProjectRepositoryTask::UpdateDependencies.as_str()
        || task == ProjectRepositoryTask::Build.as_str()
}

fn is_long_running_task(task: &str) -> bool {
    task == ProjectRepositoryTask::StartDevServer.as_str()
        || task == ProjectRepositoryTask::Preview.as_str()
}

fn is_tracked_task_process_alive(
    record: &ProjectRepositoryTaskRunRecord,
    live_processes: &[LiveTaskProcess],
) -> bool {
    if let Some(process_id) = record.process_id {
        return live_processes
            .iter()
            .find(|process| process.pid == process_id)
            .is_some_and(|process| live_process_matches_task_record(process, record));
    }

    false
}

fn is_long_running_task_process_alive(
    record: &ProjectRepositoryTaskRunRecord,
    live_processes: &[LiveTaskProcess],
) -> bool {
    if let Some(process_id) = record.process_id {
        if has_live_descendant_task_process(process_id, live_processes) {
            return true;
        }
    }

    let repository_path = normalize_process_match_text(&record.repository_path);

    if repository_path.is_empty() {
        return false;
    }

    live_processes.iter().any(|process| {
        long_running_process_matches_repository(process, &repository_path)
    })
}

fn has_live_descendant_task_process(
    ancestor_pid: u32,
    live_processes: &[LiveTaskProcess],
) -> bool {
    let parent_process_id_by_pid = live_processes
        .iter()
        .filter_map(|process| {
            process
                .parent_process_id
                .map(|parent_process_id| (process.pid, parent_process_id))
        })
        .collect::<HashMap<_, _>>();

    live_processes.iter().any(|process| {
        process.pid != ancestor_pid
            && !is_terminal_host_process(process)
            && is_descendant_process(process.pid, ancestor_pid, &parent_process_id_by_pid)
    })
}

fn is_descendant_process(
    process_id: u32,
    ancestor_pid: u32,
    parent_process_id_by_pid: &HashMap<u32, u32>,
) -> bool {
    let mut current_pid = process_id;
    let mut seen = HashSet::new();

    while let Some(parent_pid) = parent_process_id_by_pid.get(&current_pid).copied() {
        if parent_pid == ancestor_pid {
            return true;
        }

        if parent_pid == 0 || !seen.insert(parent_pid) {
            return false;
        }

        current_pid = parent_pid;
    }

    false
}

fn long_running_process_matches_repository(
    process: &LiveTaskProcess,
    repository_path: &str,
) -> bool {
    !is_terminal_host_process(process)
        && normalize_process_match_text(&process.command_line).contains(repository_path)
}

fn is_terminal_host_process(process: &LiveTaskProcess) -> bool {
    let command_line = normalize_process_match_text(&process.command_line);

    command_line.contains("powershell")
        || command_line.contains("pwsh")
        || command_line.contains("cmd.exe")
}

fn live_process_matches_task_record(
    process: &LiveTaskProcess,
    record: &ProjectRepositoryTaskRunRecord,
) -> bool {
    let command_line = normalize_process_match_text(&process.command_line);
    let repository_path = normalize_process_match_text(&record.repository_path);

    if !repository_path.is_empty() && command_line.contains(&repository_path) {
        return true;
    }

    let command = normalize_process_match_text(&record.command);

    !command.is_empty()
        && command
            .split_whitespace()
            .filter(|part| part.len() >= 3)
            .all(|part| command_line.contains(part))
}

fn stopped_task_run_record(
    record: &ProjectRepositoryTaskRunRecord,
) -> ProjectRepositoryTaskRunRecord {
    ProjectRepositoryTaskRunRecord {
        state: "stopped".to_owned(),
        exit_code: None,
        finished_at: Some(current_task_run_timestamp()),
        output_tail: Some(
            "Workduck could not find the terminal process for this repository task."
                .to_owned(),
        ),
        ..record.clone()
    }
}

fn persist_reconciled_task_run_records(records: &[ProjectRepositoryTaskRunRecord]) {
    for record in records
        .iter()
        .filter(|record| record.state == "stopped")
    {
        let _ = write_task_run_record(&PathBuf::from(&record.record_path), record);
    }
}

fn normalize_process_match_text(value: &str) -> String {
    let mut normalized = value.replace('\\', "/").to_ascii_lowercase();

    if let Some(decoded_command) = decode_powershell_encoded_command(value) {
        normalized.push(' ');
        normalized.push_str(&decoded_command.replace('\\', "/").to_ascii_lowercase());
    }

    normalized
}

fn decode_powershell_encoded_command(command_line: &str) -> Option<String> {
    let encoded_command = find_powershell_encoded_command(command_line)?;
    let bytes = general_purpose::STANDARD.decode(encoded_command).ok()?;
    let mut code_units = Vec::with_capacity(bytes.len() / 2);
    let mut chunks = bytes.chunks_exact(2);

    for chunk in &mut chunks {
        code_units.push(u16::from_le_bytes([chunk[0], chunk[1]]));
    }

    if !chunks.remainder().is_empty() {
        return None;
    }

    String::from_utf16(&code_units).ok()
}

fn find_powershell_encoded_command(command_line: &str) -> Option<&str> {
    let mut previous_was_encoded_command = false;

    for part in command_line.split_whitespace() {
        if previous_was_encoded_command {
            let encoded = part.trim_matches(|character| character == '"' || character == '\'');
            return (!encoded.is_empty()).then_some(encoded);
        }

        previous_was_encoded_command =
            part.eq_ignore_ascii_case("-encodedcommand") || part.eq_ignore_ascii_case("-enc");
    }

    None
}

#[cfg(target_os = "windows")]
fn collect_live_task_processes() -> Result<Vec<LiveTaskProcess>, ProjectRepositoryTaskError> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let current_pid = std::process::id();
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$currentPid = $PID
$workduckPid = __WORKDUCK_PID__
$processes = @(
  Get-CimInstance Win32_Process |
    Where-Object { $_.ProcessId -ne $currentPid -and $_.ProcessId -ne $workduckPid } |
    ForEach-Object {
        [PSCustomObject]@{
        pid = [int]$_.ProcessId
        parentProcessId = if ($_.ParentProcessId -ne $null) { [int]$_.ParentProcessId } else { $null }
        name = [string]$_.Name
        executablePath = [string]$_.ExecutablePath
        commandLine = [string]$_.CommandLine
      }
    }
)
[PSCustomObject]@{
  processes = $processes
} | ConvertTo-Json -Depth 4 -Compress
"#
    .replace("__WORKDUCK_PID__", &current_pid.to_string());

    let output = Command::new("powershell.exe")
        .arg("-NoLogo")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;

    if !output.status.success() {
        return Err(ProjectRepositoryTaskError::RecordReadFailed);
    }

    parse_live_task_processes(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(target_os = "windows"))]
fn collect_live_task_processes() -> Result<Vec<LiveTaskProcess>, ProjectRepositoryTaskError> {
    let output = Command::new("ps")
        .arg("-eo")
        .arg("pid=,ppid=,comm=,args=")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;

    if !output.status.success() {
        return Err(ProjectRepositoryTaskError::RecordReadFailed);
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_live_unix_task_process_line)
        .collect())
}

fn parse_live_task_processes(value: &str) -> Result<Vec<LiveTaskProcess>, ProjectRepositoryTaskError> {
    let payload = serde_json::from_str::<RawLiveTaskProcessPayload>(value.trim())
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;

    Ok(payload
        .processes
        .into_iter()
        .map(|process| LiveTaskProcess {
            pid: process.pid,
            parent_process_id: process.parent_process_id,
            command_line: format!(
                "{} {} {}",
                process.name.unwrap_or_default(),
                process.executable_path.unwrap_or_default(),
                process.command_line.unwrap_or_default()
            ),
        })
        .collect())
}

#[cfg(not(target_os = "windows"))]
fn parse_live_unix_task_process_line(line: &str) -> Option<LiveTaskProcess> {
    let trimmed = line.trim();
    let (pid_text, remainder) = trimmed.split_once(char::is_whitespace)?;
    let (parent_pid_text, command_line) = remainder.trim().split_once(char::is_whitespace)?;
    Some(LiveTaskProcess {
        pid: pid_text.parse::<u32>().ok()?,
        parent_process_id: parent_pid_text.parse::<u32>().ok(),
        command_line: command_line.trim().to_owned(),
    })
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
            ProjectRepositoryTask::Preview => "preview",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_task_run_records_keep_newest_record_per_repository() {
        let records = latest_task_run_records_by_repository(vec![
            task_run_record("repo-a-old", "C:/workspace/repo-a", "2026-05-23T01:00:00Z"),
            task_run_record("repo-b", "C:/workspace/repo-b", "2026-05-23T02:00:00Z"),
            task_run_record("repo-a-new", "C:/workspace/repo-a", "2026-05-23T03:00:00Z"),
        ]);

        let ids = records
            .iter()
            .map(|record| record.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["repo-a-new", "repo-b"]);
    }

    #[test]
    fn latest_task_run_records_use_id_as_timestamp_tie_breaker() {
        let records = latest_task_run_records_by_repository(vec![
            task_run_record("repo-a-1", "C:/workspace/repo-a", "2026-05-23T01:00:00Z"),
            task_run_record("repo-a-2", "C:/workspace/repo-a", "2026-05-23T01:00:00Z"),
        ]);

        assert_eq!(records[0].id, "repo-a-2");
    }

    fn task_run_record(
        id: &str,
        repository_path: &str,
        started_at: &str,
    ) -> ProjectRepositoryTaskRunRecord {
        ProjectRepositoryTaskRunRecord {
            id: id.to_owned(),
            task: ProjectRepositoryTask::Build.as_str().to_owned(),
            repository_path: repository_path.to_owned(),
            command: "bun run build".to_owned(),
            state: "succeeded".to_owned(),
            process_id: None,
            exit_code: Some(0),
            started_at: started_at.to_owned(),
            finished_at: Some(started_at.to_owned()),
            output_tail: None,
            record_path: format!("{id}.json"),
        }
    }

    fn temp_repository_path(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let repository_path = std::env::temp_dir().join(format!(
            "workduck-project-repository-task-{name}-{}-{nanos}",
            std::process::id()
        ));

        fs::create_dir_all(&repository_path).expect("create temporary repository");

        repository_path
    }

    fn live_task_process(
        pid: u32,
        parent_process_id: Option<u32>,
        command_line: &str,
    ) -> LiveTaskProcess {
        LiveTaskProcess {
            pid,
            parent_process_id,
            command_line: command_line.to_owned(),
        }
    }

    #[test]
    fn package_dev_server_command_uses_start_script_when_dev_is_missing() {
        let project = PackageProject {
            package_manager: PackageManager::Bun,
            scripts: HashMap::from([("start".to_owned(), "bun server.ts".to_owned())]),
            local_dependency_paths: Vec::new(),
        };

        let command = match resolve_package_dev_server_command(&project) {
            Ok(command) => command,
            Err(_) => panic!("resolve command"),
        };

        assert_eq!(command, Some("bun run start".to_owned()));
    }

    #[test]
    fn package_dev_server_command_prefers_dev_over_start() {
        let project = PackageProject {
            package_manager: PackageManager::Bun,
            scripts: HashMap::from([
                ("dev".to_owned(), "vite dev".to_owned()),
                ("start".to_owned(), "bun server.ts".to_owned()),
            ]),
            local_dependency_paths: Vec::new(),
        };

        let command = match resolve_package_dev_server_command(&project) {
            Ok(command) => command,
            Err(_) => panic!("resolve command"),
        };

        assert_eq!(command, Some("bun run dev".to_owned()));
    }

    #[test]
    fn package_preview_command_uses_preview_script() {
        let project = PackageProject {
            package_manager: PackageManager::Bun,
            scripts: HashMap::from([("preview".to_owned(), "vite preview".to_owned())]),
            local_dependency_paths: Vec::new(),
        };

        let command = match resolve_package_task_command(ProjectRepositoryTask::Preview, &project)
        {
            Ok(command) => command,
            Err(_) => panic!("resolve command"),
        };

        assert_eq!(command, Some("bun run preview".to_owned()));
    }

    #[test]
    fn package_preview_command_is_missing_without_preview_script() {
        let project = PackageProject {
            package_manager: PackageManager::Bun,
            scripts: HashMap::from([("build".to_owned(), "vite build".to_owned())]),
            local_dependency_paths: Vec::new(),
        };

        let command = match resolve_package_task_command(ProjectRepositoryTask::Preview, &project)
        {
            Ok(command) => command,
            Err(_) => panic!("resolve command"),
        };

        assert_eq!(command, None);
    }

    #[test]
    fn repository_task_commands_prefer_root_script_over_nested_package_scripts() {
        let repository_path = temp_repository_path("root-script");
        fs::create_dir_all(repository_path.join("apps/workbench")).expect("create nested package");
        fs::write(
            repository_path.join("package.json"),
            r#"{
                "packageManager": "bun@1.0.0",
                "scripts": {
                    "dev": "bun run ./scripts/dev-workbench.ts",
                    "build": "bun run ./scripts/build-workbench.ts",
                    "preview": "bun run ./scripts/preview-workbench.ts"
                }
            }"#,
        )
        .expect("write root package");
        fs::write(
            repository_path.join("apps/workbench/package.json"),
            r#"{
                "packageManager": "bun@1.0.0",
                "scripts": {
                    "dev": "astro dev",
                    "build": "astro build",
                    "preview": "astro preview"
                }
            }"#,
        )
        .expect("write nested package");

        let dev_commands = match resolve_repository_task_commands(
            ProjectRepositoryTask::StartDevServer,
            &repository_path,
        ) {
            Ok(commands) => commands,
            Err(_) => panic!("resolve dev command"),
        };
        let build_commands = match resolve_repository_task_commands(
            ProjectRepositoryTask::Build,
            &repository_path,
        ) {
            Ok(commands) => commands,
            Err(_) => panic!("resolve build command"),
        };
        let preview_commands = match resolve_repository_task_commands(
            ProjectRepositoryTask::Preview,
            &repository_path,
        ) {
            Ok(commands) => commands,
            Err(_) => panic!("resolve preview command"),
        };

        assert_eq!(dev_commands, vec!["bun run dev"]);
        assert_eq!(build_commands, vec!["bun run build"]);
        assert_eq!(preview_commands, vec!["bun run preview"]);

        let _ = fs::remove_dir_all(repository_path);
    }

    #[test]
    fn install_dependency_commands_skip_local_file_package_targets() {
        let repository_path = temp_repository_path("local-file-dependencies");
        fs::create_dir_all(repository_path.join("apps/workbench")).expect("create nested package");
        fs::create_dir_all(repository_path.join("scripts/telemetry")).expect("create local package");
        fs::write(
            repository_path.join("package.json"),
            r#"{
                "packageManager": "bun@1.0.0",
                "dependencies": {
                    "@taskmesh/telemetry": "file:./scripts/telemetry"
                }
            }"#,
        )
        .expect("write root package");
        fs::write(
            repository_path.join("apps/workbench/package.json"),
            r#"{
                "packageManager": "bun@1.0.0",
                "devDependencies": {
                    "@taskmesh/telemetry": "file:../../scripts/telemetry"
                }
            }"#,
        )
        .expect("write nested package");
        fs::write(
            repository_path.join("scripts/telemetry/package.json"),
            r#"{
                "name": "@taskmesh/telemetry",
                "version": "0.0.0"
            }"#,
        )
        .expect("write local package");

        let commands = match resolve_repository_task_commands(
            ProjectRepositoryTask::InstallDependencies,
            &repository_path,
        ) {
            Ok(commands) => commands,
            Err(_) => panic!("resolve install commands"),
        };

        assert_eq!(
            commands,
            vec![
                "bun install",
                "Push-Location -LiteralPath 'apps/workbench'; bun install; Pop-Location"
            ]
        );

        let _ = fs::remove_dir_all(repository_path);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn powershell_script_executes_each_tracked_command_line_once() {
        let run_record = ProjectRepositoryTaskRunRecord {
            command:
                "bun install\nPush-Location -LiteralPath 'apps/workbench'; bun install; Pop-Location"
                    .to_owned(),
            ..task_run_record(
                "repo-a-install",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        };
        let script = create_powershell_script(
            Path::new("C:/workspace/repo-a"),
            Some(&run_record.command),
            Some(&run_record),
        );

        assert!(script.contains("Write-Host 'Workduck: bun install'"));
        assert!(script.contains(
            "Write-Host 'Workduck: Push-Location -LiteralPath ''apps/workbench''; bun install; Pop-Location'"
        ));
        assert!(script.contains("$workduckCommand = 'bun install';"));
        assert!(script.contains(
            "$workduckCommand = 'Push-Location -LiteralPath ''apps/workbench''; bun install; Pop-Location';"
        ));
        assert!(script.contains("command = $workduckRecordCommand;"));
        assert!(!script.contains("Invoke-Expression $workduckRecordCommand"));
    }

    #[test]
    fn stale_running_dev_server_records_are_reported_as_stopped() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
                state: "running".to_owned(),
                ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[]),
        );

        assert_eq!(records[0].state, "stopped");
        assert!(records[0].finished_at.is_some());
    }

    #[test]
    fn running_dev_server_records_stop_when_process_id_was_reused() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
                state: "running".to_owned(),
                process_id: Some(42),
                ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[live_task_process(42, None, "powershell")]),
        );

        assert_eq!(records[0].state, "stopped");
        assert!(records[0].finished_at.is_some());
    }

    #[test]
    fn running_dev_server_records_stay_running_when_process_id_matches_task_command() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
                state: "running".to_owned(),
                process_id: Some(42),
                ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[
                live_task_process(
                    42,
                    None,
                    &encoded_powershell_command_line(
                        "Set-Location -LiteralPath 'C:/workspace/repo-a'; bun run dev",
                    ),
                ),
                live_task_process(43, Some(42), "bun run dev"),
            ]),
        );

        assert_eq!(records[0].state, "running");
    }

    #[test]
    fn running_dev_server_records_stop_when_only_terminal_process_remains() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
                state: "running".to_owned(),
                process_id: Some(42),
                ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[live_task_process(
                42,
                None,
                &encoded_powershell_command_line(
                    "Set-Location -LiteralPath 'C:/workspace/repo-a'; bun run dev",
                ),
            )]),
        );

        assert_eq!(records[0].state, "stopped");
        assert!(records[0].finished_at.is_some());
    }

    #[test]
    fn stale_running_preview_records_are_reported_as_stopped() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::Preview.as_str().to_owned(),
                state: "running".to_owned(),
                command: "bun run preview".to_owned(),
                ..task_run_record("repo-a-preview", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[]),
        );

        assert_eq!(records[0].state, "stopped");
        assert!(records[0].finished_at.is_some());
    }

    #[test]
    fn legacy_running_preview_records_match_repository_path_processes() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::Preview.as_str().to_owned(),
                state: "running".to_owned(),
                command: "bun run preview".to_owned(),
                ..task_run_record("repo-a-preview", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[live_task_process(
                43,
                None,
                "node C:\\workspace\\repo-a\\node_modules\\vite\\bin\\vite.js preview",
            )]),
        );

        assert_eq!(records[0].state, "running");
    }

    #[test]
    fn stale_running_dependency_update_records_are_reported_as_stopped() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::UpdateDependencies.as_str().to_owned(),
                state: "running".to_owned(),
                process_id: Some(42),
                command: "bun update".to_owned(),
                ..task_run_record(
                    "repo-a-update",
                    "C:/workspace/repo-a",
                    "2026-05-23T01:00:00Z",
                )
            }],
            Some(&[]),
        );

        assert_eq!(records[0].state, "stopped");
        assert!(records[0].finished_at.is_some());
    }

    #[test]
    fn running_dependency_update_records_stay_running_when_encoded_terminal_matches_task() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::UpdateDependencies.as_str().to_owned(),
                state: "running".to_owned(),
                process_id: Some(42),
                command: "bun update".to_owned(),
                ..task_run_record(
                    "repo-a-update",
                    "C:/workspace/repo-a",
                    "2026-05-23T01:00:00Z",
                )
            }],
            Some(&[live_task_process(
                42,
                None,
                &encoded_powershell_command_line(
                    "Set-Location -LiteralPath 'C:/workspace/repo-a'; bun update",
                ),
            )]),
        );

        assert_eq!(records[0].state, "running");
    }

    #[test]
    fn running_dependency_update_records_stop_when_process_id_was_reused() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::UpdateDependencies.as_str().to_owned(),
                state: "running".to_owned(),
                process_id: Some(42),
                command: "bun update".to_owned(),
                ..task_run_record(
                    "repo-a-update",
                    "C:/workspace/repo-a",
                    "2026-05-23T01:00:00Z",
                )
            }],
            Some(&[live_task_process(42, None, "powershell")]),
        );

        assert_eq!(records[0].state, "stopped");
    }

    #[test]
    fn reconciled_stopped_records_are_persisted_to_disk() {
        let unique = current_task_run_timestamp()
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>();
        let temp_dir = std::env::temp_dir().join(format!(
            "workduck-task-run-reconcile-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let record_path = temp_dir.join("repo_task_update.json");
        let running_record = ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::UpdateDependencies.as_str().to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            command: "bun update".to_owned(),
            record_path: record_path.to_string_lossy().to_string(),
            ..task_run_record(
                "repo-a-update",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        };
        assert!(write_task_run_record(&record_path, &running_record).is_ok());

        let stopped_record = stopped_task_run_record(&running_record);
        persist_reconciled_task_run_records(&[stopped_record]);

        let persisted_json = fs::read_to_string(&record_path).expect("read persisted record");
        let persisted_record =
            serde_json::from_str::<ProjectRepositoryTaskRunRecord>(&persisted_json)
                .expect("parse persisted record");

        assert_eq!(persisted_record.state, "stopped");
        assert_eq!(persisted_record.process_id, Some(42));
        assert!(persisted_record.finished_at.is_some());

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn legacy_running_dev_server_records_match_repository_path_processes() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
                state: "running".to_owned(),
                ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
            }],
            Some(&[live_task_process(
                43,
                None,
                "node C:\\workspace\\repo-a\\node_modules\\astro\\bin\\astro.mjs preview",
            )]),
        );

        assert_eq!(records[0].state, "running");
    }

    #[test]
    fn legacy_running_dependency_update_records_without_process_id_stop() {
        let records = reconcile_running_task_run_records(
            vec![ProjectRepositoryTaskRunRecord {
                task: ProjectRepositoryTask::UpdateDependencies.as_str().to_owned(),
                state: "running".to_owned(),
                command: "bun update".to_owned(),
                ..task_run_record(
                    "repo-a-update",
                    "C:/workspace/repo-a",
                    "2026-05-23T01:00:00Z",
                )
            }],
            Some(&[live_task_process(
                43,
                None,
                "node C:\\workspace\\repo-a\\node_modules\\vite\\bin\\vite.js dev",
            )]),
        );

        assert_eq!(records[0].state, "stopped");
    }

    fn encoded_powershell_command_line(script: &str) -> String {
        let encoded = general_purpose::STANDARD.encode(
            script
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>(),
        );

        format!("powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand {encoded}")
    }
}

#[cfg(target_os = "windows")]
fn launch_repository_terminal(
    repository_path: &Path,
    command: Option<&str>,
    run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<Option<u32>, ProjectRepositoryTaskError> {
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
        .map(|child| Some(child.id()))
        .map_err(|_| ProjectRepositoryTaskError::LaunchFailed)
}

#[cfg(not(target_os = "windows"))]
fn launch_repository_terminal(
    _repository_path: &Path,
    _command: Option<&str>,
    _run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<Option<u32>, ProjectRepositoryTaskError> {
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
            script.push_str(&create_tracked_powershell_command(
                &escaped_command,
                run_record,
            ));
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
    let record_command = escape_powershell_single_quoted(&run_record.command);
    let started_at = escape_powershell_single_quoted(&run_record.started_at);

    format!(
        r#";
$workduckRecordPath = '{record_path}';
$workduckLogPath = '{log_path}';
$workduckRecordCommand = '{record_command}';
$workduckCommand = '{escaped_command}';
function Write-WorkduckTaskRunRecord {{
    param([string]$State, [Nullable[int]]$ExitCode, [string]$OutputTail)
    $record = [ordered]@{{
        id = '{id}';
        task = '{task}';
        repositoryPath = '{repository_path}';
        command = $workduckRecordCommand;
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
