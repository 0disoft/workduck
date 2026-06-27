use std::{
    env,
    ffi::OsStr,
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
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
    let git_executable = resolve_system_executable("git").map_err(GitProcessError::Spawn)?;
    let git_working_dir = git_process_path(working_dir);
    let mut command = Command::new(git_executable);
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
    use super::{
        append_bounded_output, resolve_system_executable_from_path, validate_plain_program_name,
        CHILD_OUTPUT_MAX_BYTES,
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
