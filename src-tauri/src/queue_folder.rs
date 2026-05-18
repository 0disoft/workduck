use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const PROPOSALS_DIRECTORY_NAME: &str = "proposals";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";
const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
const PROPOSAL_FILE_SUFFIX: &str = ".workduck-proposal.json";

#[derive(serde::Serialize)]
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
    #[serde(rename = "queue-folder-file-already-exists")]
    FileAlreadyExists,
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

#[derive(serde::Serialize)]
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
        path: Some(queue_root.to_string_lossy().into_owned()),
        files,
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

    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .and_then(|mut file| file.write_all(content.as_bytes()))
    {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(relative_path),
            content: Some(content),
            error: None,
        },
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            invalid_file_read(QueueFolderError::FileAlreadyExists)
        }
        Err(_) => invalid_file_read(QueueFolderError::FileWriteFailed),
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

    match OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(&file_path)
        .and_then(|mut file| file.write_all(content.as_bytes()))
    {
        Ok(_) => QueueFileReadResult {
            ok: true,
            relative_path: Some(normalized_relative_path),
            content: Some(content),
            error: None,
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            invalid_file_read(QueueFolderError::FileNotFound)
        }
        Err(_) => invalid_file_read(QueueFolderError::FileWriteFailed),
    }
}

fn validate_workspace_root(path: &str) -> Result<PathBuf, QueueFolderError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(QueueFolderError::WorkspaceRequired);
    }

    let workspace_path = PathBuf::from(trimmed_path);

    if !workspace_path.is_absolute() {
        return Err(QueueFolderError::WorkspaceNotAbsolute);
    }

    let metadata = fs::metadata(&workspace_path).map_err(map_workspace_error)?;

    if !metadata.is_dir() {
        return Err(QueueFolderError::WorkspaceNotDirectory);
    }

    let normalized_path = fs::canonicalize(&workspace_path).map_err(map_workspace_error)?;
    fs::read_dir(&normalized_path).map_err(map_workspace_error)?;

    Ok(normalized_path)
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
        let kind = classify_queue_file(child_dir, &file_name).unwrap_or(QueueFileKind::Unsupported);

        files.push(QueueFileEntry {
            relative_path: format!("{child_dir}/{file_name}"),
            file_name,
            kind,
        });
    }

    Ok(())
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
        path: Some(path.to_string_lossy().into_owned()),
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

fn map_create_error(error: io::Error) -> QueueFolderError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => QueueFolderError::WorkspacePermissionDenied,
        _ => QueueFolderError::CreateFailed,
    }
}
