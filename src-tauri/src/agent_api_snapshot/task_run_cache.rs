// llmnav/1 module
// id=workduck.agent.task-run-cache
// role=Cache redacted completed task summaries by file metadata.
// owns=summary caching|workspace eviction
// excludes=task execution|history mutation
// search=task summary cache|run metadata
// invariant=Reuse only metadata-matching completed summaries; cap workspaces, entries, and retained payload.
// stability=implementation
// /llmnav
use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    fs::Metadata,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};

use super::AgentApiRepositoryTaskRunRecord;

const MAX_WORKSPACES: usize = 4;
const MAX_ENTRIES: usize = 10_000;
const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;

struct CachedSummary {
    len: u64,
    modified: SystemTime,
    created: Option<SystemTime>,
    summary: AgentApiRepositoryTaskRunRecord,
    payload_bytes: usize,
}

#[derive(Default)]
pub(super) struct TaskRunSummaryCache {
    files: BTreeMap<PathBuf, CachedSummary>,
    payload_bytes: usize,
}

impl TaskRunSummaryCache {
    pub(super) fn get(
        &self,
        path: &Path,
        metadata: &Metadata,
    ) -> Option<&AgentApiRepositoryTaskRunRecord> {
        let cached = self.files.get(path)?;
        (metadata.is_file()
            && !metadata.file_type().is_symlink()
            && cached.len == metadata.len()
            && Some(cached.modified) == metadata.modified().ok()
            && cached.created == metadata.created().ok())
        .then_some(&cached.summary)
    }

    pub(super) fn remove(&mut self, path: &Path) {
        if let Some(cached) = self.files.remove(path) {
            self.payload_bytes -= cached.payload_bytes;
        }
    }

    pub(super) fn insert(
        &mut self,
        path: PathBuf,
        metadata: &Metadata,
        summary: AgentApiRepositoryTaskRunRecord,
    ) {
        self.remove(&path);
        let Ok(modified) = metadata.modified() else {
            return;
        };
        let payload_bytes = path.as_os_str().len() * 2
            + summary.id.len()
            + summary.task.len()
            + summary.repository_path.len()
            + summary.state.len()
            + summary.started_at.len()
            + summary.finished_at.as_deref().map_or(0, str::len);
        if summary.state == "running"
            || self.files.len() >= MAX_ENTRIES
            || self.payload_bytes.saturating_add(payload_bytes) > MAX_PAYLOAD_BYTES
        {
            return;
        }
        self.payload_bytes += payload_bytes;
        self.files.insert(
            path,
            CachedSummary {
                len: metadata.len(),
                modified,
                created: metadata.created().ok(),
                summary,
                payload_bytes,
            },
        );
    }

    pub(super) fn retain(&mut self, paths: &HashSet<PathBuf>) {
        self.files.retain(|path, cached| {
            if paths.contains(path) {
                return true;
            }
            self.payload_bytes -= cached.payload_bytes;
            false
        });
    }

    pub(super) fn clear(&mut self) {
        self.files.clear();
        self.payload_bytes = 0;
    }
}

type WorkspaceCaches = VecDeque<(PathBuf, Arc<Mutex<TaskRunSummaryCache>>)>;

pub(super) fn workspace_cache(workspace: &Path) -> Arc<Mutex<TaskRunSummaryCache>> {
    static CACHES: OnceLock<Mutex<WorkspaceCaches>> = OnceLock::new();
    let mut caches = CACHES
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let entry = caches
        .iter()
        .position(|(path, _)| path == workspace)
        .and_then(|index| caches.remove(index))
        .unwrap_or_else(|| {
            (
                workspace.to_path_buf(),
                Arc::new(Mutex::new(TaskRunSummaryCache::default())),
            )
        });
    let cache = Arc::clone(&entry.1);
    caches.push_back(entry);
    while caches.len() > MAX_WORKSPACES {
        caches.pop_front();
    }
    cache
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(state: &str) -> AgentApiRepositoryTaskRunRecord {
        AgentApiRepositoryTaskRunRecord {
            id: "run".into(),
            task: "build".into(),
            repository_path: "repo".into(),
            state: state.into(),
            has_command: true,
            has_output_tail: true,
            started_at: "2026-10-20T00:00:00Z".into(),
            finished_at: None,
            exit_code: None,
        }
    }

    #[test]
    fn cache_caps_retained_payload_and_does_not_store_running_summaries() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let metadata = file.as_file().metadata().unwrap();
        let mut cache = TaskRunSummaryCache::default();
        cache.insert("running".into(), &metadata, summary("running"));
        assert!(cache.files.is_empty());
        let mut oversized = summary("succeeded");
        oversized.id = "x".repeat(MAX_PAYLOAD_BYTES);
        cache.insert("oversized".into(), &metadata, oversized);
        assert!(cache.files.is_empty());
        assert_eq!(cache.payload_bytes, 0);
        for index in 0..=MAX_ENTRIES {
            cache.insert(
                format!("run-{index}").into(),
                &metadata,
                summary("succeeded"),
            );
        }
        assert_eq!(cache.files.len(), MAX_ENTRIES);
        assert!(cache.payload_bytes <= MAX_PAYLOAD_BYTES);
        cache.retain(&HashSet::new());
        assert_eq!(cache.payload_bytes, 0);
        assert!(cache.files.is_empty());
    }
}
