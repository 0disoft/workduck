use std::{
    ffi::OsStr,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Output, Stdio},
    thread,
    time::Duration,
};

use wait_timeout::ChildExt;

use crate::git_credential::{
    GitCredential, apply_git_credential, apply_safe_git_config, clear_git_credential_environment,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const CHILD_OUTPUT_MAX_BYTES: usize = 128 * 1024;

pub(crate) fn git_process_path(path: &Path) -> PathBuf {
    crate::path_display::non_verbatim_path(path)
}

#[derive(Debug)]
pub(crate) enum GitProcessError {
    Spawn(io::Error),
    TimedOut,
    Failed,
}

pub(crate) fn run_git_process<I, S>(
    working_dir: &Path,
    args: I,
    timeout: Duration,
    credential: Option<&GitCredential>,
    allow_system_credentials: bool,
) -> Result<Output, GitProcessError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let git_working_dir = git_process_path(working_dir);
    let mut command = Command::new("git");
    apply_safe_git_config(&mut command, allow_system_credentials);
    command
        .args(args)
        .current_dir(git_working_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    clear_git_credential_environment(&mut command);
    apply_git_credential(&mut command, credential);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().map_err(GitProcessError::Spawn)?;

    wait_for_child_output(child, timeout)
}

pub(crate) fn wait_for_child_output(
    mut child: Child,
    timeout: Duration,
) -> Result<Output, GitProcessError> {
    let stdout_reader = child.stdout.take().map(spawn_output_reader);
    let stderr_reader = child.stderr.take().map(spawn_output_reader);

    match child.wait_timeout(timeout) {
        Ok(Some(status)) => {
            let stdout = join_output_reader(stdout_reader);
            let stderr = join_output_reader(stderr_reader);

            Ok(Output {
                status,
                stdout,
                stderr,
            })
        }
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_output_reader(stdout_reader);
            let _ = join_output_reader(stderr_reader);

            Err(GitProcessError::TimedOut)
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_output_reader(stdout_reader);
            let _ = join_output_reader(stderr_reader);

            Err(GitProcessError::Failed)
        }
    }
}

fn spawn_output_reader<T>(mut reader: T) -> thread::JoinHandle<Vec<u8>>
where
    T: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => append_bounded_output(&mut output, &buffer[..length]),
                Err(_) => break,
            }
        }

        output
    })
}

fn join_output_reader(reader: Option<thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default()
}

fn append_bounded_output(output: &mut Vec<u8>, bytes: &[u8]) {
    if bytes.len() >= CHILD_OUTPUT_MAX_BYTES {
        output.clear();
        output.extend_from_slice(&bytes[bytes.len() - CHILD_OUTPUT_MAX_BYTES..]);
        return;
    }

    let overflow = output
        .len()
        .saturating_add(bytes.len())
        .saturating_sub(CHILD_OUTPUT_MAX_BYTES);

    if overflow > 0 {
        output.drain(..overflow);
    }

    output.extend_from_slice(bytes);
}

#[cfg(test)]
mod tests {
    use super::{append_bounded_output, CHILD_OUTPUT_MAX_BYTES};

    #[test]
    fn bounded_output_keeps_recent_bytes_after_multiple_chunks() {
        let mut output = Vec::new();
        append_bounded_output(&mut output, &vec![b'a'; CHILD_OUTPUT_MAX_BYTES - 3]);
        append_bounded_output(&mut output, b"bcdef");

        assert_eq!(output.len(), CHILD_OUTPUT_MAX_BYTES);
        assert!(output.iter().take(8).all(|byte| *byte == b'a'));
        assert_eq!(&output[output.len() - 5..], b"bcdef");
    }

    #[test]
    fn bounded_output_keeps_tail_when_single_chunk_exceeds_limit() {
        let mut output = b"old".to_vec();
        let mut large = vec![b'a'; CHILD_OUTPUT_MAX_BYTES + 10];
        large.extend_from_slice(b"tail");

        append_bounded_output(&mut output, &large);

        assert_eq!(output.len(), CHILD_OUTPUT_MAX_BYTES);
        assert_eq!(&output[output.len() - 4..], b"tail");
    }
}
