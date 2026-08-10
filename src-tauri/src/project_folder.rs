use std::{
    fs,
    io::{self, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
};

use crate::ssealed_scaffold_generated::{
    SsealedScaffold, SSEALED_SCAFFOLD_TOOL_VERSION, SSEALED_SCAFFOLDS,
};
use crate::atomic_file_write::{write_file_atomically, write_file_exclusively};
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};
use crate::windows_filename::is_windows_reserved_name;
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const PROJECTS_DIRECTORY_NAME: &str = "projects";
const PROJECT_FOLDER_NAME_MAX_CHARS: usize = 80;
const DELETE_FOLDER_MAX_ATTEMPTS: usize = 4;
const DELETE_FOLDER_RETRY_DELAY: Duration = Duration::from_millis(75);
const SSEALED_SCAFFOLD_LOCK_FILE_NAME: &str = ".ssealed-init.lock";
const SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME: &str = "apply-journal.json";
const SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION: u32 = 1;

#[derive(serde::Serialize)]
pub enum ProjectFolderError {
    #[serde(rename = "project-folder-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "project-folder-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "project-folder-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "project-folder-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "project-folder-workspace-permission-denied")]
    WorkspacePermissionDenied,
    #[serde(rename = "project-folder-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "project-folder-root-invalid")]
    RootInvalid,
    #[serde(rename = "project-folder-parent-required")]
    ParentRequired,
    #[serde(rename = "project-folder-parent-invalid")]
    ParentInvalid,
    #[serde(rename = "project-folder-parent-not-found")]
    ParentNotFound,
    #[serde(rename = "project-folder-path-required")]
    PathRequired,
    #[serde(rename = "project-folder-path-invalid")]
    PathInvalid,
    #[serde(rename = "project-folder-name-required")]
    NameRequired,
    #[serde(rename = "project-folder-name-invalid")]
    NameInvalid,
    #[serde(rename = "project-folder-conflict")]
    Conflict,
    #[serde(rename = "project-folder-create-failed")]
    CreateFailed,
    #[serde(rename = "project-folder-ssealed-scaffold-failed")]
    SsealedScaffoldFailed,
    #[serde(rename = "project-folder-ssealed-scaffold-locked")]
    SsealedScaffoldLocked,
    #[serde(rename = "project-folder-open-path-required")]
    OpenPathRequired,
    #[serde(rename = "project-folder-open-path-not-absolute")]
    OpenPathNotAbsolute,
    #[serde(rename = "project-folder-open-path-not-found")]
    OpenPathNotFound,
    #[serde(rename = "project-folder-open-path-not-directory")]
    OpenPathNotDirectory,
    #[serde(rename = "project-folder-open-path-permission-denied")]
    OpenPathPermissionDenied,
    #[serde(rename = "project-folder-repository-path-outside-workspace")]
    RepositoryPathOutsideWorkspace,
    #[serde(rename = "project-folder-open-failed")]
    OpenFailed,
    #[serde(rename = "project-folder-delete-path-required")]
    DeletePathRequired,
    #[serde(rename = "project-folder-delete-path-not-absolute")]
    DeletePathNotAbsolute,
    #[serde(rename = "project-folder-delete-path-not-found")]
    DeletePathNotFound,
    #[serde(rename = "project-folder-delete-path-not-directory")]
    DeletePathNotDirectory,
    #[serde(rename = "project-folder-delete-path-outside-workspace")]
    DeletePathOutsideWorkspace,
    #[serde(rename = "project-folder-delete-path-permission-denied")]
    DeletePathPermissionDenied,
    #[serde(rename = "project-folder-delete-failed")]
    DeleteFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderCreate {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    folder_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    relative_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectFolderError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderOpen {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectFolderError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderDelete {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectFolderError>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderSsealedScaffoldFilePlan {
    path: String,
    kind: String,
    checksum: String,
    status: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderSsealedScaffoldPlan {
    tool_version: &'static str,
    scope: &'static str,
    profile: &'static str,
    density: &'static str,
    runner: &'static str,
    files: Vec<ProjectFolderSsealedScaffoldFilePlan>,
    missing_count: usize,
    added_count: usize,
    unchanged_count: usize,
    conflict_count: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderSsealedScaffoldApply {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    plan: Option<ProjectFolderSsealedScaffoldPlan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectFolderError>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SsealedScaffoldApplyJournal {
    version: u32,
    manifest_checksum: String,
    files: Vec<SsealedScaffoldApplyJournalFile>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct SsealedScaffoldApplyJournalFile {
    path: String,
    checksum: String,
}

#[tauri::command]
pub fn create_project_folder(workspace_path: String, folder_name: String) -> ProjectFolderCreate {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid(error),
    };
    let projects_root = match ensure_projects_root(&workspace_root) {
        Ok(projects_root) => projects_root,
        Err(error) => return invalid(error),
    };
    let folder_name = match validate_project_folder_name(&folder_name) {
        Ok(folder_name) => folder_name,
        Err(error) => return invalid(error),
    };
    let relative_segments = vec![PROJECTS_DIRECTORY_NAME.to_owned(), folder_name.clone()];

    create_folder(&projects_root, relative_segments, folder_name, None)
}

#[tauri::command]
pub fn create_project_group_folder(
    workspace_path: String,
    parent_relative_path: String,
    folder_name: String,
    ssealed_scaffold_scope: Option<String>,
    ssealed_scaffold_profile: Option<String>,
) -> ProjectFolderCreate {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid(error),
    };
    let projects_root = match ensure_projects_root(&workspace_root) {
        Ok(projects_root) => projects_root,
        Err(error) => return invalid(error),
    };
    let parent_segments = match validate_parent_relative_path(&parent_relative_path) {
        Ok(parent_segments) => parent_segments,
        Err(error) => return invalid(error),
    };
    let parent_path = match resolve_parent_path(&projects_root, &parent_segments) {
        Ok(parent_path) => parent_path,
        Err(error) => return invalid(error),
    };
    let folder_name = match validate_project_folder_name(&folder_name) {
        Ok(folder_name) => folder_name,
        Err(error) => return invalid(error),
    };
    let ssealed_scaffold = match validate_ssealed_scaffold_selection(
        ssealed_scaffold_scope,
        ssealed_scaffold_profile,
    ) {
        Ok(scaffold) => scaffold,
        Err(error) => return invalid(error),
    };
    let mut relative_segments = parent_segments;
    relative_segments.push(folder_name.clone());

    create_folder(
        &parent_path,
        relative_segments,
        folder_name,
        ssealed_scaffold,
    )
}

#[tauri::command]
pub fn ensure_project_folder_path(
    workspace_path: String,
    relative_path: String,
) -> ProjectFolderCreate {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid(error),
    };
    let projects_root = match ensure_projects_root(&workspace_root) {
        Ok(projects_root) => projects_root,
        Err(error) => return invalid(error),
    };
    let relative_segments = match validate_project_relative_path(&relative_path) {
        Ok(relative_segments) => relative_segments,
        Err(error) => return invalid(error),
    };

    ensure_folder_path(&projects_root, relative_segments)
}

#[tauri::command]
pub fn open_project_folder_path(path: String) -> ProjectFolderOpen {
    let folder_path = match validate_open_folder_path(&path) {
        Ok(folder_path) => folder_path,
        Err(error) => return invalid_open(error),
    };

    open_folder(&folder_path)
}

#[tauri::command]
pub fn open_project_node_folder(
    workspace_path: String,
    relative_path: String,
) -> ProjectFolderOpen {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_open(error),
    };
    let projects_root = match ensure_projects_root(&workspace_root) {
        Ok(projects_root) => projects_root,
        Err(error) => return invalid_open(error),
    };
    let relative_segments = match validate_project_relative_path(&relative_path) {
        Ok(relative_segments) => relative_segments,
        Err(error) => return invalid_open(error),
    };
    let folder_path = match resolve_project_folder_path(&projects_root, &relative_segments) {
        Ok(folder_path) => folder_path,
        Err(error) => return invalid_open(error),
    };

    open_folder(&folder_path)
}

#[tauri::command]
pub fn delete_project_node_folder(
    workspace_path: String,
    relative_path: String,
) -> ProjectFolderDelete {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_delete(error),
    };
    let projects_root = match validate_existing_projects_root(&workspace_root) {
        Ok(projects_root) => projects_root,
        Err(error) => return invalid_delete(error),
    };
    let relative_segments = match validate_project_relative_path(&relative_path) {
        Ok(relative_segments) => relative_segments,
        Err(error) => return invalid_delete(error),
    };
    let folder_path =
        match resolve_deletable_project_folder_path(&projects_root, &relative_segments) {
            Ok(folder_path) => folder_path,
            Err(error) => return invalid_delete(error),
        };

    delete_folder_tree(&folder_path)
}

#[tauri::command]
pub fn delete_project_repository_folder(
    workspace_path: String,
    path: String,
) -> ProjectFolderDelete {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_delete(error),
    };
    let projects_root = match validate_existing_projects_root(&workspace_root) {
        Ok(projects_root) => projects_root,
        Err(error) => return invalid_delete(error),
    };
    let folder_path = match validate_deletable_absolute_folder_path(&projects_root, &path) {
        Ok(folder_path) => folder_path,
        Err(error) => return invalid_delete(error),
    };

    delete_folder_tree(&folder_path)
}

#[tauri::command]
pub fn preview_ssealed_scaffold_for_repository(
    workspace_path: String,
    path: String,
    ssealed_scaffold_scope: String,
    ssealed_scaffold_profile: Option<String>,
) -> ProjectFolderSsealedScaffoldApply {
    inspect_or_apply_ssealed_scaffold_for_repository(
        workspace_path,
        path,
        ssealed_scaffold_scope,
        ssealed_scaffold_profile,
        false,
    )
}

#[tauri::command]
pub fn apply_ssealed_scaffold_to_repository(
    workspace_path: String,
    path: String,
    ssealed_scaffold_scope: String,
    ssealed_scaffold_profile: Option<String>,
) -> ProjectFolderSsealedScaffoldApply {
    inspect_or_apply_ssealed_scaffold_for_repository(
        workspace_path,
        path,
        ssealed_scaffold_scope,
        ssealed_scaffold_profile,
        true,
    )
}

fn inspect_or_apply_ssealed_scaffold_for_repository(
    workspace_path: String,
    path: String,
    ssealed_scaffold_scope: String,
    ssealed_scaffold_profile: Option<String>,
    should_apply: bool,
) -> ProjectFolderSsealedScaffoldApply {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid_ssealed_apply(error),
    };
    let repository_path = match validate_existing_repository_folder_path(&workspace_root, &path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_ssealed_apply(error),
    };
    let ssealed_scaffold =
        match validate_ssealed_scaffold_selection(
            Some(ssealed_scaffold_scope),
            ssealed_scaffold_profile,
        ) {
            Ok(Some(scaffold)) => scaffold,
            Ok(None) => return invalid_ssealed_apply(ProjectFolderError::SsealedScaffoldFailed),
            Err(error) => return invalid_ssealed_apply(error),
        };
    let _scaffold_lock = match acquire_ssealed_scaffold_lock(&repository_path) {
        Ok(scaffold_lock) => scaffold_lock,
        Err(error) => return invalid_ssealed_apply(error),
    };

    match create_ssealed_repository_scaffold_plan(
        &repository_path,
        ssealed_scaffold.0,
        ssealed_scaffold.1,
        should_apply,
    ) {
        Ok(plan) => ProjectFolderSsealedScaffoldApply {
            ok: true,
            plan: Some(plan),
            error: None,
        },
        Err(error) => invalid_ssealed_apply(error),
    }
}

fn validate_workspace_root(path: &str) -> Result<PathBuf, ProjectFolderError> {
    validate_absolute_directory_path(path).map_err(map_workspace_path_validation_error)
}

fn ensure_projects_root(workspace_root: &Path) -> Result<PathBuf, ProjectFolderError> {
    let projects_root = workspace_root.join(PROJECTS_DIRECTORY_NAME);

    match fs::symlink_metadata(&projects_root) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(ProjectFolderError::RootInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&projects_root).map_err(map_create_error)?;
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    let normalized_projects_root = fs::canonicalize(&projects_root).map_err(map_workspace_error)?;

    if !normalized_projects_root.starts_with(workspace_root) {
        return Err(ProjectFolderError::RootInvalid);
    }

    fs::read_dir(&normalized_projects_root).map_err(map_workspace_error)?;

    Ok(normalized_projects_root)
}

fn validate_existing_projects_root(workspace_root: &Path) -> Result<PathBuf, ProjectFolderError> {
    let projects_root = workspace_root.join(PROJECTS_DIRECTORY_NAME);
    let metadata = fs::symlink_metadata(&projects_root).map_err(map_delete_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectFolderError::RootInvalid);
    }

    let normalized_projects_root =
        fs::canonicalize(&projects_root).map_err(map_delete_path_error)?;

    if !normalized_projects_root.starts_with(workspace_root) {
        return Err(ProjectFolderError::RootInvalid);
    }

    Ok(normalized_projects_root)
}

fn validate_parent_relative_path(path: &str) -> Result<Vec<String>, ProjectFolderError> {
    let trimmed_path = path.trim().replace('\\', "/");

    if trimmed_path.is_empty() {
        return Err(ProjectFolderError::ParentRequired);
    }

    let segments: Vec<String> = trimmed_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(str::to_owned)
        .collect();

    if segments.len() < 2 || segments.first().map(String::as_str) != Some(PROJECTS_DIRECTORY_NAME) {
        return Err(ProjectFolderError::ParentInvalid);
    }

    if segments
        .iter()
        .any(|segment| validate_project_folder_name(segment).is_err())
    {
        return Err(ProjectFolderError::ParentInvalid);
    }

    Ok(segments)
}

fn validate_project_relative_path(path: &str) -> Result<Vec<String>, ProjectFolderError> {
    let trimmed_path = path.trim().replace('\\', "/");

    if trimmed_path.is_empty() {
        return Err(ProjectFolderError::PathRequired);
    }

    let segments: Vec<String> = trimmed_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(str::to_owned)
        .collect();

    if segments.len() < 2 || segments.first().map(String::as_str) != Some(PROJECTS_DIRECTORY_NAME) {
        return Err(ProjectFolderError::PathInvalid);
    }

    if segments
        .iter()
        .any(|segment| validate_project_folder_name(segment).is_err())
    {
        return Err(ProjectFolderError::PathInvalid);
    }

    Ok(segments)
}

fn resolve_parent_path(
    projects_root: &Path,
    parent_segments: &[String],
) -> Result<PathBuf, ProjectFolderError> {
    let mut parent_path = projects_root.to_path_buf();

    for segment in parent_segments.iter().skip(1) {
        parent_path.push(segment);
    }

    let metadata = fs::symlink_metadata(&parent_path).map_err(map_parent_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectFolderError::ParentInvalid);
    }

    let normalized_parent_path = fs::canonicalize(&parent_path).map_err(map_parent_error)?;

    if !normalized_parent_path.starts_with(projects_root) {
        return Err(ProjectFolderError::ParentInvalid);
    }

    Ok(normalized_parent_path)
}

fn resolve_project_folder_path(
    projects_root: &Path,
    relative_segments: &[String],
) -> Result<PathBuf, ProjectFolderError> {
    let mut folder_path = projects_root.to_path_buf();

    for segment in relative_segments.iter().skip(1) {
        folder_path.push(segment);
    }

    let metadata = fs::symlink_metadata(&folder_path).map_err(map_open_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectFolderError::OpenPathNotDirectory);
    }

    let normalized_folder_path = fs::canonicalize(&folder_path).map_err(map_open_path_error)?;

    if !normalized_folder_path.starts_with(projects_root) {
        return Err(ProjectFolderError::OpenFailed);
    }

    Ok(normalized_folder_path)
}

fn resolve_deletable_project_folder_path(
    projects_root: &Path,
    relative_segments: &[String],
) -> Result<PathBuf, ProjectFolderError> {
    let mut folder_path = projects_root.to_path_buf();

    for segment in relative_segments.iter().skip(1) {
        folder_path.push(segment);
    }

    validate_deletable_folder_path(projects_root, &folder_path)
}

fn validate_deletable_absolute_folder_path(
    projects_root: &Path,
    path: &str,
) -> Result<PathBuf, ProjectFolderError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectFolderError::DeletePathRequired);
    }

    let folder_path = PathBuf::from(trimmed_path);

    if !folder_path.is_absolute() {
        return Err(ProjectFolderError::DeletePathNotAbsolute);
    }

    validate_deletable_folder_path(projects_root, &folder_path)
}

fn validate_existing_repository_folder_path(
    workspace_root: &Path,
    path: &str,
) -> Result<PathBuf, ProjectFolderError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectFolderError::OpenPathRequired);
    }

    let folder_path = PathBuf::from(trimmed_path);

    if !folder_path.is_absolute() {
        return Err(ProjectFolderError::OpenPathNotAbsolute);
    }

    let metadata = fs::symlink_metadata(&folder_path).map_err(map_open_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectFolderError::OpenPathNotDirectory);
    }

    let normalized_folder_path = fs::canonicalize(&folder_path).map_err(map_open_path_error)?;

    if normalized_folder_path == workspace_root || !normalized_folder_path.starts_with(workspace_root)
    {
        return Err(ProjectFolderError::RepositoryPathOutsideWorkspace);
    }

    Ok(normalized_folder_path)
}

fn validate_deletable_folder_path(
    projects_root: &Path,
    folder_path: &Path,
) -> Result<PathBuf, ProjectFolderError> {
    let metadata = fs::symlink_metadata(folder_path).map_err(map_delete_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectFolderError::DeletePathNotDirectory);
    }

    let normalized_folder_path = fs::canonicalize(folder_path).map_err(map_delete_path_error)?;

    if normalized_folder_path == projects_root || !normalized_folder_path.starts_with(projects_root)
    {
        return Err(ProjectFolderError::DeletePathOutsideWorkspace);
    }

    Ok(normalized_folder_path)
}

fn validate_project_folder_name(name: &str) -> Result<String, ProjectFolderError> {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err(ProjectFolderError::NameRequired);
    }

    if trimmed_name.chars().count() > PROJECT_FOLDER_NAME_MAX_CHARS
        || trimmed_name == "."
        || trimmed_name == ".."
        || trimmed_name.ends_with([' ', '.'])
        || is_windows_reserved_name(trimmed_name)
        || trimmed_name.chars().any(|character| {
            matches!(
                character,
                '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*'
            ) || character.is_control()
        })
    {
        return Err(ProjectFolderError::NameInvalid);
    }

    Ok(trimmed_name.to_owned())
}

fn create_folder(
    parent_path: &Path,
    relative_segments: Vec<String>,
    folder_name: String,
    ssealed_scaffold: Option<(&'static str, &'static str)>,
) -> ProjectFolderCreate {
    let target_path = parent_path.join(&folder_name);

    match fs::symlink_metadata(&target_path) {
        Ok(metadata) => {
            if ssealed_scaffold.is_some() {
                return invalid(ProjectFolderError::Conflict);
            }

            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return invalid(ProjectFolderError::Conflict);
            }

            return valid_existing_folder(
                parent_path,
                &target_path,
                relative_segments,
                folder_name,
            );
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return invalid(map_workspace_error(error)),
    }

    if let Err(error) = fs::create_dir(&target_path) {
        return invalid(map_create_error(error));
    }

    let metadata = match fs::symlink_metadata(&target_path) {
        Ok(metadata) => metadata,
        Err(error) => return invalid(map_workspace_error(error)),
    };

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return invalid(ProjectFolderError::CreateFailed);
    }

    let normalized_target_path = match fs::canonicalize(&target_path) {
        Ok(path) => path,
        Err(error) => return invalid(map_workspace_error(error)),
    };

    if !normalized_target_path.starts_with(parent_path) {
        return invalid(ProjectFolderError::CreateFailed);
    }

    if let Some((scope, profile)) = ssealed_scaffold {
        let _scaffold_lock = match acquire_ssealed_scaffold_lock(&normalized_target_path) {
            Ok(scaffold_lock) => scaffold_lock,
            Err(ProjectFolderError::SsealedScaffoldLocked) => {
                return invalid(ProjectFolderError::SsealedScaffoldLocked);
            }
            Err(error) => {
                let _ = fs::remove_dir_all(&normalized_target_path);
                return invalid(error);
            }
        };

        if let Err(error) = write_ssealed_scaffold(&normalized_target_path, scope, profile) {
            let _ = fs::remove_dir_all(&normalized_target_path);
            return invalid(error);
        }
    }

    ProjectFolderCreate {
        ok: true,
        folder_name: Some(folder_name),
        relative_path: Some(relative_segments.join("/")),
        error: None,
    }
}

fn ensure_folder_path(projects_root: &Path, relative_segments: Vec<String>) -> ProjectFolderCreate {
    let folder_name = match relative_segments.last() {
        Some(folder_name) => folder_name.clone(),
        None => return invalid(ProjectFolderError::PathInvalid),
    };
    let mut current_path = projects_root.to_path_buf();

    for segment in relative_segments.iter().skip(1) {
        current_path.push(segment);

        match fs::symlink_metadata(&current_path) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return invalid(ProjectFolderError::Conflict);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                if let Err(error) = fs::create_dir(&current_path) {
                    return invalid(map_create_error(error));
                }
            }
            Err(error) => return invalid(map_workspace_error(error)),
        }

        let normalized_current_path = match fs::canonicalize(&current_path) {
            Ok(path) => path,
            Err(error) => return invalid(map_workspace_error(error)),
        };

        if !normalized_current_path.starts_with(projects_root) {
            return invalid(ProjectFolderError::Conflict);
        }

        current_path = normalized_current_path;
    }

    ProjectFolderCreate {
        ok: true,
        folder_name: Some(folder_name),
        relative_path: Some(relative_segments.join("/")),
        error: None,
    }
}

fn valid_existing_folder(
    parent_path: &Path,
    target_path: &Path,
    relative_segments: Vec<String>,
    folder_name: String,
) -> ProjectFolderCreate {
    let normalized_target_path = match fs::canonicalize(target_path) {
        Ok(path) => path,
        Err(error) => return invalid(map_workspace_error(error)),
    };

    if !normalized_target_path.starts_with(parent_path) {
        return invalid(ProjectFolderError::Conflict);
    }

    ProjectFolderCreate {
        ok: true,
        folder_name: Some(folder_name),
        relative_path: Some(relative_segments.join("/")),
        error: None,
    }
}

fn validate_ssealed_scaffold_selection(
    scope: Option<String>,
    profile: Option<String>,
) -> Result<Option<(&'static str, &'static str)>, ProjectFolderError> {
    let Some(scope) = scope else {
        return Ok(None);
    };
    let scope = scope.trim();

    if scope.is_empty() || scope == "none" {
        return Ok(None);
    }

    let profile = profile
        .as_deref()
        .map(str::trim)
        .filter(|profile| !profile.is_empty())
        .unwrap_or("generic");

    find_ssealed_scaffold(scope, profile)
        .map(|scaffold| Some((scaffold.scope, scaffold.profile)))
        .ok_or(ProjectFolderError::SsealedScaffoldFailed)
}

fn find_ssealed_scaffold(scope: &str, profile: &str) -> Option<&'static SsealedScaffold> {
    SSEALED_SCAFFOLDS
        .iter()
        .find(|candidate| candidate.scope == scope && candidate.profile == profile)
}

fn write_ssealed_scaffold(
    target_path: &Path,
    scope: &str,
    profile: &str,
) -> Result<(), ProjectFolderError> {
    let scaffold =
        find_ssealed_scaffold(scope, profile).ok_or(ProjectFolderError::SsealedScaffoldFailed)?;
    let mut manifest_files = Vec::with_capacity(scaffold.files.len());

    for file in scaffold.files {
        write_ssealed_scaffold_file(target_path, file.path, file.content)?;
        manifest_files.push(serde_json::json!({
            "path": file.path,
            "checksum": sha256_checksum(file.content),
            "kind": file.kind,
        }));
    }

    let generated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned());
    let manifest = serde_json::json!({
        "tool": "ssealed",
        "version": SSEALED_SCAFFOLD_TOOL_VERSION,
        "generatedBy": "workduck",
        "generatedAt": generated_at,
        "scope": scaffold.scope,
        "profile": scaffold.profile,
        "density": scaffold.density,
        "runner": scaffold.runner,
        "files": manifest_files,
    });
    let manifest_content =
        serde_json::to_string_pretty(&manifest).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    write_ssealed_scaffold_file(
        target_path,
        ".ssealed/manifest.json",
        &(manifest_content + "\n"),
    )
}

fn write_ssealed_scaffold_file(
    target_path: &Path,
    relative_path: &str,
    content: &str,
) -> Result<(), ProjectFolderError> {
    let file_path = resolve_ssealed_scaffold_file_path(target_path, relative_path)?;

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_file() || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    create_ssealed_scaffold_parent_directories(target_path, relative_path)?;

    fs::write(file_path, content).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
}

fn create_ssealed_repository_scaffold_plan(
    target_path: &Path,
    scope: &str,
    profile: &str,
    should_apply: bool,
) -> Result<ProjectFolderSsealedScaffoldPlan, ProjectFolderError> {
    let scaffold =
        find_ssealed_scaffold(scope, profile).ok_or(ProjectFolderError::SsealedScaffoldFailed)?;
    if should_apply {
        recover_ssealed_repository_apply_journal(target_path)?;
    }
    let mut files = Vec::with_capacity(scaffold.files.len());
    let mut missing_count = 0;
    let mut unchanged_count = 0;
    let mut conflict_count = 0;

    for file in scaffold.files {
        let checksum = sha256_checksum(file.content);
        let status = inspect_ssealed_repository_scaffold_file(
            target_path,
            file.path,
            file.content,
        )?;

        match status {
            "missing" => missing_count += 1,
            "unchanged" => unchanged_count += 1,
            "conflict" => conflict_count += 1,
            _ => return Err(ProjectFolderError::SsealedScaffoldFailed),
        }

        files.push(ProjectFolderSsealedScaffoldFilePlan {
            path: file.path.to_owned(),
            kind: file.kind.to_owned(),
            checksum,
            status: status.to_owned(),
        });
    }

    let plan = ProjectFolderSsealedScaffoldPlan {
        tool_version: SSEALED_SCAFFOLD_TOOL_VERSION,
        scope: scaffold.scope,
        profile: scaffold.profile,
        density: scaffold.density,
        runner: scaffold.runner,
        files,
        missing_count,
        added_count: 0,
        unchanged_count,
        conflict_count,
    };

    if should_apply {
        apply_ssealed_repository_scaffold_plan(target_path, scaffold, plan, None)
    } else {
        Ok(plan)
    }
}

fn apply_ssealed_repository_scaffold_plan(
    target_path: &Path,
    scaffold: &SsealedScaffold,
    plan: ProjectFolderSsealedScaffoldPlan,
    failure_after_created_files: Option<usize>,
) -> Result<ProjectFolderSsealedScaffoldPlan, ProjectFolderError> {
    let mut committed_plan = plan.clone();
    for file in &mut committed_plan.files {
        if file.status == "missing" {
            file.status = "added".to_string();
        }
    }
    committed_plan.added_count = committed_plan.missing_count;
    committed_plan.missing_count = 0;

    let manifest_content = create_ssealed_repository_apply_manifest_content(&committed_plan)?;
    let missing_files = scaffold
        .files
        .iter()
        .filter(|file| {
            plan.files
                .iter()
                .any(|planned| planned.path == file.path && planned.status == "missing")
        })
        .collect::<Vec<_>>();
    let staging_directory = tempfile::Builder::new()
        .prefix(".ssealed-stage.")
        .tempdir_in(target_path)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    for file in &missing_files {
        let staging_path = resolve_ssealed_scaffold_file_path(staging_directory.path(), file.path)?;
        create_ssealed_scaffold_parent_directories(staging_directory.path(), file.path)?;
        fs::write(staging_path, file.content)
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    }

    for file in &missing_files {
        if inspect_ssealed_repository_scaffold_file(target_path, file.path, file.content)? != "missing"
        {
            return Err(ProjectFolderError::Conflict);
        }
    }

    let journal = SsealedScaffoldApplyJournal {
        version: SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION,
        manifest_checksum: sha256_checksum(&manifest_content),
        files: missing_files
            .iter()
            .map(|file| SsealedScaffoldApplyJournalFile {
                path: file.path.to_string(),
                checksum: sha256_checksum(file.content),
            })
            .collect(),
    };
    let journal_path = write_ssealed_repository_apply_journal(target_path, &journal)?;
    let mut created_files = Vec::with_capacity(missing_files.len());
    let mut created_directories = Vec::new();

    let apply_result = (|| {
        for file in &missing_files {
            create_ssealed_scaffold_parent_directories_tracking(
                target_path,
                file.path,
                &mut created_directories,
            )?;
            let staging_path =
                resolve_ssealed_scaffold_file_path(staging_directory.path(), file.path)?;
            let staged_content = fs::read_to_string(staging_path)
                .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
            let target_file_path = resolve_ssealed_scaffold_file_path(target_path, file.path)?;
            write_file_exclusively(&target_file_path, &staged_content).map_err(|error| match error {
                crate::atomic_file_write::AtomicFileWriteError::TargetAlreadyExists => {
                    ProjectFolderError::Conflict
                }
                _ => ProjectFolderError::SsealedScaffoldFailed,
            })?;
            created_files.push(target_file_path);

            if failure_after_created_files
                .is_some_and(|limit| created_files.len() >= limit)
            {
                return Err(ProjectFolderError::SsealedScaffoldFailed);
            }
        }

        write_ssealed_repository_manifest_file(target_path, &manifest_content)
    })();

    if let Err(error) = apply_result {
        rollback_ssealed_repository_apply(&created_files, &created_directories);
        let _ = fs::remove_file(&journal_path);
        return Err(error);
    }

    let _ = fs::remove_file(journal_path);
    Ok(committed_plan)
}

fn inspect_ssealed_repository_scaffold_file(
    target_path: &Path,
    relative_path: &str,
    content: &str,
) -> Result<&'static str, ProjectFolderError> {
    if has_ssealed_repository_scaffold_parent_conflict(target_path, relative_path)? {
        return Ok("conflict");
    }

    let file_path = resolve_ssealed_scaffold_file_path(target_path, relative_path)?;

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_dir() {
                return Ok("conflict");
            }

            if !metadata.is_file() {
                return Ok("conflict");
            }

            match fs::read_to_string(&file_path) {
                Ok(existing_content) if existing_content == content => Ok("unchanged"),
                Ok(_) => Ok("conflict"),
                Err(_) => Err(ProjectFolderError::SsealedScaffoldFailed),
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok("missing"),
        Err(_) => Err(ProjectFolderError::SsealedScaffoldFailed),
    }
}

fn has_ssealed_repository_scaffold_parent_conflict(
    target_path: &Path,
    relative_path: &str,
) -> Result<bool, ProjectFolderError> {
    let relative_path = validate_ssealed_scaffold_relative_path(relative_path)?;
    let mut current_path = target_path.to_path_buf();
    let components = relative_path.components().collect::<Vec<_>>();

    for component in components.iter().take(components.len().saturating_sub(1)) {
        let Component::Normal(segment) = component else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        current_path.push(segment);

        match fs::symlink_metadata(&current_path) {
            Ok(metadata) => {
                if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                    return Ok(true);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
        }
    }

    Ok(false)
}

fn create_ssealed_scaffold_parent_directories(
    target_path: &Path,
    relative_path: &str,
) -> Result<(), ProjectFolderError> {
    create_ssealed_scaffold_parent_directories_tracking(target_path, relative_path, &mut Vec::new())
}

fn create_ssealed_scaffold_parent_directories_tracking(
    target_path: &Path,
    relative_path: &str,
    created_directories: &mut Vec<PathBuf>,
) -> Result<(), ProjectFolderError> {
    let relative_path = validate_ssealed_scaffold_relative_path(relative_path)?;
    let mut current_path = target_path.to_path_buf();
    let components = relative_path.components().collect::<Vec<_>>();

    for component in components.iter().take(components.len().saturating_sub(1)) {
        let Component::Normal(segment) = component else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        current_path.push(segment);

        match fs::symlink_metadata(&current_path) {
            Ok(metadata) => {
                if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                    return Err(ProjectFolderError::Conflict);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir(&current_path)
                    .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
                created_directories.push(current_path.clone());
            }
            Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
        }

        let normalized_current_path = fs::canonicalize(&current_path)
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

        if !normalized_current_path.starts_with(target_path) {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }
    }

    Ok(())
}

fn resolve_ssealed_scaffold_file_path(
    target_path: &Path,
    relative_path: &str,
) -> Result<PathBuf, ProjectFolderError> {
    Ok(target_path.join(validate_ssealed_scaffold_relative_path(relative_path)?))
}

fn validate_ssealed_scaffold_relative_path(
    relative_path: &str,
) -> Result<PathBuf, ProjectFolderError> {
    if relative_path.is_empty()
        || relative_path.contains('\0')
        || relative_path.contains('\\')
        || relative_path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let mut validated_path = PathBuf::new();
    for component in path.components() {
        let Component::Normal(segment) = component else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        let Some(segment) = segment.to_str() else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        if segment.ends_with(' ')
            || segment.ends_with('.')
            || segment
                .chars()
                .any(|character| matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
            || is_windows_reserved_name(segment)
        {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }
        validated_path.push(segment);
    }

    if validated_path.as_os_str().is_empty() {
        Err(ProjectFolderError::SsealedScaffoldFailed)
    } else {
        Ok(validated_path)
    }
}

fn create_ssealed_repository_apply_manifest_content(
    plan: &ProjectFolderSsealedScaffoldPlan,
) -> Result<String, ProjectFolderError> {
    let manifest_files: Vec<_> = plan
        .files
        .iter()
        .filter(|file| file.status != "conflict")
        .map(|file| {
            serde_json::json!({
                "path": file.path,
                "checksum": file.checksum,
                "kind": file.kind,
                "status": file.status,
            })
        })
        .collect();
    let manifest_conflicts: Vec<_> = plan
        .files
        .iter()
        .filter(|file| file.status == "conflict")
        .map(|file| {
            serde_json::json!({
                "path": file.path,
                "checksum": file.checksum,
                "kind": file.kind,
            })
        })
        .collect();
    let generated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned());
    let manifest = serde_json::json!({
        "tool": "ssealed",
        "version": plan.tool_version,
        "generatedBy": "workduck",
        "generatedAt": generated_at,
        "scope": plan.scope,
        "profile": plan.profile,
        "density": plan.density,
        "runner": plan.runner,
        "mode": "existing-repository-missing-files",
        "files": manifest_files,
        "conflicts": manifest_conflicts,
    });
    let manifest_content =
        serde_json::to_string_pretty(&manifest).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    Ok(manifest_content + "\n")
}

fn write_ssealed_repository_manifest_file(
    target_path: &Path,
    content: &str,
) -> Result<(), ProjectFolderError> {
    let manifest_directory = ensure_ssealed_manifest_directory(target_path)?;
    let manifest_path = manifest_directory.join("manifest.json");

    match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    write_file_atomically(&manifest_path, content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
}

fn ensure_ssealed_manifest_directory(target_path: &Path) -> Result<PathBuf, ProjectFolderError> {
    let manifest_directory = target_path.join(".ssealed");

    match fs::symlink_metadata(&manifest_directory) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&manifest_directory)
                .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
        }
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    let normalized_manifest_directory = fs::canonicalize(&manifest_directory)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    if !normalized_manifest_directory.starts_with(target_path) {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    Ok(normalized_manifest_directory)
}

fn write_ssealed_repository_apply_journal(
    target_path: &Path,
    journal: &SsealedScaffoldApplyJournal,
) -> Result<PathBuf, ProjectFolderError> {
    let manifest_directory = ensure_ssealed_manifest_directory(target_path)?;
    let journal_path = manifest_directory.join(SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME);

    match fs::symlink_metadata(&journal_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    let content = serde_json::to_string_pretty(journal)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?
        + "\n";
    write_file_atomically(&journal_path, &content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    Ok(journal_path)
}

fn recover_ssealed_repository_apply_journal(
    target_path: &Path,
) -> Result<(), ProjectFolderError> {
    let manifest_directory = target_path.join(".ssealed");
    match fs::symlink_metadata(&manifest_directory) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }
    let normalized_manifest_directory = fs::canonicalize(&manifest_directory)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    if !normalized_manifest_directory.starts_with(target_path) {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let journal_path = normalized_manifest_directory.join(SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME);
    let journal_content = match fs::read_to_string(&journal_path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    };
    let journal: SsealedScaffoldApplyJournal = serde_json::from_str(&journal_content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    if journal.version != SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let manifest_committed = fs::read_to_string(normalized_manifest_directory.join("manifest.json"))
        .map(|content| sha256_checksum(&content) == journal.manifest_checksum)
        .unwrap_or(false);
    if !manifest_committed {
        for file in journal.files.iter().rev() {
            let file_path = resolve_ssealed_scaffold_file_path(target_path, &file.path)?;
            let should_remove = match fs::symlink_metadata(&file_path) {
                Ok(metadata)
                    if !metadata_is_link_or_reparse(&metadata) && metadata.is_file() =>
                {
                    fs::read_to_string(&file_path)
                        .map(|content| sha256_checksum(&content) == file.checksum)
                        .unwrap_or(false)
                }
                Ok(_) => false,
                Err(error) if error.kind() == io::ErrorKind::NotFound => false,
                Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
            };
            if should_remove {
                fs::remove_file(file_path)
                    .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
            }
        }
    }

    fs::remove_file(journal_path).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
}

fn rollback_ssealed_repository_apply(
    created_files: &[PathBuf],
    created_directories: &[PathBuf],
) {
    for file_path in created_files.iter().rev() {
        let _ = fs::remove_file(file_path);
    }
    for directory_path in created_directories.iter().rev() {
        let _ = fs::remove_dir(directory_path);
    }
}

struct SsealedScaffoldLock {
    path: PathBuf,
    _file: fs::File,
}

impl Drop for SsealedScaffoldLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn acquire_ssealed_scaffold_lock(
    target_path: &Path,
) -> Result<SsealedScaffoldLock, ProjectFolderError> {
    let lock_path = target_path.join(SSEALED_SCAFFOLD_LOCK_FILE_NAME);
    if fs::symlink_metadata(&lock_path)
        .map(|metadata| metadata_is_link_or_reparse(&metadata) || metadata.is_dir())
        .unwrap_or(false)
    {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let mut lock_file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&lock_path)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    match lock_file.try_lock() {
        Ok(()) => {}
        Err(fs::TryLockError::WouldBlock) => {
            return Err(ProjectFolderError::SsealedScaffoldLocked);
        }
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }
    lock_file
        .set_len(0)
        .and_then(|_| lock_file.seek(SeekFrom::Start(0)).map(|_| ()))
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    let created_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned());
    let lock_metadata = serde_json::json!({
        "tool": "workduck",
        "pid": std::process::id(),
        "createdAt": created_at,
    });
    let lock_content = serde_json::to_vec_pretty(&lock_metadata)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed);

    if lock_content
        .and_then(|content| {
            lock_file
                .write_all(&content)
                .and_then(|_| lock_file.flush())
                .and_then(|_| lock_file.sync_all())
                .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
        })
        .is_err()
    {
        drop(lock_file);
        let _ = fs::remove_file(&lock_path);
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    Ok(SsealedScaffoldLock {
        path: lock_path,
        _file: lock_file,
    })
}

fn metadata_is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }

    #[cfg(not(windows))]
    false
}

fn sha256_checksum(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let digest = hasher.finalize();
    let mut checksum = String::from("sha256:");

    for byte in digest {
        checksum.push_str(&format!("{byte:02x}"));
    }

    checksum
}

fn validate_open_folder_path(path: &str) -> Result<PathBuf, ProjectFolderError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectFolderError::OpenPathRequired);
    }

    let folder_path = PathBuf::from(trimmed_path);

    if !folder_path.is_absolute() {
        return Err(ProjectFolderError::OpenPathNotAbsolute);
    }

    let metadata = fs::symlink_metadata(&folder_path).map_err(map_open_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectFolderError::OpenPathNotDirectory);
    }

    fs::canonicalize(&folder_path).map_err(map_open_path_error)
}

fn open_folder(path: &Path) -> ProjectFolderOpen {
    let mut command = create_open_folder_command(path);

    match command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(_) => ProjectFolderOpen {
            ok: true,
            error: None,
        },
        Err(_) => invalid_open(ProjectFolderError::OpenFailed),
    }
}

fn delete_folder_tree(path: &Path) -> ProjectFolderDelete {
    let mut last_error = None;

    for attempt_index in 0..DELETE_FOLDER_MAX_ATTEMPTS {
        match fs::remove_dir_all(path) {
            Ok(()) => {
                if is_folder_absent(path) {
                    return ProjectFolderDelete {
                        ok: true,
                        error: None,
                    };
                }

                last_error = Some(ProjectFolderError::DeleteFailed);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return ProjectFolderDelete {
                    ok: true,
                    error: None,
                };
            }
            Err(error) => {
                last_error = Some(map_delete_error(error));
            }
        }

        if attempt_index + 1 < DELETE_FOLDER_MAX_ATTEMPTS {
            thread::sleep(DELETE_FOLDER_RETRY_DELAY);
        }
    }

    invalid_delete(last_error.unwrap_or(ProjectFolderError::DeleteFailed))
}

fn is_folder_absent(path: &Path) -> bool {
    matches!(
        fs::symlink_metadata(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound
    )
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

fn invalid(error: ProjectFolderError) -> ProjectFolderCreate {
    ProjectFolderCreate {
        ok: false,
        folder_name: None,
        relative_path: None,
        error: Some(error),
    }
}

fn invalid_open(error: ProjectFolderError) -> ProjectFolderOpen {
    ProjectFolderOpen {
        ok: false,
        error: Some(error),
    }
}

fn invalid_delete(error: ProjectFolderError) -> ProjectFolderDelete {
    ProjectFolderDelete {
        ok: false,
        error: Some(error),
    }
}

fn invalid_ssealed_apply(error: ProjectFolderError) -> ProjectFolderSsealedScaffoldApply {
    ProjectFolderSsealedScaffoldApply {
        ok: false,
        plan: None,
        error: Some(error),
    }
}

fn map_workspace_error(error: io::Error) -> ProjectFolderError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectFolderError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => ProjectFolderError::WorkspacePermissionDenied,
        _ => ProjectFolderError::WorkspaceUnreadable,
    }
}

fn map_workspace_path_validation_error(
    error: WorkspacePathValidationError,
) -> ProjectFolderError {
    match error {
        WorkspacePathValidationError::Required => ProjectFolderError::WorkspaceRequired,
        WorkspacePathValidationError::NotAbsolute => ProjectFolderError::WorkspaceNotAbsolute,
        WorkspacePathValidationError::NotFound => ProjectFolderError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => ProjectFolderError::WorkspaceNotDirectory,
        WorkspacePathValidationError::PermissionDenied => ProjectFolderError::WorkspacePermissionDenied,
        WorkspacePathValidationError::Unreadable => ProjectFolderError::WorkspaceUnreadable,
    }
}

fn map_parent_error(error: io::Error) -> ProjectFolderError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectFolderError::ParentNotFound,
        io::ErrorKind::PermissionDenied => ProjectFolderError::WorkspacePermissionDenied,
        _ => ProjectFolderError::WorkspaceUnreadable,
    }
}

fn map_create_error(error: io::Error) -> ProjectFolderError {
    match error.kind() {
        io::ErrorKind::AlreadyExists => ProjectFolderError::Conflict,
        io::ErrorKind::PermissionDenied => ProjectFolderError::WorkspacePermissionDenied,
        _ => ProjectFolderError::CreateFailed,
    }
}

fn map_open_path_error(error: io::Error) -> ProjectFolderError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectFolderError::OpenPathNotFound,
        io::ErrorKind::PermissionDenied => ProjectFolderError::OpenPathPermissionDenied,
        _ => ProjectFolderError::OpenFailed,
    }
}

fn map_delete_path_error(error: io::Error) -> ProjectFolderError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectFolderError::DeletePathNotFound,
        io::ErrorKind::PermissionDenied => ProjectFolderError::DeletePathPermissionDenied,
        _ => ProjectFolderError::DeleteFailed,
    }
}

fn map_delete_error(error: io::Error) -> ProjectFolderError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectFolderError::DeletePathNotFound,
        io::ErrorKind::PermissionDenied => ProjectFolderError::DeletePathPermissionDenied,
        _ => ProjectFolderError::DeleteFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_folder_can_include_ssealed_frontend_scaffold_without_backend_files() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product".to_owned(),
                "apps".to_owned(),
                None,
                None,
            )
            .ok
        );

        let result = create_project_group_folder(
            workspace_path,
            "projects/product/apps".to_owned(),
            "web-app".to_owned(),
            Some("frontend".to_owned()),
            Some("generic".to_owned()),
        );

        assert!(result.ok);
        assert_eq!(result.relative_path.as_deref(), Some("projects/product/apps/web-app"));

        let repository_path = tempdir.path().join("projects/product/apps/web-app");
        assert!(repository_path.join("AGENTS.md").is_file());
        assert!(repository_path.join("docs/frontend/FRONTEND_DESIGN.md").is_file());
        assert!(!repository_path.join("docs/backend/README.md").exists());
        assert!(!repository_path.join("api/openapi.yaml").exists());
        assert!(!repository_path.join("db/schema.dbml").exists());

        let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
            .expect("ssealed manifest");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest_content).expect("valid manifest json");

        assert_eq!(manifest["tool"], "ssealed");
        assert_eq!(manifest["version"], SSEALED_SCAFFOLD_TOOL_VERSION);
        assert_eq!(manifest["generatedBy"], "workduck");
        assert_eq!(manifest["scope"], "frontend");
        assert_eq!(manifest["profile"], "generic");
        assert_eq!(manifest["density"], "standard");
        assert_eq!(manifest["runner"], "none");
        assert!(manifest["files"].as_array().is_some_and(|files| {
            files.iter().any(|file| file["path"] == "docs/frontend/FRONTEND_DESIGN.md")
                && !files.iter().any(|file| file["path"] == "docs/backend/README.md")
        }));
    }

    #[test]
    fn repository_folder_can_include_ssealed_general_scaffold_for_unknown_stack() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product".to_owned(),
                "apps".to_owned(),
                None,
                None,
            )
            .ok
        );

        let result = create_project_group_folder(
            workspace_path,
            "projects/product/apps".to_owned(),
            "idea".to_owned(),
            Some("general".to_owned()),
            Some("generic".to_owned()),
        );

        assert!(result.ok);

        let repository_path = tempdir.path().join("projects/product/apps/idea");
        assert!(repository_path.join("docs/product/00-product-brief.md").is_file());
        assert!(!repository_path.join("docs/frontend/FRONTEND_DESIGN.md").exists());
        assert!(!repository_path.join("api/openapi.yaml").exists());
        assert!(!repository_path.join("db/schema.dbml").exists());

        let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
            .expect("ssealed manifest");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest_content).expect("valid manifest json");

        assert_eq!(manifest["scope"], "general");
        assert_eq!(manifest["profile"], "generic");
        assert_eq!(manifest["density"], "standard");
        assert_eq!(manifest["runner"], "none");
    }

    #[test]
    fn repository_folder_can_include_ssealed_api_service_profile() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product".to_owned(),
                "apps".to_owned(),
                None,
                None,
            )
            .ok
        );

        let result = create_project_group_folder(
            workspace_path,
            "projects/product/apps".to_owned(),
            "api".to_owned(),
            Some("backend".to_owned()),
            Some("api-service".to_owned()),
        );

        assert!(result.ok);

        let repository_path = tempdir.path().join("projects/product/apps/api");
        assert!(repository_path.join("docs/backend/README.md").is_file());
        assert!(repository_path.join("docs/api-service/README.md").is_file());
        assert!(repository_path
            .join(".agents/skills/api-service/SKILL.md")
            .is_file());
        assert!(!repository_path.join("docs/cli/README.md").exists());

        let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
            .expect("ssealed manifest");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest_content).expect("valid manifest json");

        assert_eq!(manifest["scope"], "backend");
        assert_eq!(manifest["profile"], "api-service");
        assert_eq!(manifest["density"], "standard");
        assert!(manifest["files"].as_array().is_some_and(|files| {
            files.iter().any(|file| file["path"] == "docs/api-service/README.md")
                && files
                    .iter()
                    .any(|file| file["path"] == ".agents/skills/api-service/SKILL.md")
        }));
    }

    #[test]
    fn ssealed_scaffold_does_not_write_into_existing_repository_folder() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product".to_owned(),
                "apps".to_owned(),
                None,
                None,
            )
            .ok
        );
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product/apps".to_owned(),
                "api".to_owned(),
                None,
                None,
            )
            .ok
        );

        let result = create_project_group_folder(
            workspace_path,
            "projects/product/apps".to_owned(),
            "api".to_owned(),
            Some("backend".to_owned()),
            Some("generic".to_owned()),
        );

        assert!(!result.ok);
        assert!(matches!(result.error, Some(ProjectFolderError::Conflict)));
        assert!(!tempdir
            .path()
            .join("projects/product/apps/api/.ssealed/manifest.json")
            .exists());
    }

    #[test]
    fn existing_repository_can_apply_missing_ssealed_files_without_overwriting_conflicts() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product".to_owned(),
                "apps".to_owned(),
                None,
                None,
            )
            .ok
        );
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product/apps".to_owned(),
                "api".to_owned(),
                None,
                None,
            )
            .ok
        );

        let repository_path = tempdir.path().join("projects/product/apps/api");
        fs::write(repository_path.join("AGENTS.md"), "custom instructions\n")
            .expect("custom AGENTS");
        let repository_path_string = repository_path.to_string_lossy().into_owned();

        let preview = preview_ssealed_scaffold_for_repository(
            workspace_path.clone(),
            repository_path_string.clone(),
            "backend".to_owned(),
            Some("generic".to_owned()),
        );

        assert!(preview.ok);
        let preview_plan = preview.plan.expect("preview plan");
        assert!(preview_plan.missing_count > 0);
        assert!(preview_plan.conflict_count > 0);
        assert!(preview_plan
            .files
            .iter()
            .any(|file| file.path == "AGENTS.md" && file.status == "conflict"));
        assert!(!repository_path.join("docs/backend/README.md").exists());

        let apply = apply_ssealed_scaffold_to_repository(
            workspace_path,
            repository_path_string,
            "backend".to_owned(),
            Some("generic".to_owned()),
        );

        assert!(apply.ok);
        let apply_plan = apply.plan.expect("apply plan");
        assert!(apply_plan.added_count > 0);
        assert_eq!(apply_plan.missing_count, 0);
        assert!(apply_plan
            .files
            .iter()
            .any(|file| file.path == "AGENTS.md" && file.status == "conflict"));
        assert_eq!(
            fs::read_to_string(repository_path.join("AGENTS.md")).expect("AGENTS content"),
            "custom instructions\n"
        );
        assert!(repository_path.join("docs/backend/README.md").is_file());

        let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
            .expect("ssealed manifest");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest_content).expect("valid manifest json");

        assert_eq!(manifest["mode"], "existing-repository-missing-files");
        assert_eq!(manifest["scope"], "backend");
        assert_eq!(manifest["profile"], "generic");
        assert_eq!(manifest["density"], "standard");
        assert!(manifest["conflicts"].as_array().is_some_and(|conflicts| {
            conflicts.iter().any(|file| file["path"] == "AGENTS.md")
        }));
        assert!(manifest["files"].as_array().is_some_and(|files| {
            files.iter().any(|file| file["path"] == "docs/backend/README.md")
        }));
        assert!(!repository_path
            .join(SSEALED_SCAFFOLD_LOCK_FILE_NAME)
            .exists());
    }

    #[test]
    fn existing_repository_preview_and_apply_respect_active_ssealed_lock() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        let repository_path = tempdir.path().join("projects/product");
        let repository_path_string = repository_path.to_string_lossy().into_owned();
        let scaffold_lock = match acquire_ssealed_scaffold_lock(&repository_path) {
            Ok(scaffold_lock) => scaffold_lock,
            Err(_) => panic!("active ssealed lock should be acquired"),
        };
        let preview = preview_ssealed_scaffold_for_repository(
            workspace_path.clone(),
            repository_path_string.clone(),
            "backend".to_owned(),
            Some("generic".to_owned()),
        );
        let apply = apply_ssealed_scaffold_to_repository(
            workspace_path.clone(),
            repository_path_string.clone(),
            "backend".to_owned(),
            Some("generic".to_owned()),
        );

        assert!(!preview.ok);
        assert!(matches!(
            preview.error,
            Some(ProjectFolderError::SsealedScaffoldLocked)
        ));
        assert!(!apply.ok);
        assert!(matches!(
            apply.error,
            Some(ProjectFolderError::SsealedScaffoldLocked)
        ));
        assert!(!repository_path.join(".ssealed/manifest.json").exists());

        drop(scaffold_lock);
        assert!(!repository_path
            .join(SSEALED_SCAFFOLD_LOCK_FILE_NAME)
            .exists());

        let apply_after_unlock = apply_ssealed_scaffold_to_repository(
            workspace_path,
            repository_path_string,
            "backend".to_owned(),
            Some("generic".to_owned()),
        );

        assert!(apply_after_unlock.ok);
        assert!(repository_path.join(".ssealed/manifest.json").is_file());
        assert!(!repository_path
            .join(SSEALED_SCAFFOLD_LOCK_FILE_NAME)
            .exists());
    }

    #[test]
    fn ssealed_scaffold_paths_reject_cross_platform_escape_shapes() {
        let root = Path::new("C:/workspace/project");
        for path in [
            "../outside",
            "a/../outside",
            "a/./file",
            "/absolute/file",
            r"C:\absolute\file",
            r"C:drive-relative\file",
            r"\\server\share\file",
            r"\\?\C:\namespace\file",
            r"a\..\outside",
            "CON.txt",
            "folder/trailing. ",
            "folder/name:stream",
        ] {
            assert!(
                resolve_ssealed_scaffold_file_path(root, path).is_err(),
                "unsafe scaffold path should be rejected: {path}"
            );
        }

        assert_eq!(
            resolve_ssealed_scaffold_file_path(root, "docs/backend/README.md")
                .unwrap_or_else(|_| panic!("portable path should resolve")),
            root.join("docs/backend/README.md")
        );
    }

    #[test]
    fn ssealed_scaffold_lock_recovers_stale_metadata_without_manual_deletion() {
        let repository = tempfile::tempdir().expect("repository");
        let lock_path = repository.path().join(SSEALED_SCAFFOLD_LOCK_FILE_NAME);
        fs::write(&lock_path, r#"{"pid":999999,"createdAt":"stale"}"#)
            .expect("stale lock metadata");

        let lock = acquire_ssealed_scaffold_lock(repository.path())
            .unwrap_or_else(|_| panic!("stale lock metadata should be recovered"));
        drop(lock);
        assert!(!lock_path.exists());
    }

    #[test]
    fn existing_repository_scaffold_rolls_back_only_new_files_after_mid_commit_failure() {
        let repository = tempfile::tempdir().expect("repository");
        let target_path = fs::canonicalize(repository.path()).expect("canonical repository");
        let scaffold = find_ssealed_scaffold("backend", "generic").expect("backend scaffold");
        let preserved_file = &scaffold.files[0];
        create_ssealed_scaffold_parent_directories(&target_path, preserved_file.path)
            .unwrap_or_else(|_| panic!("preserved file parent should be created"));
        fs::write(
            resolve_ssealed_scaffold_file_path(&target_path, preserved_file.path)
                .unwrap_or_else(|_| panic!("preserved file path")),
            "user-owned content\n",
        )
        .expect("preserved file");
        let plan = create_ssealed_repository_scaffold_plan(
            &target_path,
            scaffold.scope,
            scaffold.profile,
            false,
        )
        .unwrap_or_else(|_| panic!("scaffold plan"));
        let missing_paths = plan
            .files
            .iter()
            .filter(|file| file.status == "missing")
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();

        let result = apply_ssealed_repository_scaffold_plan(
            &target_path,
            scaffold,
            plan,
            Some(1),
        );

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(
                resolve_ssealed_scaffold_file_path(&target_path, preserved_file.path)
                    .unwrap_or_else(|_| panic!("preserved file path"))
            )
            .expect("preserved content"),
            "user-owned content\n"
        );
        for missing_path in missing_paths {
            assert!(
                !resolve_ssealed_scaffold_file_path(&target_path, &missing_path)
                    .unwrap_or_else(|_| panic!("missing file path"))
                    .exists(),
                "new scaffold file should be rolled back: {missing_path}"
            );
        }
        assert!(!target_path.join(".ssealed/manifest.json").exists());
        assert!(!target_path
            .join(".ssealed")
            .join(SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME)
            .exists());
    }

    #[test]
    fn stale_scaffold_apply_journal_removes_matching_partial_files() {
        let repository = tempfile::tempdir().expect("repository");
        let target_path = fs::canonicalize(repository.path()).expect("canonical repository");
        let relative_path = "generated/partial.txt";
        let partial_content = "partial generated content\n";
        create_ssealed_scaffold_parent_directories(&target_path, relative_path)
            .unwrap_or_else(|_| panic!("partial parent"));
        let partial_path = resolve_ssealed_scaffold_file_path(&target_path, relative_path)
            .unwrap_or_else(|_| panic!("partial path"));
        fs::write(&partial_path, partial_content).expect("partial file");
        let journal = SsealedScaffoldApplyJournal {
            version: SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION,
            manifest_checksum: "sha256:not-committed".to_string(),
            files: vec![SsealedScaffoldApplyJournalFile {
                path: relative_path.to_string(),
                checksum: sha256_checksum(partial_content),
            }],
        };
        let journal_path = write_ssealed_repository_apply_journal(&target_path, &journal)
            .unwrap_or_else(|_| panic!("journal write"));

        recover_ssealed_repository_apply_journal(&target_path)
            .unwrap_or_else(|_| panic!("journal recovery"));

        assert!(!partial_path.exists());
        assert!(!journal_path.exists());
    }
}
