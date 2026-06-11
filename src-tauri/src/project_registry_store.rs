use std::collections::BTreeMap;

use rusqlite::{OptionalExtension, params};
use tauri::AppHandle;

use crate::storage;

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
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRegistryWriteInput {
    registry_json: String,
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
    let mut registries = BTreeMap::new();

    for workspace_id in workspace_ids {
        let registry_json = match connection
            .query_row(
                "SELECT registry_json FROM project_registries WHERE workspace_id = ?1",
                [&workspace_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
        {
            Ok(registry_json) => registry_json,
            Err(_) => return invalid_read_many(ProjectRegistryStoreError::ReadFailed),
        };

        if let Some(registry_json) = registry_json {
            registries.insert(workspace_id, registry_json);
        }
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
) -> ProjectRegistryWrite {
    let registries = BTreeMap::from([(
        workspace_id,
        ProjectRegistryWriteInput {
            registry_json,
            updated_at,
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
    let transaction = match connection.transaction() {
        Ok(transaction) => transaction,
        Err(_) => return invalid_write(ProjectRegistryStoreError::WriteFailed),
    };

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
