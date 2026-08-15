-- llmnav/1 module
-- id=workduck.migration.project-registries
-- role=Create the strict SQLite authority row for each workspace's canonical project-registry JSON snapshot.
-- owns=project registry table|workspace registry uniqueness|registry JSON validity
-- excludes=registry domain normalization|repository operation history
-- search=project registry migration|workspace registry table|sqlite registry json
-- invariant=Each workspace has at most one row and every stored registry payload is valid JSON.
-- stability=contract
-- /llmnav
CREATE TABLE IF NOT EXISTS project_registries (
  workspace_id TEXT PRIMARY KEY NOT NULL CHECK (length(workspace_id) > 0),
  registry_json TEXT NOT NULL CHECK (json_valid(registry_json)),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
