use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

use rusqlite::{OptionalExtension, params};
use tauri::AppHandle;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::{path_display::display_path, storage};

const SNAPSHOT_VERSION: u16 = 1;
const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const PROPOSALS_DIRECTORY_NAME: &str = "proposals";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";
const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
const PROPOSAL_FILE_SUFFIX: &str = ".workduck-proposal.json";
const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const WORKSPACE_DATA_FILE_MAX_BYTES: u64 = 1_048_576;
const REPOSITORY_TASK_RUN_LIMIT: usize = 20;
const REPOSITORY_IMPORT_ATTEMPT_LIMIT: i64 = 20;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApiSnapshotRequest {
    workspace_id: String,
    workspace_path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApiSnapshotResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<AgentApiSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<AgentApiSnapshotError>,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub enum AgentApiSnapshotError {
    #[serde(rename = "agent-api-workspace-id-required")]
    WorkspaceIdRequired,
    #[serde(rename = "agent-api-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "agent-api-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "agent-api-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "agent-api-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "agent-api-workspace-unreadable")]
    WorkspaceUnreadable,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApiSnapshot {
    version: u16,
    generated_at: String,
    capabilities: AgentApiCapabilities,
    workspace: AgentApiWorkspaceSnapshot,
    queue: AgentApiQueueSnapshot,
    project_registry: AgentApiProjectRegistrySnapshot,
    repository_import_attempts: AgentApiRepositoryImportAttemptsSnapshot,
    repository_task_runs: AgentApiRepositoryTaskRunsSnapshot,
    workspace_metadata: AgentApiWorkspaceMetadataSnapshot,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiCapabilities {
    read_only: bool,
    write_endpoints: Vec<&'static str>,
    secrets: &'static str,
    terminal_input: &'static str,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiWorkspaceSnapshot {
    id: String,
    path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiQueueSnapshot {
    ok: bool,
    exists: bool,
    path: String,
    counts: AgentApiQueueCounts,
    files: Vec<AgentApiQueueFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiQueueCounts {
    result_reports: usize,
    work_orders: usize,
    proposals: usize,
    unsupported: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiQueueFile {
    relative_path: String,
    file_name: String,
    kind: &'static str,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiProjectRegistrySnapshot {
    ok: bool,
    exists: bool,
    counts: AgentApiProjectRegistryCounts,
    updated_at: Option<String>,
    nodes: Vec<AgentApiProjectNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiProjectRegistryCounts {
    projects: usize,
    groups: usize,
    repositories: usize,
    credential_references: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiProjectNode {
    id: String,
    kind: String,
    parent_id: Option<String>,
    name: String,
    path: String,
    tags: Vec<String>,
    has_github_credential: bool,
    repositories: Vec<AgentApiProjectRepository>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiProjectRepository {
    id: String,
    name: String,
    path: Option<String>,
    remote_url: Option<String>,
    upstream_remote_url: Option<String>,
    tags: Vec<String>,
    has_github_credential: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiRepositoryImportAttemptsSnapshot {
    ok: bool,
    records: Vec<AgentApiRepositoryImportAttemptRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiRepositoryImportAttemptRecord {
    id: String,
    node_id: String,
    repository_name: String,
    state: String,
    phase: String,
    upstream_remote_url: String,
    fork_remote_url: Option<String>,
    target_path: Option<String>,
    error_code: Option<String>,
    started_at: String,
    updated_at: String,
    finished_at: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiRepositoryTaskRunsSnapshot {
    ok: bool,
    records: Vec<AgentApiRepositoryTaskRunRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiRepositoryTaskRunRecord {
    id: String,
    task: String,
    repository_path: String,
    state: String,
    has_command: bool,
    has_output_tail: bool,
    started_at: String,
    finished_at: Option<String>,
    exit_code: Option<i64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiWorkspaceMetadataSnapshot {
    ok: bool,
    files: BTreeMap<&'static str, AgentApiMetadataFileSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentApiMetadataFileSnapshot {
    exists: bool,
    count: usize,
    secret_values_exposed: bool,
    encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[tauri::command]
pub fn read_agent_api_snapshot(
    app: AppHandle,
    request: AgentApiSnapshotRequest,
) -> AgentApiSnapshotResult {
    let workspace_id = match validate_workspace_id(&request.workspace_id) {
        Ok(workspace_id) => workspace_id,
        Err(error) => return invalid(error),
    };
    let workspace_path = match validate_workspace_path(&request.workspace_path) {
        Ok(workspace_path) => workspace_path,
        Err(error) => return invalid(error),
    };

    AgentApiSnapshotResult {
        ok: true,
        snapshot: Some(AgentApiSnapshot {
            version: SNAPSHOT_VERSION,
            generated_at: current_timestamp(),
            capabilities: AgentApiCapabilities {
                read_only: true,
                write_endpoints: Vec::new(),
                secrets: "metadata-only",
                terminal_input: "disabled",
            },
            workspace: AgentApiWorkspaceSnapshot {
                id: workspace_id.clone(),
                path: display_path(&workspace_path),
            },
            queue: summarize_queue(&workspace_path),
            project_registry: summarize_project_registry(&app, &workspace_id),
            repository_import_attempts: summarize_repository_import_attempts(&app, &workspace_id),
            repository_task_runs: summarize_repository_task_runs(&workspace_path),
            workspace_metadata: summarize_workspace_metadata(&workspace_path),
        }),
        error: None,
    }
}

fn validate_workspace_id(workspace_id: &str) -> Result<String, AgentApiSnapshotError> {
    let workspace_id = workspace_id.trim();

    if workspace_id.is_empty() {
        return Err(AgentApiSnapshotError::WorkspaceIdRequired);
    }

    Ok(workspace_id.to_owned())
}

fn validate_workspace_path(workspace_path: &str) -> Result<PathBuf, AgentApiSnapshotError> {
    let workspace_path = workspace_path.trim();

    if workspace_path.is_empty() {
        return Err(AgentApiSnapshotError::WorkspaceRequired);
    }

    let workspace_path = PathBuf::from(workspace_path);

    if !workspace_path.is_absolute() {
        return Err(AgentApiSnapshotError::WorkspaceNotAbsolute);
    }

    let metadata = fs::metadata(&workspace_path).map_err(map_workspace_error)?;

    if !metadata.is_dir() {
        return Err(AgentApiSnapshotError::WorkspaceNotDirectory);
    }

    let workspace_path = fs::canonicalize(workspace_path).map_err(map_workspace_error)?;
    fs::read_dir(&workspace_path).map_err(map_workspace_error)?;

    Ok(workspace_path)
}

fn summarize_queue(workspace_path: &Path) -> AgentApiQueueSnapshot {
    let queue_path = workspace_path.join(QUEUE_DIRECTORY_NAME);
    let mut counts = AgentApiQueueCounts::default();
    let mut files = Vec::new();

    match fs::symlink_metadata(&queue_path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return AgentApiQueueSnapshot {
                ok: false,
                exists: true,
                path: display_path(&queue_path),
                counts,
                files,
                error: Some("agent-api-queue-root-invalid"),
            };
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return AgentApiQueueSnapshot {
                ok: true,
                exists: false,
                path: display_path(&queue_path),
                counts,
                files,
                error: None,
            };
        }
        Err(_) => {
            return AgentApiQueueSnapshot {
                ok: false,
                exists: false,
                path: display_path(&queue_path),
                counts,
                files,
                error: Some("agent-api-queue-read-failed"),
            };
        }
    }

    for child_dir in [REPORTS_DIRECTORY_NAME, WORK_ORDERS_DIRECTORY_NAME, PROPOSALS_DIRECTORY_NAME] {
        let child_path = queue_path.join(child_dir);
        let Ok(entries) = fs::read_dir(&child_path) else {
            continue;
        };

        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };

            if !file_type.is_file() {
                continue;
            }

            let file_name = entry.file_name().to_string_lossy().into_owned();

            if file_name.starts_with('.') {
                continue;
            }

            let kind = classify_queue_file(child_dir, &file_name);

            match kind {
                "result-report" => counts.result_reports += 1,
                "work-order" => counts.work_orders += 1,
                "proposal" => counts.proposals += 1,
                _ => counts.unsupported += 1,
            }

            files.push(AgentApiQueueFile {
                relative_path: format!("{child_dir}/{file_name}"),
                file_name,
                kind,
            });
        }
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    AgentApiQueueSnapshot {
        ok: true,
        exists: true,
        path: display_path(&queue_path),
        counts,
        files,
        error: None,
    }
}

fn classify_queue_file(child_dir: &str, file_name: &str) -> &'static str {
    if child_dir == REPORTS_DIRECTORY_NAME && file_name.ends_with(REPORT_FILE_SUFFIX) {
        return "result-report";
    }

    if child_dir == WORK_ORDERS_DIRECTORY_NAME && file_name.ends_with(WORK_ORDER_FILE_SUFFIX) {
        return "work-order";
    }

    if child_dir == PROPOSALS_DIRECTORY_NAME && file_name.ends_with(PROPOSAL_FILE_SUFFIX) {
        return "proposal";
    }

    "unsupported"
}

fn summarize_project_registry(
    app: &AppHandle,
    workspace_id: &str,
) -> AgentApiProjectRegistrySnapshot {
    let registry_json = match read_project_registry_json(app, workspace_id) {
        Ok(registry_json) => registry_json,
        Err(_) => {
            return AgentApiProjectRegistrySnapshot {
                ok: false,
                exists: false,
                counts: AgentApiProjectRegistryCounts::default(),
                updated_at: None,
                nodes: Vec::new(),
                error: Some("agent-api-project-registry-read-failed"),
            };
        }
    };
    let Some(registry_json) = registry_json else {
        return AgentApiProjectRegistrySnapshot {
            ok: true,
            exists: false,
            counts: AgentApiProjectRegistryCounts::default(),
            updated_at: None,
            nodes: Vec::new(),
            error: None,
        };
    };
    let value = match serde_json::from_str::<serde_json::Value>(&registry_json) {
        Ok(value) => value,
        Err(_) => {
            return AgentApiProjectRegistrySnapshot {
                ok: false,
                exists: true,
                counts: AgentApiProjectRegistryCounts::default(),
                updated_at: None,
                nodes: Vec::new(),
                error: Some("agent-api-project-registry-invalid"),
            };
        }
    };

    summarize_project_registry_value(&value)
}

fn read_project_registry_json(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<Option<String>, rusqlite::Error> {
    let connection = storage::app_read_connection(app).map_err(|_| rusqlite::Error::InvalidQuery)?;

    connection
        .query_row(
            "SELECT registry_json FROM project_registries WHERE workspace_id = ?1",
            [workspace_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
}

fn summarize_project_registry_value(value: &serde_json::Value) -> AgentApiProjectRegistrySnapshot {
    let mut counts = AgentApiProjectRegistryCounts::default();
    let nodes = value
        .get("nodes")
        .and_then(serde_json::Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| summarize_project_node(node, &mut counts))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    AgentApiProjectRegistrySnapshot {
        ok: true,
        exists: true,
        counts,
        updated_at: read_optional_string(value, "updatedAt"),
        nodes,
        error: None,
    }
}

fn summarize_project_node(
    value: &serde_json::Value,
    counts: &mut AgentApiProjectRegistryCounts,
) -> Option<AgentApiProjectNode> {
    let kind = read_required_string(value, "kind")?;

    match kind.as_str() {
        "project" => counts.projects += 1,
        "group" => counts.groups += 1,
        _ => return None,
    }

    let has_github_credential = has_non_empty_string(value, "githubCredentialSecretId");
    if has_github_credential {
        counts.credential_references += 1;
    }

    let repositories = value
        .get("repositories")
        .and_then(serde_json::Value::as_array)
        .map(|repositories| {
            repositories
                .iter()
                .filter_map(|repository| summarize_project_repository(repository, counts))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Some(AgentApiProjectNode {
        id: read_required_string(value, "id")?,
        kind,
        parent_id: read_optional_string(value, "parentId"),
        name: read_required_string(value, "name")?,
        path: read_required_string(value, "path")?,
        tags: read_string_array(value, "tags"),
        has_github_credential,
        repositories,
    })
}

fn summarize_project_repository(
    value: &serde_json::Value,
    counts: &mut AgentApiProjectRegistryCounts,
) -> Option<AgentApiProjectRepository> {
    counts.repositories += 1;
    let has_github_credential = has_non_empty_string(value, "githubCredentialSecretId");
    if has_github_credential {
        counts.credential_references += 1;
    }

    Some(AgentApiProjectRepository {
        id: read_required_string(value, "id")?,
        name: read_required_string(value, "name")?,
        path: read_optional_string(value, "path"),
        remote_url: read_optional_string(value, "remoteUrl"),
        upstream_remote_url: read_optional_string(value, "upstreamRemoteUrl"),
        tags: read_string_array(value, "tags"),
        has_github_credential,
    })
}

fn summarize_repository_import_attempts(
    app: &AppHandle,
    workspace_id: &str,
) -> AgentApiRepositoryImportAttemptsSnapshot {
    let connection = match storage::app_read_connection(app) {
        Ok(connection) => connection,
        Err(_) => {
            return AgentApiRepositoryImportAttemptsSnapshot {
                ok: false,
                records: Vec::new(),
                error: Some("agent-api-repository-import-attempts-read-failed"),
            };
        }
    };
    let mut statement = match connection.prepare(
        "SELECT
          id,
          node_id,
          repository_name,
          state,
          phase,
          upstream_remote_url,
          fork_remote_url,
          target_path,
          error_code,
          started_at,
          updated_at,
          finished_at
        FROM project_repository_import_attempt_records
        WHERE workspace_id = ?1
        ORDER BY updated_at DESC, id DESC
        LIMIT ?2",
    ) {
        Ok(statement) => statement,
        Err(_) => {
            return AgentApiRepositoryImportAttemptsSnapshot {
                ok: false,
                records: Vec::new(),
                error: Some("agent-api-repository-import-attempts-read-failed"),
            };
        }
    };
    let rows = match statement.query_map(
        params![workspace_id, REPOSITORY_IMPORT_ATTEMPT_LIMIT],
        |row| {
            Ok(AgentApiRepositoryImportAttemptRecord {
                id: row.get(0)?,
                node_id: row.get(1)?,
                repository_name: row.get(2)?,
                state: row.get(3)?,
                phase: row.get(4)?,
                upstream_remote_url: row.get(5)?,
                fork_remote_url: row.get(6)?,
                target_path: row.get(7)?,
                error_code: row.get(8)?,
                started_at: row.get(9)?,
                updated_at: row.get(10)?,
                finished_at: row.get(11)?,
            })
        },
    ) {
        Ok(rows) => rows,
        Err(_) => {
            return AgentApiRepositoryImportAttemptsSnapshot {
                ok: false,
                records: Vec::new(),
                error: Some("agent-api-repository-import-attempts-read-failed"),
            };
        }
    };
    let mut records = Vec::new();

    for row in rows {
        match row {
            Ok(record) => records.push(record),
            Err(_) => {
                return AgentApiRepositoryImportAttemptsSnapshot {
                    ok: false,
                    records: Vec::new(),
                    error: Some("agent-api-repository-import-attempts-read-failed"),
                };
            }
        }
    }

    AgentApiRepositoryImportAttemptsSnapshot {
        ok: true,
        records,
        error: None,
    }
}

fn summarize_repository_task_runs(workspace_path: &Path) -> AgentApiRepositoryTaskRunsSnapshot {
    let record_dir = workspace_path
        .join(WORKDUCK_DIRECTORY_NAME)
        .join("repository-task-runs");
    let entries = match fs::read_dir(&record_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return AgentApiRepositoryTaskRunsSnapshot {
                ok: true,
                records: Vec::new(),
                error: None,
            };
        }
        Err(_) => {
            return AgentApiRepositoryTaskRunsSnapshot {
                ok: false,
                records: Vec::new(),
                error: Some("agent-api-repository-task-runs-read-failed"),
            };
        }
    };
    let mut records = entries
        .flatten()
        .filter_map(|entry| read_repository_task_run_record(&entry.path()))
        .collect::<Vec<_>>();

    records.sort_by(|left, right| right.started_at.cmp(&left.started_at).then(right.id.cmp(&left.id)));
    records.truncate(REPOSITORY_TASK_RUN_LIMIT);

    AgentApiRepositoryTaskRunsSnapshot {
        ok: true,
        records,
        error: None,
    }
}

fn read_repository_task_run_record(path: &Path) -> Option<AgentApiRepositoryTaskRunRecord> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return None;
    }

    let value = serde_json::from_str::<serde_json::Value>(&fs::read_to_string(path).ok()?).ok()?;

    Some(AgentApiRepositoryTaskRunRecord {
        id: read_required_string(&value, "id")?,
        task: read_required_string(&value, "task")?,
        repository_path: read_required_string(&value, "repositoryPath")?,
        state: read_required_string(&value, "state")?,
        has_command: has_non_empty_string(&value, "command"),
        has_output_tail: has_non_empty_string(&value, "outputTail"),
        started_at: read_required_string(&value, "startedAt")?,
        finished_at: read_optional_string(&value, "finishedAt"),
        exit_code: value.get("exitCode").and_then(serde_json::Value::as_i64),
    })
}

fn summarize_workspace_metadata(workspace_path: &Path) -> AgentApiWorkspaceMetadataSnapshot {
    let mut files = BTreeMap::new();
    let mut ok = true;
    let mut error = None;

    for (file_name, array_key) in [
        ("agents.json", "agents"),
        ("personas.json", "personas"),
        ("references.json", "references"),
        ("skills.json", "skills"),
    ] {
        let summary = summarize_metadata_file(workspace_path, file_name, array_key, false);
        if summary.error.is_some() {
            ok = false;
            error = Some("agent-api-workspace-metadata-read-failed");
        }
        files.insert(file_name, summary);
    }

    files.insert(
        "secrets.sync.json",
        summarize_metadata_file(workspace_path, "secrets.sync.json", "", true),
    );

    AgentApiWorkspaceMetadataSnapshot { ok, files, error }
}

fn summarize_metadata_file(
    workspace_path: &Path,
    file_name: &'static str,
    array_key: &str,
    encrypted: bool,
) -> AgentApiMetadataFileSnapshot {
    let file_path = workspace_path.join(WORKDUCK_DIRECTORY_NAME).join(file_name);

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) if metadata.file_type().is_symlink() || metadata.is_dir() => {
            return AgentApiMetadataFileSnapshot {
                exists: true,
                count: 0,
                secret_values_exposed: false,
                encrypted,
                error: Some("agent-api-workspace-metadata-file-invalid"),
            };
        }
        Ok(metadata) if metadata.len() > WORKSPACE_DATA_FILE_MAX_BYTES => {
            return AgentApiMetadataFileSnapshot {
                exists: true,
                count: 0,
                secret_values_exposed: false,
                encrypted,
                error: Some("agent-api-workspace-metadata-file-too-large"),
            };
        }
        Ok(_) if encrypted => {
            return AgentApiMetadataFileSnapshot {
                exists: true,
                count: 0,
                secret_values_exposed: false,
                encrypted,
                error: None,
            };
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return AgentApiMetadataFileSnapshot {
                exists: false,
                count: 0,
                secret_values_exposed: false,
                encrypted,
                error: None,
            };
        }
        Err(_) => {
            return AgentApiMetadataFileSnapshot {
                exists: false,
                count: 0,
                secret_values_exposed: false,
                encrypted,
                error: Some("agent-api-workspace-metadata-read-failed"),
            };
        }
    }

    let count = fs::read_to_string(file_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|value| value.get(array_key).and_then(serde_json::Value::as_array).map(Vec::len))
        .unwrap_or(0);

    AgentApiMetadataFileSnapshot {
        exists: true,
        count,
        secret_values_exposed: false,
        encrypted,
        error: None,
    }
}

fn read_required_string(value: &serde_json::Value, key: &str) -> Option<String> {
    read_optional_string(value, key).filter(|value| !value.is_empty())
}

fn read_optional_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn read_string_array(value: &serde_json::Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::trim).filter(|value| !value.is_empty()))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn has_non_empty_string(value: &serde_json::Value, key: &str) -> bool {
    read_optional_string(value, key).is_some()
}

fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

fn invalid(error: AgentApiSnapshotError) -> AgentApiSnapshotResult {
    AgentApiSnapshotResult {
        ok: false,
        snapshot: None,
        error: Some(error),
    }
}

fn map_workspace_error(error: io::Error) -> AgentApiSnapshotError {
    match error.kind() {
        io::ErrorKind::NotFound => AgentApiSnapshotError::WorkspaceNotFound,
        io::ErrorKind::PermissionDenied => AgentApiSnapshotError::WorkspaceUnreadable,
        _ => AgentApiSnapshotError::WorkspaceUnreadable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn queue_summary_reads_known_files_without_creating_queue_root() {
        let workspace = create_test_workspace("queue-summary");
        let queue_root = workspace.join(QUEUE_DIRECTORY_NAME);
        fs::create_dir_all(queue_root.join(REPORTS_DIRECTORY_NAME)).expect("reports dir");
        fs::create_dir_all(queue_root.join(WORK_ORDERS_DIRECTORY_NAME)).expect("work-orders dir");
        fs::write(
            queue_root
                .join(REPORTS_DIRECTORY_NAME)
                .join("done.workduck-report.json"),
            "{}",
        )
        .expect("report file");
        fs::write(
            queue_root
                .join(WORK_ORDERS_DIRECTORY_NAME)
                .join("next.workduck-work-order.json"),
            "{}",
        )
        .expect("work order file");

        let snapshot = summarize_queue(&workspace);

        assert!(snapshot.ok);
        assert!(snapshot.exists);
        assert_eq!(snapshot.counts.result_reports, 1);
        assert_eq!(snapshot.counts.work_orders, 1);
        assert_eq!(snapshot.counts.proposals, 0);
        assert_eq!(snapshot.files.len(), 2);

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn missing_queue_summary_does_not_create_queue_directory() {
        let workspace = create_test_workspace("missing-queue");

        let snapshot = summarize_queue(&workspace);

        assert!(snapshot.ok);
        assert!(!snapshot.exists);
        assert!(!workspace.join(QUEUE_DIRECTORY_NAME).exists());

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn project_registry_summary_omits_secret_ids() {
        let value = serde_json::json!({
            "version": 1,
            "updatedAt": "2026-05-28T00:00:00Z",
            "nodes": [{
                "id": "project-node_1",
                "kind": "group",
                "parentId": "project-node_parent",
                "name": "Agents",
                "path": "projects/agents",
                "githubCredentialSecretId": "secret_project",
                "tags": ["agent"],
                "repositories": [{
                    "id": "repository_1",
                    "name": "agent-console",
                    "path": "projects/agent-console",
                    "remoteUrl": "https://example.invalid/repo.git",
                    "upstreamRemoteUrl": "https://example.invalid/upstream.git",
                    "githubCredentialSecretId": "secret_repo",
                    "tags": ["console"]
                }]
            }]
        });

        let snapshot = summarize_project_registry_value(&value);
        let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");

        assert!(snapshot.ok);
        assert_eq!(snapshot.counts.credential_references, 2);
        assert!(snapshot.nodes[0].has_github_credential);
        assert!(snapshot.nodes[0].repositories[0].has_github_credential);
        assert_eq!(
            snapshot.nodes[0].repositories[0].upstream_remote_url.as_deref(),
            Some("https://example.invalid/upstream.git")
        );
        assert!(!serialized.contains("secret_project"));
        assert!(!serialized.contains("secret_repo"));
    }

    #[test]
    fn workspace_metadata_summary_never_reads_encrypted_secret_payload_count() {
        let workspace = create_test_workspace("metadata-summary");
        let workduck_root = workspace.join(WORKDUCK_DIRECTORY_NAME);
        fs::create_dir_all(&workduck_root).expect("workduck dir");
        fs::write(
            workduck_root.join("agents.json"),
            r#"{"agents":[{"id":"agent_1","environmentSecretId":"secret_agent"}]}"#,
        )
        .expect("agents file");
        fs::write(
            workduck_root.join("secrets.sync.json"),
            r#"{"ciphertext":"do-not-read"}"#,
        )
        .expect("secrets file");

        let snapshot = summarize_workspace_metadata(&workspace);
        let secrets = snapshot.files.get("secrets.sync.json").expect("secrets summary");

        assert!(snapshot.ok);
        assert_eq!(snapshot.files.get("agents.json").expect("agents summary").count, 1);
        assert!(secrets.exists);
        assert!(secrets.encrypted);
        assert_eq!(secrets.count, 0);
        assert!(!secrets.secret_values_exposed);

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn repository_task_run_summary_omits_command_and_output_tail_text() {
        let workspace = create_test_workspace("run-summary");
        let run_dir = workspace
            .join(WORKDUCK_DIRECTORY_NAME)
            .join("repository-task-runs");
        fs::create_dir_all(&run_dir).expect("run dir");
        fs::write(
            run_dir.join("repo_task_1.json"),
            r#"{
                "id": "repo_task_1",
                "task": "build",
                "repositoryPath": "C:/workspace/project",
                "command": "echo secret_token",
                "state": "failed",
                "exitCode": 1,
                "startedAt": "2026-05-28T00:00:00Z",
                "finishedAt": "2026-05-28T00:01:00Z",
                "outputTail": "secret output",
                "recordPath": "repo_task_1.json"
            }"#,
        )
        .expect("run record");

        let snapshot = summarize_repository_task_runs(&workspace);
        let serialized = serde_json::to_string(&snapshot).expect("serialize snapshot");

        assert!(snapshot.ok);
        assert_eq!(snapshot.records.len(), 1);
        assert!(snapshot.records[0].has_command);
        assert!(snapshot.records[0].has_output_tail);
        assert!(!serialized.contains("secret_token"));
        assert!(!serialized.contains("secret output"));

        let _ = fs::remove_dir_all(workspace);
    }

    fn create_test_workspace(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("workduck-agent-api-{name}-{unique}"));
        fs::create_dir_all(&path).expect("workspace dir");
        path
    }
}
