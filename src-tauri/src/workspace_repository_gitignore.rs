use std::{fs, io, path::Path};

const WORKDUCK_GITIGNORE_BLOCK_MARKER: &str = "# BEGIN WORKDUCK WORKSPACE";
const WORKDUCK_GITIGNORE_BLOCK_END_MARKER: &str = "# END WORKDUCK WORKSPACE";
const LEGACY_WORKDUCK_SECRETS_IGNORE_RULE: &str = "/.workduck/secrets*.json";

const WORKDUCK_GITIGNORE_BLOCK: &str = "\
# BEGIN WORKDUCK WORKSPACE
/projects/*
!/projects/
!/projects/.gitkeep

/.mustflow/cache/
/.mustflow/state/
/.mustflow/backups/

/node_modules/

/.workduck/*.local.json
/.workduck/secrets.local.json
/.workduck/secrets.tmp.json
/.workduck/agent-evaluation-*.json

.DS_Store
Thumbs.db
.vscode/
.zed/
# END WORKDUCK WORKSPACE
";

pub fn ensure_workduck_gitignore(workspace_root: &Path) -> io::Result<bool> {
    let gitignore_path = workspace_root.join(".gitignore");

    match fs::metadata(&gitignore_path) {
        Ok(metadata) if metadata.is_dir() => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                ".gitignore is a directory",
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::write(&gitignore_path, WORKDUCK_GITIGNORE_BLOCK)?;
            return Ok(true);
        }
        Err(error) => return Err(error),
    }

    let content = fs::read_to_string(&gitignore_path)?;

    if let Some(next_content) = replace_workduck_gitignore_block(&content) {
        if next_content == content {
            return Ok(false);
        }

        fs::write(&gitignore_path, next_content)?;
        return Ok(true);
    }

    let mut next_content = content;

    if !next_content.ends_with('\n') {
        next_content.push('\n');
    }

    next_content.push('\n');
    next_content.push_str(WORKDUCK_GITIGNORE_BLOCK);

    fs::write(&gitignore_path, next_content)?;

    Ok(true)
}

pub fn ensure_secrets_sync_gitignore_policy(workspace_root: &Path) -> io::Result<bool> {
    let gitignore_path = workspace_root.join(".gitignore");

    match fs::metadata(&gitignore_path) {
        Ok(metadata) if metadata.is_dir() => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                ".gitignore is a directory",
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    }

    let content = fs::read_to_string(&gitignore_path)?;

    if content.contains(WORKDUCK_GITIGNORE_BLOCK_MARKER) {
        if let Some(next_content) = replace_workduck_gitignore_block(&content) {
            if next_content == content {
                return Ok(false);
            }

            fs::write(&gitignore_path, next_content)?;
            return Ok(true);
        }
    }

    if !content.contains(LEGACY_WORKDUCK_SECRETS_IGNORE_RULE) {
        return Ok(false);
    }

    let next_content = content.replace(
        LEGACY_WORKDUCK_SECRETS_IGNORE_RULE,
        "/.workduck/secrets.local.json\n/.workduck/secrets.tmp.json",
    );

    fs::write(&gitignore_path, next_content)?;

    Ok(true)
}

fn replace_workduck_gitignore_block(content: &str) -> Option<String> {
    let start_index = content.find(WORKDUCK_GITIGNORE_BLOCK_MARKER)?;
    let relative_end_index = content[start_index..].find(WORKDUCK_GITIGNORE_BLOCK_END_MARKER)?;
    let end_index = start_index + relative_end_index + WORKDUCK_GITIGNORE_BLOCK_END_MARKER.len();
    let mut next_content = String::new();

    next_content.push_str(&content[..start_index]);
    next_content.push_str(WORKDUCK_GITIGNORE_BLOCK);
    next_content.push_str(content[end_index..].trim_start_matches(|value| value == '\r' || value == '\n'));

    Some(next_content)
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUEUE_REPORT_IGNORE_RULE: &str = "/queue/reports/*.workduck-report.json";
    const QUEUE_WORK_ORDER_IGNORE_RULE: &str =
        "/queue/work-orders/*.workduck-work-order.json";

    #[test]
    fn new_workspace_gitignore_keeps_queue_artifacts_trackable() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");

        assert!(ensure_workduck_gitignore(tempdir.path()).expect("write managed gitignore"));

        let content = fs::read_to_string(tempdir.path().join(".gitignore"))
            .expect("read managed gitignore");
        assert!(!content.contains(QUEUE_REPORT_IGNORE_RULE));
        assert!(!content.contains(QUEUE_WORK_ORDER_IGNORE_RULE));
    }

    #[test]
    fn managed_gitignore_update_removes_legacy_queue_artifact_rules() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let gitignore_path = tempdir.path().join(".gitignore");
        let legacy_managed_block = WORKDUCK_GITIGNORE_BLOCK.replace(
            "\n.DS_Store",
            &format!(
                "\n{QUEUE_REPORT_IGNORE_RULE}\n{QUEUE_WORK_ORDER_IGNORE_RULE}\n\n.DS_Store"
            ),
        );
        fs::write(
            &gitignore_path,
            format!("custom-rule\n\n{legacy_managed_block}"),
        )
        .expect("write existing managed gitignore");

        assert!(ensure_workduck_gitignore(tempdir.path()).expect("update managed gitignore"));

        let content = fs::read_to_string(gitignore_path).expect("read updated gitignore");
        assert!(content.starts_with("custom-rule\n\n"));
        assert!(!content.contains(QUEUE_REPORT_IGNORE_RULE));
        assert!(!content.contains(QUEUE_WORK_ORDER_IGNORE_RULE));
    }
}
