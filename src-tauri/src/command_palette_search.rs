/* llmnav/1 module
id=workduck.command-palette.search
role=Search workspace-scoped SQLite artifact content for the desktop command palette through a bounded read-only query.
owns=command palette artifact search|FTS query normalization|workspace artifact scoping
excludes=workspace registry loading|command palette rendering|navigation actions
search=command palette artifact search|workspace global search|fts artifact lookup
invariant=Searches are read-only, length-bounded, result-bounded, and never return artifacts outside the requested workspace project registry.
stability=contract
*/

use rusqlite::{params, Connection};
use tauri::AppHandle;

use crate::storage;

const COMMAND_PALETTE_QUERY_MAX_CHARS: usize = 240;
const COMMAND_PALETTE_DEFAULT_LIMIT: u32 = 8;
const COMMAND_PALETTE_MAX_LIMIT: u32 = 24;
const COMMAND_PALETTE_MAX_TERMS: usize = 8;
const COMMAND_PALETTE_MAX_TERM_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPaletteArtifactResult {
    id: String,
    artifact_kind: String,
    artifact_id: String,
    project_id: Option<String>,
    schema_id: Option<String>,
    snippet: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPaletteArtifactSearchResponse {
    ok: bool,
    results: Vec<CommandPaletteArtifactResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[tauri::command]
pub fn search_command_palette_artifacts(
    app: AppHandle,
    workspace_id: String,
    query: String,
    limit: Option<u32>,
) -> CommandPaletteArtifactSearchResponse {
    let workspace_id = workspace_id.trim();
    let query = query.trim();

    if workspace_id.is_empty() {
        return failure("command-palette-workspace-required");
    }

    if query.chars().count() > COMMAND_PALETTE_QUERY_MAX_CHARS {
        return failure("command-palette-query-invalid");
    }

    let Some(fts_query) = compile_fts_query(query) else {
        return success(Vec::new());
    };
    let connection = match storage::app_read_connection(&app) {
        Ok(connection) => connection,
        Err(_) => return failure("command-palette-search-unavailable"),
    };

    match search_artifact_rows(
        &connection,
        workspace_id,
        &fts_query,
        normalize_result_limit(limit),
    ) {
        Ok(results) => success(results),
        Err(_) => failure("command-palette-search-failed"),
    }
}

fn success(results: Vec<CommandPaletteArtifactResult>) -> CommandPaletteArtifactSearchResponse {
    CommandPaletteArtifactSearchResponse {
        ok: true,
        results,
        error: None,
    }
}

fn failure(error: &'static str) -> CommandPaletteArtifactSearchResponse {
    CommandPaletteArtifactSearchResponse {
        ok: false,
        results: Vec::new(),
        error: Some(error),
    }
}

fn normalize_result_limit(limit: Option<u32>) -> u32 {
    limit
        .unwrap_or(COMMAND_PALETTE_DEFAULT_LIMIT)
        .clamp(1, COMMAND_PALETTE_MAX_LIMIT)
}

fn compile_fts_query(query: &str) -> Option<String> {
    let terms = query
        .split(|character: char| !(character.is_alphanumeric() || character == '_'))
        .filter_map(|raw_term| {
            let term = raw_term
                .chars()
                .take(COMMAND_PALETTE_MAX_TERM_CHARS)
                .collect::<String>();

            (!term.is_empty()).then(|| format!("\"{term}\"*"))
        })
        .take(COMMAND_PALETTE_MAX_TERMS)
        .collect::<Vec<_>>();

    (!terms.is_empty()).then(|| terms.join(" AND "))
}

fn search_artifact_rows(
    connection: &Connection,
    workspace_id: &str,
    fts_query: &str,
    limit: u32,
) -> Result<Vec<CommandPaletteArtifactResult>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT
           artifact_blob_search.id,
           artifact_blob_search.artifact_kind,
           artifact_blob_search.artifact_id,
           artifact_blob_search.project_id,
           artifact_blob_search.schema_id,
           snippet(artifact_blob_search, 5, '', '', ' … ', 12) AS content_snippet
         FROM artifact_blob_search
         WHERE artifact_blob_search MATCH ?1
           AND artifact_blob_search.project_id IN (
             SELECT CAST(json_extract(node.value, '$.id') AS TEXT)
             FROM project_registries AS registry,
                  json_each(registry.registry_json, '$.nodes') AS node
             WHERE registry.workspace_id = ?2
               AND json_extract(node.value, '$.kind') = 'project'
           )
         ORDER BY bm25(artifact_blob_search), artifact_blob_search.artifact_id
         LIMIT ?3",
    )?;
    let rows = statement.query_map(params![fts_query, workspace_id, i64::from(limit)], |row| {
        Ok(CommandPaletteArtifactResult {
            id: row.get(0)?,
            artifact_kind: row.get(1)?,
            artifact_id: row.get(2)?,
            project_id: row.get(3)?,
            schema_id: row.get(4)?,
            snippet: row.get(5)?,
        })
    })?;
    let mut results = Vec::new();

    for row in rows {
        results.push(row?);
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn compiles_unicode_prefix_terms_and_drops_punctuation() {
        assert_eq!(
            compile_fts_query("배포 report.json C++"),
            Some("\"배포\"* AND \"report\"* AND \"json\"* AND \"C\"*".to_string())
        );
    }

    #[test]
    fn rejects_queries_without_searchable_terms() {
        assert_eq!(compile_fts_query("--- ..."), None);
    }

    #[test]
    fn clamps_result_limits() {
        assert_eq!(normalize_result_limit(None), COMMAND_PALETTE_DEFAULT_LIMIT);
        assert_eq!(normalize_result_limit(Some(0)), 1);
        assert_eq!(
            normalize_result_limit(Some(COMMAND_PALETTE_MAX_LIMIT + 50)),
            COMMAND_PALETTE_MAX_LIMIT
        );
    }

    #[test]
    fn searches_only_artifacts_from_the_requested_workspace() {
        let connection = create_test_connection();
        insert_workspace_registry(&connection, "workspace-a", "project-a");
        insert_workspace_registry(&connection, "workspace-b", "project-b");
        insert_artifact(&connection, "artifact-a", "project-a", "Deploy the billing worker");
        insert_artifact(&connection, "artifact-b", "project-b", "Deploy the private worker");

        let results = search_artifact_rows(
            &connection,
            "workspace-a",
            &compile_fts_query("deploy worker").expect("query should compile"),
            10,
        )
        .expect("artifact search should succeed");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "artifact-a");
        assert_eq!(results[0].project_id.as_deref(), Some("project-a"));
    }

    fn create_test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory SQLite should open");
        connection
            .execute_batch(include_str!("../migrations/002_artifact_blobs.sql"))
            .expect("artifact table migration should apply");
        connection
            .execute_batch(include_str!("../migrations/003_artifact_blob_search.sql"))
            .expect("artifact search migration should apply");
        connection
            .execute_batch(include_str!("../migrations/004_project_registries.sql"))
            .expect("project registry migration should apply");
        connection
    }

    fn insert_workspace_registry(connection: &Connection, workspace_id: &str, project_id: &str) {
        let registry_json = serde_json::json!({
            "version": 1,
            "workspaceId": workspace_id,
            "nodes": [{ "id": project_id, "kind": "project" }]
        })
        .to_string();

        connection
            .execute(
                "INSERT INTO project_registries (workspace_id, registry_json, updated_at)
                 VALUES (?1, ?2, '2026-08-21T00:00:00Z')",
                params![workspace_id, registry_json],
            )
            .expect("workspace registry should insert");
    }

    fn insert_artifact(
        connection: &Connection,
        id: &str,
        project_id: &str,
        searchable_content: &str,
    ) {
        connection
            .execute(
                "INSERT INTO artifact_blobs (
                   id,
                   artifact_kind,
                   artifact_id,
                   project_id,
                   schema_id,
                   content_json,
                   metadata_json,
                   content_hash
                 ) VALUES (?1, 'artifact', ?1, ?2, 'workduck.test', ?3, '{}', ?4)",
                params![
                    id,
                    project_id,
                    serde_json::json!({ "body": searchable_content }).to_string(),
                    format!("hash-{id}")
                ],
            )
            .expect("artifact should insert");
    }
}
