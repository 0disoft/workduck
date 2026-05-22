use std::path::{Path, PathBuf};

pub(crate) fn git_process_path(path: &Path) -> PathBuf {
    crate::path_display::non_verbatim_path(path)
}
