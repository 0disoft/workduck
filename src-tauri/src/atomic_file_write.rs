use std::{
    fs,
    io::{self, Write},
    path::Path,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AtomicFileWriteError {
    TargetInvalid,
    TargetAlreadyExists,
    WriteFailed,
}

#[derive(Clone, Copy)]
enum AtomicFileWriteMode {
    ExclusiveCreate,
    ReplaceOrCreate,
}

pub fn write_file_exclusively(
    file_path: &Path,
    content: &str,
) -> Result<(), AtomicFileWriteError> {
    write_file(file_path, content, AtomicFileWriteMode::ExclusiveCreate)
}

pub fn write_file_atomically(
    file_path: &Path,
    content: &str,
) -> Result<(), AtomicFileWriteError> {
    write_file(file_path, content, AtomicFileWriteMode::ReplaceOrCreate)
}

fn write_file(
    file_path: &Path,
    content: &str,
    mode: AtomicFileWriteMode,
) -> Result<(), AtomicFileWriteError> {
    reject_symlink_path(file_path)?;

    let parent = file_path
        .parent()
        .ok_or(AtomicFileWriteError::TargetInvalid)?;

    let mut temporary_file = tempfile::Builder::new()
        .prefix(".workduck-write.")
        .tempfile_in(parent)
        .map_err(|_| AtomicFileWriteError::WriteFailed)?;

    temporary_file
        .write_all(content.as_bytes())
        .and_then(|_| temporary_file.flush())
        .and_then(|_| temporary_file.as_file().sync_all())
        .map_err(|_| AtomicFileWriteError::WriteFailed)?;

    match mode {
        AtomicFileWriteMode::ExclusiveCreate => temporary_file
            .persist_noclobber(file_path)
            .map(|_| ())
            .map_err(|error| match error.error.kind() {
                io::ErrorKind::AlreadyExists => AtomicFileWriteError::TargetAlreadyExists,
                _ => AtomicFileWriteError::WriteFailed,
            }),
        AtomicFileWriteMode::ReplaceOrCreate => temporary_file
            .persist(file_path)
            .map(|_| ())
            .map_err(|_| AtomicFileWriteError::WriteFailed),
    }
}

fn reject_symlink_path(file_path: &Path) -> Result<(), AtomicFileWriteError> {
    if let Ok(metadata) = fs::symlink_metadata(file_path) {
        if metadata.file_type().is_symlink() {
            return Err(AtomicFileWriteError::TargetInvalid);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn exclusive_write_does_not_clobber_existing_file() {
        let dir = create_test_dir();
        let file_path = dir.join("target.json");
        fs::write(&file_path, "old content").expect("existing file");

        let result = write_file_exclusively(&file_path, "new content");
        let content = fs::read_to_string(&file_path).expect("target content");
        let temp_files = list_workduck_temp_files(&dir);
        fs::remove_dir_all(&dir).ok();

        assert_eq!(result, Err(AtomicFileWriteError::TargetAlreadyExists));
        assert_eq!(content, "old content");
        assert!(temp_files.is_empty(), "temporary files left behind: {temp_files:?}");
    }

    #[test]
    fn atomic_write_replaces_existing_file() {
        let dir = create_test_dir();
        let file_path = dir.join("target.json");
        fs::write(&file_path, "old content").expect("existing file");

        let result = write_file_atomically(&file_path, "new content");
        let content = fs::read_to_string(&file_path).expect("target content");
        let temp_files = list_workduck_temp_files(&dir);
        fs::remove_dir_all(&dir).ok();

        assert_eq!(result, Ok(()));
        assert_eq!(content, "new content");
        assert!(temp_files.is_empty(), "temporary files left behind: {temp_files:?}");
    }

    fn create_test_dir() -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("workduck-atomic-file-write-test-{unique}"));
        fs::create_dir_all(&dir).expect("test dir");
        dir
    }

    fn list_workduck_temp_files(parent: &Path) -> Vec<String> {
        fs::read_dir(parent)
            .expect("test dir")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(".workduck-write."))
            .collect()
    }
}
