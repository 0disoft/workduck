use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    process::{ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use tauri::State;

use crate::terminal_catalog;
use crate::process_tree::ProcessTreeChild;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const POWERSHELL_BOOTSTRAP_COMMAND: &str = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; if (Get-Variable -Name PSStyle -ErrorAction SilentlyContinue) { $PSStyle.OutputRendering = 'PlainText'; $PSStyle.FileInfo.Directory = ''; $PSStyle.FileInfo.SymbolicLink = ''; $PSStyle.FileInfo.Executable = '' }";
const TERMINAL_OUTPUT_MAX_BYTES: usize = 128 * 1024;
const TERMINAL_INPUT_MAX_BYTES: usize = 64 * 1024;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub(crate) struct TerminalProcessState {
    sessions: Mutex<HashMap<String, Arc<TerminalProcess>>>,
}

struct TerminalProcess {
    child: Mutex<ProcessTreeChild>,
    stdin: Arc<Mutex<ChildStdin>>,
    output: Arc<Mutex<TerminalOutputBuffer>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTerminalSessionRequest {
    session_id: String,
    terminal_id: String,
    workspace_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInputRequest {
    session_id: String,
    input: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadTerminalSessionRequest {
    session_id: String,
    output_cursor: Option<u64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    ok: bool,
    connected: bool,
    output: String,
    output_cursor: u64,
    output_reset: bool,
}

#[tauri::command]
pub fn start_terminal_session(
    state: State<'_, TerminalProcessState>,
    request: StartTerminalSessionRequest,
) -> Result<TerminalSessionSnapshot, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let terminal_id = normalize_terminal_id(&request.terminal_id)?;
    let workspace_path = normalize_workspace_path(&request.workspace_path)?;
    let terminal = terminal_catalog::find_available_terminal_entry(&terminal_id)
        .ok_or_else(|| "terminal-unavailable".to_string())?;
    let executable_path = terminal
        .executable_path
        .clone()
        .ok_or_else(|| "terminal-unavailable".to_string())?;

    if let Some(existing_session) = find_terminal_session(&state, &session_id)? {
        let mut existing_child = existing_session
            .child
            .lock()
            .map_err(|_| "terminal-state-unavailable".to_string())?;
        if is_child_running(&mut existing_child) {
            return Ok(create_snapshot(true, &existing_session));
        }
        drop(existing_child);
        remove_terminal_session_if_same(&state, &session_id, &existing_session)?;
    }

    let mut command = Command::new(&executable_path);
    command
        .args(create_terminal_args(terminal.id))
        .env("CLICOLOR", "0")
        .env("NO_COLOR", "1")
        .env("TERM", "dumb")
        .current_dir(workspace_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = ProcessTreeChild::spawn(&mut command)
        .map_err(|_| "terminal-start-failed".to_string())?;
    let stdin = Arc::new(Mutex::new(
        child
            .child_mut()
            .stdin
            .take()
            .ok_or_else(|| "terminal-stdin-unavailable".to_string())?,
    ));
    let output = Arc::new(Mutex::new(TerminalOutputBuffer::default()));

    if let Some(stdout) = child.child_mut().stdout.take() {
        spawn_output_reader(stdout, Arc::clone(&output));
    }

    if let Some(stderr) = child.child_mut().stderr.take() {
        spawn_output_reader(stderr, Arc::clone(&output));
    }

    let process = Arc::new(TerminalProcess {
        child: Mutex::new(child),
        stdin,
        output,
    });
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "terminal-state-unavailable".to_string())?;
    if let Some(existing_session) = sessions.get(&session_id).cloned() {
        drop(sessions);
        if let Ok(mut redundant_child) = process.child.lock() {
            let _ = redundant_child.terminate();
        }
        let mut existing_child = existing_session
            .child
            .lock()
            .map_err(|_| "terminal-state-unavailable".to_string())?;
        let connected = is_child_running(&mut existing_child);
        return Ok(create_snapshot(connected, &existing_session));
    }
    let snapshot = create_snapshot(true, &process);
    sessions.insert(session_id, process);

    Ok(snapshot)
}

#[tauri::command]
pub fn read_terminal_session(
    state: State<'_, TerminalProcessState>,
    request: ReadTerminalSessionRequest,
) -> Result<TerminalSessionSnapshot, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let Some(session) = find_terminal_session(&state, &session_id)? else {
        return Ok(TerminalSessionSnapshot {
            ok: true,
            connected: false,
            output: String::new(),
            output_cursor: request.output_cursor.unwrap_or(0),
            output_reset: false,
        });
    };

    let mut child = session
        .child
        .lock()
        .map_err(|_| "terminal-state-unavailable".to_string())?;
    let connected = is_child_running(&mut child);
    drop(child);
    let snapshot = create_snapshot_from_cursor(connected, &session, request.output_cursor);

    if !connected {
        remove_terminal_session_if_same(&state, &session_id, &session)?;
    }

    Ok(snapshot)
}

#[tauri::command]
pub fn write_terminal_session_input(
    state: State<'_, TerminalProcessState>,
    request: TerminalSessionInputRequest,
) -> Result<TerminalSessionSnapshot, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let input = normalize_terminal_input(&request.input)?;

    let session = find_terminal_session(&state, &session_id)?
        .ok_or_else(|| "terminal-session-not-connected".to_string())?;
    let mut child = session
        .child
        .lock()
        .map_err(|_| "terminal-state-unavailable".to_string())?;

    if !is_child_running(&mut child) {
        drop(child);
        remove_terminal_session_if_same(&state, &session_id, &session)?;
        return Err("terminal-session-not-connected".to_string());
    }
    drop(child);

    if is_clear_screen_command(input) {
        clear_process_output(&session)?;
        return Ok(create_snapshot(true, &session));
    }

    {
        let mut stdin = session
            .stdin
            .lock()
            .map_err(|_| "terminal-stdin-unavailable".to_string())?;
        stdin
            .write_all(input.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|_| "terminal-write-failed".to_string())?;
    }

    Ok(create_snapshot(true, &session))
}

#[tauri::command]
pub fn stop_terminal_session(
    state: State<'_, TerminalProcessState>,
    session_id: String,
) -> Result<TerminalSessionSnapshot, String> {
    let session_id = normalize_session_id(&session_id)?;
    let session = state
        .sessions
        .lock()
        .map_err(|_| "terminal-state-unavailable".to_string())?
        .remove(&session_id);

    if let Some(session) = session {
        let mut child = session
            .child
            .lock()
            .map_err(|_| "terminal-state-unavailable".to_string())?;
        let _ = child.terminate();
        drop(child);

        return Ok(create_snapshot(false, &session));
    }

    Ok(TerminalSessionSnapshot {
        ok: true,
        connected: false,
        output: String::new(),
        output_cursor: 0,
        output_reset: true,
    })
}

pub(crate) fn shutdown_all_terminal_sessions(state: &TerminalProcessState) {
    let sessions = state
        .sessions
        .lock()
        .map(|mut sessions| std::mem::take(&mut *sessions))
        .unwrap_or_default();

    for session in sessions.into_values() {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.terminate();
        }
    }
}

fn find_terminal_session(
    state: &TerminalProcessState,
    session_id: &str,
) -> Result<Option<Arc<TerminalProcess>>, String> {
    state
        .sessions
        .lock()
        .map(|sessions| sessions.get(session_id).cloned())
        .map_err(|_| "terminal-state-unavailable".to_string())
}

fn remove_terminal_session_if_same(
    state: &TerminalProcessState,
    session_id: &str,
    expected: &Arc<TerminalProcess>,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "terminal-state-unavailable".to_string())?;
    if sessions
        .get(session_id)
        .is_some_and(|session| Arc::ptr_eq(session, expected))
    {
        sessions.remove(session_id);
    }
    Ok(())
}

fn create_terminal_args(terminal_id: &str) -> Vec<&'static str> {
    match terminal_id {
        "powershell-core" | "windows-powershell" => vec![
            "-NoLogo",
            "-NoProfile",
            "-NoExit",
            "-Command",
            POWERSHELL_BOOTSTRAP_COMMAND,
        ],
        "command-prompt" => vec!["/Q", "/K", "chcp 65001 >NUL"],
        _ => Vec::new(),
    }
}

fn create_snapshot(connected: bool, process: &TerminalProcess) -> TerminalSessionSnapshot {
    create_snapshot_from_cursor(connected, process, None)
}

fn create_snapshot_from_cursor(
    connected: bool,
    process: &TerminalProcess,
    output_cursor: Option<u64>,
) -> TerminalSessionSnapshot {
    let output = process
        .output
        .lock()
        .map(|output| output.snapshot(output_cursor))
        .unwrap_or_else(|_| TerminalOutputSnapshot {
            output: String::new(),
            cursor: output_cursor.unwrap_or(0),
            reset: false,
        });

    TerminalSessionSnapshot {
        ok: true,
        connected,
        output: output.output,
        output_cursor: output.cursor,
        output_reset: output.reset,
    }
}

fn clear_process_output(process: &TerminalProcess) -> Result<(), String> {
    let mut output = process
        .output
        .lock()
        .map_err(|_| "terminal-output-unavailable".to_string())?;

    output.clear();
    Ok(())
}

fn is_clear_screen_command(input: &str) -> bool {
    matches!(
        input.trim().to_ascii_lowercase().as_str(),
        "clear" | "clear-host" | "cls"
    )
}

fn spawn_output_reader<R>(mut reader: R, output: Arc<Mutex<TerminalOutputBuffer>>)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        let mut output_state = TerminalOutputState::default();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => {
                    push_terminal_output(&buffer[..length], &output, &mut output_state);
                }
                Err(_) => break,
            }
        }
    });
}

#[derive(Default)]
struct TerminalOutputState {
    ansi_state: AnsiStripState,
    utf8_pending: Vec<u8>,
}

#[derive(Clone, Copy)]
enum AnsiStripState {
    Ground,
    Escape,
    Csi,
    Utf8CsiStart,
    Osc,
    OscEscape,
}

impl Default for AnsiStripState {
    fn default() -> Self {
        Self::Ground
    }
}

fn push_terminal_output(
    bytes: &[u8],
    output: &Arc<Mutex<TerminalOutputBuffer>>,
    state: &mut TerminalOutputState,
) {
    let cleaned = strip_ansi_sequences(bytes, &mut state.ansi_state);

    if cleaned.is_empty() {
        return;
    }

    state.utf8_pending.extend_from_slice(&cleaned);
    let mut decoded = String::new();

    loop {
        match std::str::from_utf8(&state.utf8_pending) {
            Ok(text) => {
                decoded.push_str(text);
                state.utf8_pending.clear();
                break;
            }
            Err(error) => {
                let valid_length = error.valid_up_to();

                if valid_length > 0 {
                    let valid_bytes = state.utf8_pending.drain(..valid_length).collect::<Vec<_>>();
                    decoded.push_str(&String::from_utf8_lossy(&valid_bytes));
                    continue;
                }

                if let Some(error_length) = error.error_len() {
                    let invalid_bytes =
                        state.utf8_pending.drain(..error_length).collect::<Vec<_>>();
                    decoded.push_str(&String::from_utf8_lossy(&invalid_bytes));
                    continue;
                }

                break;
            }
        }
    }

    if decoded.is_empty() {
        return;
    }

    if let Ok(mut output) = output.lock() {
        output.push(&decoded);
    }
}

#[derive(Default)]
struct TerminalOutputBuffer {
    content: String,
    base_cursor: u64,
    next_cursor: u64,
}

struct TerminalOutputSnapshot {
    output: String,
    cursor: u64,
    reset: bool,
}

impl TerminalOutputBuffer {
    fn push(&mut self, decoded: &str) {
        self.content.push_str(decoded);
        self.next_cursor = self.next_cursor.saturating_add(decoded.len() as u64);
        self.trim_to_limit();
    }

    fn clear(&mut self) {
        self.content.clear();
        self.base_cursor = self.next_cursor;
    }

    fn snapshot(&self, output_cursor: Option<u64>) -> TerminalOutputSnapshot {
        let Some(output_cursor) = output_cursor else {
            return TerminalOutputSnapshot {
                output: self.content.clone(),
                cursor: self.next_cursor,
                reset: true,
            };
        };

        if output_cursor < self.base_cursor || output_cursor > self.next_cursor {
            return TerminalOutputSnapshot {
                output: self.content.clone(),
                cursor: self.next_cursor,
                reset: true,
            };
        }

        let offset = (output_cursor - self.base_cursor) as usize;
        let Some(output) = self.content.get(offset..) else {
            return TerminalOutputSnapshot {
                output: self.content.clone(),
                cursor: self.next_cursor,
                reset: true,
            };
        };

        TerminalOutputSnapshot {
            output: output.to_owned(),
            cursor: self.next_cursor,
            reset: false,
        }
    }

    fn trim_to_limit(&mut self) {
        if self.content.len() <= TERMINAL_OUTPUT_MAX_BYTES {
            return;
        }

        let mut trim_bytes = self.content.len() - TERMINAL_OUTPUT_MAX_BYTES;

        while !self.content.is_char_boundary(trim_bytes) {
            trim_bytes += 1;
        }

        self.content.drain(..trim_bytes);
        self.base_cursor = self.base_cursor.saturating_add(trim_bytes as u64);
    }
}

fn strip_ansi_sequences(bytes: &[u8], state: &mut AnsiStripState) -> Vec<u8> {
    let mut cleaned = Vec::with_capacity(bytes.len());

    for &byte in bytes {
        match *state {
            AnsiStripState::Ground => match byte {
                0x1b => *state = AnsiStripState::Escape,
                0xc2 => *state = AnsiStripState::Utf8CsiStart,
                _ => cleaned.push(byte),
            },
            AnsiStripState::Escape => match byte {
                b'[' => *state = AnsiStripState::Csi,
                b']' => *state = AnsiStripState::Osc,
                _ => *state = AnsiStripState::Ground,
            },
            AnsiStripState::Csi => {
                if (0x40..=0x7e).contains(&byte) {
                    *state = AnsiStripState::Ground;
                }
            }
            AnsiStripState::Utf8CsiStart => {
                if byte == 0x9b {
                    *state = AnsiStripState::Csi;
                } else {
                    cleaned.push(0xc2);
                    cleaned.push(byte);
                    *state = AnsiStripState::Ground;
                }
            }
            AnsiStripState::Osc => match byte {
                0x07 => *state = AnsiStripState::Ground,
                0x1b => *state = AnsiStripState::OscEscape,
                _ => {}
            },
            AnsiStripState::OscEscape => {
                *state = if byte == b'\\' {
                    AnsiStripState::Ground
                } else {
                    AnsiStripState::Osc
                };
            }
        }
    }

    cleaned
}

fn is_child_running(child: &mut ProcessTreeChild) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn normalize_session_id(value: &str) -> Result<String, String> {
    let session_id = value.trim();

    if session_id.is_empty() {
        return Err("terminal-session-id-required".to_string());
    }

    Ok(session_id.to_string())
}

fn normalize_terminal_input(value: &str) -> Result<&str, String> {
    if value.len() > TERMINAL_INPUT_MAX_BYTES {
        Err("terminal-input-too-large".to_string())
    } else {
        Ok(value.trim_end_matches(['\r', '\n']))
    }
}

fn normalize_terminal_id(value: &str) -> Result<String, String> {
    let terminal_id = value.trim();

    if terminal_id.is_empty() {
        return Err("terminal-kind-required".to_string());
    }

    Ok(terminal_id.to_string())
}

fn normalize_workspace_path(value: &str) -> Result<String, String> {
    let workspace_path = value.trim();

    if workspace_path.is_empty() || !Path::new(workspace_path).is_dir() {
        return Err("terminal-workspace-path-invalid".to_string());
    }

    Ok(workspace_path.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        AnsiStripState, TERMINAL_INPUT_MAX_BYTES, TERMINAL_OUTPUT_MAX_BYTES, TerminalOutputBuffer,
        create_terminal_args, normalize_terminal_input, strip_ansi_sequences,
    };

    #[test]
    fn command_prompt_bootstrap_switches_to_utf8_codepage() {
        assert_eq!(
            create_terminal_args("command-prompt"),
            vec!["/Q", "/K", "chcp 65001 >NUL"]
        );
    }

    #[test]
    fn strip_ansi_sequences_preserves_korean_utf8_bytes() {
        let mut state = AnsiStripState::default();
        let input = "d----        2026-05-16 오후 12:33                \x1b[44;1mprojects\x1b[0m";
        let cleaned = strip_ansi_sequences(input.as_bytes(), &mut state);

        assert_eq!(
            String::from_utf8(cleaned).expect("terminal output should stay valid UTF-8"),
            "d----        2026-05-16 오후 12:33                projects"
        );
    }

    #[test]
    fn strip_ansi_sequences_preserves_korean_utf8_across_chunks() {
        let mut state = AnsiStripState::default();
        let input = "오후".as_bytes();
        let mut cleaned = Vec::new();

        cleaned.extend(strip_ansi_sequences(&input[..2], &mut state));
        cleaned.extend(strip_ansi_sequences(&input[2..], &mut state));

        assert_eq!(
            String::from_utf8(cleaned).expect("chunked terminal output should stay valid UTF-8"),
            "오후"
        );
    }

    #[test]
    fn terminal_output_buffer_returns_delta_from_cursor() {
        let mut output = TerminalOutputBuffer::default();
        output.push("hello");
        let first = output.snapshot(None);

        output.push(" world");
        let next = output.snapshot(Some(first.cursor));

        assert_eq!(next.output, " world");
        assert!(!next.reset);
    }

    #[test]
    fn terminal_output_buffer_resets_when_cursor_was_trimmed() {
        let mut output = TerminalOutputBuffer::default();
        output.push(&"a".repeat(TERMINAL_OUTPUT_MAX_BYTES + 10));
        let snapshot = output.snapshot(Some(0));

        assert!(snapshot.reset);
        assert_eq!(snapshot.output.len(), TERMINAL_OUTPUT_MAX_BYTES);
    }

    #[test]
    fn terminal_output_buffer_resets_on_invalid_utf8_cursor_boundary() {
        let mut output = TerminalOutputBuffer::default();
        output.push("가나다");

        let snapshot = output.snapshot(Some(1));

        assert!(snapshot.reset);
        assert_eq!(snapshot.output, "가나다");
    }

    #[test]
    fn terminal_input_is_bounded_by_encoded_byte_length() {
        assert!(normalize_terminal_input(&"a".repeat(TERMINAL_INPUT_MAX_BYTES)).is_ok());
        assert_eq!(
            normalize_terminal_input(&"가".repeat(TERMINAL_INPUT_MAX_BYTES)).unwrap_err(),
            "terminal-input-too-large"
        );
    }
}
