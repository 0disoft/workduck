CREATE TABLE IF NOT EXISTS artifact_blobs (
  id TEXT PRIMARY KEY NOT NULL,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('artifact', 'catalog-artifact')),
  artifact_id TEXT NOT NULL CHECK (length(artifact_id) > 0),
  project_id TEXT CHECK (project_id IS NULL OR length(project_id) > 0),
  schema_id TEXT CHECK (schema_id IS NULL OR length(schema_id) > 0),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  content_hash TEXT NOT NULL CHECK (length(content_hash) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS artifact_blobs_content_unique
ON artifact_blobs (artifact_kind, artifact_id, COALESCE(schema_id, ''), content_hash);

CREATE INDEX IF NOT EXISTS artifact_blobs_project_lookup
ON artifact_blobs (project_id, artifact_kind, artifact_id);
