use std::{
    ffi::OsString,
    fs,
    io,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    thread,
    time::Duration,
};

use crate::git_credential::{
    GitCredential, apply_github_cli_credential, clear_git_credential_environment,
    parse_git_credential,
};
use crate::project_repository_failure::{
    CloneFailure, classify_git_clone_failure, classify_git_fetch_failure,
    classify_git_pull_failure, classify_git_push_failure, classify_github_initial_commit_failure,
    classify_github_publish_failure,
};
use crate::project_repository_validation::{
    resolve_group_path, validate_commit_message, validate_github_repository_name,
    validate_github_visibility, validate_group_relative_path, validate_remote_url,
    validate_repository_folder_name, validate_repository_path, validate_workspace_root,
};
use crate::{
    git_path::{GitProcessError, git_process_path, run_git_process, wait_for_child_output},
    path_display::display_path,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const PROJECT_REPOSITORY_CLONE_TIMEOUT: Duration = Duration::from_secs(900);
const PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT: Duration = Duration::from_secs(600);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
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
    #[serde(rename = "project-repository-clone-path-too-long")]
    ClonePathTooLong,
    #[serde(rename = "project-repository-clone-token-invalid")]
    CloneTokenInvalid,
    #[serde(rename = "project-repository-clone-permission-denied")]
    ClonePermissionDenied,
    #[serde(rename = "project-repository-clone-repository-not-found")]
    CloneRepositoryNotFound,
    #[serde(rename = "project-repository-clone-organization-restricted")]
    CloneOrganizationRestricted,
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
    has_uncommitted_changes: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryGitError>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitInspectionRequest {
    repository_id: String,
    path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitInspectionRecord {
    repository_id: String,
    inspection: ProjectRepositoryGitInspection,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitMutation {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryGitError>,
}

struct GitCommandFailure {
    error: ProjectRepositoryGitError,
}

struct GitStatusSummary {
    branch: Option<String>,
    ahead_count: u32,
    behind_count: u32,
    has_uncommitted_changes: bool,
}

#[tauri::command]
pub async fn clone_project_repository(
    workspace_path: String,
    group_relative_path: String,
    repository_name: String,
    remote_url: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryClone {
    run_clone_on_blocking_thread(move || {
        clone_project_repository_with_optional_upstream(
            workspace_path,
            group_relative_path,
            repository_name,
            remote_url,
            None,
            credential_kind,
            credential_value,
        )
    })
    .await
}

#[tauri::command]
pub async fn clone_project_repository_fork(
    workspace_path: String,
    group_relative_path: String,
    repository_name: String,
    remote_url: String,
    upstream_remote_url: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryClone {
    run_clone_on_blocking_thread(move || {
        clone_project_repository_with_optional_upstream(
            workspace_path,
            group_relative_path,
            repository_name,
            remote_url,
            Some(upstream_remote_url),
            credential_kind,
            credential_value,
        )
    })
    .await
}

async fn run_clone_on_blocking_thread<F>(operation: F) -> ProjectRepositoryClone
where
    F: FnOnce() -> ProjectRepositoryClone + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(operation).await {
        Ok(result) => result,
        Err(_) => invalid(ProjectRepositoryCloneError::CloneFailed),
    }
}

fn clone_project_repository_with_optional_upstream(
    workspace_path: String,
    group_relative_path: String,
    repository_name: String,
    remote_url: String,
    upstream_remote_url: Option<String>,
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
    let upstream_remote_url = match upstream_remote_url {
        Some(upstream_remote_url) => match validate_remote_url(&upstream_remote_url) {
            Ok(upstream_remote_url) => Some(upstream_remote_url),
            Err(error) => return invalid(error),
        },
        None => None,
    };
    let clone_target = group_path.join(repository_folder_name);

    if fs::symlink_metadata(&clone_target).is_ok() {
        if let Some(existing_clone_path) = resolve_existing_clone_target(&clone_target, &remote_url)
        {
            if let Some(upstream_remote_url) = upstream_remote_url.as_deref() {
                if ensure_upstream_remote(&existing_clone_path, upstream_remote_url).is_err() {
                    return invalid(ProjectRepositoryCloneError::CloneFailed);
                }
            }

            return valid_clone(existing_clone_path);
        }

        return invalid(ProjectRepositoryCloneError::CloneTargetExists);
    }

    let credential = parse_git_credential(credential_kind, credential_value);

    match run_git_clone_with_public_fallback(
        &group_path,
        &remote_url,
        &clone_target,
        credential.as_ref(),
    ) {
        Ok(()) => {
            if let Some(upstream_remote_url) = upstream_remote_url.as_deref() {
                if ensure_upstream_remote(&clone_target, upstream_remote_url).is_err() {
                    cleanup_failed_clone_target(&clone_target);
                    return invalid(ProjectRepositoryCloneError::CloneFailed);
                }
            }

            let normalized_clone_target =
                fs::canonicalize(&clone_target).unwrap_or_else(|_| clone_target.clone());

            valid_clone(normalized_clone_target)
        }
        Err(failure) => {
            cleanup_failed_clone_target(&clone_target);
            invalid(failure.error)
        }
    }
}

fn resolve_existing_clone_target(clone_target: &Path, remote_url: &str) -> Option<PathBuf> {
    let metadata = fs::symlink_metadata(clone_target).ok()?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return None;
    }

    if !is_git_repository(clone_target).ok()? {
        return None;
    }

    let origin_url = read_git_origin_remote_url(clone_target).ok()??;

    if normalize_remote_url_for_comparison(&origin_url)
        != normalize_remote_url_for_comparison(remote_url)
    {
        return None;
    }

    Some(fs::canonicalize(clone_target).unwrap_or_else(|_| clone_target.to_path_buf()))
}

fn run_git_clone_with_public_fallback(
    group_path: &Path,
    remote_url: &str,
    clone_target: &Path,
    credential: Option<&GitCredential>,
) -> Result<(), CloneFailure> {
    let Err(first_failure) = run_git_clone(group_path, remote_url, clone_target, credential) else {
        return Ok(());
    };

    if !should_retry_clone_with_system_credential(&first_failure.error) {
        return Err(first_failure);
    }

    cleanup_failed_clone_target(clone_target);

    if let Some(github_cli_credential) = read_github_cli_git_credential() {
        match run_git_clone(
            group_path,
            remote_url,
            clone_target,
            Some(&github_cli_credential),
        ) {
            Ok(()) => return Ok(()),
            Err(failure) if failure.error != ProjectRepositoryCloneError::CloneAuthRequired => {
                return Err(failure);
            }
            Err(_) => {
                cleanup_failed_clone_target(clone_target);
            }
        }
    }

    match run_git_clone(group_path, remote_url, clone_target, None) {
        Ok(()) => Ok(()),
        Err(failure) if failure.error == ProjectRepositoryCloneError::CloneAuthRequired => {
            Err(first_failure)
        }
        Err(failure) => Err(failure),
    }
}

fn should_retry_clone_with_system_credential(error: &ProjectRepositoryCloneError) -> bool {
    matches!(
        error,
        ProjectRepositoryCloneError::CloneTokenInvalid
            | ProjectRepositoryCloneError::CloneAuthRequired
            | ProjectRepositoryCloneError::ClonePermissionDenied
            | ProjectRepositoryCloneError::CloneRepositoryNotFound
            | ProjectRepositoryCloneError::CloneOrganizationRestricted
            | ProjectRepositoryCloneError::CloneFailed
    )
}

fn read_github_cli_git_credential() -> Option<GitCredential> {
    let mut command = Command::new("gh");
    command
        .arg("auth")
        .arg("token")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().ok()?;
    let output = wait_for_child_output(child, PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT).ok()?;

    if !output.status.success() {
        return None;
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    if token.is_empty() || token.chars().any(char::is_control) {
        return None;
    }

    Some(GitCredential::GithubToken(token))
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
pub fn inspect_project_repositories_git(
    repositories: Vec<ProjectRepositoryGitInspectionRequest>,
) -> Vec<ProjectRepositoryGitInspectionRecord> {
    thread::scope(|scope| {
        let handles = repositories
            .into_iter()
            .map(|repository| scope.spawn(move || inspect_project_repository_git_record(repository)))
            .collect::<Vec<_>>();

        handles
            .into_iter()
            .map(|handle| handle.join().expect("repository git inspection worker panicked"))
            .collect()
    })
}

fn inspect_project_repository_git_record(
    repository: ProjectRepositoryGitInspectionRequest,
) -> ProjectRepositoryGitInspectionRecord {
    let ProjectRepositoryGitInspectionRequest {
        repository_id,
        path,
    } = repository;
    let inspection = std::panic::catch_unwind(move || inspect_project_repository_git(path))
        .unwrap_or_else(|_| invalid_git_inspection(ProjectRepositoryGitError::CommandFailed));

    ProjectRepositoryGitInspectionRecord {
        repository_id,
        inspection,
    }
}

#[tauri::command]
pub async fn initialize_project_repository_git(path: String) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        initialize_project_repository_git_blocking(path)
    })
    .await
}

fn initialize_project_repository_git_blocking(path: String) -> ProjectRepositoryGitMutation {
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
pub async fn fetch_project_repository_git(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        fetch_project_repository_git_blocking(path, credential_kind, credential_value)
    })
    .await
}

fn fetch_project_repository_git_blocking(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    let credential = parse_git_credential(credential_kind, credential_value);

    run_remote_project_repository_git_command(
        path,
        &["fetch", "--all", "--prune"],
        classify_git_fetch_failure,
        credential.as_ref(),
    )
}

#[tauri::command]
pub async fn pull_project_repository_git(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        pull_project_repository_git_blocking(path, credential_kind, credential_value)
    })
    .await
}

fn pull_project_repository_git_blocking(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    let credential = parse_git_credential(credential_kind, credential_value);

    run_remote_project_repository_git_command(
        path,
        &["pull", "--ff-only"],
        classify_git_pull_failure,
        credential.as_ref(),
    )
}

#[tauri::command]
pub async fn push_project_repository_git(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        push_project_repository_git_blocking(path, credential_kind, credential_value)
    })
    .await
}

fn push_project_repository_git_blocking(
    path: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    let credential = parse_git_credential(credential_kind, credential_value);

    run_remote_project_repository_git_command(
        path,
        &["push", "-u", "origin", "HEAD"],
        classify_git_push_failure,
        credential.as_ref(),
    )
}

#[tauri::command]
pub async fn publish_project_repository_to_github(
    path: String,
    repository_name: String,
    commit_message: String,
    visibility: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        publish_project_repository_to_github_blocking(
            path,
            repository_name,
            commit_message,
            visibility,
            credential_kind,
            credential_value,
        )
    })
    .await
}

fn publish_project_repository_to_github_blocking(
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
            if let Err(error) = create_initial_repository_commit(&repository_path, &commit_message)
            {
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

    if !output.status.success() {
        return invalid_git_mutation(classify_github_publish_failure(&output));
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

#[tauri::command]
pub async fn prepare_project_repository_for_github_publish(
    path: String,
    commit_message: String,
) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        prepare_project_repository_for_github_publish_blocking(path, commit_message)
    })
    .await
}

fn prepare_project_repository_for_github_publish_blocking(
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
pub async fn push_project_repository_to_github(
    path: String,
    remote_url: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> ProjectRepositoryGitMutation {
    run_project_repository_git_mutation_off_thread(move || {
        push_project_repository_to_github_blocking(
            path,
            remote_url,
            credential_kind,
            credential_value,
        )
    })
    .await
}

fn push_project_repository_to_github_blocking(
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

async fn run_project_repository_git_mutation_off_thread(
    task: impl FnOnce() -> ProjectRepositoryGitMutation + Send + 'static,
) -> ProjectRepositoryGitMutation {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .unwrap_or_else(|_| invalid_git_mutation(ProjectRepositoryGitError::CommandFailed))
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

fn run_git_clone(
    group_path: &Path,
    remote_url: &str,
    clone_target: &Path,
    credential: Option<&GitCredential>,
) -> Result<(), CloneFailure> {
    let args = [
        OsString::from("clone"),
        OsString::from("--"),
        OsString::from(remote_url),
        git_process_path(clone_target).into_os_string(),
    ];
    let output = run_git_process(
        group_path,
        args,
        PROJECT_REPOSITORY_CLONE_TIMEOUT,
        credential,
        credential.is_none(),
    )
    .map_err(|error| CloneFailure {
        error: match error {
            GitProcessError::Spawn(error) if error.kind() == io::ErrorKind::NotFound => {
                ProjectRepositoryCloneError::CloneCommandUnavailable
            }
            GitProcessError::Spawn(_) | GitProcessError::Failed => {
                ProjectRepositoryCloneError::CloneFailed
            }
            GitProcessError::TimedOut => ProjectRepositoryCloneError::CloneCommandTimedOut,
        },
    })?;

    if output.status.success() {
        Ok(())
    } else {
        Err(classify_git_clone_failure(&output, credential.is_some()))
    }
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

fn inspect_git_repository(
    repository_path: &Path,
) -> Result<ProjectRepositoryGitInspection, GitCommandFailure> {
    let Some(status) = read_git_status_summary(repository_path)? else {
        return Ok(not_git_repository_inspection());
    };

    let has_remote = has_git_remote(repository_path)?;

    Ok(ProjectRepositoryGitInspection {
        ok: true,
        is_git_repository: true,
        has_remote,
        ahead_count: if has_remote { status.ahead_count } else { 0 },
        behind_count: if has_remote { status.behind_count } else { 0 },
        has_uncommitted_changes: status.has_uncommitted_changes,
        branch: status.branch,
        error: None,
    })
}

fn not_git_repository_inspection() -> ProjectRepositoryGitInspection {
    ProjectRepositoryGitInspection {
        ok: true,
        is_git_repository: false,
        has_remote: false,
        ahead_count: 0,
        behind_count: 0,
        has_uncommitted_changes: false,
        branch: None,
        error: None,
    }
}

fn read_git_status_summary(
    repository_path: &Path,
) -> Result<Option<GitStatusSummary>, GitCommandFailure> {
    if !is_git_repository(repository_path)? {
        return Ok(None);
    }

    let output = run_git_command(
        repository_path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=normal",
        ],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if !output.status.success() {
        return if is_git_repository(repository_path)? {
            Err(GitCommandFailure {
                error: ProjectRepositoryGitError::CommandFailed,
            })
        } else {
            Ok(None)
        };
    }

    Ok(Some(parse_git_status_summary(&String::from_utf8_lossy(
        &output.stdout,
    ))))
}

fn parse_git_status_summary(output: &str) -> GitStatusSummary {
    let mut branch = None;
    let mut ahead_count = 0;
    let mut behind_count = 0;
    let mut has_uncommitted_changes = false;

    for line in output.lines() {
        if let Some(head) = line.strip_prefix("# branch.head ") {
            let head = head.trim();

            if !head.is_empty() && head != "(detached)" {
                branch = Some(head.to_owned());
            }
            continue;
        }

        if let Some(ahead_behind) = line.strip_prefix("# branch.ab ") {
            let (ahead, behind) = parse_git_branch_ahead_behind(ahead_behind);
            ahead_count = ahead;
            behind_count = behind;
            continue;
        }

        if !line.starts_with('#') && !line.trim().is_empty() {
            has_uncommitted_changes = true;
        }
    }

    GitStatusSummary {
        branch,
        ahead_count,
        behind_count,
        has_uncommitted_changes,
    }
}

fn parse_git_branch_ahead_behind(output: &str) -> (u32, u32) {
    let mut ahead_count = 0;
    let mut behind_count = 0;

    for part in output.split_whitespace() {
        if let Some(value) = part.strip_prefix('+') {
            ahead_count = value.parse::<u32>().unwrap_or(0);
        } else if let Some(value) = part.strip_prefix('-') {
            behind_count = value.parse::<u32>().unwrap_or(0);
        }
    }

    (ahead_count, behind_count)
}

fn is_git_repository(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    let output = run_git_command(
        repository_path,
        &["rev-parse", "--show-toplevel"],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if !output.status.success() {
        return Ok(false);
    }

    let work_tree_root = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    if work_tree_root.is_empty() {
        return Ok(false);
    }

    paths_refer_to_same_directory(repository_path, Path::new(&work_tree_root))
}

fn paths_refer_to_same_directory(left: &Path, right: &Path) -> Result<bool, GitCommandFailure> {
    let left = canonicalize_git_path(left)?;
    let right = canonicalize_git_path(right)?;

    Ok(paths_match(&left, &right))
}

fn canonicalize_git_path(path: &Path) -> Result<PathBuf, GitCommandFailure> {
    fs::canonicalize(path).map_err(|error| GitCommandFailure {
        error: match error.kind() {
            io::ErrorKind::NotFound => ProjectRepositoryGitError::PathNotFound,
            io::ErrorKind::PermissionDenied => ProjectRepositoryGitError::PathPermissionDenied,
            _ => ProjectRepositoryGitError::PathUnreadable,
        },
    })
}

#[cfg(target_os = "windows")]
fn paths_match(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

#[cfg(not(target_os = "windows"))]
fn paths_match(left: &Path, right: &Path) -> bool {
    left == right
}

fn has_git_remote(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    Ok(read_git_origin_remote_url(repository_path)?
        .as_deref()
        .is_some_and(|remote_url| validate_remote_url(remote_url).is_ok()))
}

fn read_git_origin_remote_url(repository_path: &Path) -> Result<Option<String>, GitCommandFailure> {
    read_git_remote_url(repository_path, "origin")
}

fn read_git_remote_url(
    repository_path: &Path,
    remote_name: &str,
) -> Result<Option<String>, GitCommandFailure> {
    let output = run_git_command(
        repository_path,
        &["remote", "get-url", remote_name],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if !output.status.success() {
        return Ok(None);
    }

    let remote_url = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    Ok((!remote_url.is_empty()).then_some(remote_url))
}

fn ensure_upstream_remote(
    repository_path: &Path,
    upstream_remote_url: &str,
) -> Result<(), GitCommandFailure> {
    if let Some(existing_remote_url) = read_git_remote_url(repository_path, "upstream")? {
        return if normalize_remote_url_for_comparison(&existing_remote_url)
            == normalize_remote_url_for_comparison(upstream_remote_url)
        {
            Ok(())
        } else {
            Err(GitCommandFailure {
                error: ProjectRepositoryGitError::CommandFailed,
            })
        };
    }

    let output = run_git_command(
        repository_path,
        &["remote", "add", "upstream", upstream_remote_url],
        PROJECT_REPOSITORY_GIT_ACTION_TIMEOUT,
        None,
    )?;

    if output.status.success() {
        Ok(())
    } else {
        Err(GitCommandFailure {
            error: ProjectRepositoryGitError::CommandFailed,
        })
    }
}

fn normalize_remote_url_for_comparison(remote_url: &str) -> String {
    remote_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_status_summary_reads_branch_counts_and_changes() {
        let summary = parse_git_status_summary(
            "# branch.oid 9fceb02\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -3\n1 .M N... 100644 100644 100644 abc def file.txt\n",
        );

        assert_eq!(summary.branch.as_deref(), Some("main"));
        assert_eq!(summary.ahead_count, 2);
        assert_eq!(summary.behind_count, 3);
        assert!(summary.has_uncommitted_changes);
    }

    #[test]
    fn git_status_summary_ignores_detached_branch_head() {
        let summary = parse_git_status_summary(
            "# branch.oid 9fceb02\n# branch.head (detached)\n# branch.ab +0 -0\n",
        );

        assert_eq!(summary.branch, None);
        assert_eq!(summary.ahead_count, 0);
        assert_eq!(summary.behind_count, 0);
        assert!(!summary.has_uncommitted_changes);
    }

    #[test]
    fn repository_inspection_ignores_parent_work_tree() {
        if !git_is_available() {
            return;
        }

        let sandbox = unique_test_directory("workduck-parent-work-tree");
        let parent = sandbox.join("parent");
        let child = parent.join("child");

        fs::create_dir_all(&child).expect("create nested git test folder");

        let init_status = Command::new("git")
            .arg("init")
            .current_dir(&parent)
            .status()
            .expect("run git init");

        assert!(init_status.success());

        let inspection = match inspect_git_repository(&child) {
            Ok(inspection) => inspection,
            Err(_) => panic!("inspect nested folder"),
        };

        assert!(!inspection.is_git_repository);
        assert!(!inspection.has_remote);
        assert!(!inspection.has_uncommitted_changes);

        let _ = fs::remove_dir_all(&sandbox);
    }

    #[test]
    fn ensure_upstream_remote_adds_idempotently_and_rejects_different_url() {
        if !git_is_available() {
            return;
        }

        let sandbox = unique_test_directory("workduck-upstream-remote");
        let repository = sandbox.join("repo");

        fs::create_dir_all(&repository).expect("create git test repository");

        let init_status = Command::new("git")
            .arg("init")
            .current_dir(&repository)
            .status()
            .expect("run git init");

        assert!(init_status.success());

        assert!(ensure_upstream_remote(&repository, "https://github.com/openai/codex.git").is_ok());
        assert!(ensure_upstream_remote(&repository, "https://github.com/openai/codex").is_ok());
        assert!(
            ensure_upstream_remote(&repository, "https://github.com/example/other.git").is_err()
        );

        let upstream_remote_url = match read_git_remote_url(&repository, "upstream") {
            Ok(Some(remote_url)) => remote_url,
            Ok(None) => panic!("upstream remote missing"),
            Err(_) => panic!("read upstream remote"),
        };

        assert_eq!(upstream_remote_url, "https://github.com/openai/codex.git");

        let _ = fs::remove_dir_all(&sandbox);
    }

    fn git_is_available() -> bool {
        Command::new("git")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    }

    fn unique_test_directory(name: &str) -> PathBuf {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time after Unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("{name}-{}-{timestamp}", std::process::id()))
    }
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
        &["commit", "--allow-empty", "--no-verify", "-m", commit_message],
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

fn run_git_command(
    repository_path: &Path,
    args: &[&str],
    timeout: Duration,
    credential: Option<&GitCredential>,
) -> Result<Output, GitCommandFailure> {
    run_git_process(
        repository_path,
        args.iter().copied(),
        timeout,
        credential,
        credential.is_none() && git_command_may_need_credentials(args),
    )
    .map_err(|error| GitCommandFailure {
        error: match error {
            GitProcessError::Spawn(error) if error.kind() == io::ErrorKind::NotFound => {
                ProjectRepositoryGitError::CommandUnavailable
            }
            GitProcessError::Spawn(_) | GitProcessError::Failed => {
                ProjectRepositoryGitError::CommandFailed
            }
            GitProcessError::TimedOut => ProjectRepositoryGitError::CommandTimedOut,
        },
    })
}

fn git_command_may_need_credentials(args: &[&str]) -> bool {
    matches!(args.first().copied(), Some("fetch" | "pull" | "push"))
}

fn run_gh_repo_create(
    repository_path: &Path,
    repository_name: &str,
    visibility_flag: &str,
    credential: Option<&GitCredential>,
) -> Result<Output, GitCommandFailure> {
    let git_repository_path = git_process_path(repository_path);
    let mut command = Command::new("gh");
    command
        .arg("repo")
        .arg("create")
        .arg(repository_name)
        .arg(visibility_flag)
        .arg("--source")
        .arg(&git_repository_path)
        .arg("--remote")
        .arg("origin")
        .current_dir(git_repository_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    clear_git_credential_environment(&mut command);
    command.env_remove("GH_TOKEN");
    apply_github_cli_credential(&mut command, credential);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().map_err(|error| GitCommandFailure {
        error: if error.kind() == io::ErrorKind::NotFound {
            ProjectRepositoryGitError::GithubCliUnavailable
        } else {
            ProjectRepositoryGitError::GithubCreateFailed
        },
    })?;

    wait_for_child_output(child, PROJECT_REPOSITORY_CLONE_TIMEOUT).map_err(|error| {
        GitCommandFailure {
            error: match error {
                GitProcessError::TimedOut => ProjectRepositoryGitError::CommandTimedOut,
                GitProcessError::Spawn(_) | GitProcessError::Failed => {
                    ProjectRepositoryGitError::GithubCreateFailed
                }
            },
        }
    })
}

fn invalid(error: ProjectRepositoryCloneError) -> ProjectRepositoryClone {
    ProjectRepositoryClone {
        ok: false,
        path: None,
        error: Some(error),
    }
}

fn valid_clone(path: PathBuf) -> ProjectRepositoryClone {
    ProjectRepositoryClone {
        ok: true,
        path: Some(display_path(&path)),
        error: None,
    }
}

fn invalid_git_inspection(error: ProjectRepositoryGitError) -> ProjectRepositoryGitInspection {
    ProjectRepositoryGitInspection {
        ok: false,
        is_git_repository: false,
        has_remote: false,
        ahead_count: 0,
        behind_count: 0,
        has_uncommitted_changes: false,
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
