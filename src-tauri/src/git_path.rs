// llmnav/1 module
// id=workduck.git.process-boundary
// role=Resolve Git from trusted absolute PATH entries and run prompt-free bounded child processes with separate inspection and mutation profiles.
// owns=Git executable resolution|Git process policy|bounded child output|finite pipe drain
// excludes=repository operation semantics|Git failure domain mapping
// search=resolve Git executable|bounded Git output|disable Git prompts
// invariant=Git is never resolved from the current directory or a caller-supplied path; captured output retains bounded head and tail bytes, and command and pipe-drain deadlines never wait on reader threads.
// stability=contract
// /llmnav
use std::{
    collections::VecDeque,
    env,
    ffi::OsStr,
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::OnceLock,
    thread,
    time::{Duration, Instant},
};

use crate::git_credential::{
    GitCommandProfile, GitCredential, apply_git_credential, apply_safe_git_config,
    clear_git_credential_environment,
};
use crate::process_tree::ProcessTreeChild;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const CHILD_OUTPUT_MAX_BYTES: usize = 128 * 1024;
const CHILD_OUTPUT_HEAD_MAX_BYTES: usize = CHILD_OUTPUT_MAX_BYTES / 2;
const CHILD_OUTPUT_TAIL_MAX_BYTES: usize = CHILD_OUTPUT_MAX_BYTES - CHILD_OUTPUT_HEAD_MAX_BYTES;
const CHILD_OUTPUT_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);
const CHILD_OUTPUT_POLL_INTERVAL: Duration = Duration::from_millis(10);

#[cfg(unix)]
use std::os::fd::AsRawFd;
#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

#[cfg(windows)]
trait OutputPipe: Read + AsRawHandle {}
#[cfg(windows)]
impl<T: Read + AsRawHandle> OutputPipe for T {}
#[cfg(unix)]
trait OutputPipe: Read + AsRawFd {}
#[cfg(unix)]
impl<T: Read + AsRawFd> OutputPipe for T {}
#[cfg(not(any(windows, unix)))]
trait OutputPipe: Read {}
#[cfg(not(any(windows, unix)))]
impl<T: Read> OutputPipe for T {}

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
    run_git_process_with_profile(
        working_dir,
        args,
        timeout,
        credential,
        allow_system_credentials,
        GitCommandProfile::Mutation,
    )
}

pub(crate) fn run_git_inspection_process<I, S>(
    working_dir: &Path,
    args: I,
    timeout: Duration,
) -> Result<Output, GitProcessError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_git_process_with_profile(
        working_dir,
        args,
        timeout,
        None,
        false,
        GitCommandProfile::Inspection,
    )
}

fn run_git_process_with_profile<I, S>(
    working_dir: &Path,
    args: I,
    timeout: Duration,
    credential: Option<&GitCredential>,
    allow_system_credentials: bool,
    profile: GitCommandProfile,
) -> Result<Output, GitProcessError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let git_executable = resolve_git_executable().map_err(GitProcessError::Spawn)?;
    let git_working_dir = git_process_path(working_dir);
    let mut command = Command::new(git_executable);
    apply_safe_git_config(&mut command, allow_system_credentials, profile);
    command
        .args(args)
        .current_dir(git_working_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if profile == GitCommandProfile::Inspection {
        command.env("GIT_OPTIONAL_LOCKS", "0");
    }
    clear_git_credential_environment(&mut command);
    apply_git_credential(&mut command, credential);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = ProcessTreeChild::spawn(&mut command).map_err(GitProcessError::Spawn)?;

    wait_for_child_output(child, timeout)
}

fn resolve_git_executable() -> io::Result<PathBuf> {
    static GIT_EXECUTABLE: OnceLock<PathBuf> = OnceLock::new();

    if let Some(executable) = GIT_EXECUTABLE.get() {
        return Ok(executable.clone());
    }

    let executable = resolve_system_executable("git")?;
    let _ = GIT_EXECUTABLE.set(executable.clone());
    Ok(GIT_EXECUTABLE.get().cloned().unwrap_or(executable))
}

fn resolve_system_executable(program_name: &str) -> io::Result<PathBuf> {
    let search_path = env::var_os("PATH").ok_or_else(|| executable_not_found(program_name))?;
    resolve_system_executable_from_path(program_name, &search_path)
}

fn resolve_system_executable_from_path(
    program_name: &str,
    search_path: &OsStr,
) -> io::Result<PathBuf> {
    validate_plain_program_name(program_name)?;

    for directory in env::split_paths(search_path).filter(|directory| directory.is_absolute()) {
        for candidate in executable_candidates(&directory, program_name) {
            if is_executable_file(&candidate) {
                return Ok(candidate);
            }
        }
    }

    Err(executable_not_found(program_name))
}

fn validate_plain_program_name(program_name: &str) -> io::Result<()> {
    if program_name.contains('/') || program_name.contains('\\') {
        return Err(invalid_executable_name(program_name));
    }

    let mut components = Path::new(program_name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(invalid_executable_name(program_name)),
    }
}

fn invalid_executable_name(program_name: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        format!("executable name must not contain path separators: {program_name}"),
    )
}

fn executable_not_found(program_name: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::NotFound,
        format!("executable not found on absolute PATH entries: {program_name}"),
    )
}

#[cfg(target_os = "windows")]
fn executable_candidates(directory: &Path, program_name: &str) -> Vec<PathBuf> {
    let program_path = Path::new(program_name);
    if program_path.extension().is_some() {
        vec![directory.join(program_name)]
    } else {
        vec![directory.join(format!("{program_name}.exe"))]
    }
}

#[cfg(not(target_os = "windows"))]
fn executable_candidates(directory: &Path, program_name: &str) -> Vec<PathBuf> {
    vec![directory.join(program_name)]
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}

pub(crate) fn wait_for_child_output(
    mut child: ProcessTreeChild,
    timeout: Duration,
) -> Result<Output, GitProcessError> {
    let stdout_pipe = child.child_mut().stdout.take();
    let stderr_pipe = child.child_mut().stderr.take();
    wait_for_child_output_with_pipes(child, timeout, stdout_pipe, stderr_pipe)
}

fn wait_for_child_output_with_pipes<A: OutputPipe, B: OutputPipe>(
    mut child: ProcessTreeChild,
    timeout: Duration,
    mut stdout_pipe: Option<A>,
    mut stderr_pipe: Option<B>,
) -> Result<Output, GitProcessError> {
    let command_deadline = Instant::now()
        .checked_add(timeout)
        .ok_or(GitProcessError::Failed)?;
    if let Some(pipe) = &stdout_pipe {
        configure_output_pipe(pipe).map_err(|_| GitProcessError::Failed)?;
    }
    if let Some(pipe) = &stderr_pipe {
        configure_output_pipe(pipe).map_err(|_| GitProcessError::Failed)?;
    }
    let mut stdout = BoundedOutputBuffer::new();
    let mut stderr = BoundedOutputBuffer::new();
    let mut status = None;
    let mut drain_deadline = None;

    loop {
        let stdout_progress =
            poll_output_pipe(&mut stdout_pipe, &mut stdout).map_err(|_| GitProcessError::Failed)?;
        let stderr_progress =
            poll_output_pipe(&mut stderr_pipe, &mut stderr).map_err(|_| GitProcessError::Failed)?;
        if status.is_none() {
            status = child.try_wait().map_err(|_| GitProcessError::Failed)?;
            if status.is_some() {
                drain_deadline = Some(Instant::now() + CHILD_OUTPUT_DRAIN_TIMEOUT);
            }
        }
        let now = Instant::now();
        if let Some(status) = status {
            if stdout_pipe.is_none() && stderr_pipe.is_none() {
                return Ok(Output {
                    status,
                    stdout: stdout.into_bytes(),
                    stderr: stderr.into_bytes(),
                });
            }
            if drain_deadline.is_some_and(|deadline| now >= deadline) {
                return Err(GitProcessError::TimedOut);
            }
        } else if now >= command_deadline {
            let _ = child.terminate();
            return Err(GitProcessError::TimedOut);
        }
        if !stdout_progress && !stderr_progress {
            let deadline = drain_deadline.unwrap_or(command_deadline);
            thread::sleep(CHILD_OUTPUT_POLL_INTERVAL.min(deadline.saturating_duration_since(now)));
        }
    }
}

fn poll_output_pipe<T: OutputPipe>(
    pipe: &mut Option<T>,
    output: &mut BoundedOutputBuffer,
) -> io::Result<bool> {
    let Some(reader) = pipe.as_mut() else {
        return Ok(false);
    };
    let mut bytes = [0_u8; 4096];
    match read_available_output(reader, &mut bytes) {
        Ok(0) => {
            *pipe = None;
            Ok(false)
        }
        Ok(length) => {
            output.append(&bytes[..length]);
            Ok(true)
        }
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
            ) =>
        {
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn configure_output_pipe<T: OutputPipe>(_pipe: &T) -> io::Result<()> {
    Ok(())
}

#[cfg(windows)]
fn read_available_output<T: OutputPipe>(pipe: &mut T, bytes: &mut [u8]) -> io::Result<usize> {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn PeekNamedPipe(
            handle: *mut core::ffi::c_void,
            buffer: *mut core::ffi::c_void,
            buffer_size: u32,
            bytes_read: *mut u32,
            available: *mut u32,
            message_bytes_left: *mut u32,
        ) -> i32;
    }
    let mut available = 0;
    let result = unsafe {
        PeekNamedPipe(
            pipe.as_raw_handle().cast(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            &mut available,
            std::ptr::null_mut(),
        )
    };
    if result == 0 {
        let error = io::Error::last_os_error();
        return if matches!(error.raw_os_error(), Some(109 | 233)) {
            Ok(0)
        } else {
            Err(error)
        };
    }
    if available == 0 {
        return Err(io::ErrorKind::WouldBlock.into());
    }
    // This loop exclusively owns the read end. Consume no more than the bytes
    // already available, so Read cannot wait for another writer.
    let length = bytes.len().min(available as usize);
    pipe.read(&mut bytes[..length])
}

#[cfg(unix)]
fn configure_output_pipe<T: OutputPipe>(pipe: &T) -> io::Result<()> {
    let flags = unsafe { libc::fcntl(pipe.as_raw_fd(), libc::F_GETFL) };
    if flags < 0
        || unsafe { libc::fcntl(pipe.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0
    {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn read_available_output<T: OutputPipe>(pipe: &mut T, bytes: &mut [u8]) -> io::Result<usize> {
    pipe.read(bytes)
}

#[cfg(not(any(windows, unix)))]
fn configure_output_pipe<T: OutputPipe>(_pipe: &T) -> io::Result<()> {
    Err(io::ErrorKind::Unsupported.into())
}

#[cfg(not(any(windows, unix)))]
fn read_available_output<T: OutputPipe>(_pipe: &mut T, _bytes: &mut [u8]) -> io::Result<usize> {
    Err(io::ErrorKind::Unsupported.into())
}

struct BoundedOutputBuffer {
    head: Vec<u8>,
    tail: VecDeque<u8>,
}

impl BoundedOutputBuffer {
    fn new() -> Self {
        Self {
            head: Vec::with_capacity(CHILD_OUTPUT_HEAD_MAX_BYTES),
            tail: VecDeque::with_capacity(CHILD_OUTPUT_TAIL_MAX_BYTES),
        }
    }

    fn append(&mut self, bytes: &[u8]) {
        let head_remaining = CHILD_OUTPUT_HEAD_MAX_BYTES.saturating_sub(self.head.len());
        let head_length = head_remaining.min(bytes.len());
        self.head.extend_from_slice(&bytes[..head_length]);
        let tail_bytes = &bytes[head_length..];

        if tail_bytes.len() >= CHILD_OUTPUT_TAIL_MAX_BYTES {
            self.tail.clear();
            self.tail.extend(
                tail_bytes[tail_bytes.len() - CHILD_OUTPUT_TAIL_MAX_BYTES..]
                    .iter()
                    .copied(),
            );
            return;
        }

        let overflow = self
            .tail
            .len()
            .saturating_add(tail_bytes.len())
            .saturating_sub(CHILD_OUTPUT_TAIL_MAX_BYTES);
        if overflow > 0 {
            self.tail.drain(..overflow);
        }
        self.tail.extend(tail_bytes.iter().copied());
    }

    fn into_bytes(self) -> Vec<u8> {
        let mut output = Vec::with_capacity(self.head.len().saturating_add(self.tail.len()));
        output.extend_from_slice(&self.head);
        output.extend(self.tail);
        output
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BoundedOutputBuffer, CHILD_OUTPUT_HEAD_MAX_BYTES, CHILD_OUTPUT_MAX_BYTES,
        resolve_system_executable_from_path, validate_plain_program_name,
    };
    use std::{
        env,
        ffi::OsString,
        fs,
        path::{Path, PathBuf},
        sync::Mutex,
    };

    static CURRENT_DIR_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[cfg(any(windows, unix))]
    fn output_test_command(_windows_script: &str, _unix_script: &str) -> std::process::Command {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut command = {
            use std::os::windows::process::CommandExt;
            let powershell = PathBuf::from(env::var_os("SystemRoot").unwrap())
                .join("System32/WindowsPowerShell/v1.0/powershell.exe");
            let mut command = Command::new(powershell);
            command
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    _windows_script,
                ])
                .creation_flags(0x0800_0000);
            command
        };
        #[cfg(unix)]
        let mut command = {
            let mut command = Command::new("/bin/sh");
            command.args(["-c", _unix_script]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }

    #[cfg(any(windows, unix))]
    #[test]
    fn finite_output_capture_preserves_exit_code_both_streams_and_bounded_head_tail() {
        let mut command = output_test_command(
            "[Console]::Out.Write('HEAD:'); [Console]::Out.Write(('x' * 139264)); [Console]::Out.Write('TAIL'); [Console]::Error.Write('ERR'); exit 7",
            "printf HEAD:; i=0; while [ \"$i\" -lt 8192 ]; do printf xxxxxxxxxxxxxxxxx; i=$((i+1)); done; printf TAIL; printf ERR >&2; exit 7",
        );
        let child = crate::process_tree::ProcessTreeChild::spawn(&mut command).unwrap();
        let output =
            super::wait_for_child_output(child, std::time::Duration::from_secs(10)).unwrap();
        assert_eq!(output.status.code(), Some(7));
        assert_eq!(output.stdout.len(), CHILD_OUTPUT_MAX_BYTES);
        assert!(output.stdout.starts_with(b"HEAD:"));
        assert!(output.stdout.ends_with(b"TAIL"));
        assert_eq!(output.stderr, b"ERR");
    }

    #[cfg(any(windows, unix))]
    #[test]
    fn quiet_open_pipes_do_not_prevent_command_timeout() {
        let mut command = output_test_command("Start-Sleep -Seconds 30", "sleep 30");
        let child = crate::process_tree::ProcessTreeChild::spawn(&mut command).unwrap();
        let started = std::time::Instant::now();
        assert!(matches!(
            super::wait_for_child_output(child, std::time::Duration::from_millis(50)),
            Err(super::GitProcessError::TimedOut)
        ));
        assert!(started.elapsed() < std::time::Duration::from_secs(4));
    }

    #[cfg(any(windows, unix))]
    #[test]
    fn parent_exit_has_a_shared_drain_deadline_and_closes_pipes_with_independent_writers() {
        use std::io::{Write, pipe};
        let (stdout, mut stdout_writer) = pipe().unwrap();
        let (stderr, mut stderr_writer) = pipe().unwrap();
        stdout_writer.write_all(b"before-stdout").unwrap();
        stderr_writer.write_all(b"before-stderr").unwrap();
        let mut command = output_test_command("exit 0", "exit 0");
        command
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        let child = crate::process_tree::ProcessTreeChild::spawn(&mut command).unwrap();
        let started = std::time::Instant::now();
        let result = super::wait_for_child_output_with_pipes(
            child,
            std::time::Duration::from_secs(5),
            Some(stdout),
            Some(stderr),
        );
        assert!(matches!(result, Err(super::GitProcessError::TimedOut)));
        assert!(started.elapsed() < std::time::Duration::from_secs(4));
        // Both writers remain independently owned, and no reader thread keeps
        // either read end alive after the function returns.
        assert!(stdout_writer.write_all(b"after").is_err());
        assert!(stderr_writer.write_all(b"after").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn pipe_read_errors_are_reported_instead_of_returning_empty_success() {
        let file = tempfile::tempfile().unwrap();
        let mut pipe = Some(file);
        let mut output = BoundedOutputBuffer::new();
        assert!(super::poll_output_pipe(&mut pipe, &mut output).is_err());
    }

    #[cfg(any(windows, unix))]
    #[test]
    fn continuously_arriving_output_does_not_extend_the_command_deadline() {
        use std::io::{Write, pipe};
        let (reader, mut writer) = pipe().unwrap();
        let producer = std::thread::spawn(move || {
            let mut chunks = 0;
            while writer.write_all(&[b'x'; 4096]).is_ok() {
                chunks += 1;
            }
            chunks
        });
        let mut command = output_test_command("Start-Sleep -Seconds 30", "sleep 30");
        command
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        let child = crate::process_tree::ProcessTreeChild::spawn(&mut command).unwrap();
        let started = std::time::Instant::now();
        let result = super::wait_for_child_output_with_pipes(
            child,
            std::time::Duration::from_millis(200),
            Some(reader),
            None::<std::io::PipeReader>,
        );
        assert!(matches!(result, Err(super::GitProcessError::TimedOut)));
        assert!(producer.join().unwrap() > 0);
        assert!(started.elapsed() < std::time::Duration::from_secs(4));
    }

    #[test]
    fn actual_git_inspection_runs_through_the_finite_output_loop() {
        let workspace = tempfile::tempdir().unwrap();
        let output = super::run_git_inspection_process(
            workspace.path(),
            ["--version"],
            std::time::Duration::from_secs(5),
        )
        .unwrap();
        assert!(output.status.success());
        assert!(output.stdout.starts_with(b"git version "));
    }

    #[test]
    fn bounded_output_keeps_the_head_and_recent_tail_after_multiple_chunks() {
        let mut buffer = BoundedOutputBuffer::new();
        buffer.append(&vec![b'a'; CHILD_OUTPUT_MAX_BYTES - 3]);
        buffer.append(b"bcdef");
        let output = buffer.into_bytes();

        assert_eq!(output.len(), CHILD_OUTPUT_MAX_BYTES);
        assert!(output.iter().take(8).all(|byte| *byte == b'a'));
        assert_eq!(&output[output.len() - 5..], b"bcdef");
    }

    #[test]
    fn bounded_output_keeps_head_and_tail_when_single_chunk_exceeds_limit() {
        let mut large = b"branch-header\n".to_vec();
        large.extend(vec![b'a'; CHILD_OUTPUT_MAX_BYTES + 10]);
        large.extend_from_slice(b"tail");
        let mut buffer = BoundedOutputBuffer::new();
        buffer.append(&large);
        let output = buffer.into_bytes();

        assert_eq!(output.len(), CHILD_OUTPUT_MAX_BYTES);
        assert!(output.starts_with(b"branch-header\n"));
        assert_eq!(&output[output.len() - 4..], b"tail");
    }

    #[test]
    fn bounded_output_preserves_git_status_branch_headers_above_the_limit() {
        let mut buffer = BoundedOutputBuffer::new();
        buffer.append(b"# branch.oid abc\n# branch.head main\n# branch.ab +2 -3\n");
        buffer.append(&vec![b'x'; CHILD_OUTPUT_MAX_BYTES * 2]);
        let output = buffer.into_bytes();
        let head = String::from_utf8_lossy(&output[..CHILD_OUTPUT_HEAD_MAX_BYTES]);

        assert!(head.contains("# branch.head main"));
        assert!(head.contains("# branch.ab +2 -3"));
        assert_eq!(output.len(), CHILD_OUTPUT_MAX_BYTES);
    }

    #[test]
    fn system_executable_resolution_ignores_current_directory_path_entries() {
        let _guard = CURRENT_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let original_current_dir = env::current_dir().expect("read current directory");
        let restore_current_dir = CurrentDirRestore::new(original_current_dir);
        let sandbox = unique_test_directory("workduck-safe-executable-resolution");
        let current_dir = sandbox.join("current");
        let trusted_dir = sandbox.join("trusted");
        fs::create_dir_all(&current_dir).expect("create current directory");
        fs::create_dir_all(&trusted_dir).expect("create trusted directory");
        write_test_executable(&current_dir.join(test_executable_file_name()), "malicious");
        let trusted_executable = trusted_dir.join(test_executable_file_name());
        write_test_executable(&trusted_executable, "trusted");

        env::set_current_dir(&current_dir).expect("move into unsafe current directory");
        let search_path = env::join_paths([
            OsString::new(),
            OsString::from("."),
            trusted_dir.as_os_str().to_owned(),
        ])
        .expect("join search path");

        let resolved = resolve_system_executable_from_path(test_program_name(), &search_path)
            .expect("resolve executable from trusted absolute path");

        assert_eq!(resolved, trusted_executable);
        drop(restore_current_dir);
        let _ = fs::remove_dir_all(&sandbox);
    }

    #[test]
    fn system_executable_resolution_rejects_program_paths() {
        assert_eq!(
            validate_plain_program_name("").unwrap_err().kind(),
            std::io::ErrorKind::InvalidInput
        );
        assert_eq!(
            validate_plain_program_name("bin/git").unwrap_err().kind(),
            std::io::ErrorKind::InvalidInput
        );
        assert_eq!(
            validate_plain_program_name("bin\\git").unwrap_err().kind(),
            std::io::ErrorKind::InvalidInput
        );
    }

    struct CurrentDirRestore {
        original_current_dir: PathBuf,
    }

    impl CurrentDirRestore {
        fn new(original_current_dir: PathBuf) -> Self {
            Self {
                original_current_dir,
            }
        }
    }

    impl Drop for CurrentDirRestore {
        fn drop(&mut self) {
            let _ = env::set_current_dir(&self.original_current_dir);
        }
    }

    fn unique_test_directory(name: &str) -> PathBuf {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time after Unix epoch")
            .as_nanos();
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("workduck-test-sandboxes")
            .join(format!("{name}-{}-{timestamp}", std::process::id()))
    }

    fn test_program_name() -> &'static str {
        "git"
    }

    #[cfg(target_os = "windows")]
    fn test_executable_file_name() -> &'static str {
        "git.exe"
    }

    #[cfg(not(target_os = "windows"))]
    fn test_executable_file_name() -> &'static str {
        "git"
    }

    fn write_test_executable(path: &Path, contents: &str) {
        fs::write(path, contents).expect("write test executable");
        make_test_executable(path);
    }

    #[cfg(unix)]
    fn make_test_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(path)
            .expect("read test executable metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).expect("mark test executable");
    }

    #[cfg(not(unix))]
    fn make_test_executable(_path: &Path) {}
}
