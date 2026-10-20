// llmnav/1 module
// id=workduck.projects.repository-task-native
// role=Discover toolchain commands, launch bounded repository tasks in terminals, persist execution-owned records, and project process liveness without overwriting results.
// owns=native repository task launch|toolchain command discovery|task run reconciliation
// excludes=frontend task normalization|arbitrary shell command input
// search=native repository task|discover build command|reconcile dev server
// invariant=Tasks are selected from a closed vocabulary and repository paths remain inside the workspace; latest records bind selectable run IDs to their filenames, process identity is revalidated after bounded startup grace, tracked servers require their terminal execution and descendants, cached latest and unreadable files require unchanged metadata, terminal-owned completion survives launch updates and read-only reconciliation, task record publication replaces synced complete files and aborts execution on failure, success requires the final command, and bounded Unicode output previews keep completed history readable.
// stability=architecture
// /llmnav
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};

use base64::{Engine as _, engine::general_purpose};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::atomic_file_write::write_file_atomically;
use crate::workspace_path::{
    WorkspacePathValidationError, validate_absolute_directory_path,
    validate_workspace_directory_path,
};

#[path = "project_repository_task_commands.rs"]
mod commands;
use commands::resolve_repository_task_commands;

#[path = "project_repository_task_history.rs"]
mod history;

#[path = "project_repository_task_powershell.rs"]
mod powershell;
use powershell::escape_powershell_single_quoted;
#[cfg(target_os = "windows")]
use powershell::launch_repository_terminal;
#[cfg(all(test, target_os = "windows"))]
use powershell::{
    create_powershell_script, create_powershell_script_loader,
    create_powershell_task_record_writer, encode_powershell_command, prepare_powershell_command,
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
    pub(crate) id: String,
    pub(crate) task: String,
    pub(crate) repository_path: String,
    pub(crate) command: String,
    pub(crate) state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) process_id: Option<u32>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) started_at: String,
    pub(crate) finished_at: Option<String>,
    pub(crate) output_tail: Option<String>,
    pub(crate) record_path: String,
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
    record_dirs: HashMap<PathBuf, Arc<Mutex<WorkspaceTaskRunRecordCache>>>,
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
    let repository_path = match validate_repository_path(&workspace_path, &request.repository_path)
    {
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
                .map(|process_id| attach_task_process_id(&mut run_record, process_id));

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
    run_ids: Option<Vec<String>>,
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
    let read_result = match run_ids {
        Some(ids) => history::read_selected_task_run_records(&workspace_path, &ids),
        None => read_latest_cached_task_run_records(&record_dir, &visible_workspace_path),
    };
    let records = match read_result {
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
    let workspace_cache = workspace_task_run_record_cache(record_dir)?;
    let mut workspace_cache = workspace_cache
        .lock()
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;

    if workspace_cache.is_fresh(record_dir, dir_len, dir_modified_at) {
        return Ok(workspace_cache.latest_records.clone());
    }

    let entries =
        fs::read_dir(record_dir).map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;
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
        }) {
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
    let records = project_task_run_liveness(records);
    workspace_cache.dir_len = dir_len;
    workspace_cache.dir_modified_at = dir_modified_at;
    workspace_cache.latest_records = latest_task_run_records_by_repository(records);

    Ok(workspace_cache.latest_records.clone())
}

fn task_run_record_cache() -> &'static Mutex<TaskRunRecordCache> {
    static TASK_RUN_RECORD_CACHE: OnceLock<Mutex<TaskRunRecordCache>> = OnceLock::new();

    TASK_RUN_RECORD_CACHE.get_or_init(|| Mutex::new(TaskRunRecordCache::default()))
}

fn workspace_task_run_record_cache(
    record_dir: &Path,
) -> Result<Arc<Mutex<WorkspaceTaskRunRecordCache>>, ProjectRepositoryTaskError> {
    let mut cache = task_run_record_cache()
        .lock()
        .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;

    Ok(Arc::clone(
        cache
            .record_dirs
            .entry(record_dir.to_path_buf())
            .or_insert_with(|| Arc::new(Mutex::new(WorkspaceTaskRunRecordCache::default()))),
    ))
}

fn clear_cached_task_run_records(record_dir: &Path) {
    if let Ok(mut cache) = task_run_record_cache().lock() {
        cache.record_dirs.remove(record_dir);
    }
}

impl WorkspaceTaskRunRecordCache {
    fn is_fresh(
        &self,
        record_dir: &Path,
        dir_len: u64,
        dir_modified_at: Option<SystemTime>,
    ) -> bool {
        if dir_modified_at.is_none()
            || self.dir_len != dir_len
            || self.dir_modified_at != dir_modified_at
        {
            return false;
        }

        if self
            .latest_records
            .iter()
            .any(|record| record.state == "running")
        {
            return false;
        }

        // In-place terminal writes do not update the directory's modification time.
        // Check the latest records and failed reads without rescanning completed history.
        let file_is_unchanged = |file_name: &str, cached: &CachedTaskRunRecordFile| {
            fs::metadata(record_dir.join(file_name)).is_ok_and(|metadata| {
                metadata.is_file()
                    && cached.modified_at.is_some()
                    && metadata.len() == cached.len
                    && metadata.modified().ok() == cached.modified_at
            })
        };
        self.latest_records.iter().all(|record| {
            Path::new(&record.record_path)
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(|name| self.files.get(name).map(|cached| (name, cached)))
                .is_some_and(|(name, cached)| file_is_unchanged(name, cached))
        }) && self
            .files
            .iter()
            .filter(|(_, cached)| cached.record.is_none())
            .all(|(name, cached)| file_is_unchanged(name, cached))
    }
}

pub(crate) fn read_visible_task_run_record(
    path: &Path,
    visible_workspace_path: &Path,
) -> Option<ProjectRepositoryTaskRunRecord> {
    let mut remaining_bytes = history::MAX_HISTORY_BYTES;
    read_visible_task_run_record_with_budget(path, visible_workspace_path, &mut remaining_bytes)
}

pub(crate) fn read_visible_task_run_record_with_budget(
    path: &Path,
    visible_workspace_path: &Path,
    remaining_bytes: &mut usize,
) -> Option<ProjectRepositoryTaskRunRecord> {
    let mut record = history::read_bounded_task_run_record(path, remaining_bytes).ok()??;
    if !history::valid_run_id(&record.id)
        || path.file_stem().and_then(|stem| stem.to_str()) != Some(record.id.as_str())
    {
        return None;
    }
    let repository_path = PathBuf::from(&record.repository_path);

    if repository_path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir | std::path::Component::CurDir
        )
    }) {
        return None;
    }
    record.record_path = crate::git_path::git_process_path(path)
        .to_string_lossy()
        .into_owned();

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
        WorkspacePathValidationError::NotAbsolute => {
            ProjectRepositoryTaskError::WorkspaceNotAbsolute
        }
        WorkspacePathValidationError::NotFound => ProjectRepositoryTaskError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => {
            ProjectRepositoryTaskError::WorkspaceNotDirectory
        }
        WorkspacePathValidationError::PermissionDenied
        | WorkspacePathValidationError::Unreadable => {
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
        WorkspacePathValidationError::Required => {
            ProjectRepositoryTaskError::RepositoryPathRequired
        }
        WorkspacePathValidationError::NotAbsolute => {
            ProjectRepositoryTaskError::RepositoryPathNotAbsolute
        }
        WorkspacePathValidationError::NotFound => {
            ProjectRepositoryTaskError::RepositoryPathNotFound
        }
        WorkspacePathValidationError::NotDirectory => {
            ProjectRepositoryTaskError::RepositoryPathNotDirectory
        }
        WorkspacePathValidationError::PermissionDenied
        | WorkspacePathValidationError::Unreadable => {
            ProjectRepositoryTaskError::RepositoryPathUnreadable
        }
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
        let mut run_record =
            create_task_run_record(workspace_path, repository_path, task, command)?;
        let process_id =
            launch_repository_terminal(repository_path, Some(command), Some(&run_record))?;
        attach_task_process_id(&mut run_record, process_id);
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

fn attach_task_process_id(record: &mut ProjectRepositoryTaskRunRecord, process_id: Option<u32>) {
    if let Some(process_id) = process_id {
        record.process_id = Some(process_id);
    }
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
    if record_json.len() > history::MAX_RECORD_BYTES {
        return Err(ProjectRepositoryTaskError::RecordWriteFailed);
    }

    write_file_atomically(record_path, &record_json)
        .map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)
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
    if record.state != "running" || is_task_process_starting(record, OffsetDateTime::now_utc()) {
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

fn is_task_process_starting(record: &ProjectRepositoryTaskRunRecord, now: OffsetDateTime) -> bool {
    if record.process_id.is_some() || record.exit_code.is_some() || record.finished_at.is_some() {
        return false;
    }
    let Ok(started_at) = OffsetDateTime::parse(&record.started_at, &Rfc3339) else {
        return false;
    };
    // The record is published before the terminal starts and writes its own process ID.
    // Keep this launch window bounded so abandoned records still become stopped.
    let age = now - started_at;
    age >= time::Duration::ZERO && age < time::Duration::seconds(30)
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
        return is_tracked_task_process_alive(record, live_processes)
            && has_live_descendant_task_process(process_id, live_processes);
    }

    let repository_path = normalize_process_match_text(&record.repository_path);

    if repository_path.is_empty() {
        return false;
    }

    live_processes
        .iter()
        .any(|process| long_running_process_matches_repository(process, &repository_path))
}

fn has_live_descendant_task_process(ancestor_pid: u32, live_processes: &[LiveTaskProcess]) -> bool {
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
    if let Some(script) = decode_powershell_encoded_command(&process.command_line) {
        if script.starts_with("$workduckTaskRunId = '") {
            return script.starts_with(&format!(
                "$workduckTaskRunId = '{}';",
                escape_powershell_single_quoted(&record.id)
            )) && script.contains("$workduckTaskScriptPath = '")
                && script.contains("[ScriptBlock]::Create");
        }
        if script.contains("function Write-WorkduckTaskRunRecord") {
            // Current terminal scripts carry the run ID, so a reused PID must not match
            // another execution of the same command in the same repository.
            return script.contains(&format!(
                "id = '{}';",
                escape_powershell_single_quoted(&record.id)
            ));
        }
    }
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
            "Workduck could not find the terminal process for this repository task.".to_owned(),
        ),
        ..record.clone()
    }
}

pub(crate) fn project_task_run_liveness(
    records: Vec<ProjectRepositoryTaskRunRecord>,
) -> Vec<ProjectRepositoryTaskRunRecord> {
    project_task_run_liveness_with_budget(records, history::MAX_HISTORY_BYTES)
}

pub(crate) fn project_task_run_liveness_with_budget(
    records: Vec<ProjectRepositoryTaskRunRecord>,
    remaining_bytes: usize,
) -> Vec<ProjectRepositoryTaskRunRecord> {
    refresh_running_task_run_records_with_budget(
        records,
        collect_live_task_processes,
        remaining_bytes,
    )
}

fn refresh_running_task_run_records_with_budget(
    records: Vec<ProjectRepositoryTaskRunRecord>,
    collect_processes: impl FnOnce() -> Result<Vec<LiveTaskProcess>, ProjectRepositoryTaskError>,
    mut remaining_bytes: usize,
) -> Vec<ProjectRepositoryTaskRunRecord> {
    if !records.iter().any(|record| record.state == "running") {
        return records;
    }
    let live_processes = collect_processes().ok();
    // A terminal can publish its final result while process enumeration is in flight.
    let records = records
        .into_iter()
        .map(|record| reread_running_task_run_record(record, &mut remaining_bytes))
        .collect();
    // Process absence is a display projection, not authority to replace terminal evidence.
    reconcile_running_task_run_records(records, live_processes.as_deref())
}

fn reread_running_task_run_record(
    record: ProjectRepositoryTaskRunRecord,
    remaining_bytes: &mut usize,
) -> ProjectRepositoryTaskRunRecord {
    if record.state != "running" || *remaining_bytes == 0 {
        return record;
    }
    let Ok(Some(mut current)) =
        history::read_bounded_task_run_record(Path::new(&record.record_path), remaining_bytes)
    else {
        return record;
    };
    if current.id != record.id || current.repository_path != record.repository_path {
        return record;
    }
    // The caller bound this path to a workspace-owned file; ignore the JSON path.
    current.record_path = record.record_path;
    current
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

fn parse_live_task_processes(
    value: &str,
) -> Result<Vec<LiveTaskProcess>, ProjectRepositoryTaskError> {
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
    workspace_path
        .join(".workduck")
        .join("repository-task-runs")
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
#[path = "project_repository_task_tests.rs"]
mod tests;

#[cfg(all(test, target_os = "windows"))]
#[path = "project_repository_task_powershell_tests.rs"]
mod powershell_tests;

#[cfg(not(target_os = "windows"))]
fn launch_repository_terminal(
    _repository_path: &Path,
    _command: Option<&str>,
    _run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<Option<u32>, ProjectRepositoryTaskError> {
    Err(ProjectRepositoryTaskError::TerminalUnsupportedPlatform)
}

fn failed(error: ProjectRepositoryTaskError) -> ProjectRepositoryTaskResult {
    ProjectRepositoryTaskResult {
        ok: false,
        error: Some(error),
        command: None,
        run_record: None,
    }
}
