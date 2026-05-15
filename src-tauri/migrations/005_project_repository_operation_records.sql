CREATE TABLE IF NOT EXISTS project_repository_operation_records (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  workspace_id TEXT NOT NULL CHECK (length(workspace_id) > 0),
  node_id TEXT NOT NULL CHECK (length(node_id) > 0),
  repository_id TEXT NOT NULL CHECK (length(repository_id) > 0),
  repository_name TEXT NOT NULL CHECK (length(repository_name) > 0),
  operation TEXT NOT NULL CHECK (operation IN ('clone', 'init', 'fetch', 'pull', 'push', 'publish')),
  state TEXT NOT NULL CHECK (state IN ('succeeded', 'failed')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) > 0),
  started_at TEXT NOT NULL CHECK (length(started_at) > 0),
  finished_at TEXT NOT NULL CHECK (length(finished_at) > 0),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX IF NOT EXISTS project_repository_operation_records_workspace_lookup
ON project_repository_operation_records (workspace_id, repository_id, finished_at DESC, id DESC);
