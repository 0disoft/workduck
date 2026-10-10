use super::commands::{
    PackageManager, PackageProject, resolve_package_dev_server_command,
    resolve_package_task_command,
};
use super::*;

#[test]
fn oversized_task_record_writes_preserve_the_last_readable_record() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("run.json");
    let record = ProjectRepositoryTaskRunRecord {
        record_path: path.to_string_lossy().into_owned(),
        ..task_run_record(
            "run",
            &directory.path().to_string_lossy(),
            "2026-10-10T00:00:00Z",
        )
    };
    assert!(write_task_run_record(&path, &record).is_ok());
    let original = fs::read(&path).unwrap();
    let oversized = ProjectRepositoryTaskRunRecord {
        output_tail: Some("\u{0001}".repeat(200_000)),
        ..record
    };
    assert!(matches!(
        write_task_run_record(&path, &oversized),
        Err(ProjectRepositoryTaskError::RecordWriteFailed)
    ));
    assert_eq!(fs::read(&path).unwrap(), original);
}

#[cfg(target_os = "windows")]
#[test]
fn staged_powershell_process_identity_rejects_reused_pids_and_malformed_loaders() {
    let record = task_run_record("run-original", "C:/workspace/repo", "2026-10-10T00:00:00Z");
    let path = Path::new("C:/workspace/repo/script.tmp");
    let loader = create_powershell_script_loader(path, &record.id);
    let process = live_task_process(42, None, &encoded_powershell_command_line(&loader));
    assert!(live_process_matches_task_record(&process, &record));
    let replacement = ProjectRepositoryTaskRunRecord {
        id: "run-replacement".into(),
        ..record.clone()
    };
    assert!(!live_process_matches_task_record(&process, &replacement));
    let malformed = live_task_process(
        42,
        None,
        &encoded_powershell_command_line(
            "$workduckTaskRunId = 'run-original'; Write-Output 'C:/workspace/repo';",
        ),
    );
    assert!(!live_process_matches_task_record(&malformed, &record));
    let quoted_path = Path::new("C:/workspace/$workduckTaskRunId = 'quoted'");
    let direct = create_powershell_script(quoted_path, Some("Write-Output 'ok'"), Some(&record));
    assert!(live_process_matches_task_record(
        &live_task_process(42, None, &encoded_powershell_command_line(&direct)),
        &record
    ));
}

#[test]
fn reconciliation_cannot_write_to_a_path_supplied_inside_a_record() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let path = workspace.join("running.json");
    let unrelated = workspace.join("unrelated.json");
    fs::write(&unrelated, b"preserve unrelated file").unwrap();
    let mut running = task_run_record(
        "running",
        &visible.join("repo").to_string_lossy(),
        "2026-10-01T00:00:00Z",
    );
    running.state = "running".into();
    running.finished_at = None;
    running.exit_code = None;
    running.record_path = unrelated.to_string_lossy().into_owned();
    fs::write(&path, serde_json::to_vec(&running).unwrap()).unwrap();
    let loaded = read_visible_task_run_record(&path, &visible).expect("visible run");
    let records = refresh_running_task_run_records(vec![loaded], || Ok(Vec::new()));
    assert_eq!(records[0].state, "stopped");
    assert_eq!(fs::read(&unrelated).unwrap(), b"preserve unrelated file");
    let stored: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(stored["state"], "running");
}

#[test]
fn completed_records_do_not_enumerate_system_processes() {
    let completed = task_run_record("done", "C:/workspace/repo", "2026-10-01T00:00:00Z");
    let mut stopped = completed.clone();
    stopped.id = "already-stopped".into();
    stopped.state = "stopped".into();
    let records = refresh_running_task_run_records(vec![completed, stopped], || {
        panic!("completed records must not enumerate system processes")
    });
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].state, "succeeded");
    assert_eq!(records[1].state, "stopped");
}

#[test]
fn latest_task_records_ignore_copies_with_mismatched_identity() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let dir = task_run_record_dir(&workspace);
    fs::create_dir_all(&dir).unwrap();
    let completed = task_run_record(
        "build-1",
        &visible.join("repo").to_string_lossy(),
        "2026-10-01T00:00:00Z",
    );
    fs::write(
        dir.join("build-1.json"),
        serde_json::to_vec(&completed).unwrap(),
    )
    .unwrap();
    let mut copied = completed.clone();
    copied.started_at = "2026-10-02T00:00:00Z".into();
    copied.state = "failed".into();
    copied.exit_code = Some(1);
    let copy_path = dir.join("build-1-backup.json");
    let copy_bytes = serde_json::to_vec(&copied).unwrap();
    fs::write(&copy_path, &copy_bytes).unwrap();

    let latest = read_latest_cached_task_run_records(&dir, &visible)
        .unwrap_or_else(|_| panic!("read latest records"));
    assert_eq!(latest.len(), 1);
    assert_eq!(latest[0].started_at, completed.started_at);
    assert_eq!(latest[0].exit_code, Some(0));
    let selected = history::read_selected_task_run_records(&workspace, &[latest[0].id.clone()])
        .unwrap_or_else(|_| panic!("read displayed run by identity"));
    assert_eq!(selected[0].started_at, latest[0].started_at);
    assert_eq!(selected[0].exit_code, latest[0].exit_code);
    assert_eq!(fs::read(&copy_path).unwrap(), copy_bytes);
}

#[test]
fn latest_task_records_reject_ids_that_history_cannot_select() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    for id in ["", "실행-1", "run.with.dots"] {
        let path = workspace.join(format!("{id}.json"));
        let completed = task_run_record(
            id,
            &visible.join("repo").to_string_lossy(),
            "2026-10-01T00:00:00Z",
        );
        fs::write(&path, serde_json::to_vec(&completed).unwrap()).unwrap();
        assert!(
            read_visible_task_run_record(&path, &visible).is_none(),
            "unselectable run ID: {id:?}"
        );
    }
}

#[test]
fn reconciliation_preserves_both_stored_and_projected_stopped_records() {
    let temp = tempfile::tempdir().unwrap();
    let old_path = temp.path().join("already-stopped.json");
    let new_path = temp.path().join("running.json");
    let mut old = task_run_record(
        "already-stopped",
        "C:/workspace/repo",
        "2026-10-01T00:00:00Z",
    );
    old.state = "stopped".into();
    old.record_path = old_path.to_string_lossy().into_owned();
    let mut running = task_run_record("running", "C:/workspace/repo", "2026-10-02T00:00:00Z");
    running.state = "running".into();
    running.finished_at = None;
    running.exit_code = None;
    running.record_path = new_path.to_string_lossy().into_owned();
    let original = serde_json::to_vec(&old).unwrap();
    let original_running = serde_json::to_vec(&running).unwrap();
    fs::write(&old_path, &original).unwrap();
    fs::write(&new_path, &original_running).unwrap();
    let records = refresh_running_task_run_records(vec![old, running], || Ok(Vec::new()));
    assert!(records.iter().all(|record| record.state == "stopped"));
    assert_eq!(fs::read(old_path).unwrap(), original);
    assert_eq!(fs::read(new_path).unwrap(), original_running);
    assert!(records[1].finished_at.is_some());
}

#[test]
fn projected_stopped_reads_preserve_the_file_and_populate_a_stable_cache() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let dir = task_run_record_dir(&workspace);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("stopped.json");
    let mut stopped = task_run_record(
        "stopped",
        &visible.join("repo").to_string_lossy(),
        "2026-10-01T00:00:00Z",
    );
    stopped.state = "running".into();
    stopped.finished_at = None;
    stopped.exit_code = None;
    stopped.record_path = path.to_string_lossy().into_owned();
    let original = serde_json::to_vec(&stopped).unwrap();
    fs::write(&path, &original).unwrap();
    for _ in 0..2 {
        let records = read_latest_cached_task_run_records(&dir, &visible)
            .unwrap_or_else(|_| panic!("read stopped records"));
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].state, "stopped");
        assert_eq!(fs::read(&path).unwrap(), original);
    }
    let cache = workspace_task_run_record_cache(&dir).unwrap_or_else(|_| panic!("workspace cache"));
    let cache = cache.lock().unwrap();
    let metadata = fs::metadata(&dir).unwrap();
    assert!(cache.is_fresh(&dir, metadata.len(), metadata.modified().ok()));
}

#[test]
fn cached_completed_record_changes_are_visible_without_directory_changes() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let dir = task_run_record_dir(&workspace);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("completed.json");
    let mut record = task_run_record(
        "completed",
        &visible.join("repo").to_string_lossy(),
        "2026-10-01T00:00:00Z",
    );
    record.record_path = path.to_string_lossy().into_owned();
    fs::write(&path, serde_json::to_vec(&record).unwrap()).unwrap();
    let initial = read_latest_cached_task_run_records(&dir, &visible)
        .unwrap_or_else(|_| panic!("read initial completed record"));
    assert_eq!(initial[0].state, "succeeded");
    let directory_modified = fs::metadata(&dir).unwrap().modified().unwrap();

    record.state = "failed".into();
    record.exit_code = Some(1);
    record.output_tail = Some("updated execution result".into());
    fs::write(&path, serde_json::to_vec(&record).unwrap()).unwrap();
    assert_eq!(
        fs::metadata(&dir).unwrap().modified().unwrap(),
        directory_modified
    );
    let updated = read_latest_cached_task_run_records(&dir, &visible)
        .unwrap_or_else(|_| panic!("read updated completed record"));
    assert_eq!(updated[0].state, "failed");
    assert_eq!(updated[0].exit_code, Some(1));
    assert_eq!(updated[0].output_tail, record.output_tail);
}

#[test]
fn transient_invalid_record_does_not_remain_hidden_in_the_cache() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let dir = task_run_record_dir(&workspace);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("completed.json");
    fs::write(&path, b"{").unwrap();
    let initial = read_latest_cached_task_run_records(&dir, &visible)
        .unwrap_or_else(|_| panic!("read partially written record"));
    assert!(initial.is_empty());
    let directory_modified = fs::metadata(&dir).unwrap().modified().unwrap();

    let record = task_run_record(
        "completed",
        &visible.join("repo").to_string_lossy(),
        "2026-10-01T00:00:00Z",
    );
    fs::write(&path, serde_json::to_vec(&record).unwrap()).unwrap();
    assert_eq!(
        fs::metadata(&dir).unwrap().modified().unwrap(),
        directory_modified
    );
    let recovered = read_latest_cached_task_run_records(&dir, &visible)
        .unwrap_or_else(|_| panic!("reread completed record"));
    assert_eq!(recovered.len(), 1);
    assert_eq!(recovered[0].id, "completed");
    assert_eq!(recovered[0].state, "succeeded");
}

#[test]
fn latest_task_run_records_keep_newest_record_per_repository() {
    let records = latest_task_run_records_by_repository(vec![
        task_run_record("repo-a-old", "C:/workspace/repo-a", "2026-05-23T01:00:00Z"),
        task_run_record("repo-b", "C:/workspace/repo-b", "2026-05-23T02:00:00Z"),
        task_run_record("repo-a-new", "C:/workspace/repo-a", "2026-05-23T03:00:00Z"),
    ]);

    let ids = records
        .iter()
        .map(|record| record.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["repo-a-new", "repo-b"]);
}

#[test]
fn task_run_record_caches_are_shared_per_workspace_only() {
    let token = current_task_run_timestamp().replace([':', '.'], "-");
    let first_path = PathBuf::from(format!("workspace-a-{token}"));
    let second_path = PathBuf::from(format!("workspace-b-{token}"));

    let first = match workspace_task_run_record_cache(&first_path) {
        Ok(cache) => cache,
        Err(_) => panic!("first workspace cache"),
    };
    let first_again = match workspace_task_run_record_cache(&first_path) {
        Ok(cache) => cache,
        Err(_) => panic!("same workspace cache"),
    };
    let second = match workspace_task_run_record_cache(&second_path) {
        Ok(cache) => cache,
        Err(_) => panic!("second workspace cache"),
    };

    assert!(Arc::ptr_eq(&first, &first_again));
    assert!(!Arc::ptr_eq(&first, &second));
}

#[test]
fn latest_task_run_records_use_id_as_timestamp_tie_breaker() {
    let records = latest_task_run_records_by_repository(vec![
        task_run_record("repo-a-1", "C:/workspace/repo-a", "2026-05-23T01:00:00Z"),
        task_run_record("repo-a-2", "C:/workspace/repo-a", "2026-05-23T01:00:00Z"),
    ]);

    assert_eq!(records[0].id, "repo-a-2");
}

pub(super) fn task_run_record(
    id: &str,
    repository_path: &str,
    started_at: &str,
) -> ProjectRepositoryTaskRunRecord {
    ProjectRepositoryTaskRunRecord {
        id: id.to_owned(),
        task: ProjectRepositoryTask::Build.as_str().to_owned(),
        repository_path: repository_path.to_owned(),
        command: "bun run build".to_owned(),
        state: "succeeded".to_owned(),
        process_id: None,
        exit_code: Some(0),
        started_at: started_at.to_owned(),
        finished_at: Some(started_at.to_owned()),
        output_tail: None,
        record_path: format!("{id}.json"),
    }
}

fn temp_repository_path(name: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let repository_path = std::env::temp_dir().join(format!(
        "workduck-project-repository-task-{name}-{}-{nanos}",
        std::process::id()
    ));

    fs::create_dir_all(&repository_path).expect("create temporary repository");

    repository_path
}

fn live_task_process(
    pid: u32,
    parent_process_id: Option<u32>,
    command_line: &str,
) -> LiveTaskProcess {
    LiveTaskProcess {
        pid,
        parent_process_id,
        command_line: command_line.to_owned(),
    }
}

#[test]
fn package_dev_server_command_uses_start_script_when_dev_is_missing() {
    let project = PackageProject {
        package_manager: PackageManager::Bun,
        scripts: HashMap::from([("start".to_owned(), "bun server.ts".to_owned())]),
        local_dependency_paths: Vec::new(),
    };

    let command = match resolve_package_dev_server_command(&project) {
        Ok(command) => command,
        Err(_) => panic!("resolve command"),
    };

    assert_eq!(command, Some("bun run start".to_owned()));
}

#[test]
fn package_dev_server_command_prefers_dev_over_start() {
    let project = PackageProject {
        package_manager: PackageManager::Bun,
        scripts: HashMap::from([
            ("dev".to_owned(), "vite dev".to_owned()),
            ("start".to_owned(), "bun server.ts".to_owned()),
        ]),
        local_dependency_paths: Vec::new(),
    };

    let command = match resolve_package_dev_server_command(&project) {
        Ok(command) => command,
        Err(_) => panic!("resolve command"),
    };

    assert_eq!(command, Some("bun run dev".to_owned()));
}

#[test]
fn package_dev_server_command_prefers_desktop_dev_over_web_dev() {
    let project = PackageProject {
        package_manager: PackageManager::Bun,
        scripts: HashMap::from([
            ("desktop:dev".to_owned(), "tauri dev".to_owned()),
            ("dev".to_owned(), "vite dev".to_owned()),
            ("start".to_owned(), "bun server.ts".to_owned()),
        ]),
        local_dependency_paths: Vec::new(),
    };

    let command = match resolve_package_dev_server_command(&project) {
        Ok(command) => command,
        Err(_) => panic!("resolve command"),
    };

    assert_eq!(command, Some("bun run desktop:dev".to_owned()));
}

#[test]
fn package_preview_command_uses_preview_script() {
    let project = PackageProject {
        package_manager: PackageManager::Bun,
        scripts: HashMap::from([("preview".to_owned(), "vite preview".to_owned())]),
        local_dependency_paths: Vec::new(),
    };

    let command = match resolve_package_task_command(ProjectRepositoryTask::Preview, &project) {
        Ok(command) => command,
        Err(_) => panic!("resolve command"),
    };

    assert_eq!(command, Some("bun run preview".to_owned()));
}

#[test]
fn package_preview_command_is_missing_without_preview_script() {
    let project = PackageProject {
        package_manager: PackageManager::Bun,
        scripts: HashMap::from([("build".to_owned(), "vite build".to_owned())]),
        local_dependency_paths: Vec::new(),
    };

    let command = match resolve_package_task_command(ProjectRepositoryTask::Preview, &project) {
        Ok(command) => command,
        Err(_) => panic!("resolve command"),
    };

    assert_eq!(command, None);
}

#[test]
fn repository_task_commands_prefer_root_script_over_nested_package_scripts() {
    let repository_path = temp_repository_path("root-script");
    fs::create_dir_all(repository_path.join("apps/workbench")).expect("create nested package");
    fs::write(
        repository_path.join("package.json"),
        r#"{
            "packageManager": "bun@1.0.0",
            "scripts": {
                "dev": "bun run ./scripts/dev-workbench.ts",
                "build": "bun run ./scripts/build-workbench.ts",
                "preview": "bun run ./scripts/preview-workbench.ts"
            }
        }"#,
    )
    .expect("write root package");
    fs::write(
        repository_path.join("apps/workbench/package.json"),
        r#"{
            "packageManager": "bun@1.0.0",
            "scripts": {
                "dev": "astro dev",
                "build": "astro build",
                "preview": "astro preview"
            }
        }"#,
    )
    .expect("write nested package");

    let dev_commands = match resolve_repository_task_commands(
        ProjectRepositoryTask::StartDevServer,
        &repository_path,
    ) {
        Ok(commands) => commands,
        Err(_) => panic!("resolve dev command"),
    };
    let build_commands =
        match resolve_repository_task_commands(ProjectRepositoryTask::Build, &repository_path) {
            Ok(commands) => commands,
            Err(_) => panic!("resolve build command"),
        };
    let preview_commands =
        match resolve_repository_task_commands(ProjectRepositoryTask::Preview, &repository_path) {
            Ok(commands) => commands,
            Err(_) => panic!("resolve preview command"),
        };

    assert_eq!(dev_commands, vec!["bun run dev"]);
    assert_eq!(build_commands, vec!["bun run build"]);
    assert_eq!(preview_commands, vec!["bun run preview"]);

    let _ = fs::remove_dir_all(repository_path);
}

#[test]
fn repository_task_commands_use_desktop_dev_without_extra_cargo_run() {
    let repository_path = temp_repository_path("tauri-desktop-dev");
    fs::create_dir_all(repository_path.join("src-tauri")).expect("create tauri package");
    fs::write(
        repository_path.join("package.json"),
        r#"{
            "packageManager": "bun@1.0.0",
            "scripts": {
                "dev": "vite --host 127.0.0.1 --port 5173 --strictPort",
                "desktop:dev": "tauri dev"
            }
        }"#,
    )
    .expect("write package");
    fs::write(
        repository_path.join("src-tauri/Cargo.toml"),
        r#"[package]
name = "tauri-desktop-dev"
version = "0.1.0"
edition = "2021"
"#,
    )
    .expect("write cargo manifest");

    let commands = match resolve_repository_task_commands(
        ProjectRepositoryTask::StartDevServer,
        &repository_path,
    ) {
        Ok(commands) => commands,
        Err(_) => panic!("resolve dev command"),
    };

    assert_eq!(commands, vec!["bun run desktop:dev"]);

    let _ = fs::remove_dir_all(repository_path);
}

#[test]
fn repository_task_commands_use_wails_desktop_dev_without_extra_go_run() {
    let repository_path = temp_repository_path("wails-desktop-dev");
    fs::create_dir_all(repository_path.join("frontend")).expect("create frontend package");
    fs::write(
        repository_path.join("package.json"),
        r#"{
            "packageManager": "npm@11.0.0",
            "scripts": {
                "desktop:dev": "wails3 dev -config ./build/config.yml -port 9245"
            }
        }"#,
    )
    .expect("write root package");
    fs::write(
        repository_path.join("frontend/package.json"),
        r#"{
            "scripts": {
                "dev": "vite"
            }
        }"#,
    )
    .expect("write frontend package");
    fs::write(
        repository_path.join("go.mod"),
        r#"module github.com/0disoft/zdp-desktop-wails

go 1.25
"#,
    )
    .expect("write go module");

    let commands = match resolve_repository_task_commands(
        ProjectRepositoryTask::StartDevServer,
        &repository_path,
    ) {
        Ok(commands) => commands,
        Err(_) => panic!("resolve dev command"),
    };

    assert_eq!(commands, vec!["npm run desktop:dev"]);

    let _ = fs::remove_dir_all(repository_path);
}

#[test]
fn install_dependency_commands_skip_local_file_package_targets() {
    let repository_path = temp_repository_path("local-file-dependencies");
    fs::create_dir_all(repository_path.join("apps/workbench")).expect("create nested package");
    fs::create_dir_all(repository_path.join("scripts/telemetry")).expect("create local package");
    fs::write(
        repository_path.join("package.json"),
        r#"{
            "packageManager": "bun@1.0.0",
            "dependencies": {
                "@taskmesh/telemetry": "file:./scripts/telemetry"
            }
        }"#,
    )
    .expect("write root package");
    fs::write(
        repository_path.join("apps/workbench/package.json"),
        r#"{
            "packageManager": "bun@1.0.0",
            "devDependencies": {
                "@taskmesh/telemetry": "file:../../scripts/telemetry"
            }
        }"#,
    )
    .expect("write nested package");
    fs::write(
        repository_path.join("scripts/telemetry/package.json"),
        r#"{
            "name": "@taskmesh/telemetry",
            "version": "0.0.0"
        }"#,
    )
    .expect("write local package");

    let commands = match resolve_repository_task_commands(
        ProjectRepositoryTask::InstallDependencies,
        &repository_path,
    ) {
        Ok(commands) => commands,
        Err(_) => panic!("resolve install commands"),
    };

    assert_eq!(
        commands,
        vec![
            "bun install",
            "Push-Location -LiteralPath 'apps/workbench' -ErrorAction Stop; try { bun install } finally { Pop-Location }"
        ]
    );

    let _ = fs::remove_dir_all(repository_path);
}

#[cfg(target_os = "windows")]
#[test]
fn attaching_task_process_identity_never_overwrites_a_completed_record() {
    for state in ["succeeded", "failed"] {
        let workspace = tempfile::tempdir().unwrap();
        let path = workspace.path().join("run.json");
        let mut completed = task_run_record("run", "C:/workspace/repo", "2026-10-10T00:00:00Z");
        completed.state = state.into();
        completed.exit_code = Some(if state == "failed" { 7 } else { 0 });
        completed.record_path = path.to_string_lossy().into_owned();
        write_task_run_record(&path, &completed).unwrap_or_else(|_| panic!("save completed run"));
        let bytes = fs::read(&path).unwrap();
        let mut launched = ProjectRepositoryTaskRunRecord {
            state: "running".into(),
            finished_at: None,
            exit_code: None,
            ..completed
        };
        attach_task_process_id(&mut launched, Some(42));
        assert_eq!(launched.process_id, Some(42));
        assert_eq!(fs::read(&path).unwrap(), bytes, "{state}");
    }
}

#[test]
fn newly_created_tasks_wait_for_process_registration_without_rewriting_the_record() {
    for task in [
        ProjectRepositoryTask::InstallDependencies,
        ProjectRepositoryTask::UpdateDependencies,
        ProjectRepositoryTask::StartDevServer,
        ProjectRepositoryTask::Build,
        ProjectRepositoryTask::Preview,
    ] {
        let temp = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(temp.path()).unwrap();
        let record = create_task_run_record(&workspace, &workspace, task, "command")
            .unwrap_or_else(|_| panic!("create task run"));
        let original = fs::read(&record.record_path).unwrap();
        let records = refresh_running_task_run_records(vec![record], || Ok(Vec::new()));
        assert_eq!(records[0].state, "running", "{}", task.as_str());
        assert_eq!(records[0].process_id, None);
        assert_eq!(records[0].finished_at, None);
        assert_eq!(fs::read(&records[0].record_path).unwrap(), original);
    }
}

#[test]
fn process_registration_grace_does_not_preserve_stale_invalid_or_tracked_runs() {
    let now = OffsetDateTime::now_utc();
    for (started_at, process_id) in [
        (
            (now - time::Duration::seconds(31))
                .format(&Rfc3339)
                .unwrap(),
            None,
        ),
        ("invalid".into(), None),
        (
            (now + time::Duration::minutes(1)).format(&Rfc3339).unwrap(),
            None,
        ),
        (now.format(&Rfc3339).unwrap(), Some(42)),
    ] {
        let mut record = task_run_record("build", "C:/workspace/repo", &started_at);
        record.state = "running".into();
        record.process_id = process_id;
        record.exit_code = None;
        record.finished_at = None;
        let records = reconcile_running_task_run_records(vec![record], Some(&[]));
        assert_eq!(records[0].state, "stopped", "{started_at} {process_id:?}");
        assert!(records[0].finished_at.is_some());
    }
}

#[test]
fn stale_running_dev_server_records_are_reported_as_stopped() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
            state: "running".to_owned(),
            ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
        }],
        Some(&[]),
    );

    assert_eq!(records[0].state, "stopped");
    assert!(records[0].finished_at.is_some());
}

#[test]
fn running_dev_server_records_stop_when_process_id_was_reused() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
        }],
        Some(&[live_task_process(42, None, "powershell")]),
    );

    assert_eq!(records[0].state, "stopped");
    assert!(records[0].finished_at.is_some());
}

#[cfg(target_os = "windows")]
#[test]
fn running_dev_server_records_stop_when_other_processes_replace_the_tracked_run() {
    let record = ProjectRepositoryTaskRunRecord {
        task: "start-dev-server".into(),
        state: "running".into(),
        process_id: Some(42),
        command: "bun run dev".into(),
        exit_code: None,
        finished_at: None,
        ..task_run_record(
            "original-run",
            "C:/workspace/repo-a",
            "2026-05-23T01:00:00Z",
        )
    };
    let original_terminal = encoded_powershell_command_line(&create_powershell_script(
        Path::new(&record.repository_path),
        Some(&record.command),
        Some(&record),
    ));
    let replacement = ProjectRepositoryTaskRunRecord {
        id: "replacement-run".into(),
        ..record.clone()
    };
    let replacement_terminal = encoded_powershell_command_line(&create_powershell_script(
        Path::new(&replacement.repository_path),
        Some(&replacement.command),
        Some(&replacement),
    ));
    for processes in [
        vec![
            live_task_process(42, None, "powershell"),
            live_task_process(43, Some(42), "node unrelated.js"),
        ],
        vec![
            live_task_process(42, None, &replacement_terminal),
            live_task_process(43, Some(42), "bun run dev"),
        ],
        vec![live_task_process(
            99,
            None,
            "node C:/workspace/repo-a/node_modules/vite/bin/vite.js",
        )],
        vec![
            live_task_process(42, None, &original_terminal),
            live_task_process(
                99,
                None,
                "node C:/workspace/repo-a/node_modules/vite/bin/vite.js",
            ),
        ],
    ] {
        let records = reconcile_running_task_run_records(vec![record.clone()], Some(&processes));
        assert_eq!(records[0].state, "stopped");
        assert!(records[0].finished_at.is_some());
    }
}

#[cfg(target_os = "windows")]
#[test]
fn running_dev_server_records_match_their_run_id_and_nested_children() {
    let record = ProjectRepositoryTaskRunRecord {
        task: "start-dev-server".into(),
        state: "running".into(),
        process_id: Some(42),
        command: "bun run dev".into(),
        exit_code: None,
        finished_at: None,
        ..task_run_record(
            "original-run",
            "C:/workspace/repo-a",
            "2026-05-23T01:00:00Z",
        )
    };
    let terminal = encoded_powershell_command_line(&create_powershell_script(
        Path::new(&record.repository_path),
        Some(&record.command),
        Some(&record),
    ));
    let records = reconcile_running_task_run_records(
        vec![record],
        Some(&[
            live_task_process(42, None, &terminal),
            live_task_process(43, Some(42), "cmd.exe /c bun run dev"),
            live_task_process(44, Some(43), "node server.js"),
        ]),
    );
    assert_eq!(records[0].state, "running");
    assert_eq!(records[0].finished_at, None);
}

#[test]
fn running_dev_server_records_stay_running_when_process_id_matches_task_command() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
        }],
        Some(&[
            live_task_process(
                42,
                None,
                &encoded_powershell_command_line(
                    "Set-Location -LiteralPath 'C:/workspace/repo-a'; bun run dev",
                ),
            ),
            live_task_process(43, Some(42), "bun run dev"),
        ]),
    );

    assert_eq!(records[0].state, "running");
}

#[test]
fn running_dev_server_records_stop_when_only_terminal_process_remains() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
        }],
        Some(&[live_task_process(
            42,
            None,
            &encoded_powershell_command_line(
                "Set-Location -LiteralPath 'C:/workspace/repo-a'; bun run dev",
            ),
        )]),
    );

    assert_eq!(records[0].state, "stopped");
    assert!(records[0].finished_at.is_some());
}

#[test]
fn stale_running_preview_records_are_reported_as_stopped() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::Preview.as_str().to_owned(),
            state: "running".to_owned(),
            command: "bun run preview".to_owned(),
            ..task_run_record(
                "repo-a-preview",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        }],
        Some(&[]),
    );

    assert_eq!(records[0].state, "stopped");
    assert!(records[0].finished_at.is_some());
}

#[test]
fn legacy_running_preview_records_match_repository_path_processes() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::Preview.as_str().to_owned(),
            state: "running".to_owned(),
            command: "bun run preview".to_owned(),
            ..task_run_record(
                "repo-a-preview",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        }],
        Some(&[live_task_process(
            43,
            None,
            "node C:\\workspace\\repo-a\\node_modules\\vite\\bin\\vite.js preview",
        )]),
    );

    assert_eq!(records[0].state, "running");
}

#[test]
fn stale_running_dependency_update_records_are_reported_as_stopped() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::UpdateDependencies
                .as_str()
                .to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            command: "bun update".to_owned(),
            ..task_run_record(
                "repo-a-update",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        }],
        Some(&[]),
    );

    assert_eq!(records[0].state, "stopped");
    assert!(records[0].finished_at.is_some());
}

#[test]
fn running_dependency_update_records_stay_running_when_encoded_terminal_matches_task() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::UpdateDependencies
                .as_str()
                .to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            command: "bun update".to_owned(),
            ..task_run_record(
                "repo-a-update",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        }],
        Some(&[live_task_process(
            42,
            None,
            &encoded_powershell_command_line(
                "Set-Location -LiteralPath 'C:/workspace/repo-a'; bun update",
            ),
        )]),
    );

    assert_eq!(records[0].state, "running");
}

#[test]
#[cfg(target_os = "windows")]
fn running_dependency_update_records_require_their_own_embedded_run_id() {
    for (task, command) in [
        ("install-dependencies", "bun install"),
        ("update-dependencies", "bun update"),
        ("build", "bun run build"),
    ] {
        let record = ProjectRepositoryTaskRunRecord {
            task: task.into(),
            state: "running".into(),
            process_id: Some(42),
            command: command.into(),
            exit_code: None,
            finished_at: None,
            ..task_run_record(
                "original-run",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        };
        for (id, expected) in [("original-run", "running"), ("replacement-run", "stopped")] {
            let launched = ProjectRepositoryTaskRunRecord {
                id: id.into(),
                ..record.clone()
            };
            let terminal = encoded_powershell_command_line(&create_powershell_script(
                Path::new(&launched.repository_path),
                Some(&launched.command),
                Some(&launched),
            ));
            let records = reconcile_running_task_run_records(
                vec![record.clone()],
                Some(&[live_task_process(42, None, &terminal)]),
            );
            assert_eq!(records[0].state, expected, "{task}: {id}");
        }
    }
}

#[test]
fn running_dependency_update_records_stop_when_process_id_was_reused() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::UpdateDependencies
                .as_str()
                .to_owned(),
            state: "running".to_owned(),
            process_id: Some(42),
            command: "bun update".to_owned(),
            ..task_run_record(
                "repo-a-update",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        }],
        Some(&[live_task_process(42, None, "powershell")]),
    );

    assert_eq!(records[0].state, "stopped");
}

#[test]
fn completion_published_during_process_enumeration_is_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let record_path = temp.path().join("repo-a-update.json");
    let running_record = ProjectRepositoryTaskRunRecord {
        task: ProjectRepositoryTask::UpdateDependencies
            .as_str()
            .to_owned(),
        state: "running".to_owned(),
        process_id: Some(42),
        command: "bun update".to_owned(),
        record_path: record_path.to_string_lossy().to_string(),
        ..task_run_record(
            "repo-a-update",
            "C:/workspace/repo-a",
            "2026-05-23T01:00:00Z",
        )
    };
    assert!(write_task_run_record(&record_path, &running_record).is_ok());

    let completed = ProjectRepositoryTaskRunRecord {
        state: "succeeded".into(),
        exit_code: Some(0),
        finished_at: Some(current_task_run_timestamp()),
        output_tail: Some("완료 ✓".into()),
        // A reread must retain the path supplied by the original file reader.
        record_path: "untrusted-final-path.json".into(),
        ..running_record.clone()
    };
    let mut completed_bytes = vec![0xef, 0xbb, 0xbf];
    completed_bytes.extend(serde_json::to_vec(&completed).unwrap());
    let records = refresh_running_task_run_records(vec![running_record], || {
        fs::write(&record_path, &completed_bytes).unwrap();
        Ok(Vec::new())
    });

    assert_eq!(records[0].state, "succeeded");
    assert_eq!(records[0].exit_code, Some(0));
    assert_eq!(records[0].output_tail, completed.output_tail);
    assert_eq!(records[0].record_path, record_path.to_string_lossy());
    assert_eq!(fs::read(&record_path).unwrap(), completed_bytes);
}

#[test]
fn legacy_running_dev_server_records_match_repository_path_processes() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::StartDevServer.as_str().to_owned(),
            state: "running".to_owned(),
            ..task_run_record("repo-a-dev", "C:/workspace/repo-a", "2026-05-23T01:00:00Z")
        }],
        Some(&[live_task_process(
            43,
            None,
            "node C:\\workspace\\repo-a\\node_modules\\astro\\bin\\astro.mjs preview",
        )]),
    );

    assert_eq!(records[0].state, "running");
}

#[test]
fn legacy_running_dependency_update_records_without_process_id_stop() {
    let records = reconcile_running_task_run_records(
        vec![ProjectRepositoryTaskRunRecord {
            task: ProjectRepositoryTask::UpdateDependencies
                .as_str()
                .to_owned(),
            state: "running".to_owned(),
            command: "bun update".to_owned(),
            ..task_run_record(
                "repo-a-update",
                "C:/workspace/repo-a",
                "2026-05-23T01:00:00Z",
            )
        }],
        Some(&[live_task_process(
            43,
            None,
            "node C:\\workspace\\repo-a\\node_modules\\vite\\bin\\vite.js dev",
        )]),
    );

    assert_eq!(records[0].state, "stopped");
}

fn encoded_powershell_command_line(script: &str) -> String {
    let encoded = general_purpose::STANDARD.encode(
        script
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>(),
    );

    format!("powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand {encoded}")
}
