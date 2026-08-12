// llmnav/1 module
// id=workduck.workspace.path
// role=Validate workspace paths as readable absolute directories and return canonical display paths with closed error codes.
// owns=workspace path validation|directory readability check|path error mapping
// excludes=workspace registry storage|repository containment
// search=validate workspace path|canonical workspace directory|workspace unreadable error
// invariant=Only existing readable absolute directories produce a successful normalized workspace path.
// stability=contract
// /llmnav
use std::{
    fs, io,
    path::{Path, PathBuf},
};

use crate::path_display::display_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
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
    match validate_workspace_directory_path(&path) {
        Ok(normalized_path) => WorkspacePathValidation {
            ok: true,
            normalized_path: Some(display_path(&normalized_path)),
            error: None,
        },
        Err(error) => invalid(error),
    }
}

pub(crate) fn validate_workspace_directory_path(
    path: &str,
) -> Result<PathBuf, WorkspacePathValidationError> {
    validate_absolute_directory_path(path)
}

pub(crate) fn validate_absolute_directory_path(
    path: &str,
) -> Result<PathBuf, WorkspacePathValidationError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(WorkspacePathValidationError::Required);
    }

    let workspace_path = PathBuf::from(trimmed_path);

    if !workspace_path.is_absolute() {
        return Err(WorkspacePathValidationError::NotAbsolute);
    }

    validate_directory_path(&workspace_path)
}

pub(crate) fn validate_absolute_directory(
    path: &Path,
) -> Result<PathBuf, WorkspacePathValidationError> {
    if !path.is_absolute() {
        return Err(WorkspacePathValidationError::NotAbsolute);
    }

    validate_directory_path(path)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_directory_path_requires_non_empty_absolute_directory() {
        assert_eq!(
            validate_workspace_directory_path(""),
            Err(WorkspacePathValidationError::Required)
        );
        assert_eq!(
            validate_workspace_directory_path("relative/path"),
            Err(WorkspacePathValidationError::NotAbsolute)
        );
    }

    #[test]
    fn workspace_directory_path_canonicalizes_existing_directory() {
        let temp_dir = tempfile::tempdir().expect("temporary workspace directory");
        let normalized_path =
            validate_workspace_directory_path(&temp_dir.path().to_string_lossy())
                .expect("valid workspace directory");

        assert_eq!(normalized_path, temp_dir.path().canonicalize().expect("canonical temp dir"));
    }

    #[test]
    fn workspace_directory_path_rejects_existing_file() {
        let temp_dir = tempfile::tempdir().expect("temporary workspace directory");
        let file_path = temp_dir.path().join("workspace-file");
        fs::write(&file_path, "not a directory").expect("workspace file");

        assert_eq!(
            validate_workspace_directory_path(&file_path.to_string_lossy()),
            Err(WorkspacePathValidationError::NotDirectory)
        );
    }

    #[test]
    fn absolute_directory_path_uses_same_validation_contract() {
        assert_eq!(
            validate_absolute_directory_path(""),
            Err(WorkspacePathValidationError::Required)
        );
        assert_eq!(
            validate_absolute_directory_path("relative/path"),
            Err(WorkspacePathValidationError::NotAbsolute)
        );
    }
}
