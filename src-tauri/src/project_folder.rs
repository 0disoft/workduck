use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
};

use crate::ssealed_scaffold_generated::{
    SSEALED_FULLSTACK_SCAFFOLD_FILES, SSEALED_SCAFFOLD_RUNNER, SSEALED_SCAFFOLD_SCOPE,
    SSEALED_SCAFFOLD_TOOL_VERSION,
};
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};
use crate::windows_filename::is_windows_reserved_name;
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const PROJECTS_DIRECTORY_NAME: &str = "projects";
const PROJECT_FOLDER_NAME_MAX_CHARS: usize = 80;
const DELETE_FOLDER_MAX_ATTEMPTS: usize = 4;
const DELETE_FOLDER_RETRY_DELAY: Duration = Duration::from_millis(75);

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

    create_folder(&projects_root, relative_segments, folder_name, false)
}

#[tauri::command]
pub fn create_project_group_folder(
    workspace_path: String,
    parent_relative_path: String,
    folder_name: String,
    ssealed_scaffold: Option<bool>,
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
    let mut relative_segments = parent_segments;
    relative_segments.push(folder_name.clone());

    create_folder(
        &parent_path,
        relative_segments,
        folder_name,
        ssealed_scaffold.unwrap_or(false),
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
    ssealed_scaffold: bool,
) -> ProjectFolderCreate {
    let target_path = parent_path.join(&folder_name);

    match fs::symlink_metadata(&target_path) {
        Ok(metadata) => {
            if ssealed_scaffold {
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

    if ssealed_scaffold {
        if write_ssealed_fullstack_scaffold(&normalized_target_path).is_err() {
            let _ = fs::remove_dir_all(&normalized_target_path);
            return invalid(ProjectFolderError::SsealedScaffoldFailed);
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

fn write_ssealed_fullstack_scaffold(target_path: &Path) -> Result<(), ProjectFolderError> {
    let mut manifest_files = Vec::with_capacity(SSEALED_FULLSTACK_SCAFFOLD_FILES.len());

    for file in SSEALED_FULLSTACK_SCAFFOLD_FILES {
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
        "scope": SSEALED_SCAFFOLD_SCOPE,
        "runner": SSEALED_SCAFFOLD_RUNNER,
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
    let mut file_path = target_path.to_path_buf();

    for segment in relative_path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }

        file_path.push(segment);
    }

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_file() || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    if let Some(parent_path) = file_path.parent() {
        fs::create_dir_all(parent_path).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    }

    fs::write(file_path, content).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
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
    fn repository_folder_can_include_ssealed_fullstack_scaffold() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let workspace_path = tempdir.path().to_string_lossy().into_owned();

        assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product".to_owned(),
                "apps".to_owned(),
                None,
            )
            .ok
        );

        let result = create_project_group_folder(
            workspace_path,
            "projects/product/apps".to_owned(),
            "web-app".to_owned(),
            Some(true),
        );

        assert!(result.ok);
        assert_eq!(result.relative_path.as_deref(), Some("projects/product/apps/web-app"));

        let repository_path = tempdir.path().join("projects/product/apps/web-app");
        assert!(repository_path.join("AGENTS.md").is_file());
        assert!(repository_path.join("docs/backend/README.md").is_file());
        assert!(repository_path.join("docs/frontend/FRONTEND_DESIGN.md").is_file());
        assert!(repository_path.join("api/openapi.yaml").is_file());
        assert!(repository_path.join("db/schema.dbml").is_file());

        let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
            .expect("ssealed manifest");
        let manifest: serde_json::Value =
            serde_json::from_str(&manifest_content).expect("valid manifest json");

        assert_eq!(manifest["tool"], "ssealed");
        assert_eq!(manifest["version"], SSEALED_SCAFFOLD_TOOL_VERSION);
        assert_eq!(manifest["generatedBy"], "workduck");
        assert_eq!(manifest["scope"], SSEALED_SCAFFOLD_SCOPE);
        assert_eq!(manifest["runner"], SSEALED_SCAFFOLD_RUNNER);
        assert!(manifest["files"].as_array().is_some_and(|files| {
            files.iter().any(|file| file["path"] == "docs/backend/README.md")
                && files.iter().any(|file| file["path"] == "docs/frontend/FRONTEND_DESIGN.md")
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
            )
            .ok
        );
        assert!(
            create_project_group_folder(
                workspace_path.clone(),
                "projects/product/apps".to_owned(),
                "api".to_owned(),
                None,
            )
            .ok
        );

        let result = create_project_group_folder(
            workspace_path,
            "projects/product/apps".to_owned(),
            "api".to_owned(),
            Some(true),
        );

        assert!(!result.ok);
        assert!(matches!(result.error, Some(ProjectFolderError::Conflict)));
        assert!(!tempdir
            .path()
            .join("projects/product/apps/api/.ssealed/manifest.json")
            .exists());
    }
}
