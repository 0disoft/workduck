CREATE TABLE IF NOT EXISTS project_repository_import_attempt_records (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  workspace_id TEXT NOT NULL CHECK (length(workspace_id) > 0),
  node_id TEXT NOT NULL CHECK (length(node_id) > 0),
  repository_name TEXT NOT NULL CHECK (length(repository_name) > 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('fork')),
  state TEXT NOT NULL CHECK (state IN ('running', 'succeeded', 'failed')),
  phase TEXT NOT NULL CHECK (phase IN ('preflight', 'creating-fork', 'cloning-fork', 'persisting-registry', 'completed')),
  upstream_remote_url TEXT NOT NULL CHECK (length(upstream_remote_url) > 0),
  fork_remote_url TEXT CHECK (fork_remote_url IS NULL OR length(fork_remote_url) > 0),
  target_path TEXT CHECK (target_path IS NULL OR length(target_path) > 0),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) > 0),
  started_at TEXT NOT NULL CHECK (length(started_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  finished_at TEXT CHECK (finished_at IS NULL OR length(finished_at) > 0),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX IF NOT EXISTS project_repository_import_attempt_records_workspace_lookup
ON project_repository_import_attempt_records (workspace_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS project_repository_import_attempt_records_node_lookup
ON project_repository_import_attempt_records (workspace_id, node_id, updated_at DESC, id DESC);
