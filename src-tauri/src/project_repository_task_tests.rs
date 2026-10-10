use super::commands::{
    PackageManager, PackageProject, resolve_package_dev_server_command,
    resolve_package_task_command,
};
use super::*;

#[test]
fn reconciliation_cannot_write_to_a_path_supplied_inside_a_record() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(temp.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let path = workspace.join("run.json");
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
    assert_eq!(stored["state"], "stopped");
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
fn reconciliation_writes_only_newly_stopped_records() {
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
    fs::write(&old_path, &original).unwrap();
    fs::write(&new_path, serde_json::to_vec(&running).unwrap()).unwrap();
    let records = refresh_running_task_run_records(vec![old, running], || Ok(Vec::new()));
    assert!(records.iter().all(|record| record.state == "stopped"));
    assert_eq!(fs::read(old_path).unwrap(), original);
    let updated: serde_json::Value = serde_json::from_slice(&fs::read(new_path).unwrap()).unwrap();
    assert_eq!(updated["state"], "stopped");
    assert!(updated["finishedAt"].is_string());
}

#[test]
fn stopped_record_reads_preserve_the_file_and_populate_a_stable_cache() {
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
    stopped.state = "stopped".into();
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

fn task_run_record(
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

#[cfg(target_os = "windows")]
#[test]
fn powershell_task_failures_stop_following_commands_and_keep_native_exit_codes() {
    for (label, command, expected_state, expected_exit, follows) in [
        (
            "cmdlet-error",
            "Write-Error 'task failed'",
            "failed",
            1,
            false,
        ),
        (
            "stale-native-exit",
            "& $env:ComSpec /d /c 'exit 0'\nWrite-Error 'task failed'",
            "failed",
            1,
            false,
        ),
        (
            "native-error",
            "& $env:ComSpec /d /c 'exit 7'",
            "failed",
            7,
            false,
        ),
        (
            "native-stderr-success",
            "& $env:ComSpec /d /c 'echo diagnostic 1>&2 & exit 0'",
            "succeeded",
            0,
            true,
        ),
        (
            "scoped-native-error",
            "Push-Location -LiteralPath 'nested' -ErrorAction Stop; try { & $env:ComSpec /d /c 'exit 7' } finally { Pop-Location }",
            "failed",
            7,
            false,
        ),
        (
            "scoped-native-stderr-success",
            "Push-Location -LiteralPath 'nested' -ErrorAction Stop; try { & $env:ComSpec /d /c 'echo diagnostic 1>&2 & exit 0' } finally { Pop-Location }",
            "succeeded",
            0,
            true,
        ),
    ] {
        let repository = tempfile::tempdir().unwrap();
        fs::create_dir(repository.path().join("nested")).unwrap();
        let record_path = task_run_record_dir(repository.path()).join(format!("{label}.json"));
        fs::create_dir_all(record_path.parent().unwrap()).unwrap();
        let marker_path = repository.path().join("following-command.txt");
        let command =
            format!("{command}\nSet-Content -LiteralPath 'following-command.txt' -Value 'ran'");
        let record = ProjectRepositoryTaskRunRecord {
            command: command.clone(),
            record_path: record_path.to_string_lossy().into_owned(),
            ..task_run_record(
                label,
                &repository.path().to_string_lossy(),
                "2026-10-10T00:00:00Z",
            )
        };
        let script = create_powershell_script(repository.path(), Some(&command), Some(&record));
        let output = Command::new("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{label}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stored =
            read_visible_task_run_record(&record_path, repository.path()).unwrap_or_else(|| {
                panic!("PowerShell record is missing from the latest view: {label}")
            });
        assert_eq!(stored.state, expected_state, "{label}");
        assert_eq!(stored.exit_code, Some(expected_exit), "{label}");
        assert!(stored.process_id.is_some_and(|pid| pid > 0), "{label}");
        let workspace = fs::canonicalize(repository.path()).unwrap();
        let historical = history::read_selected_task_run_records(&workspace, &[label.into()])
            .unwrap_or_else(|_| panic!("PowerShell record is unreadable in history: {label}"));
        assert_eq!(historical.len(), 1, "{label}");
        assert_eq!(historical[0].state, expected_state, "{label}");
        assert_eq!(historical[0].exit_code, Some(expected_exit), "{label}");
        assert_eq!(marker_path.exists(), follows, "{label}");
    }
}

#[cfg(target_os = "windows")]
#[test]
fn powershell_script_stops_before_tasks_when_the_repository_directory_is_missing() {
    let repository = tempfile::tempdir().unwrap();
    let script = create_powershell_script(
        &repository.path().join("missing"),
        Some("Set-Content -LiteralPath 'marker.txt' -Value 'ran'"),
        None,
    );
    let output = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &script,
        ])
        .current_dir(repository.path())
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(!repository.path().join("marker.txt").exists());
}

#[cfg(target_os = "windows")]
#[test]
fn powershell_script_executes_each_tracked_command_line_once() {
    let run_record = ProjectRepositoryTaskRunRecord {
        command:
            "bun install\nPush-Location -LiteralPath 'apps/workbench' -ErrorAction Stop; try { bun install } finally { Pop-Location }"
                .to_owned(),
        ..task_run_record(
            "repo-a-install",
            "C:/workspace/repo-a",
            "2026-05-23T01:00:00Z",
        )
    };
    let script = create_powershell_script(
        Path::new("C:/workspace/repo-a"),
        Some(&run_record.command),
        Some(&run_record),
    );

    assert!(script.contains("Write-Host 'Workduck: bun install'"));
    assert!(script.contains(
        "Write-Host 'Workduck: Push-Location -LiteralPath ''apps/workbench'' -ErrorAction Stop; try { bun install } finally { Pop-Location }'"
    ));
    assert!(script.contains("$workduckCommand = 'bun install';"));
    assert!(script.contains(
        "$workduckCommand = 'Push-Location -LiteralPath ''apps/workbench'' -ErrorAction Stop; try { bun install } finally { Pop-Location }';"
    ));
    assert!(script.contains("command = $workduckRecordCommand;"));
    assert!(!script.contains("Invoke-Expression $workduckRecordCommand"));
}

#[cfg(target_os = "windows")]
#[test]
fn multi_command_task_records_stay_running_until_the_last_command_finishes() {
    for (command, final_state, exit_code) in [
        ("Write-Output 'first'\nWrite-Output 'last'", "succeeded", 0),
        (
            "Write-Output 'first'\n& $env:ComSpec /d /c 'exit 7'\nWrite-Output 'never'",
            "failed",
            7,
        ),
    ] {
        let repository = tempfile::tempdir().unwrap();
        let record_path = repository.path().join("run.json");
        let trace_path = repository.path().join("trace.jsonl");
        let record = ProjectRepositoryTaskRunRecord {
            command: command.into(),
            record_path: record_path.to_string_lossy().into_owned(),
            ..task_run_record(
                "run",
                &repository.path().to_string_lossy(),
                "2026-10-10T00:00:00Z",
            )
        };
        // Observe every durable state transition through the real PowerShell writer.
        let observer = format!(
            r#"
function Set-Content {{
    param([Parameter(ValueFromPipeline=$true)]$Value, [string]$LiteralPath, [string]$Encoding)
    process {{
        Microsoft.PowerShell.Management\Set-Content -LiteralPath $LiteralPath -Value $Value -Encoding $Encoding;
        $compact = $Value | ConvertFrom-Json | ConvertTo-Json -Compress;
        [System.IO.File]::AppendAllText('{trace_path}', $compact + [Environment]::NewLine);
    }}
}}
"#,
            trace_path = escape_powershell_single_quoted(&trace_path.to_string_lossy())
        );
        let script =
            observer + &create_powershell_script(repository.path(), Some(command), Some(&record));
        let output = Command::new("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let transitions: Vec<ProjectRepositoryTaskRunRecord> = fs::read_to_string(trace_path)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert!(transitions.len() >= 4);
        for intermediate in &transitions[..transitions.len() - 1] {
            assert_eq!(intermediate.state, "running");
            assert_eq!(intermediate.exit_code, None);
            assert_eq!(intermediate.finished_at, None);
        }
        let final_record = transitions.last().unwrap();
        assert_eq!(final_record.state, final_state);
        assert_eq!(final_record.exit_code, Some(exit_code));
        assert!(final_record.finished_at.is_some());
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
fn reconciled_stopped_records_are_persisted_to_disk() {
    let unique = current_task_run_timestamp()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>();
    let temp_dir = std::env::temp_dir().join(format!(
        "workduck-task-run-reconcile-{}-{unique}",
        std::process::id()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let record_path = temp_dir.join("repo_task_update.json");
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

    let stopped_record = stopped_task_run_record(&running_record);
    persist_reconciled_task_run_records(&[stopped_record]);

    let persisted_json = fs::read_to_string(&record_path).expect("read persisted record");
    let persisted_record = serde_json::from_str::<ProjectRepositoryTaskRunRecord>(&persisted_json)
        .expect("parse persisted record");

    assert_eq!(persisted_record.state, "stopped");
    assert_eq!(persisted_record.process_id, Some(42));
    assert!(persisted_record.finished_at.is_some());

    fs::remove_dir_all(temp_dir).expect("remove temp dir");
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
