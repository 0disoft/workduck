use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

const REGISTRY_LOCK_DIRECTORY_NAME: &str = "workduck-workspace-registry-locks";

pub fn acquire_workspace_registry_lock(workspace_root: &Path) -> io::Result<fs::File> {
    let lock_path = workspace_registry_lock_path(workspace_root);
    let lock_root = lock_path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid registry lock path"))?;
    fs::create_dir_all(lock_root)?;
    reject_symlink(&lock_path)?;

    let lock_file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(lock_path)?;
    lock_file.lock()?;

    Ok(lock_file)
}

pub fn workspace_registry_lock_path(workspace_root: &Path) -> PathBuf {
    let digest = Sha256::digest(workspace_root.as_os_str().to_string_lossy().as_bytes());
    let lock_name = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    env::temp_dir()
        .join(REGISTRY_LOCK_DIRECTORY_NAME)
        .join(format!("{lock_name}.lock"))
}

fn reject_symlink(path: &Path) -> io::Result<()> {
    if fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "registry lock path must not be a symbolic link",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_registry_lock_is_exclusive_and_releases_on_drop() {
        let workspace = tempfile::tempdir().expect("workspace");
        let first = acquire_workspace_registry_lock(workspace.path()).expect("first lock");
        let second_path = workspace_registry_lock_path(workspace.path());
        let second = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(second_path)
            .expect("second lock file");

        assert!(matches!(second.try_lock(), Err(fs::TryLockError::WouldBlock)));
        drop(first);
        second.try_lock().expect("released lock");
    }
}
