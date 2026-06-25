use std::{
    fs,
    io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use crate::atomic_file_write::{
    write_file_atomically, write_file_exclusively, AtomicFileWriteError,
};
use crate::path_display::display_path;
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};

const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const PROPOSALS_DIRECTORY_NAME: &str = "proposals";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";
const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
const PROPOSAL_FILE_SUFFIX: &str = ".workduck-proposal.json";
const AGENT_RESPONSE_EVALUATOR_SKILL_ID: &str = "workduck.skill.agent-response-evaluator";

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub enum QueueFolderError {
    #[serde(rename = "queue-folder-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "queue-folder-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "queue-folder-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "queue-folder-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "queue-folder-workspace-permission-denied")]
    WorkspacePermissionDenied,
    #[serde(rename = "queue-folder-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "queue-folder-root-invalid")]
    RootInvalid,
    #[serde(rename = "queue-folder-create-failed")]
    CreateFailed,
    #[serde(rename = "queue-folder-open-failed")]
    OpenFailed,
    #[serde(rename = "queue-folder-list-failed")]
    ListFailed,
    #[serde(rename = "queue-folder-file-invalid")]
    FileInvalid,
    #[serde(rename = "queue-folder-file-not-found")]
    FileNotFound,
    #[serde(rename = "queue-folder-file-read-failed")]
    FileReadFailed,
    #[serde(rename = "queue-folder-file-write-failed")]
    FileWriteFailed,
    #[serde(rename = "queue-folder-file-delete-failed")]
    FileDeleteFailed,
    #[serde(rename = "queue-folder-file-already-exists")]
    FileAlreadyExists,
    #[serde(rename = "queue-folder-evaluation-delegation-already-exists")]
    EvaluationDelegationAlreadyExists,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFolderResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    relative_path: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<QueueFolderError>,
}

#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum QueueFileKind {
    ResultReport,
    WorkOrder,
    Proposal,
    Unsupported,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileEntry {
    relative_path: String,
    file_name: String,
    kind: QueueFileKind,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileListResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    files: Vec<QueueFileEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<QueueFolderError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileReadResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    relative_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<QueueFolderError>,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileStatusCounts {
    pending: usize,
    running: usize,
    completed: usize,
    failed: usize,
    unknown: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileSummaryResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    counts: QueueFileStatusCounts,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<QueueFolderError>,
}

#[tauri::command]
pub fn ensure_queue_folder(workspace_path: String) -> QueueFolderResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid(error),
    };

    valid(queue_root)
}

#[tauri::command]
pub fn list_queue_files(workspace_path: String) -> QueueFileListResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_list(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_list(error),
    };
    let files = match list_known_queue_files(&queue_root) {
        Ok(files) => files,
        Err(error) => return invalid_file_list(error),
    };

    QueueFileListResult {
        ok: true,
        path: Some(display_path(&queue_root)),
        files,
        error: None,
    }
}

#[tauri::command]
pub fn summarize_queue_files(workspace_path: String) -> QueueFileSummaryResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_summary(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_summary(error),
    };
    let files = match list_known_queue_files(&queue_root) {
        Ok(files) => files,
        Err(error) => return invalid_file_summary(error),
    };
    let mut counts = QueueFileStatusCounts::default();

    for file in files {
        let state = read_queue_file_execution_state(&queue_root, &file);

        match state {
            Some("pending") => counts.pending += 1,
            Some("running") => counts.running += 1,
            Some("completed") => counts.completed += 1,
            Some("failed") => counts.failed += 1,
            _ => counts.unknown += 1,
        }
    }

    QueueFileSummaryResult {
        ok: true,
        path: Some(display_path(&queue_root)),
        counts,
        error: None,
    }
}

#[tauri::command]
pub fn open_queue_folder(workspace_path: String) -> QueueFolderResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid(error),
    };

    match create_open_folder_command(&queue_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(_) => valid(queue_root),
        Err(_) => invalid(QueueFolderError::OpenFailed),
    }
}

#[tauri::command]
pub fn read_queue_file(workspace_path: String, relative_path: String) -> QueueFileReadResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_read(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_read(error),
    };
    let file_path = match resolve_queue_file_path(&queue_root, &relative_path) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_file_read(error),
    };

    match fs::read_to_string(&file_path) {
        Ok(content) => QueueFileReadResult {
            ok: true,
            relative_path: Some(normalize_relative_path(&relative_path)),
            content: Some(content),
            error: None,
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            invalid_file_read(QueueFolderError::FileNotFound)
        }
        Err(_) => invalid_file_read(QueueFolderError::FileReadFailed),
    }
}

#[tauri::command]
pub fn write_queue_work_order_file(
    workspace_path: String,
    file_name: String,
    content: String,
) -> QueueFileReadResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_read(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_read(error),
    };
    let safe_file_name = match validate_work_order_file_name(&file_name) {
        Ok(file_name) => file_name,
        Err(error) => return invalid_file_read(error),
    };
    let relative_path = format!("{WORK_ORDERS_DIRECTORY_NAME}/{safe_file_name}");
    let file_path = queue_root
        .join(WORK_ORDERS_DIRECTORY_NAME)
        .join(&safe_file_name);

    if let Err(error) = ensure_unique_evaluation_delegation(&queue_root, None, &content) {
        return invalid_file_read(error);
    }

    match write_file_exclusively(&file_path, &content).map_err(map_atomic_file_write_error) {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(relative_path),
            content: Some(content),
            error: None,
        },
        Err(error) => invalid_file_read(error),
    }
}

#[tauri::command]
pub fn write_queue_result_report_file(
    workspace_path: String,
    file_name: String,
    content: String,
) -> QueueFileReadResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_read(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_read(error),
    };
    let safe_file_name = match validate_report_file_name(&file_name) {
        Ok(file_name) => file_name,
        Err(error) => return invalid_file_read(error),
    };
    let relative_path = format!("{REPORTS_DIRECTORY_NAME}/{safe_file_name}");
    let file_path = queue_root.join(REPORTS_DIRECTORY_NAME).join(&safe_file_name);

    match write_file_exclusively(&file_path, &content).map_err(map_atomic_file_write_error) {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(relative_path),
            content: Some(content),
            error: None,
        },
        Err(error) => invalid_file_read(error),
    }
}

#[tauri::command]
pub fn update_queue_work_order_file(
    workspace_path: String,
    relative_path: String,
    content: String,
) -> QueueFileReadResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_read(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_read(error),
    };
    let normalized_relative_path = normalize_relative_path(&relative_path);

    if !normalized_relative_path.starts_with(&format!("{WORK_ORDERS_DIRECTORY_NAME}/")) {
        return invalid_file_read(QueueFolderError::FileInvalid);
    }

    let file_path = match resolve_queue_file_path(&queue_root, &normalized_relative_path) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_file_read(error),
    };

    if let Err(error) =
        ensure_unique_evaluation_delegation(&queue_root, Some(&normalized_relative_path), &content)
    {
        return invalid_file_read(error);
    }

    match write_file_atomically(&file_path, &content).map_err(map_atomic_file_write_error) {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(normalized_relative_path),
            content: Some(content),
            error: None,
        },
        Err(error) => invalid_file_read(error),
    }
}

#[tauri::command]
pub fn update_queue_result_report_file(
    workspace_path: String,
    relative_path: String,
    content: String,
) -> QueueFileReadResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_read(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_read(error),
    };
    let normalized_relative_path = normalize_relative_path(&relative_path);

    if !normalized_relative_path.starts_with(&format!("{REPORTS_DIRECTORY_NAME}/")) {
        return invalid_file_read(QueueFolderError::FileInvalid);
    }

    let file_path = match resolve_queue_file_path(&queue_root, &normalized_relative_path) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_file_read(error),
    };

    match write_file_atomically(&file_path, &content).map_err(map_atomic_file_write_error) {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(normalized_relative_path),
            content: Some(content),
            error: None,
        },
        Err(error) => invalid_file_read(error),
    }
}

#[tauri::command]
pub fn delete_queue_file(workspace_path: String, relative_path: String) -> QueueFileReadResult {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_file_read(error),
    };
    let queue_root = match ensure_queue_root(&workspace_root) {
        Ok(queue_root) => queue_root,
        Err(error) => return invalid_file_read(error),
    };
    let normalized_relative_path = normalize_relative_path(&relative_path);
    let file_path = match resolve_queue_file_path(&queue_root, &normalized_relative_path) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_file_read(error),
    };

    match fs::remove_file(&file_path) {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(normalized_relative_path),
            content: None,
            error: None,
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            invalid_file_read(QueueFolderError::FileNotFound)
        }
        Err(_) => invalid_file_read(QueueFolderError::FileDeleteFailed),
    }
}

fn validate_workspace_root(path: &str) -> Result<PathBuf, QueueFolderError> {
    validate_absolute_directory_path(path).map_err(map_workspace_path_validation_error)
}

fn map_atomic_file_write_error(error: AtomicFileWriteError) -> QueueFolderError {
    match error {
        AtomicFileWriteError::TargetInvalid => QueueFolderError::FileInvalid,
        AtomicFileWriteError::TargetAlreadyExists => QueueFolderError::FileAlreadyExists,
        AtomicFileWriteError::WriteFailed => QueueFolderError::FileWriteFailed,
    }
}

fn ensure_queue_root(workspace_root: &Path) -> Result<PathBuf, QueueFolderError> {
    let queue_root = workspace_root.join(QUEUE_DIRECTORY_NAME);

    match fs::symlink_metadata(&queue_root) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(QueueFolderError::RootInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&queue_root).map_err(map_create_error)?;
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    let normalized_queue_root = fs::canonicalize(&queue_root).map_err(map_workspace_error)?;

    if !normalized_queue_root.starts_with(workspace_root) {
        return Err(QueueFolderError::RootInvalid);
    }

    fs::read_dir(&normalized_queue_root).map_err(map_workspace_error)?;
    ensure_queue_child_dir(&normalized_queue_root, REPORTS_DIRECTORY_NAME)?;
    ensure_queue_child_dir(&normalized_queue_root, WORK_ORDERS_DIRECTORY_NAME)?;
    ensure_queue_child_dir(&normalized_queue_root, PROPOSALS_DIRECTORY_NAME)?;

    Ok(normalized_queue_root)
}

fn ensure_queue_child_dir(queue_root: &Path, name: &str) -> Result<(), QueueFolderError> {
    let child_path = queue_root.join(name);

    match fs::symlink_metadata(&child_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(QueueFolderError::RootInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&child_path).map_err(map_create_error)?;
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    Ok(())
}

fn list_known_queue_files(queue_root: &Path) -> Result<Vec<QueueFileEntry>, QueueFolderError> {
    let mut files = Vec::new();

    collect_known_queue_files(queue_root, REPORTS_DIRECTORY_NAME, &mut files)?;
    collect_known_queue_files(queue_root, WORK_ORDERS_DIRECTORY_NAME, &mut files)?;
    collect_known_queue_files(queue_root, PROPOSALS_DIRECTORY_NAME, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(files)
}

fn collect_known_queue_files(
    queue_root: &Path,
    child_dir: &str,
    files: &mut Vec<QueueFileEntry>,
) -> Result<(), QueueFolderError> {
    let dir_path = queue_root.join(child_dir);
    let entries = fs::read_dir(&dir_path).map_err(|_| QueueFolderError::ListFailed)?;

    for entry in entries {
        let entry = entry.map_err(|_| QueueFolderError::ListFailed)?;
        let metadata = entry.metadata().map_err(|_| QueueFolderError::ListFailed)?;

        if !metadata.is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().into_owned();

        if is_queue_placeholder_file(&file_name) {
            continue;
        }

        let kind = classify_queue_file(child_dir, &file_name).unwrap_or(QueueFileKind::Unsupported);

        files.push(QueueFileEntry {
            relative_path: format!("{child_dir}/{file_name}"),
            file_name,
            kind,
        });
    }

    Ok(())
}

fn is_queue_placeholder_file(file_name: &str) -> bool {
    file_name.starts_with('.')
}

fn classify_queue_file(child_dir: &str, file_name: &str) -> Option<QueueFileKind> {
    if child_dir == REPORTS_DIRECTORY_NAME && file_name.ends_with(REPORT_FILE_SUFFIX) {
        return Some(QueueFileKind::ResultReport);
    }

    if child_dir == WORK_ORDERS_DIRECTORY_NAME && file_name.ends_with(WORK_ORDER_FILE_SUFFIX) {
        return Some(QueueFileKind::WorkOrder);
    }

    if child_dir == PROPOSALS_DIRECTORY_NAME && file_name.ends_with(PROPOSAL_FILE_SUFFIX) {
        return Some(QueueFileKind::Proposal);
    }

    None
}

fn read_queue_file_execution_state(
    queue_root: &Path,
    file: &QueueFileEntry,
) -> Option<&'static str> {
    match file.kind {
        QueueFileKind::Unsupported => return None,
        QueueFileKind::ResultReport | QueueFileKind::WorkOrder | QueueFileKind::Proposal => {}
    }

    let file_path = resolve_queue_file_path(queue_root, &file.relative_path).ok()?;
    let content = fs::read_to_string(file_path).ok()?;
    read_queue_content_execution_state(&content)
}

fn read_queue_content_execution_state(content: &str) -> Option<&'static str> {
    let value: serde_json::Value = serde_json::from_str(content).ok()?;

    if value.get("status").and_then(serde_json::Value::as_str) == Some("archived") {
        return Some("completed");
    }

    if value.get("status").and_then(serde_json::Value::as_str) == Some("running") {
        return Some("running");
    }

    if value.get("status").and_then(serde_json::Value::as_str) == Some("failed") {
        return Some("failed");
    }

    match value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_str)
    {
        Some("workduck.queue-result-report/v1") => Some("completed"),
        Some("workduck.queue-work-order/v1") | Some("workduck.queue-proposal/v1") => {
            Some("pending")
        }
        _ => None,
    }
}

fn ensure_unique_evaluation_delegation(
    queue_root: &Path,
    current_relative_path: Option<&str>,
    content: &str,
) -> Result<(), QueueFolderError> {
    let Some(source_report_id) = read_evaluation_delegation_source_report_id(content) else {
        return Ok(());
    };

    let work_orders_dir = queue_root.join(WORK_ORDERS_DIRECTORY_NAME);
    let entries = fs::read_dir(&work_orders_dir).map_err(|_| QueueFolderError::FileReadFailed)?;

    for entry in entries {
        let entry = entry.map_err(|_| QueueFolderError::FileReadFailed)?;
        let metadata = entry
            .metadata()
            .map_err(|_| QueueFolderError::FileReadFailed)?;

        if !metadata.is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().into_owned();

        if !file_name.ends_with(WORK_ORDER_FILE_SUFFIX) {
            continue;
        }

        let relative_path = format!("{WORK_ORDERS_DIRECTORY_NAME}/{file_name}");

        if current_relative_path == Some(relative_path.as_str()) {
            continue;
        }

        let existing_content =
            fs::read_to_string(entry.path()).map_err(|_| QueueFolderError::FileReadFailed)?;

        if read_evaluation_delegation_source_report_id(&existing_content).as_deref()
            == Some(source_report_id.as_str())
        {
            return Err(QueueFolderError::EvaluationDelegationAlreadyExists);
        }
    }

    Ok(())
}

fn read_evaluation_delegation_source_report_id(content: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(content).ok()?;
    let source_report = value.get("sourceReport")?.as_object()?;

    if source_report.get("kind")?.as_str()? != "queue-result-report" {
        return None;
    }

    if !work_order_has_evaluator_skill(&value) {
        return None;
    }

    let id = source_report.get("id")?.as_str()?.trim();

    if id.is_empty() {
        return None;
    }

    Some(id.to_string())
}

fn work_order_has_evaluator_skill(value: &serde_json::Value) -> bool {
    value
        .get("tasks")
        .and_then(serde_json::Value::as_array)
        .map(|tasks| {
            tasks.iter().any(|task| {
                task.get("skillIds")
                    .and_then(serde_json::Value::as_array)
                    .map(|skill_ids| {
                        skill_ids
                            .iter()
                            .any(|skill_id| skill_id.as_str() == Some(AGENT_RESPONSE_EVALUATOR_SKILL_ID))
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn resolve_queue_file_path(
    queue_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, QueueFolderError> {
    let normalized_relative_path = normalize_relative_path(relative_path);
    let mut parts = normalized_relative_path.split('/');
    let Some(child_dir) = parts.next() else {
        return Err(QueueFolderError::FileInvalid);
    };
    let Some(file_name) = parts.next() else {
        return Err(QueueFolderError::FileInvalid);
    };

    if parts.next().is_some() || classify_queue_file(child_dir, file_name).is_none() {
        return Err(QueueFolderError::FileInvalid);
    }

    let file_path = queue_root.join(child_dir).join(file_name);
    let metadata = fs::symlink_metadata(&file_path).map_err(|error| match error.kind() {
        io::ErrorKind::NotFound => QueueFolderError::FileNotFound,
        _ => QueueFolderError::FileReadFailed,
    })?;

    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(QueueFolderError::FileInvalid);
    }

    let normalized_file_path =
        fs::canonicalize(&file_path).map_err(|_| QueueFolderError::FileReadFailed)?;

    if !normalized_file_path.starts_with(queue_root) {
        return Err(QueueFolderError::FileInvalid);
    }

    Ok(normalized_file_path)
}

fn validate_work_order_file_name(file_name: &str) -> Result<String, QueueFolderError> {
    let trimmed_file_name = file_name.trim();

    if trimmed_file_name.is_empty()
        || !trimmed_file_name.ends_with(WORK_ORDER_FILE_SUFFIX)
        || trimmed_file_name.contains('/')
        || trimmed_file_name.contains('\\')
        || trimmed_file_name.contains("..")
    {
        return Err(QueueFolderError::FileInvalid);
    }

    Ok(trimmed_file_name.to_string())
}

fn validate_report_file_name(file_name: &str) -> Result<String, QueueFolderError> {
    let trimmed_file_name = file_name.trim();

    if trimmed_file_name.is_empty()
        || !trimmed_file_name.ends_with(REPORT_FILE_SUFFIX)
        || trimmed_file_name.contains('/')
        || trimmed_file_name.contains('\\')
        || trimmed_file_name.contains("..")
    {
        return Err(QueueFolderError::FileInvalid);
    }

    Ok(trimmed_file_name.to_string())
}

fn normalize_relative_path(relative_path: &str) -> String {
    relative_path.trim().replace('\\', "/")
}

#[cfg(target_os = "windows")]
fn create_open_folder_command(path: &Path) -> Command {
    let mut command = Command::new("explorer.exe");
    command.arg(path);
    command
}

#[cfg(target_os = "macos")]
fn create_open_folder_command(path: &Path) -> Command {
    let mut command = Command::new("open");
    command.arg(path);
    command
}

#[cfg(all(unix, not(target_os = "macos")))]
fn create_open_folder_command(path: &Path) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(path);
    command
}

fn valid(path: PathBuf) -> QueueFolderResult {
    QueueFolderResult {
        ok: true,
        path: Some(display_path(&path)),
        relative_path: Some(QUEUE_DIRECTORY_NAME),
        error: None,
    }
}

fn invalid(error: QueueFolderError) -> QueueFolderResult {
    QueueFolderResult {
        ok: false,
        path: None,
        relative_path: None,
        error: Some(error),
    }
}

fn invalid_file_list(error: QueueFolderError) -> QueueFileListResult {
    QueueFileListResult {
        ok: false,
        path: None,
        files: Vec::new(),
        error: Some(error),
    }
}

fn invalid_file_summary(error: QueueFolderError) -> QueueFileSummaryResult {
    QueueFileSummaryResult {
        ok: false,
        path: None,
        counts: QueueFileStatusCounts::default(),
        error: Some(error),
    }
}

fn invalid_file_read(error: QueueFolderError) -> QueueFileReadResult {
    QueueFileReadResult {
        ok: false,
        relative_path: None,
        content: None,
        error: Some(error),
    }
}

fn map_workspace_error(error: io::Error) -> QueueFolderError {
    match error.kind() {
        io::ErrorKind::NotFound => QueueFolderError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => QueueFolderError::WorkspacePermissionDenied,
        _ => QueueFolderError::WorkspaceUnreadable,
    }
}

fn map_workspace_path_validation_error(error: WorkspacePathValidationError) -> QueueFolderError {
    match error {
        WorkspacePathValidationError::Required => QueueFolderError::WorkspaceRequired,
        WorkspacePathValidationError::NotAbsolute => QueueFolderError::WorkspaceNotAbsolute,
        WorkspacePathValidationError::NotFound => QueueFolderError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => QueueFolderError::WorkspaceNotDirectory,
        WorkspacePathValidationError::PermissionDenied => QueueFolderError::WorkspacePermissionDenied,
        WorkspacePathValidationError::Unreadable => QueueFolderError::WorkspaceUnreadable,
    }
}

fn map_create_error(error: io::Error) -> QueueFolderError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => QueueFolderError::WorkspacePermissionDenied,
        _ => QueueFolderError::CreateFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn detects_evaluation_delegation_source_report() {
        let content = evaluation_delegation_content("queue-result-report_source");

        assert_eq!(
            read_evaluation_delegation_source_report_id(&content).as_deref(),
            Some("queue-result-report_source")
        );
    }

    #[test]
    fn ignores_non_evaluator_work_order_with_source_report() {
        let content = r#"{
            "schemaVersion": "workduck.queue-work-order/v1",
            "sourceReport": {
                "id": "queue-result-report_source",
                "kind": "queue-result-report",
                "label": "Source"
            },
            "tasks": [
                {
                    "id": "task_1",
                    "title": "Follow-up",
                    "body": "Do the work.",
                    "skillIds": ["workduck.skill.proposal-writer"]
                }
            ]
        }"#;

        assert_eq!(read_evaluation_delegation_source_report_id(content), None);
    }

    #[test]
    fn blocks_duplicate_evaluation_delegation_for_same_source_report() {
        let queue_root = create_test_queue_root();
        let existing_file = queue_root
            .join(WORK_ORDERS_DIRECTORY_NAME)
            .join("existing.workduck-work-order.json");
        let content = evaluation_delegation_content("queue-result-report_source");

        fs::write(&existing_file, &content).expect("existing evaluation delegation fixture");

        let result = ensure_unique_evaluation_delegation(&queue_root, None, &content);

        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(
            result,
            Err(QueueFolderError::EvaluationDelegationAlreadyExists)
        );
    }

    #[test]
    fn allows_updating_the_existing_evaluation_delegation_file() {
        let queue_root = create_test_queue_root();
        let existing_file = queue_root
            .join(WORK_ORDERS_DIRECTORY_NAME)
            .join("existing.workduck-work-order.json");
        let content = evaluation_delegation_content("queue-result-report_source");

        fs::write(&existing_file, &content).expect("existing evaluation delegation fixture");

        let result = ensure_unique_evaluation_delegation(
            &queue_root,
            Some("work-orders/existing.workduck-work-order.json"),
            &content,
        );

        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(result, Ok(()));
    }

    #[test]
    fn create_new_queue_write_does_not_clobber_existing_file() {
        let queue_root = create_test_queue_root();
        let file_path = queue_root
            .join(WORK_ORDERS_DIRECTORY_NAME)
            .join("existing.workduck-work-order.json");
        fs::write(&file_path, "old content").expect("existing queue file");

        let result = write_file_exclusively(&file_path, "new content")
            .map_err(map_atomic_file_write_error);

        let content = fs::read_to_string(&file_path).expect("existing content preserved");
        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(result, Err(QueueFolderError::FileAlreadyExists));
        assert_eq!(content, "old content");
    }

    #[test]
    fn replace_existing_queue_write_swaps_complete_content() {
        let queue_root = create_test_queue_root();
        let file_path = queue_root
            .join(WORK_ORDERS_DIRECTORY_NAME)
            .join("existing.workduck-work-order.json");
        fs::write(&file_path, "old content").expect("existing queue file");

        let result =
            write_file_atomically(&file_path, "new content").map_err(map_atomic_file_write_error);

        let content = fs::read_to_string(&file_path).expect("replaced queue file");
        let temp_files = list_queue_write_temp_files(&queue_root.join(WORK_ORDERS_DIRECTORY_NAME));
        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(result, Ok(()));
        assert_eq!(content, "new content");
        assert!(temp_files.is_empty(), "temporary files left behind: {temp_files:?}");
    }

    #[test]
    fn queue_file_summary_counts_execution_states() {
        let queue_root = create_test_queue_root();
        fs::create_dir_all(queue_root.join(REPORTS_DIRECTORY_NAME)).expect("reports dir");
        fs::create_dir_all(queue_root.join(PROPOSALS_DIRECTORY_NAME)).expect("proposals dir");
        fs::write(
            queue_root
                .join(WORK_ORDERS_DIRECTORY_NAME)
                .join("pending.workduck-work-order.json"),
            r#"{"schemaVersion":"workduck.queue-work-order/v1","status":"active"}"#,
        )
        .expect("pending work order");
        fs::write(
            queue_root
                .join(WORK_ORDERS_DIRECTORY_NAME)
                .join("running.workduck-work-order.json"),
            r#"{"schemaVersion":"workduck.queue-work-order/v1","status":"running"}"#,
        )
        .expect("running work order");
        fs::write(
            queue_root
                .join(WORK_ORDERS_DIRECTORY_NAME)
                .join("archived.workduck-work-order.json"),
            r#"{"schemaVersion":"workduck.queue-work-order/v1","status":"archived"}"#,
        )
        .expect("archived work order");
        fs::write(
            queue_root
                .join(REPORTS_DIRECTORY_NAME)
                .join("done.workduck-report.json"),
            r#"{"schemaVersion":"workduck.queue-result-report/v1"}"#,
        )
        .expect("result report");
        fs::write(
            queue_root.join(PROPOSALS_DIRECTORY_NAME).join("bad.workduck-proposal.json"),
            "not json",
        )
        .expect("unknown proposal");
        let files = list_known_queue_files(&queue_root).expect("queue files");
        let mut counts = QueueFileStatusCounts::default();

        for file in files {
            match read_queue_file_execution_state(&queue_root, &file) {
                Some("pending") => counts.pending += 1,
                Some("running") => counts.running += 1,
                Some("completed") => counts.completed += 1,
                Some("failed") => counts.failed += 1,
                _ => counts.unknown += 1,
            }
        }

        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(counts.pending, 1);
        assert_eq!(counts.running, 1);
        assert_eq!(counts.completed, 2);
        assert_eq!(counts.failed, 0);
        assert_eq!(counts.unknown, 1);
    }

    fn create_test_queue_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let queue_root = std::env::temp_dir().join(format!("workduck-queue-folder-test-{unique}"));

        fs::create_dir_all(queue_root.join(WORK_ORDERS_DIRECTORY_NAME)).expect("work-orders dir");
        fs::canonicalize(&queue_root).expect("canonical queue root")
    }

    fn list_queue_write_temp_files(parent: &Path) -> Vec<String> {
        fs::read_dir(parent)
            .expect("queue child directory")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(".workduck-write."))
            .collect()
    }

    fn evaluation_delegation_content(source_report_id: &str) -> String {
        format!(
            r#"{{
                "schemaVersion": "workduck.queue-work-order/v1",
                "sourceReport": {{
                    "id": "{source_report_id}",
                    "kind": "queue-result-report",
                    "label": "Source"
                }},
                "tasks": [
                    {{
                        "id": "task_1",
                        "title": "Evaluation delegation",
                        "body": "workduck agent evaluate-batch --workspace . --input result.json",
                        "skillIds": ["{AGENT_RESPONSE_EVALUATOR_SKILL_ID}"]
                    }}
                ]
            }}"#
        )
    }
}
