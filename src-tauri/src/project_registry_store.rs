use std::collections::BTreeMap;

use rusqlite::{OptionalExtension, params, params_from_iter};
use tauri::AppHandle;

use crate::storage;

/* llmnav/1 module
id=workduck.projects.storage-native
role=Read and atomically replace SQLite project registries with optional snapshot guards and a workspace sync checkpoint.
owns=project registry SQLite reads|snapshot write guards|atomic registry and workspace replacement
excludes=registry domain normalization|workspace sync payload assembly|editor draft ownership
search=project registry SQLite write|stale registry snapshot|atomic project bulk write
invariant=Guarded writes require the expected snapshot; sync checkpoints also preserve UTC ordering, and a conflict or failed row rolls back workspace and project changes together.
stability=contract
*/

#[derive(serde::Serialize)]
pub enum ProjectRegistryStoreError {
    #[serde(rename = "project-registry-workspace-id-required")]
    WorkspaceIdRequired,
    #[serde(rename = "project-registry-json-invalid")]
    RegistryJsonInvalid,
    #[serde(rename = "project-registry-read-failed")]
    ReadFailed,
    #[serde(rename = "project-registry-write-failed")]
    WriteFailed,
    #[serde(rename = "project-registry-revision-conflict")]
    RevisionConflict,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRegistryWriteInput {
    registry_json: String,
    updated_at: String,
    #[serde(default)]
    expected_registry_json: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRegistryWriteInput {
    value_json: String,
    expected_value_json: String,
    updated_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRegistryRead {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    registry_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRegistryStoreError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRegistriesRead {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    registries: Option<BTreeMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRegistryStoreError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRegistryWrite {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ProjectRegistryStoreError>,
}

#[tauri::command]
pub fn read_project_registry(app: AppHandle, workspace_id: String) -> ProjectRegistryRead {
    let workspace_id = match validate_workspace_id(&workspace_id) {
        Ok(workspace_id) => workspace_id,
        Err(error) => return invalid_read(error),
    };
    let connection = match storage::app_read_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_read(ProjectRegistryStoreError::ReadFailed),
    };

    match connection
        .query_row(
            "SELECT registry_json FROM project_registries WHERE workspace_id = ?1",
            [workspace_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
    {
        Ok(registry_json) => ProjectRegistryRead {
            ok: true,
            registry_json,
            error: None,
        },
        Err(_) => invalid_read(ProjectRegistryStoreError::ReadFailed),
    }
}

#[tauri::command]
pub fn read_project_registries(
    app: AppHandle,
    workspace_ids: Vec<String>,
) -> ProjectRegistriesRead {
    let workspace_ids = match validate_workspace_ids(workspace_ids) {
        Ok(workspace_ids) => workspace_ids,
        Err(error) => return invalid_read_many(error),
    };
    let connection = match storage::app_read_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_read_many(ProjectRegistryStoreError::ReadFailed),
    };
    if workspace_ids.is_empty() {
        return ProjectRegistriesRead {
            ok: true,
            registries: Some(BTreeMap::new()),
            error: None,
        };
    }

    let placeholders = std::iter::repeat("?")
        .take(workspace_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT workspace_id, registry_json
         FROM project_registries
         WHERE workspace_id IN ({placeholders})"
    );
    let mut statement = match connection.prepare(&query) {
        Ok(statement) => statement,
        Err(_) => return invalid_read_many(ProjectRegistryStoreError::ReadFailed),
    };
    let rows = match statement.query_map(
        params_from_iter(workspace_ids.iter().map(String::as_str)),
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ) {
        Ok(rows) => rows,
        Err(_) => return invalid_read_many(ProjectRegistryStoreError::ReadFailed),
    };
    let mut registries = BTreeMap::new();

    for row in rows {
        let (workspace_id, registry_json) = match row {
            Ok(row) => row,
            Err(_) => return invalid_read_many(ProjectRegistryStoreError::ReadFailed),
        };

        registries.insert(workspace_id, registry_json);
    }

    ProjectRegistriesRead {
        ok: true,
        registries: Some(registries),
        error: None,
    }
}

#[tauri::command]
pub fn write_project_registry(
    app: AppHandle,
    workspace_id: String,
    registry_json: String,
    updated_at: String,
    expected_registry_json: Option<String>,
) -> ProjectRegistryWrite {
    let registries = BTreeMap::from([(
        workspace_id,
        ProjectRegistryWriteInput {
            registry_json,
            updated_at,
            expected_registry_json,
        },
    )]);

    write_project_registries(app, registries, None)
}

#[tauri::command]
pub fn write_project_registries(
    app: AppHandle,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
    workspace_registry: Option<WorkspaceRegistryWriteInput>,
) -> ProjectRegistryWrite {
    let mut connection = match storage::app_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
    };
    write_project_registries_to_connection(&mut connection, registries, workspace_registry)
}

fn write_project_registries_to_connection(
    connection: &mut rusqlite::Connection,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
    workspace_registry: Option<WorkspaceRegistryWriteInput>,
) -> ProjectRegistryWrite {
    let behavior = if workspace_registry.is_some() {
        rusqlite::TransactionBehavior::Immediate
    } else {
        rusqlite::TransactionBehavior::Deferred
    };
    let transaction = match connection.transaction_with_behavior(behavior) {
        Ok(transaction) => transaction,
        Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
    };
    if let Some(workspace_registry) = workspace_registry {
        if let Err(error) = write_sync_workspace_registry(&transaction, workspace_registry) {
            return invalid_write(error);
        }
    }

    for (workspace_id, registry) in registries {
        let workspace_id = match validate_workspace_id(&workspace_id) {
            Ok(workspace_id) => workspace_id,
            Err(error) => return invalid_write(error),
        };
        let registry_json = match validate_registry_json(&registry.registry_json) {
            Ok(registry_json) => registry_json,
            Err(error) => return invalid_write(error),
        };
        let updated_at = registry.updated_at.trim();

        if updated_at.is_empty() {
            return invalid_write(ProjectRegistryStoreError::RegistryJsonInvalid);
        }

        if let Some(expected) = registry.expected_registry_json.as_deref() {
            let expected = expected.trim();
            // JSON null denotes a missing row; stored registries must be objects.
            if expected != "null" && validate_registry_json(expected).is_err() {
                return invalid_write(ProjectRegistryStoreError::RegistryJsonInvalid);
            }
            let current = match transaction
                .query_row(
                    "SELECT registry_json FROM project_registries WHERE workspace_id = ?1",
                    [&workspace_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
            {
                Ok(current) => current,
                Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
            };
            let matches = match current.as_deref() {
                Some(current) => current.trim() == expected,
                None => expected == "null",
            };
            if !matches {
                return invalid_write(ProjectRegistryStoreError::RevisionConflict);
            }
        }

        if transaction
            .execute(
                "INSERT INTO project_registries (
                  workspace_id,
                  registry_json,
                  updated_at
                )
                VALUES (?1, ?2, ?3)
                ON CONFLICT(workspace_id) DO UPDATE SET
                  registry_json = excluded.registry_json,
                  updated_at = excluded.updated_at,
                  stored_at = CURRENT_TIMESTAMP",
                params![workspace_id, registry_json, updated_at],
            )
            .is_err()
        {
            return invalid_write(ProjectRegistryStoreError::WriteFailed);
        }
    }

    match transaction.commit() {
        Ok(()) => ProjectRegistryWrite {
            ok: true,
            error: None,
        },
        Err(_) => invalid_write(ProjectRegistryStoreError::WriteFailed),
    }
}

fn write_sync_workspace_registry(
    transaction: &rusqlite::Transaction<'_>,
    input: WorkspaceRegistryWriteInput,
) -> Result<(), ProjectRegistryStoreError> {
    use crate::app_state_store::{is_sortable_utc_timestamp, validate_value_json};

    let value_json = validate_value_json(&input.value_json)
        .map_err(|_| ProjectRegistryStoreError::RegistryJsonInvalid)?;
    let value: serde_json::Value = serde_json::from_str(&value_json)
        .map_err(|_| ProjectRegistryStoreError::RegistryJsonInvalid)?;
    if !value
        .get("workspaces")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
    }
    let expected = input.expected_value_json.trim();
    if expected != "null" && validate_value_json(expected).is_err() {
        return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
    }
    let updated_at = input.updated_at.trim();
    if !is_sortable_utc_timestamp(updated_at) {
        return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
    }
    let current: Option<(String, String)> = transaction.query_row(
        "SELECT value_json, updated_at FROM app_state_records WHERE state_key = 'workspace-registry'",
        [], |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(|_| ProjectRegistryStoreError::WriteFailed)?;
    let matches = match current.as_ref() {
        Some((json, timestamp)) => json.trim() == expected && timestamp.as_str() <= updated_at,
        None => expected == "null",
    };
    if !matches {
        return Err(ProjectRegistryStoreError::RevisionConflict);
    }
    transaction
        .execute(
            "INSERT INTO app_state_records (state_key, value_json, updated_at)
         VALUES ('workspace-registry', ?1, ?2)
         ON CONFLICT(state_key) DO UPDATE SET value_json = excluded.value_json,
           updated_at = excluded.updated_at, stored_at = CURRENT_TIMESTAMP",
            params![value_json, updated_at],
        )
        .map_err(|_| ProjectRegistryStoreError::WriteFailed)?;
    Ok(())
}

fn validate_workspace_ids(
    workspace_ids: Vec<String>,
) -> Result<Vec<String>, ProjectRegistryStoreError> {
    let mut result = Vec::new();

    for workspace_id in workspace_ids {
        let workspace_id = validate_workspace_id(&workspace_id)?;

        if !result.contains(&workspace_id) {
            result.push(workspace_id);
        }
    }

    Ok(result)
}

fn validate_workspace_id(workspace_id: &str) -> Result<String, ProjectRegistryStoreError> {
    let workspace_id = workspace_id.trim();

    if workspace_id.is_empty() {
        return Err(ProjectRegistryStoreError::WorkspaceIdRequired);
    }

    Ok(workspace_id.to_owned())
}

fn validate_registry_json(registry_json: &str) -> Result<String, ProjectRegistryStoreError> {
    let registry_json = registry_json.trim();

    if registry_json.is_empty() {
        return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
    }

    let value: serde_json::Value = serde_json::from_str(registry_json)
        .map_err(|_| ProjectRegistryStoreError::RegistryJsonInvalid)?;

    if !value.is_object() {
        return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
    }

    Ok(registry_json.to_owned())
}

fn invalid_read(error: ProjectRegistryStoreError) -> ProjectRegistryRead {
    ProjectRegistryRead {
        ok: false,
        registry_json: None,
        error: Some(error),
    }
}

fn invalid_read_many(error: ProjectRegistryStoreError) -> ProjectRegistriesRead {
    ProjectRegistriesRead {
        ok: false,
        registries: None,
        error: Some(error),
    }
}

fn invalid_write(error: ProjectRegistryStoreError) -> ProjectRegistryWrite {
    ProjectRegistryWrite {
        ok: false,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sync_input(expected: &str) -> WorkspaceRegistryWriteInput {
        WorkspaceRegistryWriteInput {
            value_json: r#"{"workspaces":[{"id":"new"}]}"#.into(),
            expected_value_json: expected.into(),
            updated_at: "2026-10-10T00:00:00.000Z".into(),
        }
    }

    fn workspace_value(connection: &rusqlite::Connection) -> String {
        connection
            .query_row(
                "SELECT value_json FROM app_state_records WHERE state_key = 'workspace-registry'",
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn sync_import_commits_workspace_and_projects_together() {
        let mut connection = connection();
        connection
            .execute_batch(include_str!("../migrations/007_app_state_records.sql"))
            .unwrap();
        let result = write_project_registries_to_connection(
            &mut connection,
            BTreeMap::from([("new".into(), input(r#"{"value":2}"#, None))]),
            Some(sync_input("null")),
        );
        assert!(result.ok);
        assert_eq!(
            workspace_value(&connection),
            r#"{"workspaces":[{"id":"new"}]}"#
        );
        assert_eq!(
            stored(&connection, "new").as_deref(),
            Some(r#"{"value":2}"#)
        );
    }

    #[test]
    fn sync_import_rolls_back_workspace_and_prior_projects_when_a_later_write_fails() {
        for database_error in [false, true] {
            let mut connection = connection();
            connection
                .execute_batch(include_str!("../migrations/007_app_state_records.sql"))
                .unwrap();
            connection.execute(
                "INSERT INTO app_state_records (state_key, value_json, updated_at) VALUES ('workspace-registry', ?1, ?2)",
                params![r#"{"workspaces":[]}"#, "2026-10-09T00:00:00.000Z"],
            ).unwrap();
            assert!(write(&mut connection, "a", r#"{"value":1}"#, None).ok);
            if database_error {
                connection.execute_batch("CREATE TRIGGER reject_sync_project BEFORE INSERT ON project_registries WHEN NEW.workspace_id = 'z' BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
            }
            let result = write_project_registries_to_connection(
                &mut connection,
                BTreeMap::from([
                    ("a".into(), input(r#"{"value":2}"#, None)),
                    (
                        "z".into(),
                        input(if database_error { "{}" } else { "[" }, None),
                    ),
                ]),
                Some(sync_input(r#"{"workspaces":[]}"#)),
            );
            assert!(!result.ok);
            assert_eq!(workspace_value(&connection), r#"{"workspaces":[]}"#);
            assert_eq!(stored(&connection, "a").as_deref(), Some(r#"{"value":1}"#));
            assert!(stored(&connection, "z").is_none());
        }
    }

    #[test]
    fn sync_import_rejects_stale_workspace_snapshots_and_older_timestamps() {
        for (expected, timestamp) in [
            ("null", "2026-10-09T00:00:00.000Z"),
            (r#"{"workspaces":[]}"#, "2026-10-11T00:00:00.000Z"),
        ] {
            let mut connection = connection();
            connection
                .execute_batch(include_str!("../migrations/007_app_state_records.sql"))
                .unwrap();
            connection.execute(
                "INSERT INTO app_state_records (state_key, value_json, updated_at) VALUES ('workspace-registry', ?1, ?2)",
                params![r#"{"workspaces":[]}"#, timestamp],
            ).unwrap();
            let result = write_project_registries_to_connection(
                &mut connection,
                BTreeMap::from([("new".into(), input("{}", None))]),
                Some(sync_input(expected)),
            );
            assert!(matches!(
                result.error,
                Some(ProjectRegistryStoreError::RevisionConflict)
            ));
            assert_eq!(workspace_value(&connection), r#"{"workspaces":[]}"#);
            assert!(stored(&connection, "new").is_none());
        }
    }

    fn connection() -> rusqlite::Connection {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection
            .execute_batch(include_str!("../migrations/004_project_registries.sql"))
            .unwrap();
        connection
    }

    fn input(json: &str, expected: Option<&str>) -> ProjectRegistryWriteInput {
        ProjectRegistryWriteInput {
            registry_json: json.to_owned(),
            updated_at: "2026-10-04T00:00:00.000Z".to_owned(),
            expected_registry_json: expected.map(str::to_owned),
        }
    }

    fn write(
        connection: &mut rusqlite::Connection,
        id: &str,
        json: &str,
        expected: Option<&str>,
    ) -> ProjectRegistryWrite {
        write_project_registries_to_connection(
            connection,
            BTreeMap::from([(id.to_owned(), input(json, expected))]),
            None,
        )
    }

    fn stored(connection: &rusqlite::Connection, id: &str) -> Option<String> {
        connection
            .query_row(
                "SELECT registry_json FROM project_registries WHERE workspace_id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()
            .unwrap()
    }

    #[test]
    fn guarded_write_replaces_only_the_expected_snapshot() {
        let mut connection = connection();
        assert!(write(&mut connection, "demo", r#"{"value":1}"#, None).ok);
        assert!(
            write(
                &mut connection,
                "demo",
                r#"{"value":2}"#,
                Some(r#"{"value":1}"#)
            )
            .ok
        );
        let rejected = write(
            &mut connection,
            "demo",
            r#"{"value":3}"#,
            Some(r#"{"value":1}"#),
        );
        assert!(!rejected.ok);
        assert!(matches!(
            rejected.error,
            Some(ProjectRegistryStoreError::RevisionConflict)
        ));
        assert_eq!(
            stored(&connection, "demo").as_deref(),
            Some(r#"{"value":2}"#)
        );
    }

    #[test]
    fn null_snapshot_guards_creation_against_an_existing_row() {
        let mut connection = connection();
        assert!(write(&mut connection, "demo", r#"{"value":1}"#, Some("null")).ok);
        assert!(!write(&mut connection, "demo", r#"{"value":2}"#, Some("null")).ok);
        assert_eq!(
            stored(&connection, "demo").as_deref(),
            Some(r#"{"value":1}"#)
        );
    }

    #[test]
    fn a_later_conflict_rolls_back_earlier_rows_in_the_batch() {
        let mut connection = connection();
        assert!(write(&mut connection, "first", r#"{"value":1}"#, None).ok);
        assert!(write(&mut connection, "last", r#"{"value":2}"#, None).ok);
        let result = write_project_registries_to_connection(
            &mut connection,
            BTreeMap::from([
                (
                    "first".to_owned(),
                    input(r#"{"value":3}"#, Some(r#"{"value":1}"#)),
                ),
                (
                    "last".to_owned(),
                    input(r#"{"value":4}"#, Some(r#"{"value":1}"#)),
                ),
            ]),
            None,
        );
        assert!(!result.ok);
        assert_eq!(
            stored(&connection, "first").as_deref(),
            Some(r#"{"value":1}"#)
        );
        assert_eq!(
            stored(&connection, "last").as_deref(),
            Some(r#"{"value":2}"#)
        );
    }

    #[test]
    fn unconditional_write_inputs_remain_backward_compatible() {
        let value: ProjectRegistryWriteInput =
            serde_json::from_str(r#"{"registryJson":"{}","updatedAt":"now"}"#).unwrap();
        assert!(value.expected_registry_json.is_none());
        let mut connection = connection();
        assert!(write(&mut connection, "demo", r#"{"value":1}"#, None).ok);
        assert!(write(&mut connection, "demo", r#"{"value":2}"#, None).ok);
    }
}
