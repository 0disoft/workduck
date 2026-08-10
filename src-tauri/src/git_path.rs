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
    time::Duration,
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
    let stdout_reader = child.child_mut().stdout.take().map(spawn_output_reader);
    let stderr_reader = child.child_mut().stderr.take().map(spawn_output_reader);

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
            let _ = child.terminate();
            let _ = join_output_reader(stdout_reader);
            let _ = join_output_reader(stderr_reader);

            Err(GitProcessError::TimedOut)
        }
        Err(_) => {
            let _ = child.terminate();
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
        let mut output = BoundedOutputBuffer::new();
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => output.append(&buffer[..length]),
                Err(_) => break,
            }
        }

        output.into_bytes()
    })
}

fn join_output_reader(reader: Option<thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default()
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
