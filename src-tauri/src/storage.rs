use std::{
    fmt, fs,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
    time::Duration,
};

use crate::path_display::display_path;

use rusqlite::{Connection, OptionalExtension, params};
use tauri::{AppHandle, Manager, State};

const DATABASE_DRIVER: &str = "sqlite";
const DATABASE_FILE_NAME: &str = "workduck.sqlite3";
const SQLITE_BUSY_TIMEOUT_MILLIS: u64 = 5_000;
pub(crate) const CURRENT_SCHEMA_VERSION: i64 = 7;

struct Migration {
    version: i64,
    name: &'static str,
    checksum: &'static str,
    sql: &'static str,
}

pub(crate) struct AppStorageState {
    database_path: PathBuf,
    writer_connection: Mutex<Connection>,
    read_connections: Arc<Mutex<Vec<Connection>>>,
}

pub(crate) struct AppReadConnection {
    connection: Option<Connection>,
    read_connections: Arc<Mutex<Vec<Connection>>>,
}

impl std::ops::Deref for AppReadConnection {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        self.connection
            .as_ref()
            .expect("pooled read connection must exist until drop")
    }
}

impl Drop for AppReadConnection {
    fn drop(&mut self) {
        let Some(connection) = self.connection.take() else {
            return;
        };

        if let Ok(mut read_connections) = self.read_connections.lock() {
            read_connections.push(connection);
        }
    }
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "001_bootstrap",
        checksum: "sha256:57d00d3fcf4ee3881a843af9ccbc951345207757a051a3c31163548383bcf2b3",
        sql: include_str!("../migrations/001_bootstrap.sql"),
    },
    Migration {
        version: 2,
        name: "002_artifact_blobs",
        checksum: "sha256:bc2123460f496120770686c32bb28cbaae1038e5f179e56f1dfc1cc5a306db93",
        sql: include_str!("../migrations/002_artifact_blobs.sql"),
    },
    Migration {
        version: 3,
        name: "003_artifact_blob_search",
        checksum: "sha256:b1ebed43d0699dbc6c89a6f556c1119163de2797987c645bc0318b6f8f1f2ca1",
        sql: include_str!("../migrations/003_artifact_blob_search.sql"),
    },
    Migration {
        version: 4,
        name: "004_project_registries",
        checksum: "sha256:c8e4a20810854e4346391bc0293ea625b9f0b8ad0399a5afaa69eb8630fccdae",
        sql: include_str!("../migrations/004_project_registries.sql"),
    },
    Migration {
        version: 5,
        name: "005_project_repository_operation_records",
        checksum: "sha256:5520fa1eac7cd4babb8eb593ede697b69b41c8a1f8a2fda2c604c61619b37018",
        sql: include_str!("../migrations/005_project_repository_operation_records.sql"),
    },
    Migration {
        version: 6,
        name: "006_project_repository_import_attempt_records",
        checksum: "sha256:c75f5c9a500ffee7ea54363ea347cb2c594f719a3a4860283713d0a5e0774ebb",
        sql: include_str!("../migrations/006_project_repository_import_attempt_records.sql"),
    },
    Migration {
        version: 7,
        name: "007_app_state_records",
        checksum: "sha256:291b0b66a6ab5eac0924cb3842565047265469b411b12b1f94c5037aaebe714c",
        sql: include_str!("../migrations/007_app_state_records.sql"),
    },
];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    driver: &'static str,
    database_file_name: &'static str,
    database_path: String,
    journal_mode: String,
    foreign_keys: bool,
    json_available: bool,
    fts5_available: bool,
    schema_version: i64,
    applied_migration_count: i64,
    latest_migration: Option<String>,
    artifact_blob_count: i64,
    artifact_search_indexed_row_count: i64,
    app_state_record_count: i64,
    project_registry_count: i64,
    project_repository_operation_record_count: i64,
    project_repository_import_attempt_record_count: i64,
}

#[derive(Debug)]
pub enum StorageError {
    ResolveAppLocalDataDir(String),
    CreateAppLocalDataDir {
        path: PathBuf,
        source: std::io::Error,
    },
    Sqlite {
        operation: &'static str,
        source: rusqlite::Error,
    },
    MigrationChecksumChanged {
        version: i64,
        name: &'static str,
        expected_checksum: &'static str,
        applied_checksum: String,
    },
    IncompatibleSchemaVersion {
        database_version: i64,
        current_version: i64,
    },
    AppStorageNotInitialized,
    AppStorageLockPoisoned,
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ResolveAppLocalDataDir(source) => {
                write!(
                    formatter,
                    "failed to resolve app local data directory: {source}"
                )
            }
            Self::CreateAppLocalDataDir { path, source } => write!(
                formatter,
                "failed to create app local data directory '{}': {source}",
                display_path(path)
            ),
            Self::Sqlite { operation, source } => {
                write!(formatter, "SQLite {operation} failed: {source}")
            }
            Self::MigrationChecksumChanged {
                version,
                name,
                expected_checksum,
                applied_checksum,
            } => write!(
                formatter,
                "migration {version} ({name}) checksum changed: expected {expected_checksum}, found {applied_checksum}"
            ),
            Self::IncompatibleSchemaVersion {
                database_version,
                current_version,
            } => write!(
                formatter,
                "database schema version {database_version} is newer than supported version {current_version}"
            ),
            Self::AppStorageNotInitialized => write!(formatter, "app storage is not initialized"),
            Self::AppStorageLockPoisoned => write!(formatter, "app storage connection lock failed"),
        }
    }
}

impl std::error::Error for StorageError {}

pub(crate) fn initialize_app_storage(app: &AppHandle) -> Result<AppStorageState, StorageError> {
    let database_path = resolve_database_path(app)?;
    let connection = connect_database(&database_path)?;

    Ok(AppStorageState {
        database_path,
        writer_connection: Mutex::new(connection),
        read_connections: Arc::new(Mutex::new(Vec::new())),
    })
}

pub fn storage_status(app: &AppHandle) -> Result<StorageStatus, StorageError> {
    let database_path = app_storage_state(app)?.database_path.clone();
    let connection = app_read_connection(app)?;

    inspect_connection(&connection, database_path)
}

pub(crate) fn app_connection(
    app: &AppHandle,
) -> Result<MutexGuard<'_, Connection>, StorageError> {
    let state = app_storage_state(app)?;

    state
        .inner()
        .writer_connection
        .lock()
        .map_err(|_| StorageError::AppStorageLockPoisoned)
}

pub(crate) fn app_read_connection(app: &AppHandle) -> Result<AppReadConnection, StorageError> {
    let state = app_storage_state(app)?;
    let database_path = state.database_path.clone();
    let read_connections = Arc::clone(&state.read_connections);

    checkout_read_connection(database_path, read_connections)
}

fn checkout_read_connection(
    database_path: PathBuf,
    read_connections: Arc<Mutex<Vec<Connection>>>,
) -> Result<AppReadConnection, StorageError> {
    let connection = read_connections
        .lock()
        .map_err(|_| StorageError::AppStorageLockPoisoned)?
        .pop();

    let connection = match connection {
        Some(connection) => connection,
        None => connect_read_database(&database_path)?,
    };

    Ok(AppReadConnection {
        connection: Some(connection),
        read_connections,
    })
}

fn app_storage_state(app: &AppHandle) -> Result<State<'_, AppStorageState>, StorageError> {
    app.try_state::<AppStorageState>()
        .ok_or(StorageError::AppStorageNotInitialized)
}

fn resolve_database_path(app: &AppHandle) -> Result<PathBuf, StorageError> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| StorageError::ResolveAppLocalDataDir(error.to_string()))?;

    fs::create_dir_all(&app_local_data_dir).map_err(|source| {
        StorageError::CreateAppLocalDataDir {
            path: app_local_data_dir.clone(),
            source,
        }
    })?;

    Ok(app_local_data_dir.join(DATABASE_FILE_NAME))
}

fn open_database(database_path: &PathBuf) -> Result<Connection, StorageError> {
    Connection::open(database_path).map_err(|source| StorageError::Sqlite {
        operation: "open",
        source,
    })
}

fn connect_database(database_path: &PathBuf) -> Result<Connection, StorageError> {
    let mut connection = open_database(database_path)?;

    configure_writer_connection(&connection)?;
    run_migrations(&mut connection)?;

    Ok(connection)
}

fn connect_read_database(database_path: &PathBuf) -> Result<Connection, StorageError> {
    let connection = open_database(database_path)?;

    configure_read_connection(&connection)?;
    verify_supported_schema_version(&connection)?;

    Ok(connection)
}

fn configure_read_connection(connection: &Connection) -> Result<(), StorageError> {
    connection
        .busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MILLIS))
        .map_err(|source| StorageError::Sqlite {
            operation: "busy-timeout configuration",
            source,
        })?;

    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|source| StorageError::Sqlite {
            operation: "foreign-key configuration",
            source,
        })?;

    Ok(())
}

fn configure_writer_connection(connection: &Connection) -> Result<(), StorageError> {
    configure_read_connection(connection)?;

    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|source| StorageError::Sqlite {
            operation: "journal-mode configuration",
            source,
        })?;

    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|source| StorageError::Sqlite {
            operation: "synchronous-mode configuration",
            source,
        })?;

    Ok(())
}

fn verify_supported_schema_version(connection: &Connection) -> Result<(), StorageError> {
    let schema_version = query_i64(connection, "PRAGMA user_version")?;

    if schema_version > CURRENT_SCHEMA_VERSION {
        return Err(StorageError::IncompatibleSchemaVersion {
            database_version: schema_version,
            current_version: CURRENT_SCHEMA_VERSION,
        });
    }

    Ok(())
}

fn run_migrations(connection: &mut Connection) -> Result<(), StorageError> {
    ensure_migration_table(connection)?;

    verify_supported_schema_version(connection)?;

    for migration in MIGRATIONS {
        apply_migration(connection, migration)?;
    }

    Ok(())
}

fn ensure_migration_table(connection: &Connection) -> Result<(), StorageError> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY NOT NULL,
              name TEXT NOT NULL,
              checksum TEXT NOT NULL,
              applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) STRICT;",
        )
        .map_err(|source| StorageError::Sqlite {
            operation: "migration table initialization",
            source,
        })
}

fn apply_migration(
    connection: &mut Connection,
    migration: &'static Migration,
) -> Result<(), StorageError> {
    let applied_checksum = connection
        .query_row(
            "SELECT checksum FROM schema_migrations WHERE version = ?1",
            [migration.version],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|source| StorageError::Sqlite {
            operation: "migration lookup",
            source,
        })?;

    match applied_checksum {
        Some(checksum) if checksum == migration.checksum => return Ok(()),
        Some(applied_checksum) => {
            return Err(StorageError::MigrationChecksumChanged {
                version: migration.version,
                name: migration.name,
                expected_checksum: migration.checksum,
                applied_checksum,
            });
        }
        None => {}
    }

    let transaction = connection
        .transaction()
        .map_err(|source| StorageError::Sqlite {
            operation: "migration transaction start",
            source,
        })?;

    transaction
        .execute_batch(migration.sql)
        .map_err(|source| StorageError::Sqlite {
            operation: "migration SQL execution",
            source,
        })?;

    transaction
        .execute(
            "INSERT INTO schema_migrations (version, name, checksum) VALUES (?1, ?2, ?3)",
            params![migration.version, migration.name, migration.checksum],
        )
        .map_err(|source| StorageError::Sqlite {
            operation: "migration record insert",
            source,
        })?;

    transaction
        .pragma_update(None, "user_version", migration.version)
        .map_err(|source| StorageError::Sqlite {
            operation: "schema version update",
            source,
        })?;

    transaction.commit().map_err(|source| StorageError::Sqlite {
        operation: "migration transaction commit",
        source,
    })
}

fn inspect_connection(
    connection: &Connection,
    database_path: PathBuf,
) -> Result<StorageStatus, StorageError> {
    let journal_mode = query_string(connection, "PRAGMA journal_mode")?;
    let foreign_keys = query_bool(connection, "PRAGMA foreign_keys")?;
    let json_available = query_bool(connection, "SELECT json_valid('{\"workduck\":true}')")?;
    let fts5_available = query_bool(
        connection,
        "SELECT EXISTS(SELECT 1 FROM pragma_module_list WHERE name = 'fts5')",
    )?;
    let schema_version = query_i64(connection, "PRAGMA user_version")?;
    let applied_migration_count = query_i64(connection, "SELECT COUNT(*) FROM schema_migrations")?;
    let latest_migration = query_optional_string(
        connection,
        "SELECT name FROM schema_migrations ORDER BY version DESC LIMIT 1",
    )?;
    let artifact_blob_count = query_i64(connection, "SELECT COUNT(*) FROM artifact_blobs")?;
    let artifact_search_indexed_row_count =
        query_i64(connection, "SELECT COUNT(*) FROM artifact_blob_search")?;
    let app_state_record_count = query_i64(connection, "SELECT COUNT(*) FROM app_state_records")?;
    let project_registry_count = query_i64(connection, "SELECT COUNT(*) FROM project_registries")?;
    let project_repository_operation_record_count = query_i64(
        connection,
        "SELECT COUNT(*) FROM project_repository_operation_records",
    )?;
    let project_repository_import_attempt_record_count = query_i64(
        connection,
        "SELECT COUNT(*) FROM project_repository_import_attempt_records",
    )?;

    Ok(StorageStatus {
        driver: DATABASE_DRIVER,
        database_file_name: DATABASE_FILE_NAME,
        database_path: display_path(&database_path),
        journal_mode,
        foreign_keys,
        json_available,
        fts5_available,
        schema_version,
        applied_migration_count,
        latest_migration,
        artifact_blob_count,
        artifact_search_indexed_row_count,
        app_state_record_count,
        project_registry_count,
        project_repository_operation_record_count,
        project_repository_import_attempt_record_count,
    })
}

fn query_string(connection: &Connection, sql: &str) -> Result<String, StorageError> {
    connection
        .query_row(sql, [], |row| row.get::<_, String>(0))
        .map_err(|source| StorageError::Sqlite {
            operation: "string inspection query",
            source,
        })
}

fn query_optional_string(
    connection: &Connection,
    sql: &str,
) -> Result<Option<String>, StorageError> {
    connection
        .query_row(sql, [], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|source| StorageError::Sqlite {
            operation: "optional string inspection query",
            source,
        })
}

fn query_bool(connection: &Connection, sql: &str) -> Result<bool, StorageError> {
    query_i64(connection, sql).map(|value| value != 0)
}

fn query_i64(connection: &Connection, sql: &str) -> Result<i64, StorageError> {
    connection
        .query_row(sql, [], |row| row.get::<_, i64>(0))
        .map_err(|source| StorageError::Sqlite {
            operation: "integer inspection query",
            source,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_connection_opens_independently_after_writer_initialization() {
        let temp_dir = tempfile::tempdir().expect("temporary storage directory");
        let database_path = temp_dir.path().join(DATABASE_FILE_NAME);
        let writer_connection = connect_database(&database_path).expect("writer connection");

        writer_connection
            .execute(
                "INSERT INTO project_registries (workspace_id, registry_json, updated_at)
                 VALUES (?1, ?2, ?3)",
                params!["workspace_1", r#"{"version":1,"nodes":[]}"#, "2026-06-11T00:00:00Z"],
            )
            .expect("registry insert");

        let read_connection = connect_read_database(&database_path).expect("read connection");
        let registry_count =
            query_i64(&read_connection, "SELECT COUNT(*) FROM project_registries")
                .expect("registry count");
        let foreign_keys = query_bool(&read_connection, "PRAGMA foreign_keys")
            .expect("foreign key setting");

        assert_eq!(registry_count, 1);
        assert!(foreign_keys);
    }

    #[test]
    fn read_connection_pool_reuses_returned_connections() {
        let temp_dir = tempfile::tempdir().expect("temporary storage directory");
        let database_path = temp_dir.path().join(DATABASE_FILE_NAME);
        let _writer_connection = connect_database(&database_path).expect("writer connection");
        let read_connections = Arc::new(Mutex::new(Vec::new()));

        {
            let read_connection =
                checkout_read_connection(database_path.clone(), Arc::clone(&read_connections))
                    .expect("first read connection");
            assert_eq!(
                query_i64(&read_connection, "PRAGMA user_version").expect("schema version"),
                7
            );
            assert_eq!(read_connections.lock().expect("read pool").len(), 0);
        }

        assert_eq!(read_connections.lock().expect("read pool").len(), 1);

        {
            let read_connection =
                checkout_read_connection(database_path, Arc::clone(&read_connections))
                    .expect("reused read connection");
            assert!(query_bool(&read_connection, "PRAGMA foreign_keys").expect("foreign keys"));
            assert_eq!(read_connections.lock().expect("read pool").len(), 0);
        }

        assert_eq!(read_connections.lock().expect("read pool").len(), 1);
    }
}
