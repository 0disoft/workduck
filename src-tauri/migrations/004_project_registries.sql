CREATE TABLE IF NOT EXISTS project_registries (
  workspace_id TEXT PRIMARY KEY NOT NULL CHECK (length(workspace_id) > 0),
  registry_json TEXT NOT NULL CHECK (json_valid(registry_json)),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
