use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use zeroize::Zeroize;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const PROJECTS_DIRECTORY_NAME: &str = "projects";
const PROJECT_REPOSITORY_NAME_MAX_CHARS: usize = 120;
const PROJECT_REPOSITORY_REMOTE_URL_MAX_CHARS: usize = 2048;
const PROJECT_REPOSITORY_GITHUB_NAME_MAX_CHARS: usize = 100;
const PROJECT_REPOSITORY_COMMIT_MESSAGE_MAX_CHARS: usize = 200;
const PROJECT_REPOSITORY_CLONE_TIMEOUT: Duration = Duration::from_secs(900);
const PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT: Duration = Duration::from_secs(600);
const PROJECT_REPOSITORY_CLONE_POLL_INTERVAL: Duration = Duration::from_millis(100);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(serde::Serialize)]
pub enum ProjectRepositoryCloneError {
    #[serde(rename = "project-repository-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "project-repository-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "project-repository-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "project-repository-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "project-repository-workspace-permission-denied")]
    WorkspacePermissionDenied,
    #[serde(rename = "project-repository-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "project-repository-group-path-required")]
    GroupPathRequired,
    #[serde(rename = "project-repository-group-path-invalid")]
    GroupPathInvalid,
    #[serde(rename = "project-repository-group-path-not-found")]
    GroupPathNotFound,
    #[serde(rename = "project-repository-group-path-not-directory")]
    GroupPathNotDirectory,
    #[serde(rename = "project-repository-name-required")]
    NameRequired,
    #[serde(rename = "project-repository-name-invalid")]
    NameInvalid,
    #[serde(rename = "project-repository-remote-url-required")]
    RemoteUrlRequired,
    #[serde(rename = "project-repository-remote-url-invalid")]
    RemoteUrlInvalid,
    #[serde(rename = "project-repository-clone-target-exists")]
    CloneTargetExists,
    #[serde(rename = "project-repository-clone-command-unavailable")]
    CloneCommandUnavailable,
    #[serde(rename = "project-repository-clone-command-timed-out")]
    CloneCommandTimedOut,
    #[serde(rename = "project-repository-clone-access-denied")]
    CloneAccessDenied,
    #[serde(rename = "project-repository-clone-auth-required")]
    CloneAuthRequired,
    #[serde(rename = "project-repository-clone-failed")]
    CloneFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryClone {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryCloneError>,
}

#[derive(serde::Serialize)]
pub enum ProjectRepositoryGitError {
    #[serde(rename = "project-repository-git-path-required")]
    PathRequired,
    #[serde(rename = "project-repository-git-path-not-absolute")]
    PathNotAbsolute,
    #[serde(rename = "project-repository-git-path-not-found")]
    PathNotFound,
    #[serde(rename = "project-repository-git-path-not-directory")]
    PathNotDirectory,
    #[serde(rename = "project-repository-git-path-permission-denied")]
    PathPermissionDenied,
    #[serde(rename = "project-repository-git-path-unreadable")]
    PathUnreadable,
    #[serde(rename = "project-repository-git-command-unavailable")]
    CommandUnavailable,
    #[serde(rename = "project-repository-git-command-failed")]
    CommandFailed,
    #[serde(rename = "project-repository-git-command-timed-out")]
    CommandTimedOut,
    #[serde(rename = "project-repository-git-not-repository")]
    NotRepository,
    #[serde(rename = "project-repository-git-init-failed")]
    InitFailed,
    #[serde(rename = "project-repository-git-remote-missing")]
    RemoteMissing,
    #[serde(rename = "project-repository-git-push-auth-required")]
    PushAuthRequired,
    #[serde(rename = "project-repository-git-push-empty")]
    PushEmpty,
    #[serde(rename = "project-repository-git-push-failed")]
    PushFailed,
    #[serde(rename = "project-repository-git-fetch-auth-required")]
    FetchAuthRequired,
    #[serde(rename = "project-repository-git-fetch-failed")]
    FetchFailed,
    #[serde(rename = "project-repository-git-pull-auth-required")]
    PullAuthRequired,
    #[serde(rename = "project-repository-git-pull-conflict")]
    PullConflict,
    #[serde(rename = "project-repository-git-pull-failed")]
    PullFailed,
    #[serde(rename = "project-repository-github-repo-name-required")]
    GithubRepoNameRequired,
    #[serde(rename = "project-repository-github-repo-name-invalid")]
    GithubRepoNameInvalid,
    #[serde(rename = "project-repository-github-commit-message-required")]
    GithubCommitMessageRequired,
    #[serde(rename = "project-repository-github-commit-message-invalid")]
    GithubCommitMessageInvalid,
    #[serde(rename = "project-repository-github-visibility-invalid")]
    GithubVisibilityInvalid,
    #[serde(rename = "project-repository-github-cli-unavailable")]
    GithubCliUnavailable,
    #[serde(rename = "project-repository-github-auth-required")]
    GithubAuthRequired,
    #[serde(rename = "project-repository-github-remote-exists")]
    GithubRemoteExists,
    #[serde(rename = "project-repository-github-empty")]
    GithubEmpty,
    #[serde(rename = "project-repository-github-commit-identity-missing")]
    GithubCommitIdentityMissing,
    #[serde(rename = "project-repository-github-commit-index-locked")]
    GithubCommitIndexLocked,
    #[serde(rename = "project-repository-github-commit-hook-failed")]
    GithubCommitHookFailed,
    #[serde(rename = "project-repository-github-commit-failed")]
    GithubCommitFailed,
    #[serde(rename = "project-repository-github-create-failed")]
    GithubCreateFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitInspection {
    ok: bool,
    is_git_repository: bool,
    has_remote: bool,
    ahead_count: u32,
    behind_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryGitError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitMutation {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryGitError>,
}

struct CloneFailure {
    error: ProjectRepositoryCloneError,
}

struct GitCommandFailure {
    error: ProjectRepositoryGitError,
}

enum GitCredential {
    GithubToken(String),
}

#[tauri::command]
pub fn clone_project_repository(
    workspace_path: String,
    group_relative_path: String,
    repository_name: String,
    remote_url: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryClone {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return invalid(error),
    };
    let group_segments = match validate_group_relative_path(&group_relative_path) {
        Ok(group_segments) => group_segments,
        Err(error) => return invalid(error),
    };
    let group_path = match resolve_group_path(&workspace_root, &group_segments) {
        Ok(group_path) => group_path,
        Err(error) => return invalid(error),
    };
    let repository_folder_name = match validate_repository_folder_name(&repository_name) {
        Ok(repository_folder_name) => repository_folder_name,
        Err(error) => return invalid(error),
    };
    let remote_url = match validate_remote_url(&remote_url) {
        Ok(remote_url) => remote_url,
        Err(error) => return invalid(error),
    };
    let clone_target = group_path.join(repository_folder_name);

    if fs::symlink_metadata(&clone_target).is_ok() {
        return invalid(ProjectRepositoryCloneError::CloneTargetExists);
    }

    let credential = parse_git_credential(credential_kind, credential_value);

    match run_git_clone(&group_path, &remote_url, &clone_target, credential.as_ref()) {
        Ok(()) => {
            let normalized_clone_target =
                fs::canonicalize(&clone_target).unwrap_or_else(|_| clone_target.clone());

            ProjectRepositoryClone {
                ok: true,
                path: Some(normalized_clone_target.to_string_lossy().into_owned()),
                error: None,
            }
        }
        Err(failure) => {
            cleanup_failed_clone_target(&clone_target);
            invalid(failure.error)
        }
    }
}

#[tauri::command]
pub fn inspect_project_repository_git(path: String) -> ProjectRepositoryGitInspection {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_inspection(error),
    };

    match inspect_git_repository(&repository_path) {
        Ok(inspection) => inspection,
        Err(failure) => invalid_git_inspection(failure.error),
    }
}

#[tauri::command]
pub fn initialize_project_repository_git(path: String) -> ProjectRepositoryGitMutation {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_mutation(error),
    };

    match is_git_repository(&repository_path) {
        Ok(true) => return valid_git_mutation(),
        Ok(false) => {}
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    let output = match run_git_command(
        &repository_path,
        &["init"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    ) {
        Ok(output) => output,
        Err(failure) => return invalid_git_mutation(failure.error),
    };

    if output.status.success() {
        valid_git_mutation()
    } else {
        invalid_git_mutation(ProjectRepositoryGitError::InitFailed)
    }
}

#[tauri::command]
pub fn fetch_project_repository_git(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_remote_project_repository_git_command(
        path,
        &["fetch", "--all", "--prune"],
        classify_git_fetch_failure,
        parse_git_credential(credential_kind, credential_value).as_ref(),
    )
}

#[tauri::command]
pub fn pull_project_repository_git(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_remote_project_repository_git_command(
        path,
        &["pull", "--ff-only"],
        classify_git_pull_failure,
        parse_git_credential(credential_kind, credential_value).as_ref(),
    )
}

#[tauri::command]
pub fn push_project_repository_git(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_remote_project_repository_git_command(
        path,
        &["push", "-u", "origin", "HEAD"],
        classify_git_push_failure,
        parse_git_credential(credential_kind, credential_value).as_ref(),
    )
}

#[tauri::command]
pub fn publish_project_repository_to_github(
    path: String,
    repository_name: String,
    commit_message: String,
    visibility: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_mutation(error),
    };
    let repository_name = match validate_github_repository_name(&repository_name) {
        Ok(repository_name) => repository_name,
        Err(error) => return invalid_git_mutation(error),
    };
    let commit_message = match validate_commit_message(&commit_message) {
        Ok(commit_message) => commit_message,
        Err(error) => return invalid_git_mutation(error),
    };
    let visibility_flag = match validate_github_visibility(&visibility) {
        Ok(visibility_flag) => visibility_flag,
        Err(error) => return invalid_git_mutation(error),
    };

    match is_git_repository(&repository_path) {
        Ok(true) => {}
        Ok(false) => return invalid_git_mutation(ProjectRepositoryGitError::NotRepository),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    match has_git_remote(&repository_path) {
        Ok(false) => {}
        Ok(true) => return invalid_git_mutation(ProjectRepositoryGitError::GithubRemoteExists),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    match repository_has_head_commit(&repository_path) {
        Ok(true) => {}
        Ok(false) => {
            if let Err(error) = create_initial_repository_commit(&repository_path, &commit_message) {
                return invalid_git_mutation(error);
            }
        }
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    let credential = parse_git_credential(credential_kind, credential_value);
    let output = match run_gh_repo_create(
        &repository_path,
        &repository_name,
        visibility_flag,
        credential.as_ref(),
    ) {
        Ok(output) => output,
        Err(failure) => return invalid_git_mutation(failure.error),
    };

    if output.status.success() {
        valid_git_mutation()
    } else {
        invalid_git_mutation(classify_github_publish_failure(&output))
    }
}

#[tauri::command]
pub fn prepare_project_repository_for_github_publish(
    path: String,
    commit_message: String,
) -> ProjectRepositoryGitMutation {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_mutation(error),
    };
    let commit_message = match validate_commit_message(&commit_message) {
        Ok(commit_message) => commit_message,
        Err(error) => return invalid_git_mutation(error),
    };

    match is_git_repository(&repository_path) {
        Ok(true) => {}
        Ok(false) => return invalid_git_mutation(ProjectRepositoryGitError::NotRepository),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    match has_git_remote(&repository_path) {
        Ok(false) => {}
        Ok(true) => return invalid_git_mutation(ProjectRepositoryGitError::GithubRemoteExists),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    match repository_has_head_commit(&repository_path) {
        Ok(true) => valid_git_mutation(),
        Ok(false) => match create_initial_repository_commit(&repository_path, &commit_message) {
            Ok(()) => valid_git_mutation(),
            Err(error) => invalid_git_mutation(error),
        },
        Err(failure) => invalid_git_mutation(failure.error),
    }
}

#[tauri::command]
pub fn push_project_repository_to_github(
    path: String,
    remote_url: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_mutation(error),
    };
    let remote_url = match validate_remote_url(&remote_url) {
        Ok(remote_url) => remote_url,
        Err(_) => return invalid_git_mutation(ProjectRepositoryGitError::GithubCreateFailed),
    };
    let credential = parse_git_credential(credential_kind, credential_value);

    match is_git_repository(&repository_path) {
        Ok(true) => {}
        Ok(false) => return invalid_git_mutation(ProjectRepositoryGitError::NotRepository),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    match has_git_remote(&repository_path) {
        Ok(false) => {}
        Ok(true) => return invalid_git_mutation(ProjectRepositoryGitError::GithubRemoteExists),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    let add_remote_output = match run_git_command(
        &repository_path,
        &["remote", "add", "origin", &remote_url],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    ) {
        Ok(output) => output,
        Err(failure) => return invalid_git_mutation(failure.error),
    };

    if !add_remote_output.status.success() {
        return invalid_git_mutation(ProjectRepositoryGitError::GithubCreateFailed);
    }

    let push_output = match run_git_command(
        &repository_path,
        &["push", "-u", "origin", "HEAD"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        credential.as_ref(),
    ) {
        Ok(output) => output,
        Err(failure) => return invalid_git_mutation(failure.error),
    };

    if push_output.status.success() {
        valid_git_mutation()
    } else {
        invalid_git_mutation(classify_git_push_failure(&push_output))
    }
}

fn run_remote_project_repository_git_command(
    path: String,
    args: &[&str],
    classify_failure: fn(&Output) -> ProjectRepositoryGitError,
    credential: Option<&GitCredential>,
) -> ProjectRepositoryGitMutation {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_mutation(error),
    };

    match is_git_repository(&repository_path) {
        Ok(true) => {}
        Ok(false) => return invalid_git_mutation(ProjectRepositoryGitError::NotRepository),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    match has_git_remote(&repository_path) {
        Ok(true) => {}
        Ok(false) => return invalid_git_mutation(ProjectRepositoryGitError::RemoteMissing),
        Err(failure) => return invalid_git_mutation(failure.error),
    }

    let output = match run_git_command(
        &repository_path,
        args,
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        credential,
    ) {
        Ok(output) => output,
        Err(failure) => return invalid_git_mutation(failure.error),
    };

    if output.status.success() {
        valid_git_mutation()
    } else {
        invalid_git_mutation(classify_failure(&output))
    }
}

fn validate_workspace_root(path: &str) -> Result<PathBuf, ProjectRepositoryCloneError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryCloneError::WorkspaceRequired);
    }

    let workspace_path = PathBuf::from(trimmed_path);

    if !workspace_path.is_absolute() {
        return Err(ProjectRepositoryCloneError::WorkspaceNotAbsolute);
    }

    let metadata = fs::metadata(&workspace_path).map_err(map_workspace_error)?;

    if !metadata.is_dir() {
        return Err(ProjectRepositoryCloneError::WorkspaceNotDirectory);
    }

    let normalized_path = fs::canonicalize(&workspace_path).map_err(map_workspace_error)?;
    fs::read_dir(&normalized_path).map_err(map_workspace_error)?;

    Ok(normalized_path)
}

fn validate_repository_path(path: &str) -> Result<PathBuf, ProjectRepositoryGitError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryGitError::PathRequired);
    }

    let repository_path = PathBuf::from(trimmed_path);

    if !repository_path.is_absolute() {
        return Err(ProjectRepositoryGitError::PathNotAbsolute);
    }

    let metadata = fs::metadata(&repository_path).map_err(map_repository_path_error)?;

    if !metadata.is_dir() {
        return Err(ProjectRepositoryGitError::PathNotDirectory);
    }

    let normalized_path = fs::canonicalize(&repository_path).map_err(map_repository_path_error)?;
    fs::read_dir(&normalized_path).map_err(map_repository_path_error)?;

    Ok(normalized_path)
}

fn validate_group_relative_path(
    relative_path: &str,
) -> Result<Vec<String>, ProjectRepositoryCloneError> {
    let trimmed_path = relative_path.trim().replace('\\', "/");

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryCloneError::GroupPathRequired);
    }

    let segments: Vec<String> = trimmed_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(str::to_owned)
        .collect();

    if segments.len() < 3 || segments.first().map(String::as_str) != Some(PROJECTS_DIRECTORY_NAME)
    {
        return Err(ProjectRepositoryCloneError::GroupPathInvalid);
    }

    if segments
        .iter()
        .any(|segment| validate_repository_folder_name(segment).is_err())
    {
        return Err(ProjectRepositoryCloneError::GroupPathInvalid);
    }

    Ok(segments)
}

fn resolve_group_path(
    workspace_root: &Path,
    group_segments: &[String],
) -> Result<PathBuf, ProjectRepositoryCloneError> {
    let mut group_path = workspace_root.to_path_buf();

    for segment in group_segments {
        group_path.push(segment);
    }

    let metadata = fs::symlink_metadata(&group_path).map_err(map_group_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectRepositoryCloneError::GroupPathNotDirectory);
    }

    let normalized_group_path = fs::canonicalize(&group_path).map_err(map_group_path_error)?;

    if !normalized_group_path.starts_with(workspace_root) {
        return Err(ProjectRepositoryCloneError::GroupPathInvalid);
    }

    Ok(normalized_group_path)
}

fn validate_repository_folder_name(name: &str) -> Result<String, ProjectRepositoryCloneError> {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err(ProjectRepositoryCloneError::NameRequired);
    }

    if trimmed_name.chars().count() > PROJECT_REPOSITORY_NAME_MAX_CHARS
        || trimmed_name == "."
        || trimmed_name == ".."
        || trimmed_name.ends_with([' ', '.'])
        || is_windows_reserved_name(trimmed_name)
        || trimmed_name.chars().any(|character| {
            matches!(character, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
                || character.is_control()
        })
    {
        return Err(ProjectRepositoryCloneError::NameInvalid);
    }

    Ok(trimmed_name.to_owned())
}

fn validate_remote_url(remote_url: &str) -> Result<String, ProjectRepositoryCloneError> {
    let trimmed_url = remote_url.trim();

    if trimmed_url.is_empty() {
        return Err(ProjectRepositoryCloneError::RemoteUrlRequired);
    }

    if trimmed_url.chars().count() > PROJECT_REPOSITORY_REMOTE_URL_MAX_CHARS
        || trimmed_url
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    if trimmed_url.contains("://") {
        validate_scheme_remote_url(trimmed_url)?;
    } else {
        validate_scp_like_remote_url(trimmed_url)?;
    }

    Ok(trimmed_url.to_owned())
}

fn validate_github_repository_name(
    repository_name: &str,
) -> Result<String, ProjectRepositoryGitError> {
    let trimmed_name = repository_name.trim().trim_end_matches(".git");

    if trimmed_name.is_empty() {
        return Err(ProjectRepositoryGitError::GithubRepoNameRequired);
    }

    let name_parts: Vec<&str> = trimmed_name.split('/').collect();

    if name_parts.len() > 2
        || trimmed_name.chars().count() > PROJECT_REPOSITORY_GITHUB_NAME_MAX_CHARS
        || name_parts
            .iter()
            .any(|part| !is_valid_github_repository_name_part(part))
    {
        return Err(ProjectRepositoryGitError::GithubRepoNameInvalid);
    }

    Ok(trimmed_name.to_owned())
}

fn validate_commit_message(message: &str) -> Result<String, ProjectRepositoryGitError> {
    let trimmed_message = message.trim();

    if trimmed_message.is_empty() {
        return Err(ProjectRepositoryGitError::GithubCommitMessageRequired);
    }

    if trimmed_message.chars().count() > PROJECT_REPOSITORY_COMMIT_MESSAGE_MAX_CHARS
        || trimmed_message.chars().any(char::is_control)
    {
        return Err(ProjectRepositoryGitError::GithubCommitMessageInvalid);
    }

    Ok(trimmed_message.to_owned())
}

fn is_valid_github_repository_name_part(part: &str) -> bool {
    !part.is_empty()
        && part != "."
        && part != ".."
        && !part.starts_with('.')
        && !part.ends_with('.')
        && part.chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn validate_github_visibility(visibility: &str) -> Result<&'static str, ProjectRepositoryGitError> {
    match visibility.trim().to_ascii_lowercase().as_str() {
        "private" => Ok("--private"),
        "public" => Ok("--public"),
        _ => Err(ProjectRepositoryGitError::GithubVisibilityInvalid),
    }
}

fn validate_scheme_remote_url(remote_url: &str) -> Result<(), ProjectRepositoryCloneError> {
    let Some((scheme, rest)) = remote_url.split_once("://") else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };
    let scheme = scheme.to_ascii_lowercase();

    if !matches!(scheme.as_str(), "https" | "http" | "ssh" | "git") {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    let Some((authority, path)) = rest.split_once('/') else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };

    if authority.is_empty() || path.is_empty() {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    if matches!(scheme.as_str(), "https" | "http") && authority.contains('@') {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    Ok(())
}

fn validate_scp_like_remote_url(remote_url: &str) -> Result<(), ProjectRepositoryCloneError> {
    let Some((authority, path)) = remote_url.split_once(':') else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };
    let Some((user, host)) = authority.split_once('@') else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };

    if user.is_empty() || host.is_empty() || host.contains('/') || path.is_empty() {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    Ok(())
}

fn run_git_clone(
    group_path: &Path,
    remote_url: &str,
    clone_target: &Path,
    credential: Option<&GitCredential>,
) -> Result<(), CloneFailure> {
    let mut command = Command::new("git");
    command
        .arg("clone")
        .arg("--")
        .arg(remote_url)
        .arg(clone_target)
        .current_dir(group_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_git_credential(&mut command, credential);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| CloneFailure {
        error: if error.kind() == io::ErrorKind::NotFound {
            ProjectRepositoryCloneError::CloneCommandUnavailable
        } else {
            ProjectRepositoryCloneError::CloneFailed
        },
    })?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().map_err(|_| CloneFailure {
                    error: ProjectRepositoryCloneError::CloneFailed,
                })?;

                return if output.status.success() {
                    Ok(())
                } else {
                    Err(classify_git_clone_failure(&output))
                };
            }
            Ok(None) if started_at.elapsed() >= PROJECT_REPOSITORY_CLONE_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();

                return Err(CloneFailure {
                    error: ProjectRepositoryCloneError::CloneCommandTimedOut,
                });
            }
            Ok(None) => thread::sleep(PROJECT_REPOSITORY_CLONE_POLL_INTERVAL),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();

                return Err(CloneFailure {
                    error: ProjectRepositoryCloneError::CloneFailed,
                });
            }
        }
    }
}

fn classify_git_clone_failure(output: &Output) -> CloneFailure {
    let mut output_text = String::new();
    output_text.push_str(&String::from_utf8_lossy(&output.stdout));
    output_text.push_str(&String::from_utf8_lossy(&output.stderr));
    let normalized_output = output_text.to_ascii_lowercase();

    let error = if normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("authentication failed")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied (publickey)")
    {
        ProjectRepositoryCloneError::CloneAuthRequired
    } else if normalized_output.contains("repository not found")
        || normalized_output.contains("the requested url returned error: 403")
        || normalized_output.contains("the requested url returned error: 404")
        || normalized_output.contains("access denied")
        || normalized_output.contains("not authorized")
    {
        ProjectRepositoryCloneError::CloneAccessDenied
    } else if normalized_output.contains("already exists and is not an empty directory") {
        ProjectRepositoryCloneError::CloneTargetExists
    } else {
        ProjectRepositoryCloneError::CloneFailed
    };

    CloneFailure { error }
}

fn cleanup_failed_clone_target(clone_target: &Path) {
    let Ok(metadata) = fs::symlink_metadata(clone_target) else {
        return;
    };

    if metadata.file_type().is_symlink() || metadata.is_file() {
        let _ = fs::remove_file(clone_target);
        return;
    }

    if metadata.is_dir() {
        let _ = fs::remove_dir_all(clone_target);
    }
}

fn inspect_git_repository(repository_path: &Path) -> Result<ProjectRepositoryGitInspection, GitCommandFailure> {
    if !is_git_repository(repository_path)? {
        return Ok(ProjectRepositoryGitInspection {
            ok: true,
            is_git_repository: false,
            has_remote: false,
            ahead_count: 0,
            behind_count: 0,
            branch: None,
            error: None,
        });
    }

    let has_remote = has_git_remote(repository_path)?;
    let (ahead_count, behind_count) = if has_remote {
        read_git_ahead_behind_counts(repository_path)?
    } else {
        (0, 0)
    };

    Ok(ProjectRepositoryGitInspection {
        ok: true,
        is_git_repository: true,
        has_remote,
        ahead_count,
        behind_count,
        branch: read_git_branch(repository_path)?,
        error: None,
    })
}

fn is_git_repository(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    let output = run_git_command(
        repository_path,
        &["rev-parse", "--is-inside-work-tree"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    Ok(output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true")
}

fn has_git_remote(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    let output = run_git_command(
        repository_path,
        &["remote", "get-url", "origin"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    Ok(output.status.success() && !String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

fn read_git_branch(repository_path: &Path) -> Result<Option<String>, GitCommandFailure> {
    let output = run_git_command(
        repository_path,
        &["branch", "--show-current"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if !output.status.success() {
        return Ok(None);
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    Ok((!branch.is_empty()).then_some(branch))
}

fn read_git_ahead_behind_counts(repository_path: &Path) -> Result<(u32, u32), GitCommandFailure> {
    let upstream_output = run_git_command(
        repository_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if !upstream_output.status.success() {
        return Ok((0, 0));
    }

    let output = run_git_command(
        repository_path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if !output.status.success() {
        return Ok((0, 0));
    }

    Ok(parse_git_ahead_behind_counts(&String::from_utf8_lossy(&output.stdout)))
}

fn parse_git_ahead_behind_counts(output: &str) -> (u32, u32) {
    let mut parts = output.split_whitespace();
    let ahead_count = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let behind_count = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);

    (ahead_count, behind_count)
}

fn repository_has_head_commit(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    let output = run_git_command(
        repository_path,
        &["rev-parse", "--verify", "HEAD"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    Ok(output.status.success())
}

fn create_initial_repository_commit(
    repository_path: &Path,
    commit_message: &str,
) -> Result<(), ProjectRepositoryGitError> {
    let add_output = run_git_command(
        repository_path,
        &["add", "--all"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )
    .map_err(|failure| failure.error)?;

    if !add_output.status.success() {
        return Err(classify_github_initial_commit_failure(&add_output));
    }

    let commit_output = run_git_command(
        repository_path,
        &["commit", "--allow-empty", "-m", commit_message],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )
    .map_err(|failure| failure.error)?;

    if commit_output.status.success() {
        Ok(())
    } else {
        Err(classify_github_initial_commit_failure(&commit_output))
    }
}

fn parse_git_credential(
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> Option<GitCredential> {
    let kind = credential_kind?.trim().to_ascii_lowercase();
    let value = credential_value?;
    let trimmed_value = value.trim();

    if kind != "github-token"
        || trimmed_value.is_empty()
        || trimmed_value.chars().any(char::is_control)
    {
        return None;
    }

    Some(GitCredential::GithubToken(trimmed_value.to_owned()))
}

fn apply_git_credential(command: &mut Command, credential: Option<&GitCredential>) {
    let Some(GitCredential::GithubToken(token)) = credential else {
        return;
    };

    let mut basic_source = format!("x-access-token:{token}");
    let mut authorization_value = format!("AUTHORIZATION: basic {}", STANDARD.encode(&basic_source));
    basic_source.zeroize();

    command
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader")
        .env("GIT_CONFIG_VALUE_0", &authorization_value);
    authorization_value.zeroize();
}

fn apply_github_cli_credential(command: &mut Command, credential: Option<&GitCredential>) {
    let Some(GitCredential::GithubToken(token)) = credential else {
        return;
    };

    command.env("GH_TOKEN", token);
}

fn classify_github_initial_commit_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if normalized_output.contains("author identity unknown")
        || normalized_output.contains("please tell me who you are")
        || normalized_output.contains("unable to auto-detect email address")
    {
        ProjectRepositoryGitError::GithubCommitIdentityMissing
    } else if normalized_output.contains("index.lock")
        || normalized_output.contains("another git process")
    {
        ProjectRepositoryGitError::GithubCommitIndexLocked
    } else if normalized_output.contains("hook declined")
        || normalized_output.contains("pre-commit hook")
        || normalized_output.contains("commit-msg hook")
    {
        ProjectRepositoryGitError::GithubCommitHookFailed
    } else {
        ProjectRepositoryGitError::GithubCommitFailed
    }
}

fn run_git_command(
    repository_path: &Path,
    args: &[&str],
    timeout: Duration,
    credential: Option<&GitCredential>,
) -> Result<Output, GitCommandFailure> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(repository_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_git_credential(&mut command, credential);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| GitCommandFailure {
        error: if error.kind() == io::ErrorKind::NotFound {
            ProjectRepositoryGitError::CommandUnavailable
        } else {
            ProjectRepositoryGitError::CommandFailed
        },
    })?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child.wait_with_output().map_err(|_| GitCommandFailure {
                    error: ProjectRepositoryGitError::CommandFailed,
                });
            }
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();

                return Err(GitCommandFailure {
                    error: ProjectRepositoryGitError::CommandTimedOut,
                });
            }
            Ok(None) => thread::sleep(PROJECT_REPOSITORY_CLONE_POLL_INTERVAL),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();

                return Err(GitCommandFailure {
                    error: ProjectRepositoryGitError::CommandFailed,
                });
            }
        }
    }
}

fn run_gh_repo_create(
    repository_path: &Path,
    repository_name: &str,
    visibility_flag: &str,
    credential: Option<&GitCredential>,
) -> Result<Output, GitCommandFailure> {
    let mut command = Command::new("gh");
    command
        .arg("repo")
        .arg("create")
        .arg(repository_name)
        .arg(visibility_flag)
        .arg("--source")
        .arg(repository_path)
        .arg("--remote")
        .arg("origin")
        .arg("--push")
        .current_dir(repository_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_github_cli_credential(&mut command, credential);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| GitCommandFailure {
        error: if error.kind() == io::ErrorKind::NotFound {
            ProjectRepositoryGitError::GithubCliUnavailable
        } else {
            ProjectRepositoryGitError::GithubCreateFailed
        },
    })?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child.wait_with_output().map_err(|_| GitCommandFailure {
                    error: ProjectRepositoryGitError::GithubCreateFailed,
                });
            }
            Ok(None) if started_at.elapsed() >= PROJECT_REPOSITORY_CLONE_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();

                return Err(GitCommandFailure {
                    error: ProjectRepositoryGitError::CommandTimedOut,
                });
            }
            Ok(None) => thread::sleep(PROJECT_REPOSITORY_CLONE_POLL_INTERVAL),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();

                return Err(GitCommandFailure {
                    error: ProjectRepositoryGitError::GithubCreateFailed,
                });
            }
        }
    }
}

fn classify_git_push_failure(output: &Output) -> ProjectRepositoryGitError {
    let mut output_text = String::new();
    output_text.push_str(&String::from_utf8_lossy(&output.stdout));
    output_text.push_str(&String::from_utf8_lossy(&output.stderr));
    let normalized_output = output_text.to_ascii_lowercase();

    if normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("authentication failed")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied")
    {
        ProjectRepositoryGitError::PushAuthRequired
    } else if normalized_output.contains("src refspec")
        || normalized_output.contains("does not match any")
        || normalized_output.contains("no commits")
    {
        ProjectRepositoryGitError::PushEmpty
    } else {
        ProjectRepositoryGitError::PushFailed
    }
}

fn classify_git_fetch_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if git_output_needs_authentication(&normalized_output) {
        ProjectRepositoryGitError::FetchAuthRequired
    } else {
        ProjectRepositoryGitError::FetchFailed
    }
}

fn classify_git_pull_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if git_output_needs_authentication(&normalized_output) {
        ProjectRepositoryGitError::PullAuthRequired
    } else if normalized_output.contains("not possible to fast-forward")
        || normalized_output.contains("would be overwritten by merge")
        || normalized_output.contains("local changes")
        || normalized_output.contains("conflict")
    {
        ProjectRepositoryGitError::PullConflict
    } else {
        ProjectRepositoryGitError::PullFailed
    }
}

fn classify_github_publish_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if normalized_output.contains("not logged into")
        || normalized_output.contains("gh auth login")
        || normalized_output.contains("authentication")
        || normalized_output.contains("http 401")
        || normalized_output.contains("http 403")
    {
        ProjectRepositoryGitError::GithubAuthRequired
    } else if normalized_output.contains("remote origin already exists") {
        ProjectRepositoryGitError::GithubRemoteExists
    } else if normalized_output.contains("src refspec")
        || normalized_output.contains("does not match any")
        || normalized_output.contains("no commits")
    {
        ProjectRepositoryGitError::GithubEmpty
    } else {
        ProjectRepositoryGitError::GithubCreateFailed
    }
}

fn normalize_git_output(output: &Output) -> String {
    let mut output_text = String::new();
    output_text.push_str(&String::from_utf8_lossy(&output.stdout));
    output_text.push_str(&String::from_utf8_lossy(&output.stderr));

    output_text.to_ascii_lowercase()
}

fn git_output_needs_authentication(normalized_output: &str) -> bool {
    normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("authentication failed")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied")
}

fn invalid(error: ProjectRepositoryCloneError) -> ProjectRepositoryClone {
    ProjectRepositoryClone {
        ok: false,
        path: None,
        error: Some(error),
    }
}

fn invalid_git_inspection(error: ProjectRepositoryGitError) -> ProjectRepositoryGitInspection {
    ProjectRepositoryGitInspection {
        ok: false,
        is_git_repository: false,
        has_remote: false,
        ahead_count: 0,
        behind_count: 0,
        branch: None,
        error: Some(error),
    }
}

fn valid_git_mutation() -> ProjectRepositoryGitMutation {
    ProjectRepositoryGitMutation {
        ok: true,
        error: None,
    }
}

fn invalid_git_mutation(error: ProjectRepositoryGitError) -> ProjectRepositoryGitMutation {
    ProjectRepositoryGitMutation {
        ok: false,
        error: Some(error),
    }
}

fn map_workspace_error(error: io::Error) -> ProjectRepositoryCloneError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectRepositoryCloneError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => ProjectRepositoryCloneError::WorkspacePermissionDenied,
        _ => ProjectRepositoryCloneError::WorkspaceUnreadable,
    }
}

fn map_group_path_error(error: io::Error) -> ProjectRepositoryCloneError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectRepositoryCloneError::GroupPathNotFound,
        io::ErrorKind::PermissionDenied => {
            ProjectRepositoryCloneError::WorkspacePermissionDenied
        }
        _ => ProjectRepositoryCloneError::WorkspaceUnreadable,
    }
}

fn map_repository_path_error(error: io::Error) -> ProjectRepositoryGitError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectRepositoryGitError::PathNotFound,
        io::ErrorKind::PermissionDenied => ProjectRepositoryGitError::PathPermissionDenied,
        _ => ProjectRepositoryGitError::PathUnreadable,
    }
}

fn is_windows_reserved_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();

    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || is_reserved_numbered_device(&stem, "COM")
        || is_reserved_numbered_device(&stem, "LPT")
}

fn is_reserved_numbered_device(stem: &str, prefix: &str) -> bool {
    let Some(suffix) = stem.strip_prefix(prefix) else {
        return false;
    };

    suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'1'..=b'9')
}
