// llmnav/1 module
// id=workduck.projects.import-attempt-store
// role=Validate, persist, and read bounded repository-import attempt state and phase records from the native SQLite store.
// owns=import attempt persistence|import state validation|recent attempt queries
// excludes=repository clone execution|frontend attempt orchestration
// search=repository import attempt|persist import phase|read recent imports
// invariant=Only closed source-kind, state, and phase values with required repository identity and timestamps are written.
// stability=contract
// /llmnav
use rusqlite::params;
use tauri::AppHandle;

use crate::storage;

const REPOSITORY_IMPORT_ATTEMPT_READ_LIMIT: i64 = 50;
const REPOSITORY_NAME_MAX_CHARS: usize = 120;

#[derive(serde::Serialize)]
pub enum ProjectRepositoryImportAttemptStoreError {
    #[serde(rename = "project-repository-import-attempt-id-required")]
    IdRequired,
    #[serde(rename = "project-repository-import-attempt-workspace-id-required")]
    WorkspaceIdRequired,
    #[serde(rename = "project-repository-import-attempt-node-id-required")]
    NodeIdRequired,
    #[serde(rename = "project-repository-import-attempt-repository-name-required")]
    RepositoryNameRequired,
    #[serde(rename = "project-repository-import-attempt-repository-name-invalid")]
    RepositoryNameInvalid,
    #[serde(rename = "project-repository-import-attempt-source-kind-invalid")]
    SourceKindInvalid,
    #[serde(rename = "project-repository-import-attempt-state-invalid")]
    StateInvalid,
    #[serde(rename = "project-repository-import-attempt-phase-invalid")]
    PhaseInvalid,
    #[serde(rename = "project-repository-import-attempt-upstream-remote-url-required")]
    UpstreamRemoteUrlRequired,
    #[serde(rename = "project-repository-import-attempt-started-at-required")]
    StartedAtRequired,
    #[serde(rename = "project-repository-import-attempt-updated-at-required")]
    UpdatedAtRequired,
    #[serde(rename = "project-repository-import-attempt-read-failed")]
    ReadFailed,
    #[serde(rename = "project-repository-import-attempt-write-failed")]
    WriteFailed,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryImportAttemptRecordInput {
    id: String,
    workspace_id: String,
    node_id: String,
    repository_name: String,
    source_kind: String,
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
pub struct ProjectRepositoryImportAttemptRecord {
    id: String,
    workspace_id: String,
    node_id: String,
    repository_name: String,
    source_kind: String,
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
pub struct ProjectRepositoryImportAttemptRecordsRead {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    records: Option<Vec<ProjectRepositoryImportAttemptRecord>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryImportAttemptStoreError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryImportAttemptRecordWrite {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryImportAttemptStoreError>,
}

#[tauri::command]
pub fn read_project_repository_import_attempt_records(
    app: AppHandle,
    workspace_id: String,
) -> ProjectRepositoryImportAttemptRecordsRead {
    let workspace_id = match validate_required_text(
        &workspace_id,
        ProjectRepositoryImportAttemptStoreError::WorkspaceIdRequired,
    ) {
        Ok(workspace_id) => workspace_id,
        Err(error) => return invalid_read(error),
    };
    let connection = match storage::app_read_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_read(ProjectRepositoryImportAttemptStoreError::ReadFailed),
    };
    let mut statement = match connection.prepare(
        "SELECT
          id,
          workspace_id,
          node_id,
          repository_name,
          source_kind,
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
        Err(_) => return invalid_read(ProjectRepositoryImportAttemptStoreError::ReadFailed),
    };
    let rows = match statement.query_map(
        params![workspace_id, REPOSITORY_IMPORT_ATTEMPT_READ_LIMIT],
        |row| {
            Ok(ProjectRepositoryImportAttemptRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                node_id: row.get(2)?,
                repository_name: row.get(3)?,
                source_kind: row.get(4)?,
                state: row.get(5)?,
                phase: row.get(6)?,
                upstream_remote_url: row.get(7)?,
                fork_remote_url: row.get(8)?,
                target_path: row.get(9)?,
                error_code: row.get(10)?,
                started_at: row.get(11)?,
                updated_at: row.get(12)?,
                finished_at: row.get(13)?,
            })
        },
    ) {
        Ok(rows) => rows,
        Err(_) => return invalid_read(ProjectRepositoryImportAttemptStoreError::ReadFailed),
    };
    let mut records = Vec::new();

    for row in rows {
        match row {
            Ok(record) => records.push(record),
            Err(_) => return invalid_read(ProjectRepositoryImportAttemptStoreError::ReadFailed),
        }
    }

    ProjectRepositoryImportAttemptRecordsRead {
        ok: true,
        records: Some(records),
        error: None,
    }
}

#[tauri::command]
pub fn write_project_repository_import_attempt_record(
    app: AppHandle,
    record: ProjectRepositoryImportAttemptRecordInput,
) -> ProjectRepositoryImportAttemptRecordWrite {
    let record = match validate_import_attempt_record(record) {
        Ok(record) => record,
        Err(error) => return invalid_write(error),
    };
    let connection = match storage::app_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_write(ProjectRepositoryImportAttemptStoreError::WriteFailed),
    };

    if connection
        .execute(
            "INSERT INTO project_repository_import_attempt_records (
              id,
              workspace_id,
              node_id,
              repository_name,
              source_kind,
              state,
              phase,
              upstream_remote_url,
              fork_remote_url,
              target_path,
              error_code,
              started_at,
              updated_at,
              finished_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              workspace_id = excluded.workspace_id,
              node_id = excluded.node_id,
              repository_name = excluded.repository_name,
              source_kind = excluded.source_kind,
              state = excluded.state,
              phase = excluded.phase,
              upstream_remote_url = excluded.upstream_remote_url,
              fork_remote_url = excluded.fork_remote_url,
              target_path = excluded.target_path,
              error_code = excluded.error_code,
              started_at = excluded.started_at,
              updated_at = excluded.updated_at,
              finished_at = excluded.finished_at,
              recorded_at = CURRENT_TIMESTAMP",
            params![
                record.id,
                record.workspace_id,
                record.node_id,
                record.repository_name,
                record.source_kind,
                record.state,
                record.phase,
                record.upstream_remote_url,
                record.fork_remote_url,
                record.target_path,
                record.error_code,
                record.started_at,
                record.updated_at,
                record.finished_at,
            ],
        )
        .is_err()
    {
        return invalid_write(ProjectRepositoryImportAttemptStoreError::WriteFailed);
    }

    ProjectRepositoryImportAttemptRecordWrite {
        ok: true,
        error: None,
    }
}

fn validate_import_attempt_record(
    record: ProjectRepositoryImportAttemptRecordInput,
) -> Result<ProjectRepositoryImportAttemptRecordInput, ProjectRepositoryImportAttemptStoreError> {
    let id = validate_required_text(
        &record.id,
        ProjectRepositoryImportAttemptStoreError::IdRequired,
    )?;
    let workspace_id = validate_required_text(
        &record.workspace_id,
        ProjectRepositoryImportAttemptStoreError::WorkspaceIdRequired,
    )?;
    let node_id = validate_required_text(
        &record.node_id,
        ProjectRepositoryImportAttemptStoreError::NodeIdRequired,
    )?;
    let repository_name = validate_repository_name(&record.repository_name)?;
    let source_kind = validate_source_kind(&record.source_kind)?;
    let state = validate_state(&record.state)?;
    let phase = validate_phase(&record.phase)?;
    let upstream_remote_url = validate_required_text(
        &record.upstream_remote_url,
        ProjectRepositoryImportAttemptStoreError::UpstreamRemoteUrlRequired,
    )?;
    let fork_remote_url = normalize_optional_text(record.fork_remote_url);
    let target_path = normalize_optional_text(record.target_path);
    let error_code = normalize_optional_text(record.error_code);
    let started_at = validate_required_text(
        &record.started_at,
        ProjectRepositoryImportAttemptStoreError::StartedAtRequired,
    )?;
    let updated_at = validate_required_text(
        &record.updated_at,
        ProjectRepositoryImportAttemptStoreError::UpdatedAtRequired,
    )?;
    let finished_at = normalize_optional_text(record.finished_at);

    Ok(ProjectRepositoryImportAttemptRecordInput {
        id,
        workspace_id,
        node_id,
        repository_name,
        source_kind,
        state,
        phase,
        upstream_remote_url,
        fork_remote_url,
        target_path,
        error_code,
        started_at,
        updated_at,
        finished_at,
    })
}

fn validate_required_text(
    value: &str,
    error: ProjectRepositoryImportAttemptStoreError,
) -> Result<String, ProjectRepositoryImportAttemptStoreError> {
    let value = value.trim();

    if value.is_empty() {
        return Err(error);
    }

    Ok(value.to_owned())
}

fn validate_repository_name(
    name: &str,
) -> Result<String, ProjectRepositoryImportAttemptStoreError> {
    let name = validate_required_text(
        name,
        ProjectRepositoryImportAttemptStoreError::RepositoryNameRequired,
    )?;

    if name.chars().count() > REPOSITORY_NAME_MAX_CHARS {
        return Err(ProjectRepositoryImportAttemptStoreError::RepositoryNameInvalid);
    }

    Ok(name)
}

fn validate_source_kind(
    source_kind: &str,
) -> Result<String, ProjectRepositoryImportAttemptStoreError> {
    let source_kind = source_kind.trim();

    if source_kind == "fork" {
        Ok(source_kind.to_owned())
    } else {
        Err(ProjectRepositoryImportAttemptStoreError::SourceKindInvalid)
    }
}

fn validate_state(state: &str) -> Result<String, ProjectRepositoryImportAttemptStoreError> {
    let state = state.trim();

    if matches!(state, "running" | "succeeded" | "failed") {
        Ok(state.to_owned())
    } else {
        Err(ProjectRepositoryImportAttemptStoreError::StateInvalid)
    }
}

fn validate_phase(phase: &str) -> Result<String, ProjectRepositoryImportAttemptStoreError> {
    let phase = phase.trim();

    if matches!(
        phase,
        "preflight" | "creating-fork" | "cloning-fork" | "persisting-registry" | "completed"
    ) {
        Ok(phase.to_owned())
    } else {
        Err(ProjectRepositoryImportAttemptStoreError::PhaseInvalid)
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn invalid_read(
    error: ProjectRepositoryImportAttemptStoreError,
) -> ProjectRepositoryImportAttemptRecordsRead {
    ProjectRepositoryImportAttemptRecordsRead {
        ok: false,
        records: None,
        error: Some(error),
    }
}

fn invalid_write(
    error: ProjectRepositoryImportAttemptStoreError,
) -> ProjectRepositoryImportAttemptRecordWrite {
    ProjectRepositoryImportAttemptRecordWrite {
        ok: false,
        error: Some(error),
    }
}
