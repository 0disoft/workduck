pub(crate) fn is_windows_reserved_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();

    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || is_reserved_numbered_device(&stem, "COM")
        || is_reserved_numbered_device(&stem, "LPT")
}

fn is_reserved_numbered_device(stem: &str, prefix: &str) -> bool {
    let Some(suffix) = stem.strip_prefix(prefix) else {
        return false;
    };

    suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'1'..=b'9')
}

#[cfg(test)]
mod tests {
    use super::is_windows_reserved_name;

    #[test]
    fn detects_windows_reserved_device_names() {
        for name in ["CON", "prn", "AUX.txt", "nul.", "COM1", "lpt9.log"] {
            assert!(is_windows_reserved_name(name), "{name} should be reserved");
        }
    }

    #[test]
    fn allows_non_reserved_names_with_reserved_prefixes() {
        for name in ["console", "commit", "COM0", "COM10", "LPTX", "normal.txt"] {
            assert!(!is_windows_reserved_name(name), "{name} should be allowed");
        }
    }
}
