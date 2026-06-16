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
        let _ = reader.read_to_end(&mut output);
        output
    })
}

fn join_output_reader(reader: Option<thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default()
}
