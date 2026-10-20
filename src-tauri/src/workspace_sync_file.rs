// llmnav/1 module
// id=workduck.workspace.sync-file-native
// role=Resolve, validate, atomically write, and size-bound native workspace synchronization files.
// owns=native sync file I/O|sync filename validation|sync target safety
// excludes=sync payload encryption|Git synchronization
// search=native sync file|validate sync target|atomic sync write
// invariant=The target is a plain file under an existing absolute folder, never a symlink or directory; writes reject more than five MiB before changing files, and reads consume at most the limit plus one byte.
// stability=contract
// /llmnav
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

use crate::atomic_file_write::{AtomicFileWriteError, write_file_atomically};
use crate::path_display::display_path;
use crate::workspace_path::{WorkspacePathValidationError, validate_absolute_directory};

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
    if content.len() as u64 > WORKSPACE_SYNC_FILE_MAX_BYTES {
        return invalid_write(WorkspaceSyncFileError::FileTooLarge);
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

    let file = match fs::File::open(&sync_file_path) {
        Ok(file) => file,
        Err(error) => return invalid_read(map_read_error(error)),
    };
    let metadata = match file.metadata() {
        Ok(metadata) => metadata,
        Err(error) => return invalid_read(map_read_error(error)),
    };

    if metadata.len() > WORKSPACE_SYNC_FILE_MAX_BYTES {
        return invalid_read(WorkspaceSyncFileError::FileTooLarge);
    }

    match read_sync_content(file) {
        Ok(content) => WorkspaceSyncFileRead {
            ok: true,
            normalized_path: Some(display_path(&sync_file_path)),
            content: Some(content),
            error: None,
        },
        Err(error) => invalid_read(error),
    }
}

fn read_sync_content(reader: impl Read) -> Result<String, WorkspaceSyncFileError> {
    let mut content = Vec::new();
    reader
        .take(WORKSPACE_SYNC_FILE_MAX_BYTES + 1)
        .read_to_end(&mut content)
        .map_err(map_read_error)?;
    if content.len() as u64 > WORKSPACE_SYNC_FILE_MAX_BYTES {
        return Err(WorkspaceSyncFileError::FileTooLarge);
    }
    String::from_utf8(content).map_err(|_| WorkspaceSyncFileError::ReadFailed)
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

fn map_folder_path_validation_error(error: WorkspacePathValidationError) -> WorkspaceSyncFileError {
    match error {
        WorkspacePathValidationError::Required => WorkspaceSyncFileError::FolderRequired,
        WorkspacePathValidationError::NotAbsolute => WorkspaceSyncFileError::FolderNotAbsolute,
        WorkspacePathValidationError::NotFound => WorkspaceSyncFileError::FolderNotFound,
        WorkspacePathValidationError::NotDirectory => WorkspaceSyncFileError::FolderNotDirectory,
        WorkspacePathValidationError::PermissionDenied => {
            WorkspaceSyncFileError::FolderPermissionDenied
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversized_utf8_write_preserves_the_previous_backup() {
        let directory = tempfile::tempdir().expect("sync directory");
        let path = directory.path().join("backup.json");
        fs::write(&path, "previous backup").expect("existing backup");
        let oversized = "한".repeat(WORKSPACE_SYNC_FILE_MAX_BYTES as usize / 3 + 1);
        assert!(oversized.chars().count() < WORKSPACE_SYNC_FILE_MAX_BYTES as usize);
        let result = write_workspace_sync_file(
            display_path(directory.path()),
            "backup.json".to_owned(),
            oversized,
        );
        assert!(!result.ok);
        assert!(matches!(
            result.error,
            Some(WorkspaceSyncFileError::FileTooLarge)
        ));
        assert_eq!(
            fs::read_to_string(path).expect("preserved backup"),
            "previous backup"
        );
    }

    #[test]
    fn backup_at_the_byte_limit_remains_readable() {
        let directory = tempfile::tempdir().expect("sync directory");
        let content = "x".repeat(WORKSPACE_SYNC_FILE_MAX_BYTES as usize);
        let folder = display_path(directory.path());
        assert!(
            write_workspace_sync_file(folder.clone(), "backup.json".to_owned(), content.clone()).ok
        );
        let result = read_workspace_sync_file(folder, "backup.json".to_owned());
        assert!(result.ok);
        assert_eq!(result.content.as_deref(), Some(content.as_str()));
    }

    #[test]
    fn read_stops_after_one_extra_byte_even_when_the_source_keeps_growing() {
        let mut source = io::repeat(b'x');
        let mut counted = 0;
        struct Counted<'a> {
            source: &'a mut dyn Read,
            count: &'a mut usize,
        }
        impl Read for Counted<'_> {
            fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
                let read = self.source.read(buffer)?;
                *self.count += read;
                Ok(read)
            }
        }
        let result = read_sync_content(Counted {
            source: &mut source,
            count: &mut counted,
        });
        assert!(matches!(result, Err(WorkspaceSyncFileError::FileTooLarge)));
        assert_eq!(counted as u64, WORKSPACE_SYNC_FILE_MAX_BYTES + 1);
    }
}
