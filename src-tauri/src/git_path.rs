use std::path::{Path, PathBuf};

pub(crate) fn git_process_path(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let path_text = path.to_string_lossy();

        if let Some(rest) = path_text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", rest));
        }

        if let Some(rest) = path_text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }

    path.to_path_buf()
}
