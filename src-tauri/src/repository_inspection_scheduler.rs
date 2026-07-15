use std::{
    collections::{HashMap, VecDeque},
    io,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex, OnceLock},
    thread,
};

use tauri::ipc::Channel;

use crate::{
    project_repository::{
        ProjectRepositoryGitError, ProjectRepositoryGitInspectionRecord,
        ProjectRepositoryGitInspectionRequest, inspect_project_repository_git_record,
        project_repository_git_inspection_error_record,
    },
    project_repository_validation::validate_repository_path,
};

const REPOSITORY_INSPECTION_QUEUE_CAPACITY: usize = 1_024;
const REPOSITORY_INSPECTION_SCAN_ID_MAX_CHARS: usize = 128;
const REPOSITORY_INSPECTION_REPOSITORY_ID_MAX_CHARS: usize = 256;

#[cfg(target_os = "windows")]
const REPOSITORY_INSPECTION_WORKER_COUNT: usize = 2;
#[cfg(not(target_os = "windows"))]
const REPOSITORY_INSPECTION_WORKER_COUNT: usize = 4;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitInspectionEvent {
    scan_id: String,
    record: ProjectRepositoryGitInspectionRecord,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRepositoryGitInspectionSchedule {
    scheduled_count: usize,
    rejected_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct InspectionSubscriber {
    scan_id: String,
    repository_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InspectionJobState {
    Queued,
    Running,
}

struct InspectionJob {
    request: ProjectRepositoryGitInspectionRequest,
    state: InspectionJobState,
    subscribers: Vec<InspectionSubscriber>,
}

#[derive(Default)]
struct InspectionQueue {
    paths: VecDeque<PathBuf>,
    jobs: HashMap<PathBuf, InspectionJob>,
}

enum EnqueueResult {
    Scheduled,
    Shared,
    Duplicate,
    Full,
}

impl InspectionQueue {
    fn enqueue(
        &mut self,
        path: PathBuf,
        request: ProjectRepositoryGitInspectionRequest,
        subscriber: InspectionSubscriber,
        capacity: usize,
    ) -> EnqueueResult {
        if let Some(job) = self.jobs.get_mut(&path) {
            if job.subscribers.contains(&subscriber) {
                return EnqueueResult::Duplicate;
            }
            job.subscribers.push(subscriber);
            return EnqueueResult::Shared;
        }

        if self.jobs.len() >= capacity {
            return EnqueueResult::Full;
        }

        self.paths.push_back(path.clone());
        self.jobs.insert(
            path,
            InspectionJob {
                request,
                state: InspectionJobState::Queued,
                subscribers: vec![subscriber],
            },
        );
        EnqueueResult::Scheduled
    }

    fn next_request(&mut self) -> Option<(PathBuf, ProjectRepositoryGitInspectionRequest)> {
        while let Some(path) = self.paths.pop_front() {
            let Some(job) = self.jobs.get_mut(&path) else {
                continue;
            };
            if job.state != InspectionJobState::Queued || job.subscribers.is_empty() {
                continue;
            }

            job.state = InspectionJobState::Running;
            return Some((path, job.request.clone()));
        }

        None
    }

    fn finish(&mut self, path: &PathBuf) -> Vec<InspectionSubscriber> {
        self.jobs
            .remove(path)
            .map(|job| job.subscribers)
            .unwrap_or_default()
    }

    fn cancel_scan(&mut self, scan_id: &str) {
        for job in self.jobs.values_mut() {
            job.subscribers
                .retain(|subscriber| subscriber.scan_id != scan_id);
        }

        let abandoned_paths = self
            .jobs
            .iter()
            .filter_map(|(path, job)| {
                (job.state == InspectionJobState::Queued && job.subscribers.is_empty())
                    .then(|| path.clone())
            })
            .collect::<Vec<_>>();

        for path in &abandoned_paths {
            self.jobs.remove(path);
        }
        if !abandoned_paths.is_empty() {
            self.paths.retain(|path| self.jobs.contains_key(path));
        }
    }
}

struct InspectionScan {
    channel: Channel<ProjectRepositoryGitInspectionEvent>,
    pending_count: usize,
}

#[derive(Default)]
struct SchedulerState {
    queue: InspectionQueue,
    scans: HashMap<String, InspectionScan>,
    shutting_down: bool,
}

struct RepositoryInspectionScheduler {
    shared: Arc<(Mutex<SchedulerState>, Condvar)>,
    _workers: Vec<thread::JoinHandle<()>>,
}

impl RepositoryInspectionScheduler {
    fn start(worker_count: usize) -> io::Result<Self> {
        let shared = Arc::new((Mutex::new(SchedulerState::default()), Condvar::new()));
        let mut workers = Vec::with_capacity(worker_count.max(1));

        for worker_index in 0..worker_count.max(1) {
            let worker_shared = Arc::clone(&shared);
            match thread::Builder::new()
                .name(format!("workduck-repository-inspection-{worker_index}"))
                .spawn(move || run_repository_inspection_worker(worker_shared))
            {
                Ok(worker) => workers.push(worker),
                Err(error) => {
                    let (state, ready) = &*shared;
                    state
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .shutting_down = true;
                    ready.notify_all();
                    for worker in workers {
                        let _ = worker.join();
                    }
                    return Err(error);
                }
            }
        }

        Ok(Self {
            shared,
            _workers: workers,
        })
    }

    fn schedule(
        &self,
        scan_id: String,
        repositories: Vec<ProjectRepositoryGitInspectionRequest>,
        channel: Channel<ProjectRepositoryGitInspectionEvent>,
    ) -> ProjectRepositoryGitInspectionSchedule {
        self.cancel(&scan_id);

        let mut candidates = Vec::with_capacity(repositories.len());
        let mut immediate_records = Vec::new();

        for repository in repositories {
            if !is_valid_repository_id(&repository.repository_id) {
                immediate_records.push(project_repository_git_inspection_error_record(
                    repository.repository_id,
                    ProjectRepositoryGitError::CommandFailed,
                ));
                continue;
            }

            match validate_repository_path(&repository.path) {
                Ok(path) => candidates.push((path, repository)),
                Err(error) => immediate_records.push(
                    project_repository_git_inspection_error_record(repository.repository_id, error),
                ),
            }
        }

        let total_count = candidates.len().saturating_add(immediate_records.len());
        let (state, ready) = &*self.shared;
        let mut scheduler = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        scheduler.scans.insert(
            scan_id.clone(),
            InspectionScan {
                channel: channel.clone(),
                pending_count: total_count,
            },
        );

        let mut scheduled_count = 0;
        for (path, mut repository) in candidates {
            repository.path = path.to_string_lossy().into_owned();
            let subscriber = InspectionSubscriber {
                scan_id: scan_id.clone(),
                repository_id: repository.repository_id.clone(),
            };
            let repository_id = subscriber.repository_id.clone();
            match scheduler.queue.enqueue(
                path,
                repository,
                subscriber,
                REPOSITORY_INSPECTION_QUEUE_CAPACITY,
            ) {
                EnqueueResult::Scheduled | EnqueueResult::Shared => {
                    scheduled_count += 1;
                }
                EnqueueResult::Duplicate | EnqueueResult::Full => {
                    immediate_records.push(project_repository_git_inspection_error_record(
                        repository_id,
                        ProjectRepositoryGitError::CommandFailed,
                    ));
                }
            }
        }
        ready.notify_all();
        drop(scheduler);

        for record in &immediate_records {
            let _ = channel.send(ProjectRepositoryGitInspectionEvent {
                scan_id: scan_id.clone(),
                record: record.clone(),
            });
        }
        self.complete_immediate(&scan_id, immediate_records.len());

        ProjectRepositoryGitInspectionSchedule {
            scheduled_count,
            rejected_count: immediate_records.len(),
        }
    }

    fn complete_immediate(&self, scan_id: &str, completed_count: usize) {
        let (state, _) = &*self.shared;
        let mut scheduler = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let should_remove = scheduler.scans.get_mut(scan_id).is_some_and(|scan| {
            scan.pending_count = scan.pending_count.saturating_sub(completed_count);
            scan.pending_count == 0
        });
        if should_remove {
            scheduler.scans.remove(scan_id);
        }
    }

    fn cancel(&self, scan_id: &str) {
        let (state, ready) = &*self.shared;
        let mut scheduler = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        scheduler.scans.remove(scan_id);
        scheduler.queue.cancel_scan(scan_id);
        ready.notify_all();
    }
}

fn run_repository_inspection_worker(shared: Arc<(Mutex<SchedulerState>, Condvar)>) {
    loop {
        let (path, request) = {
            let (state, ready) = &*shared;
            let mut scheduler = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());

            loop {
                if scheduler.shutting_down {
                    return;
                }
                if let Some(job) = scheduler.queue.next_request() {
                    break job;
                }
                scheduler = ready
                    .wait(scheduler)
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
            }
        };

        let record = inspect_project_repository_git_record(request);
        let emissions = {
            let (state, _) = &*shared;
            let mut scheduler = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let subscribers = scheduler.queue.finish(&path);
            let mut emissions = Vec::with_capacity(subscribers.len());

            for (index, subscriber) in subscribers.into_iter().enumerate() {
                let Some(scan) = scheduler.scans.get_mut(&subscriber.scan_id) else {
                    continue;
                };
                emissions.push((
                    scan.channel.clone(),
                    ProjectRepositoryGitInspectionEvent {
                        scan_id: subscriber.scan_id.clone(),
                        record: record.for_repository(subscriber.repository_id, index == 0),
                    },
                ));
                scan.pending_count = scan.pending_count.saturating_sub(1);
                if scan.pending_count == 0 {
                    scheduler.scans.remove(&subscriber.scan_id);
                }
            }

            emissions
        };

        for (channel, event) in emissions {
            let _ = channel.send(event);
        }
    }
}

fn repository_inspection_scheduler() -> Option<&'static RepositoryInspectionScheduler> {
    static SCHEDULER: OnceLock<Option<RepositoryInspectionScheduler>> = OnceLock::new();

    SCHEDULER
        .get_or_init(|| {
            RepositoryInspectionScheduler::start(REPOSITORY_INSPECTION_WORKER_COUNT).ok()
        })
        .as_ref()
}

#[tauri::command]
pub fn schedule_project_repositories_git_inspection(
    scan_id: String,
    repositories: Vec<ProjectRepositoryGitInspectionRequest>,
    on_event: Channel<ProjectRepositoryGitInspectionEvent>,
) -> ProjectRepositoryGitInspectionSchedule {
    if !is_valid_scan_id(&scan_id) {
        let rejected_count = repositories.len();
        for repository in repositories {
            let _ = on_event.send(ProjectRepositoryGitInspectionEvent {
                scan_id: scan_id.clone(),
                record: project_repository_git_inspection_error_record(
                    repository.repository_id,
                    ProjectRepositoryGitError::CommandFailed,
                ),
            });
        }
        return ProjectRepositoryGitInspectionSchedule {
            scheduled_count: 0,
            rejected_count,
        };
    }

    let Some(scheduler) = repository_inspection_scheduler() else {
        let rejected_count = repositories.len();
        for repository in repositories {
            let _ = on_event.send(ProjectRepositoryGitInspectionEvent {
                scan_id: scan_id.clone(),
                record: project_repository_git_inspection_error_record(
                    repository.repository_id,
                    ProjectRepositoryGitError::CommandFailed,
                ),
            });
        }
        return ProjectRepositoryGitInspectionSchedule {
            scheduled_count: 0,
            rejected_count,
        };
    };

    scheduler.schedule(scan_id, repositories, on_event)
}

#[tauri::command]
pub fn cancel_project_repositories_git_inspection(scan_id: String) {
    if is_valid_scan_id(&scan_id) {
        if let Some(scheduler) = repository_inspection_scheduler() {
            scheduler.cancel(&scan_id);
        }
    }
}

fn is_valid_scan_id(scan_id: &str) -> bool {
    !scan_id.is_empty()
        && scan_id.chars().count() <= REPOSITORY_INSPECTION_SCAN_ID_MAX_CHARS
        && scan_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn is_valid_repository_id(repository_id: &str) -> bool {
    !repository_id.is_empty()
        && repository_id.chars().count() <= REPOSITORY_INSPECTION_REPOSITORY_ID_MAX_CHARS
        && !repository_id.chars().any(char::is_control)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(repository_id: &str, path: &str) -> ProjectRepositoryGitInspectionRequest {
        ProjectRepositoryGitInspectionRequest {
            repository_id: repository_id.to_owned(),
            path: path.to_owned(),
        }
    }

    fn subscriber(scan_id: &str, repository_id: &str) -> InspectionSubscriber {
        InspectionSubscriber {
            scan_id: scan_id.to_owned(),
            repository_id: repository_id.to_owned(),
        }
    }

    #[test]
    fn queue_coalesces_same_path_and_keeps_each_subscriber() {
        let path = PathBuf::from("C:/workspace/repository");
        let mut queue = InspectionQueue::default();

        assert!(matches!(
            queue.enqueue(
                path.clone(),
                request("first", "C:/workspace/repository"),
                subscriber("scan-a", "first"),
                2,
            ),
            EnqueueResult::Scheduled
        ));
        assert!(matches!(
            queue.enqueue(
                path.clone(),
                request("second", "C:/workspace/repository"),
                subscriber("scan-b", "second"),
                2,
            ),
            EnqueueResult::Shared
        ));
        assert!(matches!(
            queue.enqueue(
                path.clone(),
                request("second", "C:/workspace/repository"),
                subscriber("scan-b", "second"),
                2,
            ),
            EnqueueResult::Duplicate
        ));

        assert_eq!(queue.jobs.len(), 1);
        assert_eq!(queue.jobs[&path].subscribers.len(), 2);
    }

    #[test]
    fn cancelling_a_scan_removes_only_its_queued_subscriptions() {
        let shared_path = PathBuf::from("C:/workspace/shared");
        let abandoned_path = PathBuf::from("C:/workspace/abandoned");
        let mut queue = InspectionQueue::default();
        queue.enqueue(
            shared_path.clone(),
            request("first", "C:/workspace/shared"),
            subscriber("scan-a", "first"),
            4,
        );
        queue.enqueue(
            shared_path.clone(),
            request("second", "C:/workspace/shared"),
            subscriber("scan-b", "second"),
            4,
        );
        queue.enqueue(
            abandoned_path.clone(),
            request("third", "C:/workspace/abandoned"),
            subscriber("scan-a", "third"),
            4,
        );

        queue.cancel_scan("scan-a");

        assert_eq!(queue.jobs.len(), 1);
        assert_eq!(
            queue.jobs[&shared_path].subscribers,
            vec![subscriber("scan-b", "second")]
        );
        assert!(!queue.jobs.contains_key(&abandoned_path));
    }

    #[test]
    fn bounded_queue_rejects_a_new_path_but_still_coalesces_an_existing_path() {
        let first_path = PathBuf::from("C:/workspace/first");
        let second_path = PathBuf::from("C:/workspace/second");
        let mut queue = InspectionQueue::default();
        queue.enqueue(
            first_path.clone(),
            request("first", "C:/workspace/first"),
            subscriber("scan-a", "first"),
            1,
        );

        assert!(matches!(
            queue.enqueue(
                second_path,
                request("second", "C:/workspace/second"),
                subscriber("scan-a", "second"),
                1,
            ),
            EnqueueResult::Full
        ));
        assert!(matches!(
            queue.enqueue(
                first_path,
                request("third", "C:/workspace/first"),
                subscriber("scan-b", "third"),
                1,
            ),
            EnqueueResult::Shared
        ));
    }

    #[test]
    fn queue_releases_the_next_path_before_the_prior_job_finishes() {
        let first_path = PathBuf::from("C:/workspace/slow");
        let second_path = PathBuf::from("C:/workspace/fast");
        let mut queue = InspectionQueue::default();
        queue.enqueue(
            first_path.clone(),
            request("slow", "C:/workspace/slow"),
            subscriber("scan-a", "slow"),
            2,
        );
        queue.enqueue(
            second_path.clone(),
            request("fast", "C:/workspace/fast"),
            subscriber("scan-a", "fast"),
            2,
        );

        assert_eq!(queue.next_request().map(|job| job.0), Some(first_path));
        assert_eq!(queue.next_request().map(|job| job.0), Some(second_path));
    }

    #[test]
    fn a_new_scan_can_join_a_running_job_after_the_old_scan_is_cancelled() {
        let path = PathBuf::from("C:/workspace/repository");
        let mut queue = InspectionQueue::default();
        queue.enqueue(
            path.clone(),
            request("old", "C:/workspace/repository"),
            subscriber("scan-old", "old"),
            2,
        );
        assert!(queue.next_request().is_some());

        queue.cancel_scan("scan-old");
        assert!(matches!(
            queue.enqueue(
                path.clone(),
                request("new", "C:/workspace/repository"),
                subscriber("scan-new", "new"),
                2,
            ),
            EnqueueResult::Shared
        ));

        assert_eq!(
            queue.finish(&path),
            vec![subscriber("scan-new", "new")]
        );
    }
}
