use std::{
    fs, io,
    path::{Path, PathBuf},
};

use crate::atomic_file_write::{AtomicFileWriteError, write_file_atomically};
use crate::path_display::display_path;
use crate::workspace_path::{validate_absolute_directory, WorkspacePathValidationError};

const WORKSPACE_SYNC_FILE_NAME_MAX_CHARS: usize = 120;
const WORKSPACE_SYNC_FILE_MAX_BYTES: u64 = 5 * 1024 * 1024;

#[derive(serde::Serialize)]
pub enum WorkspaceSyncFileError {
    #[serde(rename = "workspace-sync-folder-required")]
    FolderRequired,
    #[serde(rename = "workspace-sync-folder-not-absolute")]
    FolderNotAbsolute,
    #[serde(rename = "workspace-sync-folder-not-found")]
    FolderNotFound,
    #[serde(rename = "workspace-sync-folder-not-directory")]
    FolderNotDirectory,
    #[serde(rename = "workspace-sync-folder-permission-denied")]
    FolderPermissionDenied,
    #[serde(rename = "workspace-sync-file-name-required")]
    FileNameRequired,
    #[serde(rename = "workspace-sync-file-name-invalid")]
    FileNameInvalid,
    #[serde(rename = "workspace-sync-content-required")]
    ContentRequired,
    #[serde(rename = "workspace-sync-file-not-found")]
    FileNotFound,
    #[serde(rename = "workspace-sync-file-too-large")]
    FileTooLarge,
    #[serde(rename = "workspace-sync-file-target-invalid")]
    FileTargetInvalid,
    #[serde(rename = "workspace-sync-file-read-failed")]
    ReadFailed,
    #[serde(rename = "workspace-sync-file-write-failed")]
    WriteFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncFileWrite {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    normalized_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceSyncFileError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncFileRead {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    normalized_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceSyncFileError>,
}

#[tauri::command]
pub fn write_workspace_sync_file(
    folder_path: String,
    file_name: String,
    content: String,
) -> WorkspaceSyncFileWrite {
    if content.trim().is_empty() {
        return invalid_write(WorkspaceSyncFileError::ContentRequired);
    }

    let sync_file_path = match resolve_sync_file_path(&folder_path, &file_name) {
        Ok(sync_file_path) => sync_file_path,
        Err(error) => return invalid_write(error),
    };

    if let Err(error) = validate_sync_file_target(&sync_file_path) {
        return invalid_write(error);
    }

    match write_file_atomically(&sync_file_path, &content) {
        Ok(()) => WorkspaceSyncFileWrite {
            ok: true,
            normalized_path: Some(display_path(&sync_file_path)),
            error: None,
        },
        Err(error) => invalid_write(map_atomic_write_error(error)),
    }
}

#[tauri::command]
pub fn read_workspace_sync_file(folder_path: String, file_name: String) -> WorkspaceSyncFileRead {
    let sync_file_path = match resolve_sync_file_path(&folder_path, &file_name) {
        Ok(sync_file_path) => sync_file_path,
        Err(error) => return invalid_read(error),
    };

    if let Err(error) = validate_sync_file_target(&sync_file_path) {
        return invalid_read(error);
    }

    let metadata = match fs::metadata(&sync_file_path) {
        Ok(metadata) => metadata,
        Err(error) => return invalid_read(map_read_error(error)),
    };

    if metadata.len() > WORKSPACE_SYNC_FILE_MAX_BYTES {
        return invalid_read(WorkspaceSyncFileError::FileTooLarge);
    }

    match fs::read_to_string(&sync_file_path) {
        Ok(content) => WorkspaceSyncFileRead {
            ok: true,
            normalized_path: Some(display_path(&sync_file_path)),
            content: Some(content),
            error: None,
        },
        Err(error) => invalid_read(map_read_error(error)),
    }
}

pub(crate) fn resolve_sync_file_path(
    folder_path: &str,
    file_name: &str,
) -> Result<PathBuf, WorkspaceSyncFileError> {
    let trimmed_folder_path = folder_path.trim();

    if trimmed_folder_path.is_empty() {
        return Err(WorkspaceSyncFileError::FolderRequired);
    }

    let folder_path = PathBuf::from(trimmed_folder_path);

    if !folder_path.is_absolute() {
        return Err(WorkspaceSyncFileError::FolderNotAbsolute);
    }

    let folder_path = validate_sync_folder_path(&folder_path)?;
    let file_name = validate_sync_file_name(file_name)?;

    Ok(folder_path.join(file_name))
}

fn validate_sync_folder_path(path: &Path) -> Result<PathBuf, WorkspaceSyncFileError> {
    validate_absolute_directory(path).map_err(map_folder_path_validation_error)
}

fn validate_sync_file_name(file_name: &str) -> Result<String, WorkspaceSyncFileError> {
    let trimmed_file_name = file_name.trim();

    if trimmed_file_name.is_empty() {
        return Err(WorkspaceSyncFileError::FileNameRequired);
    }

    if trimmed_file_name.chars().count() > WORKSPACE_SYNC_FILE_NAME_MAX_CHARS {
        return Err(WorkspaceSyncFileError::FileNameInvalid);
    }

    if trimmed_file_name == "."
        || trimmed_file_name == ".."
        || trimmed_file_name.chars().any(|character| {
            matches!(
                character,
                '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*'
            ) || character.is_control()
        })
    {
        return Err(WorkspaceSyncFileError::FileNameInvalid);
    }

    Ok(trimmed_file_name.to_owned())
}

pub(crate) fn validate_sync_file_target(path: &Path) -> Result<(), WorkspaceSyncFileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_dir() {
                return Err(WorkspaceSyncFileError::FileTargetInvalid);
            }

            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(map_read_error(error)),
    }
}

fn invalid_write(error: WorkspaceSyncFileError) -> WorkspaceSyncFileWrite {
    WorkspaceSyncFileWrite {
        ok: false,
        normalized_path: None,
        error: Some(error),
    }
}

fn invalid_read(error: WorkspaceSyncFileError) -> WorkspaceSyncFileRead {
    WorkspaceSyncFileRead {
        ok: false,
        normalized_path: None,
        content: None,
        error: Some(error),
    }
}

fn map_folder_path_validation_error(
    error: WorkspacePathValidationError,
) -> WorkspaceSyncFileError {
    match error {
        WorkspacePathValidationError::Required => WorkspaceSyncFileError::FolderRequired,
        WorkspacePathValidationError::NotAbsolute => WorkspaceSyncFileError::FolderNotAbsolute,
        WorkspacePathValidationError::NotFound => WorkspaceSyncFileError::FolderNotFound,
        WorkspacePathValidationError::NotDirectory => WorkspaceSyncFileError::FolderNotDirectory,
        WorkspacePathValidationError::PermissionDenied => WorkspaceSyncFileError::FolderPermissionDenied,
        WorkspacePathValidationError::Unreadable => WorkspaceSyncFileError::ReadFailed,
    }
}

fn map_read_error(error: io::Error) -> WorkspaceSyncFileError {
    match error.kind() {
        io::ErrorKind::NotFound => WorkspaceSyncFileError::FileNotFound,
        io::ErrorKind::PermissionDenied => WorkspaceSyncFileError::FolderPermissionDenied,
        _ => WorkspaceSyncFileError::ReadFailed,
    }
}

fn map_atomic_write_error(error: AtomicFileWriteError) -> WorkspaceSyncFileError {
    match error {
        AtomicFileWriteError::TargetInvalid => WorkspaceSyncFileError::FileTargetInvalid,
        AtomicFileWriteError::TargetAlreadyExists | AtomicFileWriteError::WriteFailed => {
            WorkspaceSyncFileError::WriteFailed
        }
    }
}
