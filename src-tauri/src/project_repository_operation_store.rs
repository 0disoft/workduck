use rusqlite::params;
use tauri::AppHandle;

use crate::storage;

const REPOSITORY_NAME_MAX_CHARS: usize = 120;

#[derive(serde::Serialize)]
pub enum ProjectRepositoryOperationStoreError {
    #[serde(rename = "project-repository-operation-id-required")]
    IdRequired,
    #[serde(rename = "project-repository-operation-workspace-id-required")]
    WorkspaceIdRequired,
    #[serde(rename = "project-repository-operation-node-id-required")]
    NodeIdRequired,
    #[serde(rename = "project-repository-operation-repository-id-required")]
    RepositoryIdRequired,
    #[serde(rename = "project-repository-operation-repository-name-required")]
    RepositoryNameRequired,
    #[serde(rename = "project-repository-operation-repository-name-invalid")]
    RepositoryNameInvalid,
    #[serde(rename = "project-repository-operation-name-invalid")]
    OperationInvalid,
    #[serde(rename = "project-repository-operation-state-invalid")]
    StateInvalid,
    #[serde(rename = "project-repository-operation-started-at-required")]
    StartedAtRequired,
    #[serde(rename = "project-repository-operation-finished-at-required")]
    FinishedAtRequired,
    #[serde(rename = "project-repository-operation-read-failed")]
    ReadFailed,
    #[serde(rename = "project-repository-operation-write-failed")]
    WriteFailed,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryOperationRecordInput {
    id: String,
    workspace_id: String,
    node_id: String,
    repository_id: String,
    repository_name: String,
    operation: String,
    state: String,
    error_code: Option<String>,
    started_at: String,
    finished_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryOperationRecord {
    id: String,
    workspace_id: String,
    node_id: String,
    repository_id: String,
    repository_name: String,
    operation: String,
    state: String,
    error_code: Option<String>,
    started_at: String,
    finished_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryOperationRecordsRead {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    records: Option<Vec<ProjectRepositoryOperationRecord>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryOperationStoreError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryOperationRecordWrite {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRepositoryOperationStoreError>,
}

#[tauri::command]
pub fn read_project_repository_operation_records(
    app: AppHandle,
    workspace_id: String,
) -> ProjectRepositoryOperationRecordsRead {
    let workspace_id = match validate_required_text(
        &workspace_id,
        ProjectRepositoryOperationStoreError::WorkspaceIdRequired,
    ) {
        Ok(workspace_id) => workspace_id,
        Err(error) => return invalid_read(error),
    };
    let connection = match storage::app_read_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_read(ProjectRepositoryOperationStoreError::ReadFailed),
    };
    let mut statement = match connection.prepare(
        "SELECT
          id,
          workspace_id,
          node_id,
          repository_id,
          repository_name,
          operation,
          state,
          error_code,
          started_at,
          finished_at
        FROM project_repository_operation_records current_record
        WHERE workspace_id = ?1
          AND NOT EXISTS (
            SELECT 1
            FROM project_repository_operation_records newer
            WHERE newer.workspace_id = current_record.workspace_id
              AND newer.repository_id = current_record.repository_id
              AND (
                newer.finished_at > current_record.finished_at
                OR (newer.finished_at = current_record.finished_at AND newer.id > current_record.id)
              )
          )
        ORDER BY finished_at DESC, id DESC",
    ) {
        Ok(statement) => statement,
        Err(_) => return invalid_read(ProjectRepositoryOperationStoreError::ReadFailed),
    };
    let rows = match statement.query_map([workspace_id], |row| {
        Ok(ProjectRepositoryOperationRecord {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            node_id: row.get(2)?,
            repository_id: row.get(3)?,
            repository_name: row.get(4)?,
            operation: row.get(5)?,
            state: row.get(6)?,
            error_code: row.get(7)?,
            started_at: row.get(8)?,
            finished_at: row.get(9)?,
        })
    }) {
        Ok(rows) => rows,
        Err(_) => return invalid_read(ProjectRepositoryOperationStoreError::ReadFailed),
    };
    let mut records = Vec::new();

    for row in rows {
        match row {
            Ok(record) => records.push(record),
            Err(_) => return invalid_read(ProjectRepositoryOperationStoreError::ReadFailed),
        }
    }

    ProjectRepositoryOperationRecordsRead {
        ok: true,
        records: Some(records),
        error: None,
    }
}

#[tauri::command]
pub fn write_project_repository_operation_record(
    app: AppHandle,
    record: ProjectRepositoryOperationRecordInput,
) -> ProjectRepositoryOperationRecordWrite {
    let record = match validate_operation_record(record) {
        Ok(record) => record,
        Err(error) => return invalid_write(error),
    };
    let connection = match storage::app_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_write(ProjectRepositoryOperationStoreError::WriteFailed),
    };

    if connection
        .execute(
            "INSERT INTO project_repository_operation_records (
              id,
              workspace_id,
              node_id,
              repository_id,
              repository_name,
              operation,
              state,
              error_code,
              started_at,
              finished_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
              workspace_id = excluded.workspace_id,
              node_id = excluded.node_id,
              repository_id = excluded.repository_id,
              repository_name = excluded.repository_name,
              operation = excluded.operation,
              state = excluded.state,
              error_code = excluded.error_code,
              started_at = excluded.started_at,
              finished_at = excluded.finished_at,
              recorded_at = CURRENT_TIMESTAMP",
            params![
                record.id,
                record.workspace_id,
                record.node_id,
                record.repository_id,
                record.repository_name,
                record.operation,
                record.state,
                record.error_code,
                record.started_at,
                record.finished_at,
            ],
        )
        .is_err()
    {
        return invalid_write(ProjectRepositoryOperationStoreError::WriteFailed);
    }

    ProjectRepositoryOperationRecordWrite {
        ok: true,
        error: None,
    }
}

fn validate_operation_record(
    record: ProjectRepositoryOperationRecordInput,
) -> Result<ProjectRepositoryOperationRecordInput, ProjectRepositoryOperationStoreError> {
    let id = validate_required_text(&record.id, ProjectRepositoryOperationStoreError::IdRequired)?;
    let workspace_id = validate_required_text(
        &record.workspace_id,
        ProjectRepositoryOperationStoreError::WorkspaceIdRequired,
    )?;
    let node_id = validate_required_text(
        &record.node_id,
        ProjectRepositoryOperationStoreError::NodeIdRequired,
    )?;
    let repository_id = validate_required_text(
        &record.repository_id,
        ProjectRepositoryOperationStoreError::RepositoryIdRequired,
    )?;
    let repository_name = validate_repository_name(&record.repository_name)?;
    let operation = validate_operation(&record.operation)?;
    let state = validate_state(&record.state)?;
    let error_code = record
        .error_code
        .map(|error_code| error_code.trim().to_owned())
        .filter(|error_code| !error_code.is_empty());
    let started_at = validate_required_text(
        &record.started_at,
        ProjectRepositoryOperationStoreError::StartedAtRequired,
    )?;
    let finished_at = validate_required_text(
        &record.finished_at,
        ProjectRepositoryOperationStoreError::FinishedAtRequired,
    )?;

    Ok(ProjectRepositoryOperationRecordInput {
        id,
        workspace_id,
        node_id,
        repository_id,
        repository_name,
        operation,
        state,
        error_code,
        started_at,
        finished_at,
    })
}

fn validate_required_text(
    value: &str,
    error: ProjectRepositoryOperationStoreError,
) -> Result<String, ProjectRepositoryOperationStoreError> {
    let value = value.trim();

    if value.is_empty() {
        return Err(error);
    }

    Ok(value.to_owned())
}

fn validate_repository_name(name: &str) -> Result<String, ProjectRepositoryOperationStoreError> {
    let name = validate_required_text(
        name,
        ProjectRepositoryOperationStoreError::RepositoryNameRequired,
    )?;

    if name.chars().count() > REPOSITORY_NAME_MAX_CHARS {
        return Err(ProjectRepositoryOperationStoreError::RepositoryNameInvalid);
    }

    Ok(name)
}

fn validate_operation(operation: &str) -> Result<String, ProjectRepositoryOperationStoreError> {
    let operation = operation.trim();

    if matches!(
        operation,
        "clone" | "init" | "fetch" | "pull" | "push" | "publish"
    ) {
        Ok(operation.to_owned())
    } else {
        Err(ProjectRepositoryOperationStoreError::OperationInvalid)
    }
}

fn validate_state(state: &str) -> Result<String, ProjectRepositoryOperationStoreError> {
    let state = state.trim();

    if matches!(state, "succeeded" | "failed") {
        Ok(state.to_owned())
    } else {
        Err(ProjectRepositoryOperationStoreError::StateInvalid)
    }
}

fn invalid_read(
    error: ProjectRepositoryOperationStoreError,
) -> ProjectRepositoryOperationRecordsRead {
    ProjectRepositoryOperationRecordsRead {
        ok: false,
        records: None,
        error: Some(error),
    }
}

fn invalid_write(
    error: ProjectRepositoryOperationStoreError,
) -> ProjectRepositoryOperationRecordWrite {
    ProjectRepositoryOperationRecordWrite {
        ok: false,
        error: Some(error),
    }
}
