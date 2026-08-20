use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, params, params_from_iter};
use tauri::AppHandle;

use crate::storage;

const APP_STATE_VALUE_MAX_BYTES: usize = 5 * 1024 * 1024;
const APP_STATE_KEYS: &[&str] = &[
    "appearance-settings",
    "sync-settings",
    "system-settings",
    "workspace-registry",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum AppStateStoreError {
    #[serde(rename = "app-state-key-invalid")]
    KeyInvalid,
    #[serde(rename = "app-state-json-invalid")]
    ValueJsonInvalid,
    #[serde(rename = "app-state-updated-at-required")]
    UpdatedAtRequired,
    #[serde(rename = "app-state-read-failed")]
    ReadFailed,
    #[serde(rename = "app-state-write-failed")]
    WriteFailed,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateWriteInput {
    value_json: String,
    updated_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateRecordsRead {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    records: Option<BTreeMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<AppStateStoreError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateRecordsWrite {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<AppStateStoreError>,
}

#[tauri::command]
pub fn read_app_state_records(app: AppHandle, keys: Vec<String>) -> AppStateRecordsRead {
    let keys = match validate_keys(keys) {
        Ok(keys) => keys,
        Err(error) => return invalid_read(error),
    };
    let connection = match storage::app_read_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_read(AppStateStoreError::ReadFailed),
    };

    match read_records_from_connection(&connection, &keys) {
        Ok(records) => AppStateRecordsRead {
            ok: true,
            records: Some(records),
            error: None,
        },
        Err(error) => invalid_read(error),
    }
}

#[tauri::command]
pub fn write_app_state_records(
    app: AppHandle,
    records: BTreeMap<String, AppStateWriteInput>,
) -> AppStateRecordsWrite {
    let mut connection = match storage::app_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return invalid_write(AppStateStoreError::WriteFailed),
    };

    match write_records_to_connection(&mut connection, records) {
        Ok(()) => AppStateRecordsWrite {
            ok: true,
            error: None,
        },
        Err(error) => invalid_write(error),
    }
}

fn read_records_from_connection(
    connection: &Connection,
    keys: &[String],
) -> Result<BTreeMap<String, String>, AppStateStoreError> {
    if keys.is_empty() {
        return Ok(BTreeMap::new());
    }

    let placeholders = std::iter::repeat("?")
        .take(keys.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT state_key, value_json
         FROM app_state_records
         WHERE state_key IN ({placeholders})"
    );
    let mut statement = connection
        .prepare(&query)
        .map_err(|_| AppStateStoreError::ReadFailed)?;
    let rows = statement
        .query_map(params_from_iter(keys.iter().map(String::as_str)), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| AppStateStoreError::ReadFailed)?;
    let mut records = BTreeMap::new();

    for row in rows {
        let (key, value_json) = row.map_err(|_| AppStateStoreError::ReadFailed)?;
        records.insert(key, value_json);
    }

    Ok(records)
}

fn write_records_to_connection(
    connection: &mut Connection,
    records: BTreeMap<String, AppStateWriteInput>,
) -> Result<(), AppStateStoreError> {
    let records = validate_records(records)?;
    let transaction = connection
        .transaction()
        .map_err(|_| AppStateStoreError::WriteFailed)?;

    for (key, record) in records {
        transaction
            .execute(
                "INSERT INTO app_state_records (
                  state_key,
                  value_json,
                  updated_at
                )
                VALUES (?1, ?2, ?3)
                ON CONFLICT(state_key) DO UPDATE SET
                  value_json = excluded.value_json,
                  updated_at = excluded.updated_at,
                  stored_at = CURRENT_TIMESTAMP",
                params![key, record.value_json, record.updated_at],
            )
            .map_err(|_| AppStateStoreError::WriteFailed)?;
    }

    transaction
        .commit()
        .map_err(|_| AppStateStoreError::WriteFailed)
}

fn validate_records(
    records: BTreeMap<String, AppStateWriteInput>,
) -> Result<BTreeMap<String, AppStateWriteInput>, AppStateStoreError> {
    records
        .into_iter()
        .map(|(key, record)| {
            let key = validate_key(&key)?;
            let value_json = validate_value_json(&record.value_json)?;
            let updated_at = record.updated_at.trim();

            if updated_at.is_empty() {
                return Err(AppStateStoreError::UpdatedAtRequired);
            }

            Ok((
                key,
                AppStateWriteInput {
                    value_json,
                    updated_at: updated_at.to_owned(),
                },
            ))
        })
        .collect()
}

fn validate_keys(keys: Vec<String>) -> Result<Vec<String>, AppStateStoreError> {
    let keys = keys
        .into_iter()
        .map(|key| validate_key(&key))
        .collect::<Result<BTreeSet<_>, _>>()?;

    Ok(keys.into_iter().collect())
}

fn validate_key(key: &str) -> Result<String, AppStateStoreError> {
    let key = key.trim();

    if !APP_STATE_KEYS.contains(&key) {
        return Err(AppStateStoreError::KeyInvalid);
    }

    Ok(key.to_owned())
}

fn validate_value_json(value_json: &str) -> Result<String, AppStateStoreError> {
    let value_json = value_json.trim();

    if value_json.len() > APP_STATE_VALUE_MAX_BYTES {
        return Err(AppStateStoreError::ValueJsonInvalid);
    }
    let value: serde_json::Value =
        serde_json::from_str(value_json).map_err(|_| AppStateStoreError::ValueJsonInvalid)?;

    if !value.is_object() {
        return Err(AppStateStoreError::ValueJsonInvalid);
    }

    Ok(value_json.to_owned())
}

fn invalid_read(error: AppStateStoreError) -> AppStateRecordsRead {
    AppStateRecordsRead {
        ok: false,
        records: None,
        error: Some(error),
    }
}

fn invalid_write(error: AppStateStoreError) -> AppStateRecordsWrite {
    AppStateRecordsWrite {
        ok: false,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory SQLite connection");
        connection
            .execute_batch(include_str!("../migrations/007_app_state_records.sql"))
            .expect("app state schema");
        connection
    }

    #[test]
    fn bulk_write_and_read_round_trip_is_atomic() {
        let mut connection = test_connection();
        let records = BTreeMap::from([
            (
                "appearance-settings".to_string(),
                AppStateWriteInput {
                    value_json: r#"{"languageId":"ko","fontSizePx":16}"#.to_string(),
                    updated_at: "2026-08-20T00:00:00.000Z".to_string(),
                },
            ),
            (
                "workspace-registry".to_string(),
                AppStateWriteInput {
                    value_json: r#"{"activeWorkspaceId":null,"workspaces":[]}"#.to_string(),
                    updated_at: "2026-08-20T00:00:00.000Z".to_string(),
                },
            ),
        ]);

        write_records_to_connection(&mut connection, records).expect("app state write");
        let result = read_records_from_connection(
            &connection,
            &[
                "workspace-registry".to_string(),
                "appearance-settings".to_string(),
            ],
        )
        .expect("app state read");

        assert_eq!(result.len(), 2);
        assert_eq!(
            result.get("appearance-settings").map(String::as_str),
            Some(r#"{"languageId":"ko","fontSizePx":16}"#)
        );
    }

    #[test]
    fn invalid_record_rolls_back_the_complete_batch() {
        let mut connection = test_connection();
        let records = BTreeMap::from([
            (
                "appearance-settings".to_string(),
                AppStateWriteInput {
                    value_json: r#"{"languageId":"ko","fontSizePx":16}"#.to_string(),
                    updated_at: "2026-08-20T00:00:00.000Z".to_string(),
                },
            ),
            (
                "unknown-state".to_string(),
                AppStateWriteInput {
                    value_json: "{}".to_string(),
                    updated_at: "2026-08-20T00:00:00.000Z".to_string(),
                },
            ),
        ]);

        assert_eq!(
            write_records_to_connection(&mut connection, records),
            Err(AppStateStoreError::KeyInvalid)
        );
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM app_state_records", [], |row| row.get(0))
            .expect("app state count");

        assert_eq!(count, 0);
    }

    #[test]
    fn arrays_and_scalar_json_are_rejected() {
        assert_eq!(
            validate_value_json("[]"),
            Err(AppStateStoreError::ValueJsonInvalid)
        );
        assert_eq!(
            validate_value_json("true"),
            Err(AppStateStoreError::ValueJsonInvalid)
        );
    }
}
