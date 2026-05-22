use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::path_display::display_path;
use crate::workspace_repository_gitignore::ensure_workduck_gitignore as ensure_workduck_gitignore_policy;

const PROJECTS_DIRECTORY_NAME: &str = "projects";
const QUEUE_DIRECTORY_NAME: &str = "queue";
const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const PACKAGE_JSON_FILE_NAME: &str = "package.json";
const QUEUE_REPORTS_DIRECTORY_NAME: &str = "reports";
const QUEUE_WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const QUEUE_PROPOSALS_DIRECTORY_NAME: &str = "proposals";
const WORKSPACE_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
const WORKSPACE_COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(100);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const WORKSPACE_PACKAGE_JSON: &str = r#"{
  "private": true,
  "scripts": {
    "mf": "mf",
    "mustflow:check": "mf version --check",
    "mustflow:update:dry-run": "bun update mustflow && mf update --dry-run",
    "mustflow:update:apply": "bun update mustflow && mf update --apply"
  },
  "devDependencies": {
    "mustflow": "latest"
  }
}
"#;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepositorySetupOptions {
    initialize_git: bool,
    install_mustflow: bool,
    install_gitignore: bool,
}

#[derive(Clone, Copy, serde::Serialize)]
pub enum WorkspaceRepositorySetupError {
    #[serde(rename = "workspace-repository-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "workspace-repository-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "workspace-repository-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "workspace-repository-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "workspace-repository-workspace-permission-denied")]
    WorkspacePermissionDenied,
    #[serde(rename = "workspace-repository-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "workspace-repository-layout-invalid")]
    LayoutInvalid,
    #[serde(rename = "workspace-repository-create-failed")]
    CreateFailed,
    #[serde(rename = "workspace-repository-git-unavailable")]
    GitUnavailable,
    #[serde(rename = "workspace-repository-git-timed-out")]
    GitTimedOut,
    #[serde(rename = "workspace-repository-git-init-failed")]
    GitInitFailed,
    #[serde(rename = "workspace-repository-mustflow-unavailable")]
    MustflowUnavailable,
    #[serde(rename = "workspace-repository-mustflow-timed-out")]
    MustflowTimedOut,
    #[serde(rename = "workspace-repository-mustflow-failed")]
    MustflowFailed,
    #[serde(rename = "workspace-repository-mustflow-package-failed")]
    MustflowPackageFailed,
    #[serde(rename = "workspace-repository-gitignore-failed")]
    GitignoreFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepositorySetupResponse {
    ok: bool,
    initialized_git: bool,
    installed_mustflow: bool,
    installed_gitignore: bool,
    created_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceRepositorySetupError>,
}

#[tauri::command]
pub fn setup_workspace_repository(
    workspace_path: String,
    options: WorkspaceRepositorySetupOptions,
) -> WorkspaceRepositorySetupResponse {
    let workspace_root = match validate_workspace_root(&workspace_path) {
        Ok(workspace_root) => workspace_root,
        Err(error) => return failure(error),
    };
    let mut created_paths = Vec::new();

    if let Err(error) = ensure_workspace_layout(&workspace_root, &mut created_paths) {
        return failure(error);
    }

    let initialized_git = if options.initialize_git {
        match ensure_git_repository(&workspace_root) {
            Ok(changed) => changed,
            Err(error) => return failure(error),
        }
    } else {
        false
    };

    let installed_mustflow = if options.install_mustflow {
        match ensure_mustflow(&workspace_root) {
            Ok(changed) => changed,
            Err(error) => return failure(error),
        }
    } else {
        false
    };

    let installed_gitignore = if options.install_gitignore {
        match ensure_workduck_gitignore(&workspace_root) {
            Ok(changed) => changed,
            Err(error) => return failure(error),
        }
    } else {
        false
    };

    WorkspaceRepositorySetupResponse {
        ok: true,
        initialized_git,
        installed_mustflow,
        installed_gitignore,
        created_paths,
        error: None,
    }
}

fn failure(error: WorkspaceRepositorySetupError) -> WorkspaceRepositorySetupResponse {
    WorkspaceRepositorySetupResponse {
        ok: false,
        initialized_git: false,
        installed_mustflow: false,
        installed_gitignore: false,
        created_paths: Vec::new(),
        error: Some(error),
    }
}

fn validate_workspace_root(workspace_path: &str) -> Result<PathBuf, WorkspaceRepositorySetupError> {
    let trimmed_path = workspace_path.trim();

    if trimmed_path.is_empty() {
        return Err(WorkspaceRepositorySetupError::WorkspaceRequired);
    }

    let workspace_path = PathBuf::from(trimmed_path);

    if !workspace_path.is_absolute() {
        return Err(WorkspaceRepositorySetupError::WorkspaceNotAbsolute);
    }

    let metadata = fs::metadata(&workspace_path).map_err(map_workspace_error)?;

    if !metadata.is_dir() {
        return Err(WorkspaceRepositorySetupError::WorkspaceNotDirectory);
    }

    let normalized_path = fs::canonicalize(&workspace_path).map_err(map_workspace_error)?;
    fs::read_dir(&normalized_path).map_err(map_workspace_error)?;

    Ok(normalized_path)
}

fn ensure_workspace_layout(
    workspace_root: &Path,
    created_paths: &mut Vec<String>,
) -> Result<(), WorkspaceRepositorySetupError> {
    let workduck_root = ensure_child_dir(workspace_root, WORKDUCK_DIRECTORY_NAME, created_paths)?;
    ensure_gitkeep(&workduck_root, created_paths)?;

    ensure_child_dir(workspace_root, PROJECTS_DIRECTORY_NAME, created_paths)?;
    ensure_gitkeep(&workspace_root.join(PROJECTS_DIRECTORY_NAME), created_paths)?;

    let queue_root = ensure_child_dir(workspace_root, QUEUE_DIRECTORY_NAME, created_paths)?;
    for child in [
        QUEUE_REPORTS_DIRECTORY_NAME,
        QUEUE_WORK_ORDERS_DIRECTORY_NAME,
        QUEUE_PROPOSALS_DIRECTORY_NAME,
    ] {
        let child_path = ensure_child_dir(&queue_root, child, created_paths)?;
        ensure_gitkeep(&child_path, created_paths)?;
    }

    Ok(())
}

fn ensure_child_dir(
    parent: &Path,
    name: &str,
    created_paths: &mut Vec<String>,
) -> Result<PathBuf, WorkspaceRepositorySetupError> {
    let child_path = parent.join(name);

    match fs::symlink_metadata(&child_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(WorkspaceRepositorySetupError::LayoutInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&child_path).map_err(map_create_error)?;
            created_paths.push(name.to_string());
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    let normalized_child = fs::canonicalize(&child_path).map_err(map_workspace_error)?;

    if !normalized_child.starts_with(parent) {
        return Err(WorkspaceRepositorySetupError::LayoutInvalid);
    }

    Ok(normalized_child)
}

fn ensure_gitkeep(
    directory: &Path,
    created_paths: &mut Vec<String>,
) -> Result<(), WorkspaceRepositorySetupError> {
    let gitkeep_path = directory.join(".gitkeep");

    match fs::symlink_metadata(&gitkeep_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_dir() {
                return Err(WorkspaceRepositorySetupError::LayoutInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::write(&gitkeep_path, "")
                .map_err(|_| WorkspaceRepositorySetupError::CreateFailed)?;
            created_paths.push(display_path(&gitkeep_path));
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    Ok(())
}

fn ensure_git_repository(workspace_root: &Path) -> Result<bool, WorkspaceRepositorySetupError> {
    if fs::symlink_metadata(workspace_root.join(".git")).is_ok() {
        return Ok(false);
    }

    let output = run_command(
        workspace_root,
        "git",
        &["init"],
        WORKSPACE_COMMAND_TIMEOUT,
        WorkspaceRepositorySetupError::GitUnavailable,
        WorkspaceRepositorySetupError::GitTimedOut,
        WorkspaceRepositorySetupError::GitInitFailed,
    )?;

    if output.status.success() {
        Ok(true)
    } else {
        Err(WorkspaceRepositorySetupError::GitInitFailed)
    }
}

fn ensure_mustflow(workspace_root: &Path) -> Result<bool, WorkspaceRepositorySetupError> {
    let mut changed = false;

    match fs::symlink_metadata(workspace_root.join(".mustflow")) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(WorkspaceRepositorySetupError::LayoutInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(map_workspace_error(error)),
    }

    if !workspace_root.join(".mustflow").exists() {
        let output = run_command(
            workspace_root,
            "mf",
            &[
                "init",
                "--yes",
                "--merge",
                "--profile",
                "product",
                "--locale",
                "en",
            ],
            WORKSPACE_COMMAND_TIMEOUT,
            WorkspaceRepositorySetupError::MustflowUnavailable,
            WorkspaceRepositorySetupError::MustflowTimedOut,
            WorkspaceRepositorySetupError::MustflowFailed,
        )?;

        if !output.status.success() {
            return Err(WorkspaceRepositorySetupError::MustflowFailed);
        }

        changed = true;
    }

    if ensure_mustflow_package_metadata(workspace_root)? {
        changed = true;
    }

    Ok(changed)
}

fn ensure_mustflow_package_metadata(
    workspace_root: &Path,
) -> Result<bool, WorkspaceRepositorySetupError> {
    let package_json_path = workspace_root.join(PACKAGE_JSON_FILE_NAME);

    match fs::symlink_metadata(&package_json_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_dir() {
                return Err(WorkspaceRepositorySetupError::LayoutInvalid);
            }

            Ok(false)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::write(&package_json_path, WORKSPACE_PACKAGE_JSON)
                .map_err(|_| WorkspaceRepositorySetupError::MustflowPackageFailed)?;
            Ok(true)
        }
        Err(error) => Err(map_workspace_error(error)),
    }
}

fn ensure_workduck_gitignore(workspace_root: &Path) -> Result<bool, WorkspaceRepositorySetupError> {
    ensure_workduck_gitignore_policy(workspace_root)
        .map_err(|_| WorkspaceRepositorySetupError::GitignoreFailed)
}

fn run_command(
    current_dir: &Path,
    program: &str,
    args: &[&str],
    timeout: Duration,
    unavailable_error: WorkspaceRepositorySetupError,
    timed_out_error: WorkspaceRepositorySetupError,
    failed_error: WorkspaceRepositorySetupError,
) -> Result<Output, WorkspaceRepositorySetupError> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            unavailable_error
        } else {
            failed_error
        }
    })?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map_err(|_| WorkspaceRepositorySetupError::CreateFailed);
            }
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(timed_out_error);
            }
            Ok(None) => thread::sleep(WORKSPACE_COMMAND_POLL_INTERVAL),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(failed_error);
            }
        }
    }
}

fn map_workspace_error(error: io::Error) -> WorkspaceRepositorySetupError {
    match error.kind() {
        io::ErrorKind::NotFound => WorkspaceRepositorySetupError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => WorkspaceRepositorySetupError::WorkspacePermissionDenied,
        _ => WorkspaceRepositorySetupError::WorkspaceUnreadable,
    }
}

fn map_create_error(error: io::Error) -> WorkspaceRepositorySetupError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => WorkspaceRepositorySetupError::WorkspacePermissionDenied,
        _ => WorkspaceRepositorySetupError::CreateFailed,
    }
}
