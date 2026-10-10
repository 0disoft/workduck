// llmnav/1 module
// id=workduck.projects.task-history
// role=Read selected durable repository task runs by identity without reducing historical evidence to the latest run.
// owns=bounded task history lookup|run identity and file binding|historical running state refresh
// excludes=command selection|execution launch|latest repository card projection
// search=read historical repository run|saved brief execution evidence|task record ID lookup
// invariant=Requested IDs resolve only to bounded workspace-owned files, completed runs retain identity, and missing records never become passing evidence.
// stability=contract
// /llmnav
use std::{collections::HashSet, fs, io::Read, path::Path};

use super::{
    ProjectRepositoryTaskError, ProjectRepositoryTaskRunRecord, collect_live_task_processes,
    compare_task_run_records_descending, refresh_running_task_run_records, task_run_record_dir,
};

const MAX_SELECTED_RUNS: usize = 200;
const MAX_RECORD_BYTES: usize = 1024 * 1024;
const MAX_HISTORY_BYTES: usize = 8 * MAX_RECORD_BYTES;

pub(super) fn read_selected_task_run_records(
    workspace_path: &Path,
    ids: &[String],
) -> Result<Vec<ProjectRepositoryTaskRunRecord>, ProjectRepositoryTaskError> {
    if ids.len() > MAX_SELECTED_RUNS || ids.iter().any(|id| !valid_run_id(id)) {
        return Err(ProjectRepositoryTaskError::RecordReadFailed);
    }
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let record_dir = match fs::canonicalize(task_run_record_dir(workspace_path)) {
        Ok(path) if path.starts_with(workspace_path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        _ => return Err(ProjectRepositoryTaskError::RecordReadFailed),
    };
    let visible_workspace = crate::git_path::git_process_path(workspace_path);
    let mut seen_ids = HashSet::new();
    let mut records = Vec::new();
    let mut total_bytes = 0;
    for id in ids {
        if !seen_ids.insert(id) {
            continue;
        }
        let path = record_dir.join(format!("{id}.json"));
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            _ => return Err(ProjectRepositoryTaskError::RecordReadFailed),
        };
        if metadata.len() > MAX_RECORD_BYTES as u64 {
            return Err(ProjectRepositoryTaskError::RecordReadFailed);
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .and_then(|file| {
                file.take((MAX_RECORD_BYTES + 1) as u64)
                    .read_to_end(&mut bytes)
            })
            .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;
        total_bytes += bytes.len();
        if bytes.len() > MAX_RECORD_BYTES || total_bytes > MAX_HISTORY_BYTES {
            return Err(ProjectRepositoryTaskError::RecordReadFailed);
        }
        let json_bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
        let mut record: ProjectRepositoryTaskRunRecord = serde_json::from_slice(json_bytes)
            .map_err(|_| ProjectRepositoryTaskError::RecordReadFailed)?;
        let repository_path = Path::new(&record.repository_path);
        if record.id != *id
            || !repository_path.starts_with(&visible_workspace)
            || repository_path.components().any(|component| {
                matches!(
                    component,
                    std::path::Component::ParentDir | std::path::Component::CurDir
                )
            })
        {
            return Err(ProjectRepositoryTaskError::RecordReadFailed);
        }
        // Reconciliation must write back to the file we read, never a path inside its JSON.
        record.record_path = crate::git_path::git_process_path(&path)
            .to_string_lossy()
            .into_owned();
        records.push(record);
    }
    records = refresh_running_task_run_records(records, collect_live_task_processes);
    records.sort_by(compare_task_run_records_descending);
    Ok(records)
}

pub(super) fn valid_run_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && !crate::windows_filename::is_windows_reserved_name(id)
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(workspace: &Path, id: &str, timestamp: &str) -> ProjectRepositoryTaskRunRecord {
        ProjectRepositoryTaskRunRecord {
            id: id.into(),
            task: "build".into(),
            repository_path: crate::git_path::git_process_path(&workspace.join("repo"))
                .to_string_lossy()
                .into_owned(),
            command: "build".into(),
            state: "succeeded".into(),
            process_id: None,
            exit_code: Some(0),
            started_at: timestamp.into(),
            finished_at: Some(timestamp.into()),
            output_tail: None,
            record_path: "untrusted-path.json".into(),
        }
    }

    fn save(workspace: &Path, record: &ProjectRepositoryTaskRunRecord) {
        let dir = task_run_record_dir(workspace);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(format!("{}.json", record.id)),
            serde_json::to_vec(record).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn reads_utf8_bom_records_without_changing_the_file_or_unicode_output() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        let mut completed = record(&workspace, "build-1", "2026-10-01T00:00:00Z");
        completed.output_tail = Some("빌드 완료 ✓".into());
        save(&workspace, &completed);
        let path = task_run_record_dir(&workspace).join("build-1.json");
        let mut bytes = vec![0xef, 0xbb, 0xbf];
        bytes.extend(serde_json::to_vec(&completed).unwrap());
        fs::write(&path, &bytes).unwrap();
        let records = read_selected_task_run_records(&workspace, &["build-1".into()])
            .unwrap_or_else(|_| panic!("read BOM-prefixed history"));
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, completed.id);
        assert_eq!(records[0].output_tail, completed.output_tail);
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn bom_does_not_make_invalid_json_or_mismatched_identity_valid() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        let completed = record(&workspace, "build-1", "2026-10-01T00:00:00Z");
        save(&workspace, &completed);
        let path = task_run_record_dir(&workspace).join("build-1.json");
        let mismatched =
            serde_json::to_vec(&record(&workspace, "other", &completed.started_at)).unwrap();
        for payload in [b"{".to_vec(), mismatched] {
            let mut bytes = vec![0xef, 0xbb, 0xbf];
            bytes.extend(payload);
            fs::write(&path, bytes).unwrap();
            assert!(read_selected_task_run_records(&workspace, &["build-1".into()]).is_err());
        }
    }

    #[test]
    fn older_linked_run_survives_newer_run_for_the_same_repository() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        save(
            &workspace,
            &record(&workspace, "old-build", "2026-10-01T00:00:00Z"),
        );
        save(
            &workspace,
            &record(&workspace, "new-build", "2026-10-02T00:00:00Z"),
        );
        let records = read_selected_task_run_records(&workspace, &["old-build".into()])
            .unwrap_or_else(|_| panic!("read historical run"));
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "old-build");
        assert_eq!(records[0].exit_code, Some(0));
        assert_ne!(records[0].record_path, "untrusted-path.json");
    }

    #[test]
    fn missing_runs_are_absent_and_duplicate_requests_do_not_duplicate_evidence() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        save(
            &workspace,
            &record(&workspace, "build-1", "2026-10-01T00:00:00Z"),
        );
        let records = read_selected_task_run_records(
            &workspace,
            &["build-1".into(), "missing".into(), "build-1".into()],
        )
        .unwrap_or_else(|_| panic!("read distinct selected runs"));
        assert_eq!(records.len(), 1);
    }

    #[test]
    fn rejects_path_arguments_identity_mismatches_and_oversized_records() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        assert!(read_selected_task_run_records(&workspace, &["../escape".into()]).is_err());
        assert!(read_selected_task_run_records(&workspace, &["CON".into()]).is_err());
        assert!(read_selected_task_run_records(&workspace, &vec!["run".into(); 201]).is_err());
        save(
            &workspace,
            &record(&workspace, "build-1", "2026-10-01T00:00:00Z"),
        );
        let path = task_run_record_dir(&workspace).join("build-1.json");
        fs::write(
            &path,
            serde_json::to_vec(&record(&workspace, "other", "2026-10-01T00:00:00Z")).unwrap(),
        )
        .unwrap();
        assert!(read_selected_task_run_records(&workspace, &["build-1".into()]).is_err());
        fs::write(path, vec![b' '; MAX_RECORD_BYTES + 1]).unwrap();
        assert!(read_selected_task_run_records(&workspace, &["build-1".into()]).is_err());
    }

    #[test]
    fn rejects_records_for_other_workspaces() {
        let temp = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        let mut forged = record(&workspace, "build-1", "2026-10-01T00:00:00Z");
        forged.repository_path = other.path().to_string_lossy().into_owned();
        save(&workspace, &forged);
        assert!(read_selected_task_run_records(&workspace, &["build-1".into()]).is_err());
    }
}
