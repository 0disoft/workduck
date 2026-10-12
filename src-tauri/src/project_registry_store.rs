use std::collections::BTreeMap;

use rusqlite::{OptionalExtension, params, params_from_iter};
use tauri::AppHandle;

use crate::storage;

/* llmnav/1 module
id=workduck.projects.storage-native
role=Read and atomically replace SQLite project registry snapshots with optional stale-write guards.
owns=project registry SQLite reads|snapshot write guards|atomic bulk registry replacement
excludes=registry domain normalization|workspace sync payload assembly|editor draft ownership
search=project registry SQLite write|stale registry snapshot|atomic project bulk write
invariant=Guarded writes replace only the expected stored snapshot; workspace sync restores commit the workspace list and project snapshots together, and any conflict or invalid row rolls back the entire batch.
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

    write_project_registries(app, registries)
}

#[tauri::command]
pub fn write_project_registries(
    app: AppHandle,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
) -> ProjectRegistryWrite {
    let mut connection = match storage::app_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
    };
    write_project_registries_to_connection(&mut connection, registries)
}

fn write_project_registries_to_connection(
    connection: &mut rusqlite::Connection,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
) -> ProjectRegistryWrite {
    let transaction = match connection.transaction() {
        Ok(transaction) => transaction,
        Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
    };

    if let Err(error) = write_project_registries_in_transaction(&transaction, registries) {
        return invalid_write(error);
    }
    match transaction.commit() {
        Ok(()) => ProjectRegistryWrite {
            ok: true,
            error: None,
        },
        Err(_) => invalid_write(ProjectRegistryStoreError::WriteFailed),
    }
}

fn write_project_registries_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
) -> Result<(), ProjectRegistryStoreError> {
    for (workspace_id, registry) in registries {
        let workspace_id = match validate_workspace_id(&workspace_id) {
            Ok(workspace_id) => workspace_id,
            Err(error) => return Err(error),
        };
        let registry_json = match validate_registry_json(&registry.registry_json) {
            Ok(registry_json) => registry_json,
            Err(error) => return Err(error),
        };
        let updated_at = registry.updated_at.trim();

        if updated_at.is_empty() {
            return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
        }

        if let Some(expected) = registry.expected_registry_json.as_deref() {
            let expected = expected.trim();
            // JSON null denotes a missing row; stored registries must be objects.
            if expected != "null" && validate_registry_json(expected).is_err() {
                return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
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
                Err(_) => return Err(ProjectRegistryStoreError::WriteFailed),
            };
            let matches = match current.as_deref() {
                Some(current) => current.trim() == expected,
                None => expected == "null",
            };
            if !matches {
                return Err(ProjectRegistryStoreError::RevisionConflict);
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
            return Err(ProjectRegistryStoreError::WriteFailed);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn restore_workspace_sync(
    app: AppHandle,
    workspace_registry_json: String,
    expected_workspace_registry_json: String,
    updated_at: String,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
) -> ProjectRegistryWrite {
    let mut connection = match storage::app_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
    };
    match restore_workspace_sync_to_connection(
        &mut connection,
        &workspace_registry_json,
        &expected_workspace_registry_json,
        &updated_at,
        registries,
    ) {
        Ok(()) => ProjectRegistryWrite {
            ok: true,
            error: None,
        },
        Err(error) => invalid_write(error),
    }
}

fn restore_workspace_sync_to_connection(
    connection: &mut rusqlite::Connection,
    workspace_registry_json: &str,
    expected_workspace_registry_json: &str,
    updated_at: &str,
    registries: BTreeMap<String, ProjectRegistryWriteInput>,
) -> Result<(), ProjectRegistryStoreError> {
    let workspace_json = validate_registry_json(workspace_registry_json)?;
    if workspace_json.len() > 5 * 1024 * 1024 || updated_at.trim().is_empty() {
        return Err(ProjectRegistryStoreError::RegistryJsonInvalid);
    }
    let expected = expected_workspace_registry_json.trim();
    if expected != "null" {
        validate_registry_json(expected)?;
    }
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|_| ProjectRegistryStoreError::WriteFailed)?;
    let current: Option<String> = transaction
        .query_row(
            "SELECT value_json FROM app_state_records WHERE state_key = 'workspace-registry'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| ProjectRegistryStoreError::WriteFailed)?;
    if current.as_deref().map(str::trim).unwrap_or("null") != expected {
        return Err(ProjectRegistryStoreError::RevisionConflict);
    }
    // The workspace list is part of the same rollback boundary as every project row.
    transaction
        .execute(
            "INSERT INTO app_state_records (state_key, value_json, updated_at)
         VALUES ('workspace-registry', ?1, ?2)
         ON CONFLICT(state_key) DO UPDATE SET value_json=excluded.value_json,
         updated_at=excluded.updated_at, stored_at=CURRENT_TIMESTAMP",
            params![workspace_json, updated_at.trim()],
        )
        .map_err(|_| ProjectRegistryStoreError::WriteFailed)?;
    write_project_registries_in_transaction(&transaction, registries)?;
    transaction
        .commit()
        .map_err(|_| ProjectRegistryStoreError::WriteFailed)
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

    fn sync_connection() -> rusqlite::Connection {
        let connection = connection();
        connection
            .execute_batch(include_str!("../migrations/007_app_state_records.sql"))
            .unwrap();
        connection
            .execute(
                "INSERT INTO app_state_records(state_key,value_json,updated_at)
            VALUES('workspace-registry','{\"workspaces\":[]}','2026-10-12T00:00:00.000Z')",
                [],
            )
            .unwrap();
        connection
    }

    fn workspace_json(connection: &rusqlite::Connection) -> String {
        connection
            .query_row(
                "SELECT value_json FROM app_state_records WHERE state_key='workspace-registry'",
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn sync_restore_commits_both_tables_and_checks_the_workspace_revision() {
        let mut connection = sync_connection();
        let before = workspace_json(&connection);
        let imported = r#"{"workspaces":[{"id":"demo"}]}"#;
        assert!(
            restore_workspace_sync_to_connection(
                &mut connection,
                imported,
                &before,
                "2026-10-12T01:00:00.000Z",
                BTreeMap::from([("demo".to_owned(), input("{}", Some("null")))])
            )
            .is_ok()
        );
        assert_eq!(workspace_json(&connection), imported);
        assert_eq!(stored(&connection, "demo").as_deref(), Some("{}"));
        assert!(matches!(
            restore_workspace_sync_to_connection(
                &mut connection,
                &before,
                &before,
                "2026-10-12T02:00:00.000Z",
                BTreeMap::from([("demo".to_owned(), input(r#"{"new":true}"#, None))])
            ),
            Err(ProjectRegistryStoreError::RevisionConflict)
        ));
        assert_eq!(workspace_json(&connection), imported);
        assert_eq!(stored(&connection, "demo").as_deref(), Some("{}"));
    }

    #[test]
    fn sync_restore_rolls_back_workspace_and_earlier_projects_when_later_rows_fail() {
        for failure in ["conflict", "invalid", "storage"] {
            let mut connection = sync_connection();
            assert!(write(&mut connection, "first", "{}", None).ok);
            assert!(write(&mut connection, "last", "{}", None).ok);
            if failure == "storage" {
                connection.execute_batch("CREATE TRIGGER fail_last BEFORE UPDATE ON project_registries
                    WHEN NEW.workspace_id='last' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END;").unwrap();
            }
            let before = workspace_json(&connection);
            let last = match failure {
                "conflict" => input(r#"{"new":true}"#, Some(r#"{"stale":true}"#)),
                "invalid" => input("[]", None),
                _ => input(r#"{"new":true}"#, None),
            };
            assert!(
                restore_workspace_sync_to_connection(
                    &mut connection,
                    r#"{"workspaces":[{"id":"new"}]}"#,
                    &before,
                    "2026-10-12T01:00:00.000Z",
                    BTreeMap::from([
                        ("first".to_owned(), input(r#"{"new":true}"#, None)),
                        ("last".to_owned(), last),
                    ])
                )
                .is_err()
            );
            assert_eq!(workspace_json(&connection), before, "{failure}");
            assert_eq!(
                stored(&connection, "first").as_deref(),
                Some("{}"),
                "{failure}"
            );
            assert_eq!(
                stored(&connection, "last").as_deref(),
                Some("{}"),
                "{failure}"
            );
        }
    }
}
