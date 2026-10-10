use super::tests::task_run_record;
use super::*;

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
fn powershell_task_record_write_failure_prevents_execution() {
    use std::os::windows::fs::OpenOptionsExt;

    for shell in ["powershell.exe", "pwsh.exe"] {
        if shell == "pwsh.exe" && Command::new(shell).arg("-Version").output().is_err() {
            continue;
        }
        let repository = tempfile::tempdir().unwrap();
        let record_path = repository.path().join("run.json");
        let marker_path = repository.path().join("executed.txt");
        let record = ProjectRepositoryTaskRunRecord {
            record_path: record_path.to_string_lossy().into_owned(),
            ..task_run_record(
                "run",
                &repository.path().to_string_lossy(),
                "2026-10-10T00:00:00Z",
            )
        };
        assert!(write_task_run_record(&record_path, &record).is_ok());
        let original = fs::read(&record_path).unwrap();
        // Deny writes and replacement while allowing history readers.
        let locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&record_path)
            .unwrap();
        let script = create_powershell_script(
            repository.path(),
            Some("[System.IO.File]::WriteAllText('executed.txt', 'ran')"),
            Some(&record),
        );
        let output = Command::new(shell)
            .current_dir(repository.path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .output()
            .unwrap();
        drop(locked);
        assert!(
            !marker_path.exists(),
            "{shell}: task ran without a durable running record"
        );
        assert!(
            !output.status.success(),
            "{shell}: write failure was ignored"
        );
        assert!(
            String::from_utf8_lossy(&output.stderr)
                .contains("Workduck could not save task history"),
            "{shell}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(fs::read(&record_path).unwrap(), original);
        assert_eq!(
            fs::read_dir(repository.path()).unwrap().count(),
            1,
            "{shell}: temporary file leaked"
        );
    }
}

#[cfg(target_os = "windows")]
#[test]
fn powershell_task_record_completion_failure_stops_following_commands() {
    for shell in ["powershell.exe", "pwsh.exe"] {
        if shell == "pwsh.exe" && Command::new(shell).arg("-Version").output().is_err() {
            continue;
        }
        let repository = tempfile::tempdir().unwrap();
        let record_path = repository.path().join("run.json");
        let command = "[System.IO.File]::WriteAllText('first.txt', 'ran'); $workduckTestLock = [System.IO.File]::Open($workduckRecordPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)\n[System.IO.File]::WriteAllText('following.txt', 'ran')";
        let record = ProjectRepositoryTaskRunRecord {
            command: command.into(),
            record_path: record_path.to_string_lossy().into_owned(),
            ..task_run_record(
                "run",
                &repository.path().to_string_lossy(),
                "2026-10-10T00:00:00Z",
            )
        };
        let script = create_powershell_script(repository.path(), Some(command), Some(&record));
        let output = Command::new(shell)
            .current_dir(repository.path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .output()
            .unwrap();
        assert!(repository.path().join("first.txt").exists(), "{shell}");
        assert!(
            !repository.path().join("following.txt").exists(),
            "{shell}: continued after failed completion write"
        );
        assert!(!output.status.success(), "{shell}");
        let stored: ProjectRepositoryTaskRunRecord =
            serde_json::from_slice(&fs::read(&record_path).unwrap()).unwrap();
        assert_eq!(
            stored.state, "running",
            "{shell}: replaced the last durable state"
        );
        assert_eq!(stored.exit_code, None, "{shell}");
        assert!(
            fs::read_dir(repository.path()).unwrap().all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".workduck-task-record.")),
            "{shell}: temporary file leaked"
        );
    }
}

#[cfg(target_os = "windows")]
#[test]
fn powershell_task_record_publication_keeps_concurrent_reads_complete() {
    for shell in ["powershell.exe", "pwsh.exe"] {
        if shell == "pwsh.exe" && Command::new(shell).arg("-Version").output().is_err() {
            continue;
        }
        let repository = tempfile::tempdir().unwrap();
        let record_path = repository.path().join("run.json");
        let record = ProjectRepositoryTaskRunRecord {
            record_path: record_path.to_string_lossy().into_owned(),
            ..task_run_record(
                "run",
                &repository.path().to_string_lossy(),
                "2026-10-10T00:00:00Z",
            )
        };
        assert!(write_task_run_record(&record_path, &record).is_ok());
        let script = create_powershell_task_record_writer(&record)
            + r#";
for ($i = 0; $i -lt 80; $i++) {
    Write-WorkduckTaskRunRecord -State 'running' -ExitCode $null -OutputTail ('phase ' + $i + ' ' + ('🙂' * 4096));
}
Write-WorkduckTaskRunRecord -State 'succeeded' -ExitCode 0 -OutputTail 'completed ✓🙂';
"#;
        let mut child = Command::new(shell)
            .current_dir(repository.path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        let mut observed_updates = 0;
        let mut invalid_reads = 0;
        let mut first_read_error = None;
        let mut last_tail = None;
        while child.try_wait().unwrap().is_none() {
            if std::time::Instant::now() > deadline {
                child.kill().ok();
                child.wait().ok();
                panic!("{shell}: record writer did not finish");
            }
            match fs::read(&record_path)
                .map_err(|error| format!("I/O: {error}"))
                .and_then(|bytes| {
                    serde_json::from_slice::<ProjectRepositoryTaskRunRecord>(&bytes)
                        .map_err(|error| format!("JSON: {error}, size={}", bytes.len()))
                }) {
                Ok(current) => {
                    assert_eq!(current.id, "run", "{shell}");
                    if current.output_tail != last_tail {
                        observed_updates += 1;
                        last_tail = current.output_tail;
                    }
                }
                Err(error) => {
                    invalid_reads += 1;
                    first_read_error.get_or_insert(error);
                }
            }
            std::thread::yield_now();
        }
        let output = child.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "{shell}: {}; reader error: {first_read_error:?}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            observed_updates >= 2,
            "{shell}: did not observe concurrent publication"
        );
        assert_eq!(
            invalid_reads, 0,
            "{shell}: history contained a partial or missing record: {first_read_error:?}"
        );
        let stored: ProjectRepositoryTaskRunRecord =
            serde_json::from_slice(&fs::read(&record_path).unwrap()).unwrap();
        assert_eq!(stored.state, "succeeded", "{shell}");
        assert_eq!(
            stored.output_tail.as_deref(),
            Some("completed ✓🙂"),
            "{shell}"
        );
        assert_eq!(
            fs::read_dir(repository.path()).unwrap().count(),
            1,
            "{shell}: temporary file leaked"
        );
    }
}

#[cfg(target_os = "windows")]
#[test]
fn powershell_task_large_output_keeps_history_readable_and_preserves_the_full_log() {
    for encoding in ["utf16", "utf8"] {
        let repository = tempfile::tempdir().unwrap();
        let workspace = fs::canonicalize(repository.path()).unwrap();
        let visible = crate::git_path::git_process_path(&workspace);
        let id = "large-output";
        let record_path = task_run_record_dir(&visible).join(format!("{id}.json"));
        fs::create_dir_all(record_path.parent().unwrap()).unwrap();
        // The preview boundary falls inside the emoji's UTF-16 surrogate pair.
        let content = "(('x' * 1048576) + [char]::ConvertFromUtf32(0x1F986) + ([string][char]0xD55C * 16380) + 'END')";
        let command = if encoding == "utf16" {
            format!("{content} | Out-File -LiteralPath $workduckLogPath -Encoding Unicode")
        } else {
            format!(
                "[System.IO.File]::WriteAllText($workduckLogPath, {content}, [System.Text.UTF8Encoding]::new($false))"
            )
        };
        let record = ProjectRepositoryTaskRunRecord {
            command: command.clone(),
            record_path: record_path.to_string_lossy().into_owned(),
            ..task_run_record(id, &visible.to_string_lossy(), "2026-10-10T00:00:00Z")
        };
        let script = create_powershell_script(&visible, Some(&command), Some(&record));
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
        let restored = history::read_selected_task_run_records(&workspace, &[id.into()])
            .unwrap_or_else(|_| panic!("completed build must remain readable after large output"));
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].state, "succeeded");
        assert_eq!(restored[0].exit_code, Some(0));
        assert_eq!(
            restored[0].output_tail.as_deref(),
            Some(("한".repeat(16380) + "END").as_str())
        );
        let latest = read_visible_task_run_record(&record_path, &visible).expect("latest record");
        assert_eq!(latest.output_tail, restored[0].output_tail);
        assert!(fs::metadata(record_path).unwrap().len() < 1024 * 1024);
        assert!(
            fs::metadata(format!("{}.log", record.record_path))
                .unwrap()
                .len()
                > 1024 * 1024
        );
    }
}

#[cfg(target_os = "windows")]
#[test]
fn powershell_task_completion_survives_an_unreadable_log_preview() {
    let repository = tempfile::tempdir().unwrap();
    let workspace = fs::canonicalize(repository.path()).unwrap();
    let visible = crate::git_path::git_process_path(&workspace);
    let id = "unreadable-log";
    let record_path = task_run_record_dir(&visible).join(format!("{id}.json"));
    fs::create_dir_all(record_path.parent().unwrap()).unwrap();
    let command = "$logLock = [System.IO.File]::Open($workduckLogPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)";
    let record = ProjectRepositoryTaskRunRecord {
        command: command.into(),
        record_path: record_path.to_string_lossy().into_owned(),
        ..task_run_record(id, &visible.to_string_lossy(), "2026-10-10T00:00:00Z")
    };
    let script =
        create_powershell_script(&visible, Some(command), Some(&record)) + "; $logLock.Dispose()";
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
    let restored = history::read_selected_task_run_records(&workspace, &[id.into()])
        .unwrap_or_else(|_| panic!("completion must survive unavailable preview"));
    assert_eq!(restored[0].state, "succeeded");
    assert_eq!(restored[0].exit_code, Some(0));
    assert_eq!(restored[0].output_tail, None);
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
function Write-WorkduckTaskRunRecord {{
    param([string]$State, [Nullable[int]]$ExitCode, [string]$OutputTail)
    Write-WorkduckTaskRunRecordOriginal -State $State -ExitCode $ExitCode -OutputTail $OutputTail;
    $compact = [System.IO.File]::ReadAllText($workduckRecordPath) | ConvertFrom-Json | ConvertTo-Json -Compress;
    [System.IO.File]::AppendAllText('{trace_path}', $compact + [Environment]::NewLine);
}}
"#,
            trace_path = escape_powershell_single_quoted(&trace_path.to_string_lossy())
        );
        let script = observer
            + &create_powershell_script(repository.path(), Some(command), Some(&record)).replacen(
                "function Write-WorkduckTaskRunRecord {",
                "function Write-WorkduckTaskRunRecordOriginal {",
                1,
            );
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
