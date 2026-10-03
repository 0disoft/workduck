use super::super::{ensure_upstream_remote, read_git_remote_url};
use super::*;
use std::{
    process::{Command, Stdio},
    thread,
};

#[test]
fn worktree_remote_cache_refreshes_after_shared_config_changes() {
    let (_sandbox, repository, worktree) = create_linked_worktree_for_test();
    run_test_git(
        &repository,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/example/old.git",
        ],
    );
    let first = inspect_git_repository(&worktree).unwrap_or_else(|_| panic!("first inspection"));
    assert_eq!(
        first.origin_url.as_deref(),
        Some("https://github.com/example/old.git")
    );

    run_test_git(
        &repository,
        &[
            "remote",
            "set-url",
            "origin",
            "https://github.com/example/renamed.git",
        ],
    );
    let refreshed =
        inspect_git_repository(&worktree).unwrap_or_else(|_| panic!("refreshed inspection"));

    assert_eq!(
        refreshed.origin_url.as_deref(),
        Some("https://github.com/example/renamed.git")
    );
    reset_git_inspection_diagnostics();
    let cached = inspect_git_repository(&worktree).unwrap_or_else(|_| panic!("cached inspection"));
    assert_eq!(cached.origin_url, refreshed.origin_url);
    assert_eq!(read_git_inspection_diagnostics(), (1, 1));
}

#[test]
fn worktree_remote_cache_refreshes_after_worktree_config_changes() {
    let (_sandbox, repository, worktree) = create_linked_worktree_for_test();
    run_test_git(
        &repository,
        &["config", "extensions.worktreeConfig", "true"],
    );
    run_test_git(
        &worktree,
        &[
            "config",
            "--worktree",
            "remote.origin.url",
            "https://github.com/example/local.git",
        ],
    );
    let first = inspect_git_repository(&worktree).unwrap_or_else(|_| panic!("first inspection"));
    assert_eq!(
        first.origin_url.as_deref(),
        Some("https://github.com/example/local.git")
    );

    run_test_git(
        &worktree,
        &[
            "config",
            "--worktree",
            "remote.origin.url",
            "https://github.com/example/local-renamed.git",
        ],
    );
    let refreshed =
        inspect_git_repository(&worktree).unwrap_or_else(|_| panic!("refreshed inspection"));

    assert_eq!(
        refreshed.origin_url.as_deref(),
        Some("https://github.com/example/local-renamed.git")
    );
}

fn create_linked_worktree_for_test() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let sandbox = tempfile::tempdir().expect("worktree sandbox");
    let repository = sandbox.path().join("repo");
    let worktree = sandbox.path().join("linked");
    fs::create_dir(&repository).unwrap();
    run_test_git(&repository, &["init", "--quiet"]);
    run_test_git(
        &repository,
        &[
            "-c",
            "user.name=Workduck Test",
            "-c",
            "user.email=workduck@example.invalid",
            "commit",
            "--allow-empty",
            "--no-gpg-sign",
            "--quiet",
            "-m",
            "fixture",
        ],
    );
    run_test_git(
        &repository,
        &[
            "worktree",
            "add",
            "--quiet",
            "--detach",
            worktree.to_str().unwrap(),
            "HEAD",
        ],
    );
    let repository = fs::canonicalize(repository).unwrap();
    let worktree = fs::canonicalize(worktree).unwrap();
    (sandbox, repository, worktree)
}

fn run_test_git(repository: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(["-c", "core.hooksPath=", "-c", "commit.gpgSign=false"])
        .args(args)
        .current_dir(repository)
        .output()
        .expect("run fixture Git command");
    assert!(
        output.status.success(),
        "fixture Git failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn git_status_summary_reads_branch_counts_and_changes() {
    let summary = parse_git_status_summary(
        "# branch.oid 9fceb02\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -3\n1 .M N... 100644 100644 100644 abc def file.txt\n",
    );

    assert_eq!(summary.branch.as_deref(), Some("main"));
    assert_eq!(summary.ahead_count, 2);
    assert_eq!(summary.behind_count, 3);
    assert!(summary.has_uncommitted_changes);
}

#[test]
fn git_status_summary_ignores_detached_branch_head() {
    let summary = parse_git_status_summary(
        "# branch.oid 9fceb02\n# branch.head (detached)\n# branch.ab +0 -0\n",
    );

    assert_eq!(summary.branch, None);
    assert_eq!(summary.ahead_count, 0);
    assert_eq!(summary.behind_count, 0);
    assert!(!summary.has_uncommitted_changes);
}

#[test]
fn repository_git_inspection_diagnostics_count_commands_and_remote_cache_hits() {
    if !git_is_available() {
        return;
    }

    let repository = unique_test_directory("workduck-inspection-diagnostics");
    fs::create_dir_all(&repository).expect("create diagnostic repository");

    let init_status = Command::new("git")
        .arg("init")
        .current_dir(&repository)
        .status()
        .expect("initialize diagnostic repository");
    assert!(init_status.success());

    let repository = fs::canonicalize(repository).expect("canonical diagnostic repository");
    let request = || ProjectRepositoryGitInspectionRequest {
        repository_id: "diagnostic-repository".to_string(),
        path: repository.to_string_lossy().into_owned(),
    };

    let first = inspect_project_repository_git_record(request());
    let second = inspect_project_repository_git_record(request());

    assert_eq!(first.git_command_count, 2);
    assert_eq!(first.remote_cache_hit_count, 0);
    assert_eq!(second.git_command_count, 1);
    assert_eq!(second.remote_cache_hit_count, 1);
    assert!(first.inspection.ok);
    assert!(second.inspection.ok);

    let _ = fs::remove_dir_all(&repository);
}

#[test]
fn repository_git_inspection_does_not_modify_the_git_index() {
    if !git_is_available() {
        return;
    }

    let repository = unique_test_directory("workduck-inspection-index-invariant");
    fs::create_dir_all(&repository).expect("create index invariant repository");
    assert!(
        Command::new("git")
            .arg("init")
            .current_dir(&repository)
            .status()
            .expect("initialize index invariant repository")
            .success()
    );
    fs::write(repository.join("tracked.txt"), "tracked\n").expect("write tracked file");
    assert!(
        Command::new("git")
            .args(["add", "tracked.txt"])
            .current_dir(&repository)
            .status()
            .expect("stage tracked file")
            .success()
    );
    assert!(
        Command::new("git")
            .args([
                "-c",
                "user.name=Workduck Test",
                "-c",
                "user.email=workduck@example.invalid",
                "commit",
                "-m",
                "initial",
            ])
            .current_dir(&repository)
            .status()
            .expect("commit tracked file")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["config", "core.untrackedCache", "true"])
            .current_dir(&repository)
            .status()
            .expect("enable untracked cache")
            .success()
    );
    assert!(
        Command::new("git")
            .args(["status", "--porcelain=v2", "--untracked-files=normal"])
            .current_dir(&repository)
            .status()
            .expect("warm untracked cache")
            .success()
    );

    let index_path = repository.join(".git").join("index");
    let index_before = fs::read(&index_path).expect("read index before inspection");
    fs::create_dir_all(repository.join("untracked")).expect("create untracked directory");
    fs::write(repository.join("untracked").join("file.txt"), "untracked\n")
        .expect("write untracked file");

    let inspection = match inspect_git_repository(&repository) {
        Ok(inspection) => inspection,
        Err(_) => panic!("inspect repository"),
    };
    let index_after = fs::read(&index_path).expect("read index after inspection");

    assert!(inspection.has_uncommitted_changes);
    assert_eq!(index_after, index_before);

    let _ = fs::remove_dir_all(&repository);
}

#[test]
fn concurrent_repository_git_inspections_share_in_flight_result() {
    let repository_path = unique_test_directory("workduck-git-inspection-coalescing");
    fs::create_dir_all(&repository_path).expect("create inspection test directory");
    let repository_path = fs::canonicalize(&repository_path).expect("canonical repository path");
    let expected_inspection = ProjectRepositoryGitInspection {
        ok: true,
        is_git_repository: true,
        has_remote: false,
        origin_url: None,
        upstream_remote_url: None,
        ahead_count: 0,
        behind_count: 0,
        has_uncommitted_changes: true,
        branch: Some("main".to_string()),
        error: None,
    };
    let call_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let (leader_started_tx, leader_started_rx) = std::sync::mpsc::channel();
    let (release_leader_tx, release_leader_rx) = std::sync::mpsc::channel();
    let leader_path = repository_path.clone();
    let leader_call_count = std::sync::Arc::clone(&call_count);
    let leader_inspection = expected_inspection.clone();

    let leader = thread::spawn(move || {
        inspect_project_repository_git_coalesced_with(leader_path, move |_| {
            leader_call_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            leader_started_tx
                .send(())
                .expect("leader start signal sent");
            release_leader_rx
                .recv()
                .expect("leader release signal received");
            leader_inspection
        })
    });

    leader_started_rx.recv().expect("leader inspection started");

    let waiter_path = repository_path.clone();
    let waiter_call_count = std::sync::Arc::clone(&call_count);
    let waiter = thread::spawn(move || {
        inspect_project_repository_git_coalesced_with(waiter_path, move |_| {
            waiter_call_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            invalid_git_inspection(ProjectRepositoryGitError::CommandFailed)
        })
    });

    wait_until_git_inspection_has_waiter(&repository_path);
    release_leader_tx
        .send(())
        .expect("leader release signal sent");

    let leader_result = leader.join().expect("leader inspection completed");
    let waiter_result = waiter.join().expect("waiter inspection completed");
    fs::remove_dir_all(&repository_path).ok();

    assert_eq!(call_count.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert_eq!(leader_result, expected_inspection);
    assert_eq!(waiter_result, expected_inspection);
}

#[test]
fn repository_inspection_ignores_parent_work_tree() {
    if !git_is_available() {
        return;
    }

    let sandbox = unique_test_directory("workduck-parent-work-tree");
    let parent = sandbox.join("parent");
    let child = parent.join("child");

    fs::create_dir_all(&child).expect("create nested git test folder");

    let init_status = Command::new("git")
        .arg("init")
        .current_dir(&parent)
        .status()
        .expect("run git init");

    assert!(init_status.success());

    let inspection = match inspect_git_repository(&child) {
        Ok(inspection) => inspection,
        Err(_) => panic!("inspect nested folder"),
    };

    assert!(!inspection.is_git_repository);
    assert!(!inspection.has_remote);
    assert!(!inspection.has_uncommitted_changes);

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn repository_inspection_reports_valid_origin_and_upstream_remote_urls() {
    if !git_is_available() {
        return;
    }

    let sandbox = unique_test_directory("workduck-inspection-remotes");
    let repository = sandbox.join("repo");

    fs::create_dir_all(&repository).expect("create git test repository");

    let init_status = Command::new("git")
        .arg("init")
        .current_dir(&repository)
        .status()
        .expect("run git init");

    assert!(init_status.success());

    let add_origin_status = Command::new("git")
        .args([
            "remote",
            "add",
            "origin",
            "https://github.com/0disoft/workduck.git",
        ])
        .current_dir(&repository)
        .status()
        .expect("add origin remote");

    assert!(add_origin_status.success());

    let add_upstream_status = Command::new("git")
        .args([
            "remote",
            "add",
            "upstream",
            "https://github.com/example/workduck.git",
        ])
        .current_dir(&repository)
        .status()
        .expect("add upstream remote");

    assert!(add_upstream_status.success());

    let inspection = match inspect_git_repository(&repository) {
        Ok(inspection) => inspection,
        Err(_) => panic!("inspect git repository"),
    };

    assert!(inspection.is_git_repository);
    assert!(inspection.has_remote);
    assert_eq!(
        inspection.origin_url.as_deref(),
        Some("https://github.com/0disoft/workduck.git")
    );
    assert_eq!(
        inspection.upstream_remote_url.as_deref(),
        Some("https://github.com/example/workduck.git")
    );

    let update_origin_status = Command::new("git")
        .args([
            "remote",
            "set-url",
            "origin",
            "https://github.com/0disoft/workduck-renamed.git",
        ])
        .current_dir(&repository)
        .status()
        .expect("update origin remote");

    assert!(update_origin_status.success());

    let refreshed_inspection = match inspect_git_repository(&repository) {
        Ok(inspection) => inspection,
        Err(_) => panic!("reinspect git repository after config change"),
    };

    assert_eq!(
        refreshed_inspection.origin_url.as_deref(),
        Some("https://github.com/0disoft/workduck-renamed.git")
    );

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn repository_git_dir_resolver_supports_relative_worktree_markers() {
    let sandbox = unique_test_directory("workduck-relative-git-dir");
    let repository = sandbox.join("repo");
    let git_dir = sandbox.join("worktrees").join("repo");

    fs::create_dir_all(&repository).expect("create worktree directory");
    fs::create_dir_all(&git_dir).expect("create worktree git directory");
    fs::write(repository.join(".git"), "gitdir: ../worktrees/repo\n")
        .expect("write relative worktree marker");

    assert_eq!(
        resolve_repository_git_dir(&repository),
        Some(fs::canonicalize(git_dir).expect("canonical worktree git directory"))
    );

    let _ = fs::remove_dir_all(&sandbox);
}

#[test]
fn ensure_upstream_remote_adds_idempotently_and_rejects_different_url() {
    if !git_is_available() {
        return;
    }

    let sandbox = unique_test_directory("workduck-upstream-remote");
    let repository = sandbox.join("repo");

    fs::create_dir_all(&repository).expect("create git test repository");

    let init_status = Command::new("git")
        .arg("init")
        .current_dir(&repository)
        .status()
        .expect("run git init");

    assert!(init_status.success());

    assert!(ensure_upstream_remote(&repository, "https://github.com/openai/codex.git").is_ok());
    assert!(ensure_upstream_remote(&repository, "https://github.com/openai/codex").is_ok());
    assert!(ensure_upstream_remote(&repository, "https://github.com/example/other.git").is_err());

    let upstream_remote_url = match read_git_remote_url(&repository, "upstream") {
        Ok(Some(remote_url)) => remote_url,
        Ok(None) => panic!("upstream remote missing"),
        Err(_) => panic!("read upstream remote"),
    };

    assert_eq!(upstream_remote_url, "https://github.com/openai/codex.git");

    let _ = fs::remove_dir_all(&sandbox);
}

fn git_is_available() -> bool {
    Command::new("git")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn unique_test_directory(name: &str) -> PathBuf {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time after Unix epoch")
        .as_nanos();

    std::env::temp_dir().join(format!("{name}-{}-{timestamp}", std::process::id()))
}

fn wait_until_git_inspection_has_waiter(repository_path: &Path) {
    for _ in 0..1_000 {
        let has_waiter = {
            let in_flight_by_path = git_inspection_in_flight_by_path()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());

            in_flight_by_path
                .get(repository_path)
                .is_some_and(|in_flight| std::sync::Arc::strong_count(in_flight) > 2)
        };

        if has_waiter {
            return;
        }

        thread::yield_now();
    }

    panic!("repository git inspection waiter did not attach");
}
