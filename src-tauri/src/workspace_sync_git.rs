use crate::git_credential::{GitCredential, parse_git_credential};
use crate::git_path::{GitProcessError, run_git_process};
use crate::path_display::display_path;
use crate::workspace_sync_file::{
    WorkspaceSyncFileError, resolve_sync_file_path, validate_sync_file_target,
};
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};

use std::{
    fs,
    io,
    path::{Path, PathBuf},
    process::Output,
    time::Duration,
};

const WORKSPACE_SYNC_GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(60);
const WORKSPACE_SYNC_GIT_COMMIT_MESSAGE: &str = "chore: update workduck sync";

#[derive(serde::Serialize)]
pub enum WorkspaceSyncGitError {
    #[serde(rename = "workspace-sync-git-folder-required")]
    FolderRequired,
    #[serde(rename = "workspace-sync-git-folder-not-absolute")]
    FolderNotAbsolute,
    #[serde(rename = "workspace-sync-git-folder-not-found")]
    FolderNotFound,
    #[serde(rename = "workspace-sync-git-folder-not-directory")]
    FolderNotDirectory,
    #[serde(rename = "workspace-sync-git-folder-permission-denied")]
    FolderPermissionDenied,
    #[serde(rename = "workspace-sync-git-read-failed")]
    ReadFailed,
}

#[derive(serde::Serialize)]
pub enum WorkspaceSyncGitRunError {
    #[serde(rename = "workspace-sync-git-action-invalid")]
    ActionInvalid,
    #[serde(rename = "workspace-sync-git-folder-required")]
    FolderRequired,
    #[serde(rename = "workspace-sync-git-folder-not-absolute")]
    FolderNotAbsolute,
    #[serde(rename = "workspace-sync-git-folder-not-found")]
    FolderNotFound,
    #[serde(rename = "workspace-sync-git-folder-not-directory")]
    FolderNotDirectory,
    #[serde(rename = "workspace-sync-git-folder-permission-denied")]
    FolderPermissionDenied,
    #[serde(rename = "workspace-sync-file-name-required")]
    FileNameRequired,
    #[serde(rename = "workspace-sync-file-name-invalid")]
    FileNameInvalid,
    #[serde(rename = "workspace-sync-file-not-found")]
    FileNotFound,
    #[serde(rename = "workspace-sync-file-target-invalid")]
    FileTargetInvalid,
    #[serde(rename = "workspace-sync-git-not-repository")]
    NotRepository,
    #[serde(rename = "workspace-sync-git-remote-missing")]
    RemoteMissing,
    #[serde(rename = "workspace-sync-git-branch-missing")]
    BranchMissing,
    #[serde(rename = "workspace-sync-git-command-unavailable")]
    CommandUnavailable,
    #[serde(rename = "workspace-sync-git-command-timed-out")]
    CommandTimedOut,
    #[serde(rename = "workspace-sync-git-auth-required")]
    AuthRequired,
    #[serde(rename = "workspace-sync-git-identity-required")]
    IdentityRequired,
    #[serde(rename = "workspace-sync-git-remote-has-changes")]
    RemoteHasChanges,
    #[serde(rename = "workspace-sync-git-fast-forward-required")]
    FastForwardRequired,
    #[serde(rename = "workspace-sync-git-trust-required")]
    TrustRequired,
    #[serde(rename = "workspace-sync-git-command-failed")]
    CommandFailed,
}

#[derive(serde::Serialize)]
pub enum WorkspaceSyncGitRunOutcome {
    #[serde(rename = "fetched")]
    Fetched,
    #[serde(rename = "pulled")]
    Pulled,
    #[serde(rename = "pushed")]
    Pushed,
    #[serde(rename = "committed-and-pushed")]
    CommittedAndPushed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncGitInspection {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    normalized_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_repository: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    origin_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ahead_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    behind_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_sync_file_changes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_uncommitted_changes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceSyncGitError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncGitRun {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    outcome: Option<WorkspaceSyncGitRunOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceSyncGitRunError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phase: Option<&'static str>,
}

#[derive(Clone, Copy)]
enum WorkspaceSyncGitOperation {
    Fetch,
    Pull,
    Push,
}

#[derive(Clone, Copy)]
enum WorkspaceSyncGitPhase {
    Add,
    Diff,
    Commit,
    Fetch,
    Pull,
    Push,
}

struct WorkspaceSyncGitFailure {
    error: WorkspaceSyncGitRunError,
    phase: Option<WorkspaceSyncGitPhase>,
}

#[tauri::command]
pub fn inspect_workspace_sync_git(
    folder_path: String,
    file_name: Option<String>,
) -> WorkspaceSyncGitInspection {
    let folder_path = match validate_sync_folder_path(&folder_path) {
        Ok(folder_path) => folder_path,
        Err(error) => return invalid_inspection(error),
    };

    let Some(git_dir) = resolve_git_dir(&folder_path) else {
        return WorkspaceSyncGitInspection {
            ok: true,
            normalized_path: Some(display_path(&folder_path)),
            is_repository: Some(false),
            origin_url: None,
            branch_name: None,
            ahead_count: Some(0),
            behind_count: Some(0),
            has_sync_file_changes: Some(false),
            has_uncommitted_changes: Some(false),
            error: None,
        };
    };

    let origin_url = read_safe_origin_url(&git_dir);
    let (ahead_count, behind_count) = if origin_url.is_some() {
        read_git_ahead_behind_counts(&folder_path)
    } else {
        (0, 0)
    };

    WorkspaceSyncGitInspection {
        ok: true,
        normalized_path: Some(display_path(&folder_path)),
        is_repository: Some(true),
        origin_url,
        branch_name: read_branch_name(&git_dir),
        ahead_count: Some(ahead_count),
        behind_count: Some(behind_count),
        has_sync_file_changes: Some(read_sync_file_has_changes(
            &folder_path,
            file_name.as_deref(),
        )),
        has_uncommitted_changes: Some(read_git_has_uncommitted_changes(
            &folder_path,
            file_name.as_deref(),
        )),
        error: None,
    }
}

#[tauri::command]
pub async fn run_workspace_sync_git(
    folder_path: String,
    file_name: String,
    action: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> WorkspaceSyncGitRun {
    tauri::async_runtime::spawn_blocking(move || {
        run_workspace_sync_git_blocking(
            folder_path,
            file_name,
            action,
            credential_kind,
            credential_value,
        )
    })
    .await
    .unwrap_or_else(|_| invalid_run(WorkspaceSyncGitRunError::CommandFailed, None))
}

fn run_workspace_sync_git_blocking(
    folder_path: String,
    file_name: String,
    action: String,
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> WorkspaceSyncGitRun {
    let operation = match WorkspaceSyncGitOperation::from_action(&action) {
        Some(operation) => operation,
        None => return invalid_run(WorkspaceSyncGitRunError::ActionInvalid, None),
    };

    let folder_path = match validate_sync_folder_path(&folder_path) {
        Ok(folder_path) => folder_path,
        Err(error) => return invalid_run(map_inspection_error(error), None),
    };

    let Some(git_dir) = resolve_git_dir(&folder_path) else {
        return invalid_run(WorkspaceSyncGitRunError::NotRepository, None);
    };

    if read_safe_origin_url(&git_dir).is_none() {
        return invalid_run(WorkspaceSyncGitRunError::RemoteMissing, None);
    }

    let credential = parse_git_credential(credential_kind, credential_value);

    match operation {
        WorkspaceSyncGitOperation::Fetch => {
            match run_git_success(
                &folder_path,
                &["fetch", "origin"],
                WorkspaceSyncGitPhase::Fetch,
                credential.as_ref(),
            ) {
                Ok(()) => valid_run(WorkspaceSyncGitRunOutcome::Fetched),
                Err(failure) => invalid_run(failure.error, failure.phase),
            }
        }
        WorkspaceSyncGitOperation::Pull => {
            let Some(branch_name) = read_branch_name(&git_dir) else {
                return invalid_run(WorkspaceSyncGitRunError::BranchMissing, None);
            };

            match run_git_success(
                &folder_path,
                &["pull", "--ff-only", "origin", branch_name.as_str()],
                WorkspaceSyncGitPhase::Pull,
                credential.as_ref(),
            ) {
                Ok(()) => valid_run(WorkspaceSyncGitRunOutcome::Pulled),
                Err(failure) => invalid_run(failure.error, failure.phase),
            }
        }
        WorkspaceSyncGitOperation::Push => {
            let Some(branch_name) = read_branch_name(&git_dir) else {
                return invalid_run(WorkspaceSyncGitRunError::BranchMissing, None);
            };

            run_workspace_sync_push(&folder_path, &file_name, &branch_name, credential.as_ref())
        }
    }
}

fn validate_sync_folder_path(folder_path: &str) -> Result<PathBuf, WorkspaceSyncGitError> {
    validate_absolute_directory_path(folder_path).map_err(map_folder_path_validation_error)
}

fn run_workspace_sync_push(
    folder_path: &Path,
    file_name: &str,
    branch_name: &str,
    credential: Option<&GitCredential>,
) -> WorkspaceSyncGitRun {
    let sync_file_path =
        match resolve_sync_file_path(folder_path.to_string_lossy().as_ref(), file_name) {
            Ok(sync_file_path) => sync_file_path,
            Err(error) => return invalid_run(map_file_error(error), None),
        };

    if let Err(error) = validate_sync_file_target(&sync_file_path) {
        return invalid_run(map_file_error(error), None);
    }

    let metadata = match fs::metadata(&sync_file_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return invalid_run(WorkspaceSyncGitRunError::FileNotFound, None);
        }
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            return invalid_run(WorkspaceSyncGitRunError::FolderPermissionDenied, None);
        }
        Err(_) => return invalid_run(WorkspaceSyncGitRunError::CommandFailed, None),
    };

    if !metadata.is_file() {
        return invalid_run(WorkspaceSyncGitRunError::FileTargetInvalid, None);
    }

    let Some(sync_file_name) = sync_file_path.file_name().and_then(|name| name.to_str()) else {
        return invalid_run(WorkspaceSyncGitRunError::FileNameInvalid, None);
    };

    if let Err(failure) = run_git_success(
        folder_path,
        &["add", "--", sync_file_name],
        WorkspaceSyncGitPhase::Add,
        None,
    ) {
        return invalid_run(failure.error, failure.phase);
    }

    let diff_output = match run_git_command(
        folder_path,
        &["diff", "--cached", "--quiet", "--", sync_file_name],
        WorkspaceSyncGitPhase::Diff,
        None,
    ) {
        Ok(output) => output,
        Err(failure) => return invalid_run(failure.error, failure.phase),
    };

    let has_staged_sync_file_change = match diff_output.status.code() {
        Some(0) => false,
        Some(1) => true,
        _ => {
            let failure = classify_git_command_failure(&diff_output, WorkspaceSyncGitPhase::Diff);
            return invalid_run(failure.error, failure.phase);
        }
    };

    if has_staged_sync_file_change {
        if let Err(failure) = run_git_success(
            folder_path,
            &[
                "commit",
                "--no-verify",
                "-m",
                WORKSPACE_SYNC_GIT_COMMIT_MESSAGE,
                "--",
                sync_file_name,
            ],
            WorkspaceSyncGitPhase::Commit,
            None,
        ) {
            return invalid_run(failure.error, failure.phase);
        }
    }

    match run_git_success(
        folder_path,
        &["push", "-u", "origin", branch_name],
        WorkspaceSyncGitPhase::Push,
        credential,
    ) {
        Ok(()) => valid_run(if has_staged_sync_file_change {
            WorkspaceSyncGitRunOutcome::CommittedAndPushed
        } else {
            WorkspaceSyncGitRunOutcome::Pushed
        }),
        Err(failure) => invalid_run(failure.error, failure.phase),
    }
}

fn resolve_git_dir(folder_path: &Path) -> Option<PathBuf> {
    let dot_git_path = folder_path.join(".git");
    let dot_git_metadata = fs::metadata(&dot_git_path).ok()?;

    if dot_git_metadata.is_dir() {
        return Some(dot_git_path);
    }

    if !dot_git_metadata.is_file() {
        return None;
    }

    let dot_git_content = fs::read_to_string(&dot_git_path).ok()?;
    let git_dir_path = dot_git_content
        .lines()
        .find_map(|line| line.trim().strip_prefix("gitdir:"))?
        .trim();

    if git_dir_path.is_empty() {
        return None;
    }

    let git_dir = PathBuf::from(git_dir_path);
    let resolved_git_dir = if git_dir.is_absolute() {
        git_dir
    } else {
        folder_path.join(git_dir)
    };

    let normalized_git_dir = fs::canonicalize(resolved_git_dir).ok()?;

    fs::metadata(&normalized_git_dir)
        .ok()
        .filter(|metadata| metadata.is_dir())?;

    Some(normalized_git_dir)
}

fn read_origin_url(git_dir: &Path) -> Option<String> {
    let config_content = fs::read_to_string(git_dir.join("config")).ok()?;
    let mut is_origin_remote = false;

    for raw_line in config_content.lines() {
        let line = raw_line.trim();

        if line.starts_with('[') && line.ends_with(']') {
            is_origin_remote = line == r#"[remote "origin"]"# || line == "[remote 'origin']";
            continue;
        }

        if !is_origin_remote {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        if key.trim() == "url" {
            return Some(redact_remote_credentials(value.trim()));
        }
    }

    None
}

fn read_safe_origin_url(git_dir: &Path) -> Option<String> {
    let origin_url = read_origin_url(git_dir)?;

    if is_safe_git_remote_url(&origin_url) {
        Some(origin_url)
    } else {
        None
    }
}

fn is_safe_git_remote_url(remote_url: &str) -> bool {
    let remote_url = remote_url.trim();

    if remote_url.is_empty()
        || remote_url
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return false;
    }

    if remote_url.contains("://") {
        let Some((scheme, rest)) = remote_url.split_once("://") else {
            return false;
        };

        if !matches!(
            scheme.to_ascii_lowercase().as_str(),
            "https" | "http" | "ssh" | "git"
        ) {
            return false;
        }

        let Some((authority, path)) = rest.split_once('/') else {
            return false;
        };

        return !authority.is_empty()
            && !path.is_empty()
            && !(matches!(scheme.to_ascii_lowercase().as_str(), "https" | "http")
                && authority.contains('@'));
    }

    let Some((authority, path)) = remote_url.split_once(':') else {
        return false;
    };
    let Some((user, host)) = authority.split_once('@') else {
        return false;
    };

    user == "git"
        && !host.is_empty()
        && !path.is_empty()
        && !host.contains('/')
        && !path.starts_with('/')
}

fn read_branch_name(git_dir: &Path) -> Option<String> {
    let head_content = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let ref_name = head_content.trim().strip_prefix("ref: refs/heads/")?.trim();

    if ref_name.is_empty() {
        None
    } else {
        Some(ref_name.to_owned())
    }
}

fn read_git_ahead_behind_counts(folder_path: &Path) -> (u32, u32) {
    let upstream_output = match run_git_command(
        folder_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
        WorkspaceSyncGitPhase::Diff,
        None,
    ) {
        Ok(output) => output,
        Err(_) => return (0, 0),
    };

    if !upstream_output.status.success() {
        return (0, 0);
    }

    let output = match run_git_command(
        folder_path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        WorkspaceSyncGitPhase::Diff,
        None,
    ) {
        Ok(output) => output,
        Err(_) => return (0, 0),
    };

    if !output.status.success() {
        return (0, 0);
    }

    parse_git_ahead_behind_counts(&String::from_utf8_lossy(&output.stdout))
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

fn read_sync_file_has_changes(folder_path: &Path, file_name: Option<&str>) -> bool {
    let Some(file_name) = file_name else {
        return false;
    };

    let sync_file_path =
        match resolve_sync_file_path(folder_path.to_string_lossy().as_ref(), file_name) {
            Ok(sync_file_path) => sync_file_path,
            Err(_) => return false,
        };

    if validate_sync_file_target(&sync_file_path).is_err() {
        return false;
    }

    let Some(sync_file_name) = sync_file_path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    let output = match run_git_command(
        folder_path,
        &["status", "--porcelain", "--", sync_file_name],
        WorkspaceSyncGitPhase::Diff,
        None,
    ) {
        Ok(output) => output,
        Err(_) => return false,
    };

    output.status.success() && !output.stdout.is_empty()
}

fn read_git_has_uncommitted_changes(folder_path: &Path, file_name: Option<&str>) -> bool {
    let sync_file_path = file_name
        .and_then(|file_name| {
            resolve_sync_file_path(folder_path.to_string_lossy().as_ref(), file_name).ok()
        })
        .filter(|sync_file_path| validate_sync_file_target(sync_file_path).is_ok());
    let sync_file_name = sync_file_path
        .as_ref()
        .and_then(|sync_file_path| sync_file_path.file_name())
        .and_then(|name| name.to_str());
    let excluded_sync_file_pathspec = sync_file_name.map(|sync_file_name| {
        format!(":(exclude){}", sync_file_name.replace('\\', "/"))
    });
    let mut args = vec!["status", "--porcelain", "--untracked-files=normal", "--", "."];

    if let Some(excluded_sync_file_pathspec) = excluded_sync_file_pathspec.as_deref() {
        args.push(excluded_sync_file_pathspec);
    }

    let output = match run_git_command(folder_path, &args, WorkspaceSyncGitPhase::Diff, None) {
        Ok(output) => output,
        Err(_) => return false,
    };

    output.status.success() && !output.stdout.is_empty()
}

impl WorkspaceSyncGitOperation {
    fn from_action(action: &str) -> Option<Self> {
        match action.trim() {
            "fetch" => Some(Self::Fetch),
            "pull" => Some(Self::Pull),
            "push" => Some(Self::Push),
            _ => None,
        }
    }
}

impl WorkspaceSyncGitPhase {
    fn as_str(self) -> &'static str {
        match self {
            Self::Add => "add",
            Self::Diff => "diff",
            Self::Commit => "commit",
            Self::Fetch => "fetch",
            Self::Pull => "pull",
            Self::Push => "push",
        }
    }
}

fn run_git_success(
    folder_path: &Path,
    args: &[&str],
    phase: WorkspaceSyncGitPhase,
    credential: Option<&GitCredential>,
) -> Result<(), WorkspaceSyncGitFailure> {
    let output = run_git_command(folder_path, args, phase, credential)?;

    if output.status.success() {
        Ok(())
    } else {
        Err(classify_git_command_failure(&output, phase))
    }
}

fn run_git_command(
    folder_path: &Path,
    args: &[&str],
    phase: WorkspaceSyncGitPhase,
    credential: Option<&GitCredential>,
) -> Result<Output, WorkspaceSyncGitFailure> {
    run_git_process(
        folder_path,
        args.iter().copied(),
        WORKSPACE_SYNC_GIT_COMMAND_TIMEOUT,
        credential,
        credential.is_none() && workspace_sync_phase_may_need_credentials(phase),
    )
    .map_err(|error| {
        WorkspaceSyncGitFailure {
            error: match error {
                GitProcessError::Spawn(error)
                    if error.kind() == std::io::ErrorKind::NotFound =>
                {
                    WorkspaceSyncGitRunError::CommandUnavailable
                }
                GitProcessError::Spawn(_) | GitProcessError::Failed => {
                    WorkspaceSyncGitRunError::CommandFailed
                }
                GitProcessError::TimedOut => WorkspaceSyncGitRunError::CommandTimedOut,
            },
            phase: Some(phase),
        }
    })
}

fn workspace_sync_phase_may_need_credentials(phase: WorkspaceSyncGitPhase) -> bool {
    matches!(
        phase,
        WorkspaceSyncGitPhase::Fetch | WorkspaceSyncGitPhase::Pull | WorkspaceSyncGitPhase::Push
    )
}

fn classify_git_command_failure(
    output: &Output,
    phase: WorkspaceSyncGitPhase,
) -> WorkspaceSyncGitFailure {
    let output_text = git_output_text(output);
    let normalized_output = output_text.to_ascii_lowercase();

    let error = if normalized_output.contains("author identity unknown")
        || normalized_output.contains("please tell me who you are")
    {
        WorkspaceSyncGitRunError::IdentityRequired
    } else if normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("authentication failed")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied (publickey)")
        || normalized_output.contains("repository not found")
    {
        WorkspaceSyncGitRunError::AuthRequired
    } else if normalized_output.contains("non-fast-forward")
        || normalized_output.contains("fetch first")
        || normalized_output.contains("failed to push some refs")
    {
        WorkspaceSyncGitRunError::RemoteHasChanges
    } else if normalized_output.contains("not possible to fast-forward")
        || normalized_output.contains("divergent branches")
        || normalized_output.contains("need to specify how to reconcile")
    {
        WorkspaceSyncGitRunError::FastForwardRequired
    } else if normalized_output.contains("detected dubious ownership") {
        WorkspaceSyncGitRunError::TrustRequired
    } else {
        WorkspaceSyncGitRunError::CommandFailed
    };

    WorkspaceSyncGitFailure {
        error,
        phase: Some(phase),
    }
}

fn git_output_text(output: &Output) -> String {
    let mut output_text = String::new();
    output_text.push_str(&String::from_utf8_lossy(&output.stdout));
    output_text.push_str(&String::from_utf8_lossy(&output.stderr));
    output_text
}

fn redact_remote_credentials(remote_url: &str) -> String {
    let Some(scheme_end) = remote_url.find("://") else {
        return remote_url.to_owned();
    };
    let authority_start = scheme_end + 3;
    let Some(path_start_offset) = remote_url[authority_start..].find('/') else {
        return remote_url.to_owned();
    };
    let authority_end = authority_start + path_start_offset;
    let Some(user_info_end_offset) = remote_url[authority_start..authority_end].rfind('@') else {
        return remote_url.to_owned();
    };
    let user_info_end = authority_start + user_info_end_offset;

    format!(
        "{}{}",
        &remote_url[..authority_start],
        &remote_url[user_info_end + 1..]
    )
}

fn invalid_inspection(error: WorkspaceSyncGitError) -> WorkspaceSyncGitInspection {
    WorkspaceSyncGitInspection {
        ok: false,
        normalized_path: None,
        is_repository: None,
        origin_url: None,
        branch_name: None,
        ahead_count: None,
        behind_count: None,
        has_sync_file_changes: None,
        has_uncommitted_changes: None,
        error: Some(error),
    }
}

fn valid_run(outcome: WorkspaceSyncGitRunOutcome) -> WorkspaceSyncGitRun {
    WorkspaceSyncGitRun {
        ok: true,
        outcome: Some(outcome),
        error: None,
        phase: None,
    }
}

fn invalid_run(
    error: WorkspaceSyncGitRunError,
    phase: Option<WorkspaceSyncGitPhase>,
) -> WorkspaceSyncGitRun {
    WorkspaceSyncGitRun {
        ok: false,
        outcome: None,
        error: Some(error),
        phase: phase.map(WorkspaceSyncGitPhase::as_str),
    }
}

fn map_inspection_error(error: WorkspaceSyncGitError) -> WorkspaceSyncGitRunError {
    match error {
        WorkspaceSyncGitError::FolderRequired => WorkspaceSyncGitRunError::FolderRequired,
        WorkspaceSyncGitError::FolderNotAbsolute => WorkspaceSyncGitRunError::FolderNotAbsolute,
        WorkspaceSyncGitError::FolderNotFound => WorkspaceSyncGitRunError::FolderNotFound,
        WorkspaceSyncGitError::FolderNotDirectory => WorkspaceSyncGitRunError::FolderNotDirectory,
        WorkspaceSyncGitError::FolderPermissionDenied => {
            WorkspaceSyncGitRunError::FolderPermissionDenied
        }
        WorkspaceSyncGitError::ReadFailed => WorkspaceSyncGitRunError::CommandFailed,
    }
}

fn map_file_error(error: WorkspaceSyncFileError) -> WorkspaceSyncGitRunError {
    match error {
        WorkspaceSyncFileError::FolderRequired => WorkspaceSyncGitRunError::FolderRequired,
        WorkspaceSyncFileError::FolderNotAbsolute => WorkspaceSyncGitRunError::FolderNotAbsolute,
        WorkspaceSyncFileError::FolderNotFound => WorkspaceSyncGitRunError::FolderNotFound,
        WorkspaceSyncFileError::FolderNotDirectory => WorkspaceSyncGitRunError::FolderNotDirectory,
        WorkspaceSyncFileError::FolderPermissionDenied => {
            WorkspaceSyncGitRunError::FolderPermissionDenied
        }
        WorkspaceSyncFileError::FileNameRequired => WorkspaceSyncGitRunError::FileNameRequired,
        WorkspaceSyncFileError::FileNameInvalid => WorkspaceSyncGitRunError::FileNameInvalid,
        WorkspaceSyncFileError::ContentRequired => WorkspaceSyncGitRunError::CommandFailed,
        WorkspaceSyncFileError::FileNotFound => WorkspaceSyncGitRunError::FileNotFound,
        WorkspaceSyncFileError::FileTooLarge => WorkspaceSyncGitRunError::CommandFailed,
        WorkspaceSyncFileError::FileTargetInvalid => WorkspaceSyncGitRunError::FileTargetInvalid,
        WorkspaceSyncFileError::ReadFailed => WorkspaceSyncGitRunError::CommandFailed,
        WorkspaceSyncFileError::WriteFailed => WorkspaceSyncGitRunError::CommandFailed,
    }
}

fn map_folder_path_validation_error(error: WorkspacePathValidationError) -> WorkspaceSyncGitError {
    match error {
        WorkspacePathValidationError::Required => WorkspaceSyncGitError::FolderRequired,
        WorkspacePathValidationError::NotAbsolute => WorkspaceSyncGitError::FolderNotAbsolute,
        WorkspacePathValidationError::NotFound => WorkspaceSyncGitError::FolderNotFound,
        WorkspacePathValidationError::NotDirectory => WorkspaceSyncGitError::FolderNotDirectory,
        WorkspacePathValidationError::PermissionDenied => WorkspaceSyncGitError::FolderPermissionDenied,
        WorkspacePathValidationError::Unreadable => WorkspaceSyncGitError::ReadFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git_path::wait_for_child_output;
    use std::process::{Command, Stdio};

    #[test]
    fn safe_origin_url_redacts_embedded_credentials_before_display() {
        let temp_dir = tempfile::tempdir().expect("temporary git dir");
        let git_dir = temp_dir.path().join(".git");
        fs::create_dir_all(&git_dir).expect("git dir");
        fs::write(
            git_dir.join("config"),
            r#"
[remote "origin"]
    url = https://token@example.com/workduck/workduck.git
"#,
        )
        .expect("git config");

        assert_eq!(
            read_origin_url(&git_dir).as_deref(),
            Some("https://example.com/workduck/workduck.git")
        );
        assert_eq!(
            read_safe_origin_url(&git_dir).as_deref(),
            Some("https://example.com/workduck/workduck.git")
        );
    }

    #[test]
    fn remote_url_safety_rejects_credentials_absolute_scp_paths_and_whitespace() {
        for safe_url in [
            "https://github.com/workduck/workduck.git",
            "ssh://git@github.com/workduck/workduck.git",
            "git@github.com:workduck/workduck.git",
        ] {
            assert!(is_safe_git_remote_url(safe_url), "{safe_url:?} should be safe");
        }

        for unsafe_url in [
            "",
            "https://token@github.com/workduck/workduck.git",
            "https://github.com/workduck/work duck.git",
            "ftp://github.com/workduck/workduck.git",
            "git@github.com:/workduck/workduck.git",
            "github.com/workduck/workduck.git",
        ] {
            assert!(
                !is_safe_git_remote_url(unsafe_url),
                "{unsafe_url:?} should be rejected"
            );
        }
    }

    #[test]
    fn detached_head_and_malformed_ahead_behind_counts_fall_back_to_zero() {
        assert_eq!(parse_git_ahead_behind_counts("2\t3\n"), (2, 3));
        assert_eq!(parse_git_ahead_behind_counts("bad 3"), (0, 3));
        assert_eq!(parse_git_ahead_behind_counts(""), (0, 0));
    }

    #[test]
    fn child_output_wait_drains_large_stdout_and_stderr() {
        let mut command = large_output_command();
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = command.spawn().expect("spawn large output command");
        let output =
            wait_for_child_output(child, Duration::from_secs(10)).expect("large output completes");

        assert!(output.status.success());
        assert!(output.stdout.len() > 64 * 1024);
        assert!(output.stderr.len() > 64 * 1024);
    }

    #[cfg(target_os = "windows")]
    fn large_output_command() -> Command {
        let mut command = Command::new("cmd");
        command.args([
            "/C",
            "(for /L %i in (1,1,1024) do @echo stdout%i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz) & (for /L %i in (1,1,1024) do @echo stderr%i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz 1>&2)",
        ]);
        command
    }

    #[cfg(not(target_os = "windows"))]
    fn large_output_command() -> Command {
        let mut command = Command::new("sh");
        command.args([
            "-c",
            "i=0; while [ $i -lt 1024 ]; do echo stdout$i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz; echo stderr$i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz >&2; i=$((i + 1)); done",
        ]);
        command
    }
}
