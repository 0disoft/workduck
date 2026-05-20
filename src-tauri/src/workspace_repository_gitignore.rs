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

/.workduck/*.local.json
/.workduck/secrets.local.json
/.workduck/secrets.tmp.json

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
