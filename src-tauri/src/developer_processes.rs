use std::{
    collections::BTreeMap,
    env,
    path::Path,
    process::{Command, Stdio},
};

use crate::path_display::display_path_text;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const COMMAND_TOKEN_LIMIT: usize = 12;
const DEVELOPER_PROCESS_KEYWORDS: &[&str] = &[
    "bun",
    "node",
    "npm",
    "pnpm",
    "yarn",
    "vite",
    "svelte-kit",
    "tauri",
    "cargo",
    "rustc",
    "deno",
    "workduck",
];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperProcessList {
    ok: bool,
    processes: Vec<DeveloperProcessEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<DeveloperProcessError>,
}

#[derive(serde::Serialize)]
pub enum DeveloperProcessError {
    #[serde(rename = "developer-processes-unavailable")]
    Unavailable,
    #[serde(rename = "developer-processes-read-failed")]
    ReadFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperProcessCommandResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<DeveloperProcessCommandError>,
}

#[derive(serde::Serialize)]
pub enum DeveloperProcessCommandError {
    #[serde(rename = "developer-processes-unavailable")]
    Unavailable,
    #[serde(rename = "developer-process-kill-denied")]
    KillDenied,
    #[serde(rename = "developer-process-kill-failed")]
    KillFailed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperProcessEntry {
    pid: u32,
    name: String,
    kind: String,
    command: String,
    ports: Vec<u16>,
    memory_bytes: Option<u64>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProcessPayload {
    #[serde(default)]
    processes: Vec<RawProcessRecord>,
    #[serde(default)]
    ports: Vec<RawPortRecord>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProcessRecord {
    pid: u32,
    name: Option<String>,
    executable_path: Option<String>,
    command_line: Option<String>,
    memory_bytes: Option<u64>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPortRecord {
    pid: u32,
    port: u16,
}

#[tauri::command]
pub async fn list_developer_processes() -> DeveloperProcessList {
    match collect_developer_processes_off_thread().await {
        Ok(processes) => DeveloperProcessList {
            ok: true,
            processes,
            error: None,
        },
        Err(error) => DeveloperProcessList {
            ok: false,
            processes: Vec::new(),
            error: Some(error),
        },
    }
}

async fn collect_developer_processes_off_thread() -> Result<
    Vec<DeveloperProcessEntry>,
    DeveloperProcessError,
> {
    tauri::async_runtime::spawn_blocking(collect_developer_processes)
        .await
        .map_err(|_| DeveloperProcessError::ReadFailed)?
}

#[tauri::command]
pub async fn kill_developer_process(pid: u32) -> DeveloperProcessCommandResult {
    let result = tauri::async_runtime::spawn_blocking(move || verified_force_kill_process(pid))
        .await
        .map_err(|_| DeveloperProcessCommandError::Unavailable)
        .and_then(|result| result);

    match result {
        Ok(()) => DeveloperProcessCommandResult {
            ok: true,
            error: None,
        },
        Err(error) => DeveloperProcessCommandResult {
            ok: false,
            error: Some(error),
        },
    }
}

fn verified_force_kill_process(pid: u32) -> Result<(), DeveloperProcessCommandError> {
    verify_developer_process_id(pid)?;
    force_kill_process(pid)
}

fn verify_developer_process_id(pid: u32) -> Result<(), DeveloperProcessCommandError> {
    if is_protected_process_id(pid) {
        return Err(DeveloperProcessCommandError::KillDenied);
    }

    let processes = collect_developer_processes().map_err(|error| match error {
        DeveloperProcessError::Unavailable => DeveloperProcessCommandError::Unavailable,
        DeveloperProcessError::ReadFailed => DeveloperProcessCommandError::KillDenied,
    })?;

    if processes.iter().any(|process| process.pid == pid) {
        Ok(())
    } else {
        Err(DeveloperProcessCommandError::KillDenied)
    }
}

#[cfg(target_os = "windows")]
fn collect_developer_processes() -> Result<Vec<DeveloperProcessEntry>, DeveloperProcessError> {
    let current_workduck_pid = std::process::id();
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$currentPid = $PID
$workduckPid = __WORKDUCK_PID__
$namePattern = '^(bun|node|npm|pnpm|yarn|deno|cargo|rustc|tauri|workduck)(\.exe|\.cmd)?$'
$commandPattern = '(?i)\b(bun|node|npm|pnpm|yarn|vite|svelte-kit|tauri|cargo|rustc|deno|workduck)\b'
$processes = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.ProcessId -ne $currentPid -and $_.ProcessId -ne $workduckPid -and (
        ($_.Name -match $namePattern) -or
        (($_.CommandLine -ne $null) -and ($_.CommandLine -match $commandPattern))
      )
    } |
    ForEach-Object {
      [PSCustomObject]@{
        pid = [int]$_.ProcessId
        name = [string]$_.Name
        executablePath = [string]$_.ExecutablePath
        commandLine = [string]$_.CommandLine
        memoryBytes = if ($_.WorkingSetSize -ne $null) { [Int64]$_.WorkingSetSize } else { $null }
      }
    }
)
$ports = @(
  Get-NetTCPConnection -State Listen |
    ForEach-Object {
      [PSCustomObject]@{
        pid = [int]$_.OwningProcess
        port = [int]$_.LocalPort
      }
    }
)
[PSCustomObject]@{
  processes = $processes
  ports = $ports
} | ConvertTo-Json -Depth 4 -Compress
"#
    .replace("__WORKDUCK_PID__", &current_workduck_pid.to_string());

    let mut command = Command::new("powershell.exe");
    command
        .arg("-NoLogo")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|_| DeveloperProcessError::Unavailable)?;

    if !output.status.success() {
        return Err(DeveloperProcessError::ReadFailed);
    }

    parse_process_payload(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn force_kill_process(pid: u32) -> Result<(), DeveloperProcessCommandError> {
    if is_protected_process_id(pid) {
        return Err(DeveloperProcessCommandError::KillDenied);
    }

    let mut command = Command::new("taskkill.exe");
    command
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/F")
        .arg("/T")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|_| DeveloperProcessCommandError::Unavailable)?;

    if output.status.success() {
        Ok(())
    } else {
        Err(DeveloperProcessCommandError::KillFailed)
    }
}

#[cfg(not(target_os = "windows"))]
fn collect_developer_processes() -> Result<Vec<DeveloperProcessEntry>, DeveloperProcessError> {
    let output = Command::new("ps")
        .arg("-eo")
        .arg("pid=,rss=,comm=,args=")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| DeveloperProcessError::Unavailable)?;

    if !output.status.success() {
        return Err(DeveloperProcessError::ReadFailed);
    }

    let mut processes = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_unix_process_line)
        .collect::<Vec<_>>();
    processes.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.pid.cmp(&right.pid))
    });

    Ok(processes)
}

fn parse_process_payload(value: &str) -> Result<Vec<DeveloperProcessEntry>, DeveloperProcessError> {
    let payload = serde_json::from_str::<RawProcessPayload>(value.trim())
        .map_err(|_| DeveloperProcessError::ReadFailed)?;
    let ports_by_pid = group_ports_by_pid(payload.ports);
    let mut processes = payload
        .processes
        .into_iter()
        .filter_map(|process| map_raw_process(process, &ports_by_pid))
        .collect::<Vec<_>>();

    processes.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.pid.cmp(&right.pid))
    });

    Ok(processes)
}

fn group_ports_by_pid(records: Vec<RawPortRecord>) -> BTreeMap<u32, Vec<u16>> {
    let mut ports_by_pid = BTreeMap::<u32, Vec<u16>>::new();

    for record in records {
        let ports = ports_by_pid.entry(record.pid).or_default();

        if !ports.contains(&record.port) {
            ports.push(record.port);
        }
    }

    for ports in ports_by_pid.values_mut() {
        ports.sort_unstable();
    }

    ports_by_pid
}

fn map_raw_process(
    process: RawProcessRecord,
    ports_by_pid: &BTreeMap<u32, Vec<u16>>,
) -> Option<DeveloperProcessEntry> {
    let name = process
        .name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| executable_leaf(process.executable_path.as_deref()))?;
    let command_line = process.command_line.unwrap_or_default();
    let searchable = format!("{} {}", name, command_line).to_ascii_lowercase();

    if !is_developer_process(&searchable) {
        return None;
    }

    Some(DeveloperProcessEntry {
        pid: process.pid,
        kind: classify_process_kind(&searchable),
        command: sanitize_command_line(&command_line, &name),
        name,
        ports: ports_by_pid.get(&process.pid).cloned().unwrap_or_default(),
        memory_bytes: process.memory_bytes,
    })
}

#[cfg(not(target_os = "windows"))]
fn parse_unix_process_line(line: &str) -> Option<DeveloperProcessEntry> {
    let trimmed = line.trim();
    let (pid_text, remainder) = trimmed.split_once(char::is_whitespace)?;
    let pid = pid_text.parse::<u32>().ok()?;
    if is_protected_process_id(pid) {
        return None;
    }
    let remainder = remainder.trim();
    let (rss_text, remainder) = remainder.split_once(char::is_whitespace)?;
    let memory_bytes = rss_text
        .parse::<u64>()
        .ok()
        .map(|rss_kib| rss_kib.saturating_mul(1024));
    let remainder = remainder.trim();
    let (name, command_line) = remainder
        .split_once(char::is_whitespace)
        .map(|(name, command)| (name.to_string(), command.trim().to_string()))
        .unwrap_or_else(|| (remainder.to_string(), remainder.to_string()));
    let searchable = format!("{} {}", name, command_line).to_ascii_lowercase();

    if !is_developer_process(&searchable) {
        return None;
    }

    Some(DeveloperProcessEntry {
        pid,
        kind: classify_process_kind(&searchable),
        command: sanitize_command_line(&command_line, &name),
        name,
        ports: Vec::new(),
        memory_bytes,
    })
}

#[cfg(not(target_os = "windows"))]
fn force_kill_process(pid: u32) -> Result<(), DeveloperProcessCommandError> {
    if is_protected_process_id(pid) {
        return Err(DeveloperProcessCommandError::KillDenied);
    }

    let output = Command::new("kill")
        .arg("-9")
        .arg(pid.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| DeveloperProcessCommandError::Unavailable)?;

    if output.status.success() {
        Ok(())
    } else {
        Err(DeveloperProcessCommandError::KillFailed)
    }
}

fn executable_leaf(value: Option<&str>) -> Option<String> {
    let path = value?;

    Path::new(path)
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .map(ToOwned::to_owned)
}

fn is_developer_process(value: &str) -> bool {
    DEVELOPER_PROCESS_KEYWORDS
        .iter()
        .any(|keyword| value.contains(keyword))
}

fn is_protected_process_id(pid: u32) -> bool {
    pid == 0 || pid == std::process::id()
}

fn classify_process_kind(value: &str) -> String {
    if value.contains("vite") {
        "Vite".to_string()
    } else if value.contains("tauri") {
        "Tauri".to_string()
    } else if value.contains("workduck") {
        "Workduck".to_string()
    } else if value.contains("svelte-kit") {
        "SvelteKit".to_string()
    } else if value.contains("bun") {
        "Bun".to_string()
    } else if value.contains("pnpm") {
        "pnpm".to_string()
    } else if value.contains("npm") {
        "npm".to_string()
    } else if value.contains("yarn") {
        "Yarn".to_string()
    } else if value.contains("node") {
        "Node.js".to_string()
    } else if value.contains("cargo") {
        "Cargo".to_string()
    } else if value.contains("rustc") {
        "Rust".to_string()
    } else if value.contains("deno") {
        "Deno".to_string()
    } else {
        "Process".to_string()
    }
}

fn sanitize_command_line(command_line: &str, fallback: &str) -> String {
    let source = if command_line.trim().is_empty() {
        fallback
    } else {
        command_line
    };
    let home = env::var("USERPROFILE")
        .ok()
        .or_else(|| env::var("HOME").ok())
        .filter(|value| !value.trim().is_empty());
    let mut tokens = source
        .split_whitespace()
        .take(COMMAND_TOKEN_LIMIT)
        .map(|token| sanitize_command_token(token, home.as_deref()))
        .collect::<Vec<_>>();

    if source.split_whitespace().count() > COMMAND_TOKEN_LIMIT {
        tokens.push("...".to_string());
    }

    tokens.join(" ")
}

fn sanitize_command_token(token: &str, home: Option<&str>) -> String {
    let lower = token.to_ascii_lowercase();

    if lower.contains("token")
        || lower.contains("secret")
        || lower.contains("password")
        || lower.contains("passwd")
        || lower.contains("apikey")
        || lower.contains("api-key")
    {
        return "[redacted]".to_string();
    }

    let display_token = display_path_text(token);

    if let Some(home) = home {
        return display_token.replace(home, "~");
    }

    display_token
}
