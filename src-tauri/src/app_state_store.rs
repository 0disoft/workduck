use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, params, params_from_iter};
use tauri::{AppHandle, Emitter};

use crate::storage;

pub(crate) const APP_STATE_COMMITTED_EVENT: &str = "workduck:app-state-committed";

/* llmnav/1 module
id=workduck.app-state.storage-native
role=Read and transactionally persist allowed application settings in SQLite with bounded JSON and ordered UTC revisions.
owns=app state SQLite transactions|setting key allowlist|JSON size validation|UTC revision ordering|committed setting key notifications
excludes=renderer crash journal|setting domain normalization|sync payload assembly
search=app state SQLite transaction|setting JSON size limit|UTC setting revision|native setting commit notification
invariant=Only allowed keys and bounded JSON objects are stored; invalid rows roll back the batch; older revisions retain and return the newer value; only committed changed keys notify renderers.
stability=contract
*/

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
    superseded_records: Option<BTreeMap<String, String>>,
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

    match write_records_with_notification(&mut connection, records, |keys| {
        let _ = app.emit(APP_STATE_COMMITTED_EVENT, keys);
    }) {
        Ok(superseded_records) => AppStateRecordsWrite {
            ok: true,
            superseded_records: (!superseded_records.is_empty()).then_some(superseded_records),
            error: None,
        },
        Err(error) => invalid_write(error),
    }
}

fn write_records_with_notification(
    connection: &mut Connection,
    records: BTreeMap<String, AppStateWriteInput>,
    notify: impl FnOnce(Vec<String>),
) -> Result<BTreeMap<String, String>, AppStateStoreError> {
    let keys: BTreeSet<String> = records.keys().map(|key| key.trim().to_owned()).collect();
    let superseded = write_records_to_connection(connection, records)?;
    let changed: Vec<String> = keys
        .into_iter()
        .filter(|key| !superseded.contains_key(key))
        .collect();
    if !changed.is_empty() {
        notify(changed);
    }
    Ok(superseded)
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
) -> Result<BTreeMap<String, String>, AppStateStoreError> {
    let records = validate_records(records)?;
    let transaction = connection
        .transaction()
        .map_err(|_| AppStateStoreError::WriteFailed)?;

    let mut superseded_records = BTreeMap::new();
    for (key, record) in records {
        let written = transaction
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
                  stored_at = CURRENT_TIMESTAMP
                WHERE excluded.updated_at >= app_state_records.updated_at",
                params![key, record.value_json, record.updated_at],
            )
            .map_err(|_| AppStateStoreError::WriteFailed)?;
        if written == 0 {
            let value_json: String = transaction
                .query_row(
                    "SELECT value_json FROM app_state_records WHERE state_key = ?1",
                    [&key],
                    |row| row.get(0),
                )
                .map_err(|_| AppStateStoreError::WriteFailed)?;
            // Return the authoritative value from this same transaction; callers
            // cannot treat an ignored timestamp as persistence of their payload.
            validate_value_json(&value_json)?;
            superseded_records.insert(key, value_json);
        }
    }

    transaction
        .commit()
        .map_err(|_| AppStateStoreError::WriteFailed)?;
    Ok(superseded_records)
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

            if !is_sortable_utc_timestamp(updated_at) {
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

pub(crate) fn is_sortable_utc_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();

    bytes.len() == 24
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'.'
        && bytes[23] == b'Z'
        && bytes.iter().enumerate().all(|(index, byte)| {
            matches!(index, 4 | 7 | 10 | 13 | 16 | 19 | 23) || byte.is_ascii_digit()
        })
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

pub(crate) fn validate_value_json(value_json: &str) -> Result<String, AppStateStoreError> {
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
        superseded_records: None,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notification_record(timestamp: &str) -> AppStateWriteInput {
        AppStateWriteInput {
            value_json: r#"{"value":1}"#.into(),
            updated_at: timestamp.into(),
        }
    }

    #[test]
    fn notifies_only_committed_keys_and_keeps_superseded_writes_silent() {
        let uri = format!(
            "file:workduck-state-notify-{}?mode=memory&cache=shared",
            std::process::id()
        );
        let flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
            | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
            | rusqlite::OpenFlags::SQLITE_OPEN_URI;
        let mut connection = Connection::open_with_flags(&uri, flags).unwrap();
        let observer = Connection::open_with_flags(&uri, flags).unwrap();
        connection
            .execute_batch(include_str!("../migrations/007_app_state_records.sql"))
            .unwrap();
        let old = "2026-10-10T00:00:00.000Z";
        let new = "2026-10-10T00:00:01.000Z";
        write_records_to_connection(
            &mut connection,
            BTreeMap::from([("appearance-settings".into(), notification_record(new))]),
        )
        .unwrap();
        let mut notified = false;
        let result = write_records_with_notification(
            &mut connection,
            BTreeMap::from([
                ("appearance-settings".into(), notification_record(old)),
                ("system-settings".into(), notification_record(new)),
            ]),
            |keys| {
                assert_eq!(keys, ["system-settings"]);
                assert_eq!(
                    read_records_from_connection(&observer, &keys)
                        .unwrap()
                        .get("system-settings")
                        .map(String::as_str),
                    Some(r#"{"value":1}"#)
                );
                notified = true;
            },
        )
        .unwrap();
        assert!(notified);
        assert!(result.contains_key("appearance-settings"));
        for records in [
            BTreeMap::new(),
            BTreeMap::from([("system-settings".into(), notification_record(old))]),
        ] {
            assert!(
                write_records_with_notification(&mut connection, records, |_| panic!(
                    "no changed records"
                ))
                .is_ok()
            );
        }
    }

    #[test]
    fn failed_state_transactions_never_publish_commit_notifications() {
        for failure in ["validation", "statement", "commit"] {
            let mut connection = test_connection();
            if failure == "statement" {
                connection.execute_batch("CREATE TRIGGER reject_state BEFORE INSERT ON app_state_records WHEN NEW.state_key = 'system-settings' BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
            }
            if failure == "commit" {
                connection.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE parent (id INTEGER PRIMARY KEY);
                    CREATE TABLE child (id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED);
                    CREATE TRIGGER deferred_state_failure AFTER INSERT ON app_state_records WHEN NEW.state_key = 'system-settings' BEGIN INSERT INTO child VALUES (1); END;").unwrap();
            }
            let mut last = notification_record("2026-10-10T00:00:00.000Z");
            if failure == "validation" {
                last.value_json = "[".into();
            }
            let mut notified = false;
            let result = write_records_with_notification(
                &mut connection,
                BTreeMap::from([
                    (
                        "appearance-settings".into(),
                        notification_record("2026-10-10T00:00:00.000Z"),
                    ),
                    ("system-settings".into(), last),
                ]),
                |_| {
                    notified = true;
                },
            );
            assert!(result.is_err(), "{failure}");
            assert!(!notified, "{failure}");
            assert!(
                read_records_from_connection(
                    &connection,
                    &["appearance-settings".into(), "system-settings".into()]
                )
                .unwrap()
                .is_empty()
            );
        }
    }

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
            .query_row("SELECT COUNT(*) FROM app_state_records", [], |row| {
                row.get(0)
            })
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

    #[test]
    fn older_timestamp_cannot_overwrite_a_newer_record() {
        let mut connection = test_connection();

        let superseded = write_records_to_connection(
            &mut connection,
            BTreeMap::from([(
                "appearance-settings".to_string(),
                AppStateWriteInput {
                    value_json: r#"{"languageId":"ko"}"#.to_string(),
                    updated_at: "2026-08-20T00:00:01.000Z".to_string(),
                },
            )]),
        )
        .expect("newer app state write");
        assert!(superseded.is_empty());
        let superseded = write_records_to_connection(
            &mut connection,
            BTreeMap::from([(
                "appearance-settings".to_string(),
                AppStateWriteInput {
                    value_json: r#"{"languageId":"en"}"#.to_string(),
                    updated_at: "2026-08-20T00:00:00.000Z".to_string(),
                },
            )]),
        )
        .expect("stale app state write is ignored");
        assert_eq!(
            superseded.get("appearance-settings").map(String::as_str),
            Some(r#"{"languageId":"ko"}"#)
        );

        let records =
            read_records_from_connection(&connection, &["appearance-settings".to_string()])
                .expect("app state read");

        assert_eq!(
            records.get("appearance-settings").map(String::as_str),
            Some(r#"{"languageId":"ko"}"#)
        );
    }

    #[test]
    fn mixed_batch_returns_only_superseded_values_after_commit() {
        let mut connection = test_connection();
        let input = |value: &str, time: &str| AppStateWriteInput {
            value_json: value.into(),
            updated_at: time.into(),
        };
        write_records_to_connection(
            &mut connection,
            BTreeMap::from([(
                "system-settings".into(),
                input(r#"{"value":"durable"}"#, "2026-10-10T00:00:01.000Z"),
            )]),
        )
        .unwrap();
        let superseded = write_records_to_connection(
            &mut connection,
            BTreeMap::from([
                (
                    "appearance-settings".into(),
                    input("{}", "2026-10-10T00:00:00.000Z"),
                ),
                (
                    "system-settings".into(),
                    input(r#"{"value":"older"}"#, "2026-10-10T00:00:00.000Z"),
                ),
            ]),
        )
        .unwrap();
        assert_eq!(
            superseded,
            BTreeMap::from([("system-settings".into(), r#"{"value":"durable"}"#.into())])
        );
        let response = serde_json::to_value(AppStateRecordsWrite {
            ok: true,
            superseded_records: Some(superseded),
            error: None,
        })
        .unwrap();
        assert_eq!(
            response["supersededRecords"]["system-settings"],
            r#"{"value":"durable"}"#
        );
        assert_eq!(
            read_records_from_connection(&connection, &["appearance-settings".into()]).unwrap()["appearance-settings"],
            "{}"
        );
    }

    #[test]
    fn later_database_failure_rolls_back_earlier_writes() {
        let mut connection = test_connection();
        connection.execute_batch("CREATE TRIGGER reject_setting BEFORE INSERT ON app_state_records WHEN NEW.state_key = 'system-settings' BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
        let records = ["appearance-settings", "system-settings"]
            .into_iter()
            .map(|key| {
                (
                    key.into(),
                    AppStateWriteInput {
                        value_json: "{}".into(),
                        updated_at: "2026-10-10T00:00:00.000Z".into(),
                    },
                )
            })
            .collect();
        assert_eq!(
            write_records_to_connection(&mut connection, records),
            Err(AppStateStoreError::WriteFailed)
        );
        assert!(
            read_records_from_connection(&connection, &["appearance-settings".into()])
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn timestamp_must_keep_the_sortable_utc_shape() {
        assert!(is_sortable_utc_timestamp("2026-08-20T00:00:00.000Z"));
        assert!(!is_sortable_utc_timestamp("2026-08-20T00:00:00Z"));
        assert!(!is_sortable_utc_timestamp("not-a-timestamp"));
    }
}
