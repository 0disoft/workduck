use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    time::Duration,
};

use sha2::{Digest, Sha256};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::git_path::{GitProcessError, wait_for_child_output};
use crate::path_display::display_path;
use crate::workspace_path::{validate_absolute_directory_path, WorkspacePathValidationError};
use crate::workspace_repository_gitignore::ensure_workduck_gitignore as ensure_workduck_gitignore_policy;

const PROJECTS_DIRECTORY_NAME: &str = "projects";
const QUEUE_DIRECTORY_NAME: &str = "queue";
const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const AGENTS_FILE_NAME: &str = "AGENTS.md";
const MUSTFLOW_DIRECTORY_NAME: &str = ".mustflow";
const MUSTFLOW_CONFIG_DIRECTORY_NAME: &str = "config";
const MUSTFLOW_MANIFEST_LOCK_FILE_NAME: &str = "manifest.lock.toml";
const PACKAGE_JSON_FILE_NAME: &str = "package.json";
const QUEUE_REPORTS_DIRECTORY_NAME: &str = "reports";
const QUEUE_WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const QUEUE_PROPOSALS_DIRECTORY_NAME: &str = "proposals";
const WORKSPACE_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
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

const WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_MARKER: &str =
    "<!-- BEGIN WORKDUCK WORK ORDER HANDOFF -->";
const WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_END_MARKER: &str =
    "<!-- END WORKDUCK WORK ORDER HANDOFF -->";
const WORKDUCK_AGENT_INSTRUCTIONS_BLOCK: &str = "\
<!-- BEGIN WORKDUCK WORK ORDER HANDOFF -->
## Workduck Work Order IDs

When the user gives only a Workduck work order ID, such as `wo_...` or
`work-order_...`, treat the ID as an assignment pointer and resolve the actual
task before making edits.

1. Search the current workspace for exactly one matching
   `queue/work-orders/*.workduck-work-order.json` file whose `ref.id` equals the
   requested ID. If no file matches, report the searched path. If multiple files
   match, stop and report the ambiguity.
2. Read the matched JSON and verify `schemaVersion` is
   `workduck.queue-work-order/v1`, `ref.kind` is `queue-work-order`, and
   `status` is `active`. If status is `running`, `archived`, or another value,
   report that state instead of guessing.
3. Treat the work order body as the user task. Follow the nearest repository
   instructions for the target repository named by the work order, and reread
   that repository's `AGENTS.md` and command contract before edits or command
   execution.
4. Do not infer push, release, deletion, migration, dependency installation, or
   other high-risk actions beyond the work order body and current user message.
5. When the work order is complete, or when there is no commit-worthy/actionable
   work left, set the matched work order JSON `status` to `archived` so Workduck
   does not keep it in the pending queue.
<!-- END WORKDUCK WORK ORDER HANDOFF -->
";

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepositorySetupOptions {
    initialize_git: bool,
    install_mustflow: bool,
    install_gitignore: bool,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
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
    #[serde(rename = "workspace-repository-agent-instructions-failed")]
    AgentInstructionsFailed,
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

    if let Err(error) = ensure_workduck_agent_instructions(&workspace_root, &mut created_paths) {
        return failure(error);
    }

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
    validate_absolute_directory_path(workspace_path).map_err(map_workspace_path_validation_error)
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

fn ensure_workduck_agent_instructions(
    workspace_root: &Path,
    created_paths: &mut Vec<String>,
) -> Result<bool, WorkspaceRepositorySetupError> {
    let agents_path = workspace_root.join(AGENTS_FILE_NAME);

    match fs::symlink_metadata(&agents_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_dir() {
                return Err(WorkspaceRepositorySetupError::LayoutInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let content = format!("# AGENTS.md\n\n{WORKDUCK_AGENT_INSTRUCTIONS_BLOCK}");
            fs::write(&agents_path, content)
                .map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;
            refresh_agents_manifest_lock_if_present(workspace_root)?;
            created_paths.push(AGENTS_FILE_NAME.to_string());
            return Ok(true);
        }
        Err(error) => return Err(map_workspace_error(error)),
    }

    let content = fs::read_to_string(&agents_path)
        .map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;

    if let Some(next_content) = replace_workduck_agent_instructions_block(&content)? {
        if next_content == content {
            refresh_agents_manifest_lock_if_present(workspace_root)?;
            return Ok(false);
        }

        fs::write(&agents_path, next_content)
            .map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;
        refresh_agents_manifest_lock_if_present(workspace_root)?;
        created_paths.push(AGENTS_FILE_NAME.to_string());
        return Ok(true);
    }

    let mut next_content = content;

    if !next_content.ends_with('\n') {
        next_content.push('\n');
    }

    next_content.push('\n');
    next_content.push_str(WORKDUCK_AGENT_INSTRUCTIONS_BLOCK);

    fs::write(&agents_path, next_content)
        .map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;
    refresh_agents_manifest_lock_if_present(workspace_root)?;
    created_paths.push(AGENTS_FILE_NAME.to_string());

    Ok(true)
}

fn replace_workduck_agent_instructions_block(
    content: &str,
) -> Result<Option<String>, WorkspaceRepositorySetupError> {
    let Some(start_index) = content.find(WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_MARKER) else {
        return Ok(None);
    };

    let Some(relative_end_index) = content[start_index..]
        .find(WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_END_MARKER)
    else {
        return Err(WorkspaceRepositorySetupError::LayoutInvalid);
    };

    let end_index = start_index
        + relative_end_index
        + WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_END_MARKER.len();
    let mut next_content = String::new();

    next_content.push_str(&content[..start_index]);
    next_content.push_str(WORKDUCK_AGENT_INSTRUCTIONS_BLOCK);
    next_content.push_str(
        content[end_index..].trim_start_matches(|value| value == '\r' || value == '\n'),
    );

    Ok(Some(next_content))
}

fn refresh_agents_manifest_lock_if_present(
    workspace_root: &Path,
) -> Result<(), WorkspaceRepositorySetupError> {
    let manifest_lock_path = workspace_root
        .join(MUSTFLOW_DIRECTORY_NAME)
        .join(MUSTFLOW_CONFIG_DIRECTORY_NAME)
        .join(MUSTFLOW_MANIFEST_LOCK_FILE_NAME);

    match fs::symlink_metadata(&manifest_lock_path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || metadata.is_dir() {
                return Err(WorkspaceRepositorySetupError::LayoutInvalid);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(map_workspace_error(error)),
    }

    let manifest_lock = fs::read_to_string(&manifest_lock_path)
        .map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;
    let agents_hash = sha256_file_hash(&workspace_root.join(AGENTS_FILE_NAME))?;
    let Some(next_manifest_lock) =
        replace_manifest_lock_agents_entry(&manifest_lock, &agents_hash)?
    else {
        return Ok(());
    };

    if next_manifest_lock != manifest_lock {
        fs::write(&manifest_lock_path, next_manifest_lock)
            .map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;
    }

    Ok(())
}

fn sha256_file_hash(path: &Path) -> Result<String, WorkspaceRepositorySetupError> {
    let bytes = fs::read(path).map_err(|_| WorkspaceRepositorySetupError::AgentInstructionsFailed)?;
    let digest = Sha256::digest(bytes);
    let mut content_hash = String::from("sha256:");

    for byte in digest {
        content_hash.push_str(&format!("{byte:02x}"));
    }

    Ok(content_hash)
}

fn replace_manifest_lock_agents_entry(
    content: &str,
    content_hash: &str,
) -> Result<Option<String>, WorkspaceRepositorySetupError> {
    let header = format!("[files.\"{AGENTS_FILE_NAME}\"]");
    let Some(start_index) = content.find(&header) else {
        return Ok(None);
    };
    let relative_end_index = content[start_index + header.len()..]
        .find("\n[")
        .map(|index| start_index + header.len() + index)
        .unwrap_or(content.len());
    let block = &content[start_index..relative_end_index];
    let Some(source_line) = block.lines().find(|line| line.starts_with("source = ")) else {
        return Err(WorkspaceRepositorySetupError::AgentInstructionsFailed);
    };
    let mut next_content = String::new();

    next_content.push_str(&content[..start_index]);
    next_content.push_str(&header);
    next_content.push('\n');
    next_content.push_str(source_line);
    next_content.push('\n');
    next_content.push_str("last_action = \"customized\"\n");
    next_content.push_str("content_hash = \"");
    next_content.push_str(content_hash);
    next_content.push_str("\"\n\n");
    next_content.push_str(
        content[relative_end_index..].trim_start_matches(|value| value == '\r' || value == '\n'),
    );

    Ok(Some(next_content))
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

    let child = command.spawn().map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            unavailable_error
        } else {
            failed_error
        }
    })?;

    match wait_for_child_output(child, timeout) {
        Ok(output) => Ok(output),
        Err(GitProcessError::TimedOut) => Err(timed_out_error),
        Err(GitProcessError::Spawn(_)) | Err(GitProcessError::Failed) => Err(failed_error),
    }
}

fn map_workspace_error(error: io::Error) -> WorkspaceRepositorySetupError {
    match error.kind() {
        io::ErrorKind::NotFound => WorkspaceRepositorySetupError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => WorkspaceRepositorySetupError::WorkspacePermissionDenied,
        _ => WorkspaceRepositorySetupError::WorkspaceUnreadable,
    }
}

fn map_workspace_path_validation_error(
    error: WorkspacePathValidationError,
) -> WorkspaceRepositorySetupError {
    match error {
        WorkspacePathValidationError::Required => WorkspaceRepositorySetupError::WorkspaceRequired,
        WorkspacePathValidationError::NotAbsolute => {
            WorkspaceRepositorySetupError::WorkspaceNotAbsolute
        }
        WorkspacePathValidationError::NotFound => WorkspaceRepositorySetupError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => {
            WorkspaceRepositorySetupError::WorkspaceNotDirectory
        }
        WorkspacePathValidationError::PermissionDenied => {
            WorkspaceRepositorySetupError::WorkspacePermissionDenied
        }
        WorkspacePathValidationError::Unreadable => {
            WorkspaceRepositorySetupError::WorkspaceUnreadable
        }
    }
}

fn map_create_error(error: io::Error) -> WorkspaceRepositorySetupError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => WorkspaceRepositorySetupError::WorkspacePermissionDenied,
        _ => WorkspaceRepositorySetupError::CreateFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn workduck_agent_instructions_are_created_when_agents_file_is_missing() {
        let workspace_root = create_test_workspace("create-agent-instructions");
        let mut created_paths = Vec::new();

        let changed =
            ensure_workduck_agent_instructions(&workspace_root, &mut created_paths).unwrap();

        let content = fs::read_to_string(workspace_root.join(AGENTS_FILE_NAME)).unwrap();
        assert!(changed);
        assert_eq!(created_paths, vec![AGENTS_FILE_NAME.to_string()]);
        assert!(content.contains(WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_MARKER));
        assert!(content.contains("queue/work-orders/*.workduck-work-order.json"));
        assert!(content.contains("set the matched work order JSON `status` to `archived`"));

        fs::remove_dir_all(workspace_root).unwrap();
    }

    #[test]
    fn workduck_agent_instructions_replace_existing_managed_block_once() {
        let workspace_root = create_test_workspace("replace-agent-instructions");
        let agents_path = workspace_root.join(AGENTS_FILE_NAME);
        fs::write(
            &agents_path,
            "# AGENTS.md\n\n<!-- BEGIN WORKDUCK WORK ORDER HANDOFF -->\nold text\n<!-- END WORKDUCK WORK ORDER HANDOFF -->\n\n## Local Rules\n\nKeep me.\n",
        )
        .unwrap();
        let mut created_paths = Vec::new();

        let changed =
            ensure_workduck_agent_instructions(&workspace_root, &mut created_paths).unwrap();
        let changed_again =
            ensure_workduck_agent_instructions(&workspace_root, &mut created_paths).unwrap();

        let content = fs::read_to_string(agents_path).unwrap();
        assert!(changed);
        assert!(!changed_again);
        assert_eq!(
            content.matches(WORKDUCK_AGENT_INSTRUCTIONS_BLOCK_MARKER).count(),
            1
        );
        assert!(!content.contains("old text"));
        assert!(content.contains("## Local Rules"));
        assert!(content.contains("Keep me."));

        fs::remove_dir_all(workspace_root).unwrap();
    }

    #[test]
    fn workduck_agent_instructions_refresh_manifest_lock_as_customized() {
        let workspace_root = create_test_workspace("refresh-agent-lock");
        let mustflow_config_path = workspace_root
            .join(MUSTFLOW_DIRECTORY_NAME)
            .join(MUSTFLOW_CONFIG_DIRECTORY_NAME);
        fs::create_dir_all(&mustflow_config_path).unwrap();
        fs::write(
            mustflow_config_path.join(MUSTFLOW_MANIFEST_LOCK_FILE_NAME),
            "schema_version = \"1\"\n\n[files.\"AGENTS.md\"]\nsource = \"template_locale\"\nlast_action = \"created\"\ncontent_hash = \"sha256:old\"\n\n[files.\"README.md\"]\nsource = \"template_locale\"\nlast_action = \"created\"\ncontent_hash = \"sha256:readme\"\n",
        )
        .unwrap();
        let mut created_paths = Vec::new();

        ensure_workduck_agent_instructions(&workspace_root, &mut created_paths).unwrap();

        let manifest_lock =
            fs::read_to_string(mustflow_config_path.join(MUSTFLOW_MANIFEST_LOCK_FILE_NAME))
                .unwrap();
        let agents_hash = sha256_file_hash(&workspace_root.join(AGENTS_FILE_NAME)).unwrap();
        assert!(manifest_lock.contains("last_action = \"customized\""));
        assert!(manifest_lock.contains(&format!("content_hash = \"{agents_hash}\"")));
        assert!(manifest_lock.contains("[files.\"README.md\"]"));
        assert!(manifest_lock.contains("content_hash = \"sha256:readme\""));

        fs::remove_dir_all(workspace_root).unwrap();
    }

    #[test]
    fn setup_command_drains_large_stdout_and_stderr() {
        let workspace_root = create_test_workspace("large-command-output");
        #[cfg(target_os = "windows")]
        let (program, args) = (
            "cmd",
            vec![
                "/C",
                "(for /L %i in (1,1,1024) do @echo stdout%i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz) & (for /L %i in (1,1,1024) do @echo stderr%i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz 1>&2)",
            ],
        );
        #[cfg(not(target_os = "windows"))]
        let (program, args) = (
            "sh",
            vec![
                "-c",
                "i=0; while [ $i -lt 1024 ]; do echo stdout$i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz; echo stderr$i-abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz >&2; i=$((i + 1)); done",
            ],
        );

        let output = run_command(
            &workspace_root,
            program,
            &args,
            Duration::from_secs(10),
            WorkspaceRepositorySetupError::GitUnavailable,
            WorkspaceRepositorySetupError::GitTimedOut,
            WorkspaceRepositorySetupError::GitInitFailed,
        )
        .expect("large output command completes");

        assert!(output.status.success());
        assert!(output.stdout.len() > 64 * 1024);
        assert!(output.stderr.len() > 64 * 1024);

        fs::remove_dir_all(workspace_root).unwrap();
    }

    fn create_test_workspace(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let workspace_root = std::env::temp_dir().join(format!(
            "workduck-workspace-repository-setup-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&workspace_root).expect("workspace dir");
        workspace_root
    }
}
