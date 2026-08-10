use std::{
    fs,
    io,
    path::{Path, PathBuf},
};

use crate::atomic_file_write::{write_file_atomically, AtomicFileWriteError};
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};
use crate::workspace_registry_lock::acquire_workspace_registry_lock;
use crate::workspace_repository_gitignore::ensure_secrets_sync_gitignore_policy;

const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const SECRETS_SYNC_FILE_NAME: &str = "secrets.sync.json";
const REGISTRY_FILE_NAMES: &[&str] = &["agents.json", "personas.json"];
const REGISTRY_TRANSACTION_FILE_NAME: &str = ".registry-transaction.json";
const WORKSPACE_DATA_FILE_MAX_BYTES: u64 = 1_048_576;
const ALLOWED_WORKSPACE_DATA_FILES: &[&str] = &[
    "agents.json",
    "personas.json",
    "references.json",
    "secrets.sync.json",
    "skills.json",
    "workspace.json",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
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
    #[serde(rename = "workspace-data-revision-conflict")]
    RevisionConflict,
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
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceDataFileError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRegistryPairWriteResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    agents_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    personas_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceDataFileError>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRegistryTransaction {
    agents_content: String,
    personas_content: String,
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

    let _registry_lock = if REGISTRY_FILE_NAMES.contains(&file_name.trim()) {
        match acquire_workspace_registry_lock(&workspace_root) {
            Ok(lock) => {
                if recover_workspace_registry_transaction_under_lock(&workspace_root).is_err() {
                    return invalid_read(WorkspaceDataFileError::FileReadFailed);
                }
                Some(lock)
            }
            Err(_) => return invalid_read(WorkspaceDataFileError::FileReadFailed),
        }
    } else {
        None
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
    if REGISTRY_FILE_NAMES.contains(&normalized_file_name.as_str()) {
        return invalid_write(WorkspaceDataFileError::FileInvalid);
    }

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
        content: None,
        error: None,
    }
}

#[tauri::command]
pub fn write_workspace_registry_file(
    workspace_path: String,
    file_name: String,
    expected_revision: u64,
    content: String,
) -> WorkspaceDataFileWriteResponse {
    if content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES {
        return invalid_write(WorkspaceDataFileError::FileTooLarge);
    }

    let normalized_file_name = file_name.trim();
    if !REGISTRY_FILE_NAMES.contains(&normalized_file_name) {
        return invalid_write(WorkspaceDataFileError::FileInvalid);
    }

    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_write(error),
    };
    let _registry_lock = match acquire_workspace_registry_lock(&workspace_root) {
        Ok(lock) => lock,
        Err(_) => return invalid_write(WorkspaceDataFileError::FileWriteFailed),
    };
    if let Err(error) = recover_workspace_registry_transaction_under_lock(&workspace_root) {
        return invalid_write(error);
    }
    let file_path = match resolve_workspace_data_file_path(
        &workspace_root,
        normalized_file_name,
        true,
    ) {
        Ok(file_path) => file_path,
        Err(error) => return invalid_write(error),
    };

    let current_revision = match read_registry_revision(&file_path) {
        Ok(revision) => revision,
        Err(error) => return invalid_write(error),
    };
    if current_revision != expected_revision {
        return invalid_write(WorkspaceDataFileError::RevisionConflict);
    }

    let mut registry: serde_json::Value = match serde_json::from_str(&content) {
        Ok(serde_json::Value::Object(registry)) => serde_json::Value::Object(registry),
        _ => return invalid_write(WorkspaceDataFileError::FileInvalid),
    };
    let supplied_revision = registry
        .get("revision")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    if supplied_revision != expected_revision {
        return invalid_write(WorkspaceDataFileError::RevisionConflict);
    }

    let Some(next_revision) = expected_revision.checked_add(1) else {
        return invalid_write(WorkspaceDataFileError::RevisionConflict);
    };
    registry["revision"] = serde_json::Value::from(next_revision);
    let persisted_content = match serde_json::to_string(&registry) {
        Ok(content) if content.len() as u64 <= WORKSPACE_DATA_FILE_MAX_BYTES => content,
        Ok(_) => return invalid_write(WorkspaceDataFileError::FileTooLarge),
        Err(_) => return invalid_write(WorkspaceDataFileError::FileInvalid),
    };

    if let Err(error) =
        write_file_atomically(&file_path, &persisted_content).map_err(map_atomic_write_error)
    {
        return invalid_write(error);
    }

    WorkspaceDataFileWriteResponse {
        ok: true,
        content: Some(persisted_content),
        error: None,
    }
}

#[tauri::command]
pub fn write_workspace_registry_pair(
    workspace_path: String,
    agents_expected_revision: u64,
    agents_content: String,
    personas_expected_revision: u64,
    personas_content: String,
) -> WorkspaceRegistryPairWriteResponse {
    if agents_content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES
        || personas_content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES
    {
        return invalid_pair_write(WorkspaceDataFileError::FileTooLarge);
    }

    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_pair_write(error),
    };
    let _registry_lock = match acquire_workspace_registry_lock(&workspace_root) {
        Ok(lock) => lock,
        Err(_) => return invalid_pair_write(WorkspaceDataFileError::FileWriteFailed),
    };
    if let Err(error) = recover_workspace_registry_transaction_under_lock(&workspace_root) {
        return invalid_pair_write(error);
    }

    let agents_path = match resolve_workspace_data_file_path(&workspace_root, "agents.json", true) {
        Ok(path) => path,
        Err(error) => return invalid_pair_write(error),
    };
    let personas_path =
        match resolve_workspace_data_file_path(&workspace_root, "personas.json", true) {
            Ok(path) => path,
            Err(error) => return invalid_pair_write(error),
        };
    let current_agents_revision = match read_registry_revision(&agents_path) {
        Ok(revision) => revision,
        Err(error) => return invalid_pair_write(error),
    };
    let current_personas_revision = match read_registry_revision(&personas_path) {
        Ok(revision) => revision,
        Err(error) => return invalid_pair_write(error),
    };
    if current_agents_revision != agents_expected_revision
        || current_personas_revision != personas_expected_revision
    {
        return invalid_pair_write(WorkspaceDataFileError::RevisionConflict);
    }

    let persisted_agents_content = match prepare_registry_content(
        &agents_content,
        agents_expected_revision,
    ) {
        Ok(content) => content,
        Err(error) => return invalid_pair_write(error),
    };
    let persisted_personas_content = match prepare_registry_content(
        &personas_content,
        personas_expected_revision,
    ) {
        Ok(content) => content,
        Err(error) => return invalid_pair_write(error),
    };

    if let Err(error) = commit_workspace_registry_pair_under_lock(
        &workspace_root,
        &persisted_agents_content,
        &persisted_personas_content,
    ) {
        return invalid_pair_write(error);
    }

    WorkspaceRegistryPairWriteResponse {
        ok: true,
        agents_content: Some(persisted_agents_content),
        personas_content: Some(persisted_personas_content),
        error: None,
    }
}

fn prepare_registry_content(
    content: &str,
    expected_revision: u64,
) -> Result<String, WorkspaceDataFileError> {
    let mut registry: serde_json::Value = match serde_json::from_str(content) {
        Ok(serde_json::Value::Object(registry)) => serde_json::Value::Object(registry),
        _ => return Err(WorkspaceDataFileError::FileInvalid),
    };
    let supplied_revision = registry
        .get("revision")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    if supplied_revision != expected_revision {
        return Err(WorkspaceDataFileError::RevisionConflict);
    }

    let next_revision = expected_revision
        .checked_add(1)
        .ok_or(WorkspaceDataFileError::RevisionConflict)?;
    registry["revision"] = serde_json::Value::from(next_revision);
    match serde_json::to_string(&registry) {
        Ok(content) if content.len() as u64 <= WORKSPACE_DATA_FILE_MAX_BYTES => Ok(content),
        Ok(_) => Err(WorkspaceDataFileError::FileTooLarge),
        Err(_) => Err(WorkspaceDataFileError::FileInvalid),
    }
}

pub fn commit_workspace_registry_pair_under_lock(
    workspace_root: &Path,
    agents_content: &str,
    personas_content: &str,
) -> Result<(), WorkspaceDataFileError> {
    if agents_content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES
        || personas_content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES
    {
        return Err(WorkspaceDataFileError::FileTooLarge);
    }

    let agents_path = resolve_workspace_data_file_path(workspace_root, "agents.json", true)?;
    let personas_path = resolve_workspace_data_file_path(workspace_root, "personas.json", true)?;
    let transaction_path = resolve_registry_transaction_path(workspace_root, true)?;
    let transaction = serde_json::to_string(&WorkspaceRegistryTransaction {
        agents_content: agents_content.to_string(),
        personas_content: personas_content.to_string(),
    })
    .map_err(|_| WorkspaceDataFileError::FileWriteFailed)?;

    write_file_atomically(&transaction_path, &transaction).map_err(map_atomic_write_error)?;
    write_file_atomically(&agents_path, agents_content).map_err(map_atomic_write_error)?;
    write_file_atomically(&personas_path, personas_content).map_err(map_atomic_write_error)?;
    let _ = fs::remove_file(transaction_path);
    Ok(())
}

pub fn recover_workspace_registry_transaction_under_lock(
    workspace_root: &Path,
) -> Result<(), WorkspaceDataFileError> {
    let transaction_path = resolve_registry_transaction_path(workspace_root, false)?;
    let transaction = match fs::read_to_string(&transaction_path) {
        Ok(content) => serde_json::from_str::<WorkspaceRegistryTransaction>(&content)
            .map_err(|_| WorkspaceDataFileError::FileInvalid)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(WorkspaceDataFileError::FileReadFailed),
    };
    if transaction.agents_content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES
        || transaction.personas_content.len() as u64 > WORKSPACE_DATA_FILE_MAX_BYTES
    {
        return Err(WorkspaceDataFileError::FileTooLarge);
    }

    let agents_path = resolve_workspace_data_file_path(workspace_root, "agents.json", true)?;
    let personas_path = resolve_workspace_data_file_path(workspace_root, "personas.json", true)?;
    write_file_atomically(&agents_path, &transaction.agents_content)
        .map_err(map_atomic_write_error)?;
    write_file_atomically(&personas_path, &transaction.personas_content)
        .map_err(map_atomic_write_error)?;
    let _ = fs::remove_file(transaction_path);
    Ok(())
}

fn resolve_registry_transaction_path(
    workspace_root: &Path,
    create_root: bool,
) -> Result<PathBuf, WorkspaceDataFileError> {
    let workduck_root = workspace_root.join(WORKDUCK_DIRECTORY_NAME);
    match fs::symlink_metadata(&workduck_root) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(WorkspaceDataFileError::RootInvalid);
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound && create_root => {
            fs::create_dir(&workduck_root).map_err(map_create_error)?;
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(workduck_root.join(REGISTRY_TRANSACTION_FILE_NAME));
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    let transaction_path = workduck_root.join(REGISTRY_TRANSACTION_FILE_NAME);
    ensure_path_stays_in_workspace(workspace_root, &transaction_path)?;
    match fs::symlink_metadata(&transaction_path) {
        Ok(metadata) if metadata.file_type().is_symlink() || metadata.is_dir() => {
            Err(WorkspaceDataFileError::FileInvalid)
        }
        Ok(_) => Ok(transaction_path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(transaction_path),
        Err(error) => Err(map_workspace_error(error)),
    }
}

fn read_registry_revision(file_path: &Path) -> Result<u64, WorkspaceDataFileError> {
    match fs::read_to_string(file_path) {
        Ok(content) => {
            let value: serde_json::Value =
                serde_json::from_str(&content).map_err(|_| WorkspaceDataFileError::FileInvalid)?;
            value
                .get("revision")
                .map(|revision| revision.as_u64().ok_or(WorkspaceDataFileError::FileInvalid))
                .transpose()
                .map(|revision| revision.unwrap_or(0))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(0),
        Err(_) => Err(WorkspaceDataFileError::FileReadFailed),
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
        content: None,
        error: Some(error),
    }
}

fn invalid_pair_write(error: WorkspaceDataFileError) -> WorkspaceRegistryPairWriteResponse {
    WorkspaceRegistryPairWriteResponse {
        ok: false,
        agents_content: None,
        personas_content: None,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_write_increments_revision_and_rejects_stale_writer() {
        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_path = workspace.path().to_string_lossy().into_owned();
        let content = concat!(
            r#"{"version":6,"workspaceId":"workspace-1","revision":0,"#,
            r#""agents":[],"updatedAt":""}"#
        );

        let first = write_workspace_registry_file(
            workspace_path.clone(),
            "agents.json".to_string(),
            0,
            content.to_string(),
        );
        assert!(first.ok);
        assert_eq!(
            first
                .content
                .as_deref()
                .and_then(|content| serde_json::from_str::<serde_json::Value>(content).ok())
                .and_then(|value| value["revision"].as_u64()),
            Some(1)
        );

        let stale = write_workspace_registry_file(
            workspace_path,
            "agents.json".to_string(),
            0,
            content.to_string(),
        );
        assert!(!stale.ok);
        assert_eq!(stale.error, Some(WorkspaceDataFileError::RevisionConflict));
    }

    #[test]
    fn generic_write_cannot_bypass_registry_revision_check() {
        let workspace = tempfile::tempdir().expect("workspace");
        let result = write_workspace_data_file(
            workspace.path().to_string_lossy().into_owned(),
            "personas.json".to_string(),
            "{}".to_string(),
        );

        assert!(!result.ok);
        assert_eq!(result.error, Some(WorkspaceDataFileError::FileInvalid));
    }

    #[test]
    fn registry_pair_write_checks_both_revisions_and_commits_both_files() {
        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_path = workspace.path().to_string_lossy().into_owned();
        let agents = concat!(
            r#"{"version":6,"workspaceId":"workspace-1","revision":0,"#,
            r#""agents":[],"updatedAt":""}"#
        );
        let personas = concat!(
            r#"{"version":2,"workspaceId":"workspace-1","revision":0,"#,
            r#""personas":[],"updatedAt":""}"#
        );

        let result = write_workspace_registry_pair(
            workspace_path.clone(),
            0,
            agents.to_string(),
            0,
            personas.to_string(),
        );
        assert!(result.ok);
        for content in [result.agents_content, result.personas_content] {
            assert_eq!(
                content
                    .as_deref()
                    .and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok())
                    .and_then(|value| value["revision"].as_u64()),
                Some(1)
            );
        }

        let stale = write_workspace_registry_pair(
            workspace_path,
            0,
            agents.to_string(),
            1,
            personas.to_string(),
        );
        assert_eq!(stale.error, Some(WorkspaceDataFileError::RevisionConflict));
    }

    #[test]
    fn registry_read_recovers_interrupted_pair_transaction() {
        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_root = workspace.path();
        let agents = r#"{"revision":3,"agents":[{"id":"agent-1"}]}"#;
        let personas = r#"{"revision":4,"personas":[{"id":"persona-1"}]}"#;
        let workduck_root = workspace_root.join(WORKDUCK_DIRECTORY_NAME);
        fs::create_dir(&workduck_root).expect("workduck root");
        let transaction = serde_json::to_string(&WorkspaceRegistryTransaction {
            agents_content: agents.to_string(),
            personas_content: personas.to_string(),
        })
        .expect("transaction");
        fs::write(
            workduck_root.join(REGISTRY_TRANSACTION_FILE_NAME),
            transaction,
        )
        .expect("transaction journal");
        fs::write(workduck_root.join("agents.json"), "{\"revision\":2}")
            .expect("partial agents write");

        let response = read_workspace_data_file(
            workspace_root.to_string_lossy().into_owned(),
            "personas.json".to_string(),
        );

        assert!(response.ok);
        assert_eq!(response.content.as_deref(), Some(personas));
        assert_eq!(
            fs::read_to_string(workduck_root.join("agents.json")).expect("agents recovered"),
            agents
        );
        assert!(!workduck_root.join(REGISTRY_TRANSACTION_FILE_NAME).exists());
    }
}
