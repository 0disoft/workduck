use std::{
    fs,
    io,
    path::{Path, PathBuf},
};

use crate::atomic_file_write::{write_file_atomically, AtomicFileWriteError};
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};
use crate::workspace_repository_gitignore::ensure_secrets_sync_gitignore_policy;

const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const SECRETS_SYNC_FILE_NAME: &str = "secrets.sync.json";
const WORKSPACE_DATA_FILE_MAX_BYTES: u64 = 1_048_576;
const ALLOWED_WORKSPACE_DATA_FILES: &[&str] = &[
    "agents.json",
    "personas.json",
    "references.json",
    "secrets.sync.json",
    "skills.json",
    "workspace.json",
];

#[derive(Clone, Copy, serde::Serialize)]
pub enum WorkspaceDataFileError {
    #[serde(rename = "workspace-data-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "workspace-data-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "workspace-data-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "workspace-data-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "workspace-data-workspace-permission-denied")]
    WorkspacePermissionDenied,
    #[serde(rename = "workspace-data-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "workspace-data-root-invalid")]
    RootInvalid,
    #[serde(rename = "workspace-data-file-invalid")]
    FileInvalid,
    #[serde(rename = "workspace-data-file-too-large")]
    FileTooLarge,
    #[serde(rename = "workspace-data-file-read-failed")]
    FileReadFailed,
    #[serde(rename = "workspace-data-file-write-failed")]
    FileWriteFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDataFileReadResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceDataFileError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDataFileWriteResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceDataFileError>,
}

#[tauri::command]
pub fn read_workspace_data_file(
    workspace_path: String,
    file_name: String,
) -> WorkspaceDataFileReadResponse {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_read(error),
    };

    let file_path = match resolve_workspace_data_file_path(&workspace_root, &file_name, false) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_read(error),
    };

    match fs::metadata(&file_path) {
        Ok(metadata) if metadata.len() > WORKSPACE_DATA_FILE_MAX_BYTES => {
            invalid_read(WorkspaceDataFileError::FileTooLarge)
        }
        Ok(metadata) if metadata.is_dir() => invalid_read(WorkspaceDataFileError::FileInvalid),
        Ok(_) => match fs::read_to_string(&file_path) {
            Ok(content) => WorkspaceDataFileReadResponse {
                ok: true,
                content: Some(content),
                error: None,
            },
            Err(_) => invalid_read(WorkspaceDataFileError::FileReadFailed),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => WorkspaceDataFileReadResponse {
            ok: true,
            content: None,
            error: None,
        },
        Err(error) => invalid_read(map_workspace_error(error)),
    }
}

#[tauri::command]
pub fn write_workspace_data_file(
    workspace_path: String,
    file_name: String,
    content: String,
) -> WorkspaceDataFileWriteResponse {
    if content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES {
        return invalid_write(WorkspaceDataFileError::FileTooLarge);
    }

    let normalized_file_name = match validate_workspace_data_file_name(&file_name) {
        Ok(file_name) => file_name.to_string(),
        Err(error) => return invalid_write(error),
    };

    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_write(error),
    };

    let file_path = match resolve_workspace_data_file_path(
        &workspace_root,
        &normalized_file_name,
        true,
    ) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_write(error),
    };

    let write_result = write_file_atomically(&file_path, &content).map_err(map_atomic_write_error);
    if let Err(error) = write_result {
        return invalid_write(error);
    }

    if normalized_file_name == SECRETS_SYNC_FILE_NAME
        && ensure_secrets_sync_gitignore_policy(&workspace_root).is_err()
    {
        return invalid_write(WorkspaceDataFileError::FileWriteFailed);
    }

    WorkspaceDataFileWriteResponse {
        ok: true,
        error: None,
    }
}

fn map_atomic_write_error(error: AtomicFileWriteError) -> WorkspaceDataFileError {
    match error {
        AtomicFileWriteError::TargetInvalid => WorkspaceDataFileError::FileInvalid,
        AtomicFileWriteError::TargetAlreadyExists | AtomicFileWriteError::WriteFailed => {
            WorkspaceDataFileError::FileWriteFailed
        }
    }
}

fn resolve_workspace_data_file_path(
    workspace_root: &Path,
    file_name: &str,
    create_root: bool,
) -> Result<PathBuf, WorkspaceDataFileError> {
    let normalized_file_name = validate_workspace_data_file_name(file_name)?;
    let workduck_root = workspace_root.join(WORKDUCK_DIRECTORY_NAME);

    match fs::symlink_metadata(&workduck_root) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(WorkspaceDataFileError::RootInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound && create_root => {
            fs::create_dir(&workduck_root).map_err(map_create_error)?;
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(workduck_root.join(normalized_file_name));
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    let file_path = workduck_root.join(normalized_file_name);
    ensure_path_stays_in_workspace(&workspace_root, &file_path)?;

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_dir() {
                return Err(WorkspaceDataFileError::FileInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(map_workspace_error(error)),
    }

    Ok(file_path)
}

fn validate_workspace_root(workspace_path: &str) -> Result<PathBuf, WorkspaceDataFileError> {
    validate_absolute_directory_path(workspace_path).map_err(map_workspace_path_validation_error)
}

fn validate_workspace_data_file_name(file_name: &str) -> Result<&str, WorkspaceDataFileError> {
    let trimmed_file_name = file_name.trim();

    if ALLOWED_WORKSPACE_DATA_FILES.contains(&trimmed_file_name) {
        Ok(trimmed_file_name)
    } else {
        Err(WorkspaceDataFileError::FileInvalid)
    }
}

fn ensure_path_stays_in_workspace(
    workspace_root: &Path,
    path: &Path,
) -> Result<(), WorkspaceDataFileError> {
    let parent = path.parent().ok_or(WorkspaceDataFileError::FileInvalid)?;
    let normalized_parent = fs::canonicalize(parent).map_err(map_workspace_error)?;

    if normalized_parent.starts_with(workspace_root) {
        Ok(())
    } else {
        Err(WorkspaceDataFileError::RootInvalid)
    }
}

fn invalid_read(error: WorkspaceDataFileError) -> WorkspaceDataFileReadResponse {
    WorkspaceDataFileReadResponse {
        ok: false,
        content: None,
        error: Some(error),
    }
}

fn invalid_write(error: WorkspaceDataFileError) -> WorkspaceDataFileWriteResponse {
    WorkspaceDataFileWriteResponse {
        ok: false,
        error: Some(error),
    }
}

fn map_workspace_error(error: io::Error) -> WorkspaceDataFileError {
    match error.kind() {
        io::ErrorKind::NotFound => WorkspaceDataFileError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => WorkspaceDataFileError::WorkspacePermissionDenied,
        _ => WorkspaceDataFileError::WorkspaceUnreadable,
    }
}

fn map_workspace_path_validation_error(
    error: WorkspacePathValidationError,
) -> WorkspaceDataFileError {
    match error {
        WorkspacePathValidationError::Required => WorkspaceDataFileError::WorkspaceRequired,
        WorkspacePathValidationError::NotAbsolute => WorkspaceDataFileError::WorkspaceNotAbsolute,
        WorkspacePathValidationError::NotFound => WorkspaceDataFileError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => WorkspaceDataFileError::WorkspaceNotDirectory,
        WorkspacePathValidationError::PermissionDenied => {
            WorkspaceDataFileError::WorkspacePermissionDenied
        }
        WorkspacePathValidationError::Unreadable => WorkspaceDataFileError::WorkspaceUnreadable,
    }
}

fn map_create_error(error: io::Error) -> WorkspaceDataFileError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => WorkspaceDataFileError::WorkspacePermissionDenied,
        _ => WorkspaceDataFileError::FileWriteFailed,
    }
}
