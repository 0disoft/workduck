CREATE TABLE app_state_records (
  state_key TEXT PRIMARY KEY NOT NULL
    CHECK (
      state_key IN (
        'appearance-settings',
        'sync-settings',
        'system-settings',
        'workspace-registry'
      )
    ),
  value_json TEXT NOT NULL
    CHECK (json_valid(value_json) AND json_type(value_json) = 'object'),
  updated_at TEXT NOT NULL
    CHECK (length(trim(updated_at)) > 0),
  stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
