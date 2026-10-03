// llmnav/1 module
// id=workduck.projects.git-inspection
// role=Inspect repository status and remotes with bounded read-only Git processes, shared in-flight requests, and cache diagnostics.
// owns=repository Git status parsing|inspection request coalescing|remote URL cache and diagnostics
// excludes=Git mutations|GitHub publication|clone credentials
// search=repository inspection cache|worktree remote URLs|coalesce Git status reads
// invariant=Inspections avoid credential helpers and index writes, and concurrent callers for one repository share the same in-flight result.
// stability=architecture
// /llmnav
use super::{
    GitCommandFailure, ProjectRepositoryGitError, ProjectRepositoryGitInspection,
    ProjectRepositoryGitInspectionRecord, ProjectRepositoryGitInspectionRequest,
    invalid_git_inspection,
};
use crate::git_path::{GitProcessError, run_git_inspection_process};
use crate::project_repository_validation::{validate_remote_url, validate_repository_path};
use std::{
    cell::Cell,
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    process::Output,
    sync::{Arc, Condvar, Mutex, OnceLock},
    time::{Duration, Instant, SystemTime},
};

const PROJECT_REPOSITORY_GIT_STATUS_TIMEOUT: Duration = Duration::from_secs(10);
const PROJECT_REPOSITORY_GIT_CONFIG_TIMEOUT: Duration = Duration::from_secs(3);
const PROJECT_REPOSITORY_REMOTE_CACHE_MAX_ENTRIES: usize = 512;
const PROJECT_REPOSITORY_REMOTE_CACHE_TTL: Duration = Duration::from_secs(30);

struct GitStatusSummary {
    branch: Option<String>,
    ahead_count: u32,
    behind_count: u32,
    has_uncommitted_changes: bool,
}

struct GitInspectionInFlight {
    result: Mutex<Option<ProjectRepositoryGitInspection>>,
    completed: Condvar,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct GitConfigFingerprint {
    length: u64,
    modified: Option<SystemTime>,
}

#[derive(Clone)]
struct GitRemoteUrlsCacheEntry {
    fingerprint: Option<GitConfigFingerprint>,
    remote_urls: HashMap<String, String>,
    cached_at: Instant,
}

thread_local! {
    static GIT_INSPECTION_COMMAND_COUNT: Cell<u32> = const { Cell::new(0) };
    static GIT_INSPECTION_REMOTE_CACHE_HIT_COUNT: Cell<u32> = const { Cell::new(0) };
}

pub(super) fn inspect_project_repository_git_blocking(
    path: String,
) -> ProjectRepositoryGitInspection {
    let repository_path = match validate_repository_path(&path) {
        Ok(repository_path) => repository_path,
        Err(error) => return invalid_git_inspection(error),
    };

    inspect_project_repository_git_coalesced(repository_path)
}

fn inspect_project_repository_git_coalesced(
    repository_path: PathBuf,
) -> ProjectRepositoryGitInspection {
    inspect_project_repository_git_coalesced_with(repository_path, |repository_path| {
        match inspect_git_repository(repository_path) {
            Ok(inspection) => inspection,
            Err(failure) => invalid_git_inspection(failure.error),
        }
    })
}

fn inspect_project_repository_git_coalesced_with<F>(
    repository_path: PathBuf,
    inspect: F,
) -> ProjectRepositoryGitInspection
where
    F: FnOnce(&Path) -> ProjectRepositoryGitInspection,
{
    let (in_flight, is_leader) = take_or_create_git_inspection_in_flight(&repository_path);

    if !is_leader {
        return wait_for_git_inspection_result(&in_flight);
    }

    let inspection =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| inspect(&repository_path)))
            .unwrap_or_else(|_| invalid_git_inspection(ProjectRepositoryGitError::CommandFailed));

    complete_git_inspection_in_flight(&repository_path, &in_flight, inspection.clone());
    inspection
}

fn take_or_create_git_inspection_in_flight(
    repository_path: &Path,
) -> (Arc<GitInspectionInFlight>, bool) {
    let mut in_flight_by_path = git_inspection_in_flight_by_path()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(in_flight) = in_flight_by_path.get(repository_path) {
        return (Arc::clone(in_flight), false);
    }

    let in_flight = Arc::new(GitInspectionInFlight {
        result: Mutex::new(None),
        completed: Condvar::new(),
    });
    in_flight_by_path.insert(repository_path.to_path_buf(), Arc::clone(&in_flight));

    (in_flight, true)
}

fn wait_for_git_inspection_result(
    in_flight: &GitInspectionInFlight,
) -> ProjectRepositoryGitInspection {
    let mut result = in_flight
        .result
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    loop {
        if let Some(inspection) = result.as_ref() {
            return inspection.clone();
        }

        result = in_flight
            .completed
            .wait(result)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
    }
}

fn complete_git_inspection_in_flight(
    repository_path: &Path,
    in_flight: &Arc<GitInspectionInFlight>,
    inspection: ProjectRepositoryGitInspection,
) {
    {
        let mut result = in_flight
            .result
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *result = Some(inspection);
        in_flight.completed.notify_all();
    }

    let mut in_flight_by_path = git_inspection_in_flight_by_path()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if in_flight_by_path
        .get(repository_path)
        .is_some_and(|current| Arc::ptr_eq(current, in_flight))
    {
        in_flight_by_path.remove(repository_path);
    }
}

fn git_inspection_in_flight_by_path() -> &'static Mutex<HashMap<PathBuf, Arc<GitInspectionInFlight>>>
{
    static GIT_INSPECTION_IN_FLIGHT_BY_PATH: OnceLock<
        Mutex<HashMap<PathBuf, Arc<GitInspectionInFlight>>>,
    > = OnceLock::new();

    GIT_INSPECTION_IN_FLIGHT_BY_PATH.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn inspect_project_repository_git_record(
    repository: ProjectRepositoryGitInspectionRequest,
) -> ProjectRepositoryGitInspectionRecord {
    let ProjectRepositoryGitInspectionRequest {
        repository_id,
        path,
    } = repository;
    reset_git_inspection_diagnostics();
    let started_at = Instant::now();
    let inspection =
        std::panic::catch_unwind(move || inspect_project_repository_git_blocking(path))
            .unwrap_or_else(|_| invalid_git_inspection(ProjectRepositoryGitError::CommandFailed));
    let elapsed_ms = duration_millis_u64(started_at.elapsed());
    let (git_command_count, remote_cache_hit_count) = read_git_inspection_diagnostics();

    ProjectRepositoryGitInspectionRecord {
        repository_id,
        inspection,
        git_command_count,
        remote_cache_hit_count,
        elapsed_ms,
    }
}

pub(crate) fn project_repository_git_inspection_error_record(
    repository_id: String,
    error: ProjectRepositoryGitError,
) -> ProjectRepositoryGitInspectionRecord {
    ProjectRepositoryGitInspectionRecord {
        repository_id,
        inspection: invalid_git_inspection(error),
        git_command_count: 0,
        remote_cache_hit_count: 0,
        elapsed_ms: 0,
    }
}

fn reset_git_inspection_diagnostics() {
    GIT_INSPECTION_COMMAND_COUNT.set(0);
    GIT_INSPECTION_REMOTE_CACHE_HIT_COUNT.set(0);
}

fn read_git_inspection_diagnostics() -> (u32, u32) {
    (
        GIT_INSPECTION_COMMAND_COUNT.get(),
        GIT_INSPECTION_REMOTE_CACHE_HIT_COUNT.get(),
    )
}

fn duration_millis_u64(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

fn inspect_git_repository(
    repository_path: &Path,
) -> Result<ProjectRepositoryGitInspection, GitCommandFailure> {
    if !has_repository_git_marker(repository_path)? {
        return Ok(not_git_repository_inspection());
    }

    let status = read_git_status_summary(repository_path)?;

    let remote_urls = read_valid_git_remote_urls(repository_path)?;
    let origin_url = remote_urls.get("origin").cloned();
    let upstream_remote_url = remote_urls.get("upstream").cloned();
    let has_remote = origin_url.is_some();

    Ok(ProjectRepositoryGitInspection {
        ok: true,
        is_git_repository: true,
        has_remote,
        origin_url,
        upstream_remote_url,
        ahead_count: if has_remote { status.ahead_count } else { 0 },
        behind_count: if has_remote { status.behind_count } else { 0 },
        has_uncommitted_changes: status.has_uncommitted_changes,
        branch: status.branch,
        error: None,
    })
}

fn not_git_repository_inspection() -> ProjectRepositoryGitInspection {
    ProjectRepositoryGitInspection {
        ok: true,
        is_git_repository: false,
        has_remote: false,
        origin_url: None,
        upstream_remote_url: None,
        ahead_count: 0,
        behind_count: 0,
        has_uncommitted_changes: false,
        branch: None,
        error: None,
    }
}

fn read_git_status_summary(repository_path: &Path) -> Result<GitStatusSummary, GitCommandFailure> {
    let output = run_git_inspection_command(
        repository_path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=normal",
        ],
        PROJECT_REPOSITORY_GIT_STATUS_TIMEOUT,
    )?;

    if !output.status.success() {
        return Err(GitCommandFailure {
            error: ProjectRepositoryGitError::CommandFailed,
        });
    }

    Ok(parse_git_status_summary(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn has_repository_git_marker(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    match fs::symlink_metadata(repository_path.join(".git")) {
        Ok(metadata) => {
            Ok(metadata.is_dir() || metadata.is_file() || metadata.file_type().is_symlink())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(GitCommandFailure {
            error: match error.kind() {
                io::ErrorKind::PermissionDenied => ProjectRepositoryGitError::PathPermissionDenied,
                _ => ProjectRepositoryGitError::PathUnreadable,
            },
        }),
    }
}

fn parse_git_status_summary(output: &str) -> GitStatusSummary {
    let mut branch = None;
    let mut ahead_count = 0;
    let mut behind_count = 0;
    let mut has_uncommitted_changes = false;

    for line in output.lines() {
        if let Some(head) = line.strip_prefix("# branch.head ") {
            let head = head.trim();

            if !head.is_empty() && head != "(detached)" {
                branch = Some(head.to_owned());
            }
            continue;
        }

        if let Some(ahead_behind) = line.strip_prefix("# branch.ab ") {
            let (ahead, behind) = parse_git_branch_ahead_behind(ahead_behind);
            ahead_count = ahead;
            behind_count = behind;
            continue;
        }

        if !line.starts_with('#') && !line.trim().is_empty() {
            has_uncommitted_changes = true;
        }
    }

    GitStatusSummary {
        branch,
        ahead_count,
        behind_count,
        has_uncommitted_changes,
    }
}

fn parse_git_branch_ahead_behind(output: &str) -> (u32, u32) {
    let mut ahead_count = 0;
    let mut behind_count = 0;

    for part in output.split_whitespace() {
        if let Some(value) = part.strip_prefix('+') {
            ahead_count = value.parse::<u32>().unwrap_or(0);
        } else if let Some(value) = part.strip_prefix('-') {
            behind_count = value.parse::<u32>().unwrap_or(0);
        }
    }

    (ahead_count, behind_count)
}

pub(super) fn is_git_repository(repository_path: &Path) -> Result<bool, GitCommandFailure> {
    let output = run_git_inspection_command(
        repository_path,
        &["rev-parse", "--show-toplevel"],
        PROJECT_REPOSITORY_GIT_CONFIG_TIMEOUT,
    )?;

    if !output.status.success() {
        return Ok(false);
    }

    let work_tree_root = String::from_utf8_lossy(&output.stdout).trim().to_owned();

    if work_tree_root.is_empty() {
        return Ok(false);
    }

    paths_refer_to_same_directory(repository_path, Path::new(&work_tree_root))
}

fn paths_refer_to_same_directory(left: &Path, right: &Path) -> Result<bool, GitCommandFailure> {
    let left = canonicalize_git_path(left)?;
    let right = canonicalize_git_path(right)?;

    Ok(paths_match(&left, &right))
}

fn canonicalize_git_path(path: &Path) -> Result<PathBuf, GitCommandFailure> {
    fs::canonicalize(path).map_err(|error| GitCommandFailure {
        error: match error.kind() {
            io::ErrorKind::NotFound => ProjectRepositoryGitError::PathNotFound,
            io::ErrorKind::PermissionDenied => ProjectRepositoryGitError::PathPermissionDenied,
            _ => ProjectRepositoryGitError::PathUnreadable,
        },
    })
}

#[cfg(target_os = "windows")]
fn paths_match(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

#[cfg(not(target_os = "windows"))]
fn paths_match(left: &Path, right: &Path) -> bool {
    left == right
}

fn read_valid_git_remote_urls(
    repository_path: &Path,
) -> Result<HashMap<String, String>, GitCommandFailure> {
    let fingerprint = read_git_config_fingerprint(repository_path);

    if let Some(cached) = git_remote_urls_cache()
        .lock()
        .expect("git remote URL cache lock poisoned")
        .get(repository_path)
        .filter(|entry| {
            entry.fingerprint == fingerprint
                && entry.cached_at.elapsed() < PROJECT_REPOSITORY_REMOTE_CACHE_TTL
        })
        .cloned()
    {
        GIT_INSPECTION_REMOTE_CACHE_HIT_COUNT.with(|count| {
            count.set(count.get().saturating_add(1));
        });
        return Ok(cached.remote_urls);
    }

    let remote_urls = read_valid_git_remote_urls_uncached(repository_path)?;
    let mut cache = git_remote_urls_cache()
        .lock()
        .expect("git remote URL cache lock poisoned");
    if cache.len() >= PROJECT_REPOSITORY_REMOTE_CACHE_MAX_ENTRIES
        && !cache.contains_key(repository_path)
    {
        cache.clear();
    }
    cache.insert(
        repository_path.to_path_buf(),
        GitRemoteUrlsCacheEntry {
            fingerprint,
            remote_urls: remote_urls.clone(),
            cached_at: Instant::now(),
        },
    );

    Ok(remote_urls)
}

fn read_valid_git_remote_urls_uncached(
    repository_path: &Path,
) -> Result<HashMap<String, String>, GitCommandFailure> {
    let output = run_git_inspection_command(
        repository_path,
        &["config", "--get-regexp", r"^remote\..*\.url$"],
        PROJECT_REPOSITORY_GIT_CONFIG_TIMEOUT,
    )?;

    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let mut remote_urls = HashMap::new();

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((key, remote_url)) = line.split_once(' ') else {
            continue;
        };
        let Some(remote_name) = key
            .strip_prefix("remote.")
            .and_then(|key| key.strip_suffix(".url"))
        else {
            continue;
        };
        let remote_url = remote_url.trim();

        if let Ok(remote_url) = validate_remote_url(remote_url) {
            remote_urls.insert(remote_name.to_owned(), remote_url);
        }
    }

    Ok(remote_urls)
}

fn read_git_config_fingerprint(repository_path: &Path) -> Option<GitConfigFingerprint> {
    let config_path = resolve_repository_git_dir(repository_path)?.join("config");
    let metadata = fs::metadata(config_path).ok()?;

    Some(GitConfigFingerprint {
        length: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

fn resolve_repository_git_dir(repository_path: &Path) -> Option<PathBuf> {
    let git_marker = repository_path.join(".git");
    let metadata = fs::symlink_metadata(&git_marker).ok()?;

    if metadata.is_dir() {
        return Some(canonicalize_existing_path_or_keep(git_marker));
    }

    if !metadata.is_file() {
        return None;
    }

    let marker = fs::read_to_string(git_marker).ok()?;
    let git_dir = marker.trim().strip_prefix("gitdir:")?.trim();
    let git_dir = Path::new(git_dir);

    let git_dir = if git_dir.is_absolute() {
        git_dir.to_path_buf()
    } else {
        repository_path.join(git_dir)
    };

    Some(canonicalize_existing_path_or_keep(git_dir))
}

fn canonicalize_existing_path_or_keep(path: PathBuf) -> PathBuf {
    fs::canonicalize(&path).unwrap_or(path)
}

fn git_remote_urls_cache() -> &'static Mutex<HashMap<PathBuf, GitRemoteUrlsCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, GitRemoteUrlsCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn run_git_inspection_command(
    repository_path: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<Output, GitCommandFailure> {
    record_git_inspection_command();
    run_git_inspection_process(repository_path, args.iter().copied(), timeout).map_err(|error| {
        GitCommandFailure {
            error: match error {
                GitProcessError::Spawn(error) if error.kind() == io::ErrorKind::NotFound => {
                    ProjectRepositoryGitError::CommandUnavailable
                }
                GitProcessError::Spawn(_) | GitProcessError::Failed => {
                    ProjectRepositoryGitError::CommandFailed
                }
                GitProcessError::TimedOut => ProjectRepositoryGitError::CommandTimedOut,
            },
        }
    })
}

pub(super) fn record_git_inspection_command() {
    GIT_INSPECTION_COMMAND_COUNT.with(|count| {
        count.set(count.get().saturating_add(1));
    });
}

#[cfg(test)]
#[path = "project_repository_inspection_tests.rs"]
mod tests;
