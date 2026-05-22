use std::path::{Path, PathBuf};

pub(crate) fn non_verbatim_path(path: &Path) -> PathBuf {
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

pub(crate) fn display_path(path: &Path) -> String {
    non_verbatim_path(path).to_string_lossy().into_owned()
}

pub(crate) fn display_path_text(value: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{}", rest);
        }

        if let Some(rest) = value.strip_prefix(r"\\?\") {
            return rest.to_owned();
        }
    }

    value.to_owned()
}
