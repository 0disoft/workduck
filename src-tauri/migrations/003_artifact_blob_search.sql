CREATE VIRTUAL TABLE IF NOT EXISTS artifact_blob_search USING fts5(
  id UNINDEXED,
  artifact_kind UNINDEXED,
  artifact_id UNINDEXED,
  project_id UNINDEXED,
  schema_id UNINDEXED,
  content_json,
  metadata_json,
  content_hash UNINDEXED,
  content='artifact_blobs',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS artifact_blobs_ai
AFTER INSERT ON artifact_blobs
BEGIN
  INSERT INTO artifact_blob_search(
    rowid,
    id,
    artifact_kind,
    artifact_id,
    project_id,
    schema_id,
    content_json,
    metadata_json,
    content_hash
  )
  VALUES (
    new.rowid,
    new.id,
    new.artifact_kind,
    new.artifact_id,
    new.project_id,
    new.schema_id,
    new.content_json,
    new.metadata_json,
    new.content_hash
  );
END;

CREATE TRIGGER IF NOT EXISTS artifact_blobs_ad
AFTER DELETE ON artifact_blobs
BEGIN
  INSERT INTO artifact_blob_search(
    artifact_blob_search,
    rowid,
    id,
    artifact_kind,
    artifact_id,
    project_id,
    schema_id,
    content_json,
    metadata_json,
    content_hash
  )
  VALUES (
    'delete',
    old.rowid,
    old.id,
    old.artifact_kind,
    old.artifact_id,
    old.project_id,
    old.schema_id,
    old.content_json,
    old.metadata_json,
    old.content_hash
  );
END;

CREATE TRIGGER IF NOT EXISTS artifact_blobs_au
AFTER UPDATE ON artifact_blobs
BEGIN
  INSERT INTO artifact_blob_search(
    artifact_blob_search,
    rowid,
    id,
    artifact_kind,
    artifact_id,
    project_id,
    schema_id,
    content_json,
    metadata_json,
    content_hash
  )
  VALUES (
    'delete',
    old.rowid,
    old.id,
    old.artifact_kind,
    old.artifact_id,
    old.project_id,
    old.schema_id,
    old.content_json,
    old.metadata_json,
    old.content_hash
  );

  INSERT INTO artifact_blob_search(
    rowid,
    id,
    artifact_kind,
    artifact_id,
    project_id,
    schema_id,
    content_json,
    metadata_json,
    content_hash
  )
  VALUES (
    new.rowid,
    new.id,
    new.artifact_kind,
    new.artifact_id,
    new.project_id,
    new.schema_id,
    new.content_json,
    new.metadata_json,
    new.content_hash
  );
END;

INSERT INTO artifact_blob_search(artifact_blob_search) VALUES ('rebuild');
