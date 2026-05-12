CREATE TABLE IF NOT EXISTS workduck_database_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO workduck_database_metadata (key, value)
VALUES ('storage_schema', 'bootstrap')
ON CONFLICT(key) DO NOTHING;
