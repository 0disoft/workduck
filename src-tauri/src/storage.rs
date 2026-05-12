use std::{fmt, fs, path::PathBuf, time::Duration};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

const DATABASE_DRIVER: &str = "sqlite";
const DATABASE_FILE_NAME: &str = "workduck.sqlite3";
const SQLITE_BUSY_TIMEOUT_MILLIS: u64 = 5_000;

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
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ResolveAppLocalDataDir(source) => {
                write!(formatter, "failed to resolve app local data directory: {source}")
            }
            Self::CreateAppLocalDataDir { path, source } => write!(
                formatter,
                "failed to create app local data directory '{}': {source}",
                path.display()
            ),
            Self::Sqlite { operation, source } => {
                write!(formatter, "SQLite {operation} failed: {source}")
            }
        }
    }
}

impl std::error::Error for StorageError {}

pub fn storage_status(app: &AppHandle) -> Result<StorageStatus, StorageError> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    configure_connection(&connection)?;
    inspect_connection(&connection, database_path)
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

fn configure_connection(connection: &Connection) -> Result<(), StorageError> {
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

fn inspect_connection(
    connection: &Connection,
    database_path: PathBuf,
) -> Result<StorageStatus, StorageError> {
    let journal_mode = query_string(connection, "PRAGMA journal_mode")?;
    let foreign_keys = query_bool(connection, "PRAGMA foreign_keys")?;
    let json_available = query_bool(connection, "SELECT json_valid('{\"workduck\":true}')")?;
    let fts5_available = query_bool(
        connection,
        "SELECT EXISTS(SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5')",
    )?;
    let schema_version = query_i64(connection, "PRAGMA user_version")?;

    Ok(StorageStatus {
        driver: DATABASE_DRIVER,
        database_file_name: DATABASE_FILE_NAME,
        database_path: database_path.to_string_lossy().into_owned(),
        journal_mode,
        foreign_keys,
        json_available,
        fts5_available,
        schema_version,
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
