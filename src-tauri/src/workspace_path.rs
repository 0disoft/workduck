use std::{
    fs, io,
    path::{Path, PathBuf},
};

use crate::path_display::display_path;

#[derive(serde::Serialize)]
pub enum WorkspacePathValidationError {
    #[serde(rename = "workspace-path-required")]
    Required,
    #[serde(rename = "workspace-path-not-absolute")]
    NotAbsolute,
    #[serde(rename = "workspace-path-not-found")]
    NotFound,
    #[serde(rename = "workspace-path-not-directory")]
    NotDirectory,
    #[serde(rename = "workspace-path-permission-denied")]
    PermissionDenied,
    #[serde(rename = "workspace-path-unreadable")]
    Unreadable,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathValidation {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    normalized_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspacePathValidationError>,
}

#[tauri::command]
pub fn validate_workspace_path(path: String) -> WorkspacePathValidation {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return invalid(WorkspacePathValidationError::Required);
    }

    let workspace_path = PathBuf::from(trimmed_path);

    if !workspace_path.is_absolute() {
        return invalid(WorkspacePathValidationError::NotAbsolute);
    }

    match validate_directory_path(&workspace_path) {
        Ok(normalized_path) => WorkspacePathValidation {
            ok: true,
            normalized_path: Some(display_path(&normalized_path)),
            error: None,
        },
        Err(error) => invalid(error),
    }
}

fn validate_directory_path(path: &Path) -> Result<PathBuf, WorkspacePathValidationError> {
    let metadata = fs::metadata(path).map_err(map_io_error)?;

    if !metadata.is_dir() {
        return Err(WorkspacePathValidationError::NotDirectory);
    }

    let normalized_path = fs::canonicalize(path).map_err(map_io_error)?;
    fs::read_dir(&normalized_path).map_err(map_io_error)?;

    Ok(normalized_path)
}

fn invalid(error: WorkspacePathValidationError) -> WorkspacePathValidation {
    WorkspacePathValidation {
        ok: false,
        normalized_path: None,
        error: Some(error),
    }
}

fn map_io_error(error: io::Error) -> WorkspacePathValidationError {
    match error.kind() {
        io::ErrorKind::NotFound => WorkspacePathValidationError::NotFound,
        io::ErrorKind::PermissionDenied => WorkspacePathValidationError::PermissionDenied,
        _ => WorkspacePathValidationError::Unreadable,
    }
}
