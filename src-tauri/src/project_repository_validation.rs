use std::{
    fs, io,
    path::{Path, PathBuf},
};

use crate::project_repository::{ProjectRepositoryCloneError, ProjectRepositoryGitError};
use crate::workspace_path::{WorkspacePathValidationError, validate_workspace_directory_path};

const PROJECTS_DIRECTORY_NAME: &str = "projects";
const PROJECT_REPOSITORY_NAME_MAX_CHARS: usize = 120;
const PROJECT_REPOSITORY_REMOTE_URL_MAX_CHARS: usize = 2048;
const PROJECT_REPOSITORY_GITHUB_NAME_MAX_CHARS: usize = 100;
const PROJECT_REPOSITORY_COMMIT_MESSAGE_MAX_CHARS: usize = 200;

pub(crate) fn validate_workspace_root(path: &str) -> Result<PathBuf, ProjectRepositoryCloneError> {
    validate_workspace_directory_path(path).map_err(map_workspace_path_error)
}

pub(crate) fn validate_repository_path(path: &str) -> Result<PathBuf, ProjectRepositoryGitError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryGitError::PathRequired);
    }

    let repository_path = PathBuf::from(trimmed_path);

    if !repository_path.is_absolute() {
        return Err(ProjectRepositoryGitError::PathNotAbsolute);
    }

    let metadata = fs::metadata(&repository_path).map_err(map_repository_path_error)?;

    if !metadata.is_dir() {
        return Err(ProjectRepositoryGitError::PathNotDirectory);
    }

    let normalized_path = fs::canonicalize(&repository_path).map_err(map_repository_path_error)?;
    fs::read_dir(&normalized_path).map_err(map_repository_path_error)?;

    Ok(normalized_path)
}

pub(crate) fn validate_group_relative_path(
    relative_path: &str,
) -> Result<Vec<String>, ProjectRepositoryCloneError> {
    let trimmed_path = relative_path.trim().replace('\\', "/");

    if trimmed_path.is_empty() {
        return Err(ProjectRepositoryCloneError::GroupPathRequired);
    }

    let segments: Vec<String> = trimmed_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(str::to_owned)
        .collect();

    if segments.len() < 3 || segments.first().map(String::as_str) != Some(PROJECTS_DIRECTORY_NAME) {
        return Err(ProjectRepositoryCloneError::GroupPathInvalid);
    }

    if segments
        .iter()
        .any(|segment| validate_repository_folder_name(segment).is_err())
    {
        return Err(ProjectRepositoryCloneError::GroupPathInvalid);
    }

    Ok(segments)
}

pub(crate) fn resolve_group_path(
    workspace_root: &Path,
    group_segments: &[String],
) -> Result<PathBuf, ProjectRepositoryCloneError> {
    let mut group_path = workspace_root.to_path_buf();

    for segment in group_segments {
        group_path.push(segment);
    }

    let metadata = fs::symlink_metadata(&group_path).map_err(map_group_path_error)?;

    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ProjectRepositoryCloneError::GroupPathNotDirectory);
    }

    let normalized_group_path = fs::canonicalize(&group_path).map_err(map_group_path_error)?;

    if !normalized_group_path.starts_with(workspace_root) {
        return Err(ProjectRepositoryCloneError::GroupPathInvalid);
    }

    Ok(normalized_group_path)
}

pub(crate) fn validate_repository_folder_name(
    name: &str,
) -> Result<String, ProjectRepositoryCloneError> {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err(ProjectRepositoryCloneError::NameRequired);
    }

    if trimmed_name.chars().count() > PROJECT_REPOSITORY_NAME_MAX_CHARS
        || trimmed_name == "."
        || trimmed_name == ".."
        || trimmed_name.ends_with([' ', '.'])
        || is_windows_reserved_name(trimmed_name)
        || trimmed_name.chars().any(|character| {
            matches!(
                character,
                '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*'
            ) || character.is_control()
        })
    {
        return Err(ProjectRepositoryCloneError::NameInvalid);
    }

    Ok(trimmed_name.to_owned())
}

pub(crate) fn validate_remote_url(remote_url: &str) -> Result<String, ProjectRepositoryCloneError> {
    let trimmed_url = remote_url.trim();

    if trimmed_url.is_empty() {
        return Err(ProjectRepositoryCloneError::RemoteUrlRequired);
    }

    if trimmed_url.chars().count() > PROJECT_REPOSITORY_REMOTE_URL_MAX_CHARS
        || trimmed_url
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    if trimmed_url.contains("://") {
        validate_scheme_remote_url(trimmed_url)?;
    } else {
        validate_scp_like_remote_url(trimmed_url)?;
    }

    Ok(trimmed_url.to_owned())
}

pub(crate) fn validate_github_repository_name(
    repository_name: &str,
) -> Result<String, ProjectRepositoryGitError> {
    let trimmed_name = repository_name.trim().trim_end_matches(".git");

    if trimmed_name.is_empty() {
        return Err(ProjectRepositoryGitError::GithubRepoNameRequired);
    }

    let name_parts: Vec<&str> = trimmed_name.split('/').collect();

    if name_parts.len() > 2
        || trimmed_name.chars().count() > PROJECT_REPOSITORY_GITHUB_NAME_MAX_CHARS
        || name_parts
            .iter()
            .any(|part| !is_valid_github_repository_name_part(part))
    {
        return Err(ProjectRepositoryGitError::GithubRepoNameInvalid);
    }

    Ok(trimmed_name.to_owned())
}

pub(crate) fn validate_commit_message(message: &str) -> Result<String, ProjectRepositoryGitError> {
    let trimmed_message = message.trim();

    if trimmed_message.is_empty() {
        return Err(ProjectRepositoryGitError::GithubCommitMessageRequired);
    }

    if trimmed_message.chars().count() > PROJECT_REPOSITORY_COMMIT_MESSAGE_MAX_CHARS
        || trimmed_message.chars().any(char::is_control)
    {
        return Err(ProjectRepositoryGitError::GithubCommitMessageInvalid);
    }

    Ok(trimmed_message.to_owned())
}

pub(crate) fn validate_github_visibility(
    visibility: &str,
) -> Result<&'static str, ProjectRepositoryGitError> {
    match visibility.trim().to_ascii_lowercase().as_str() {
        "private" => Ok("--private"),
        "public" => Ok("--public"),
        _ => Err(ProjectRepositoryGitError::GithubVisibilityInvalid),
    }
}

fn is_valid_github_repository_name_part(part: &str) -> bool {
    !part.is_empty()
        && part != "."
        && part != ".."
        && !part.starts_with('.')
        && !part.ends_with('.')
        && part.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn validate_scheme_remote_url(remote_url: &str) -> Result<(), ProjectRepositoryCloneError> {
    let Some((scheme, rest)) = remote_url.split_once("://") else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };
    let scheme = scheme.to_ascii_lowercase();

    if !matches!(scheme.as_str(), "https" | "http" | "ssh" | "git") {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    let Some((authority, path)) = rest.split_once('/') else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };

    if authority.is_empty() || path.is_empty() {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    if matches!(scheme.as_str(), "https" | "http") && authority.contains('@') {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    Ok(())
}

fn validate_scp_like_remote_url(remote_url: &str) -> Result<(), ProjectRepositoryCloneError> {
    let Some((authority, path)) = remote_url.split_once(':') else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };
    let Some((user, host)) = authority.split_once('@') else {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    };

    if user.is_empty()
        || host.is_empty()
        || host.contains('/')
        || path.is_empty()
        || path.starts_with('/')
    {
        return Err(ProjectRepositoryCloneError::RemoteUrlInvalid);
    }

    Ok(())
}

fn map_workspace_path_error(error: WorkspacePathValidationError) -> ProjectRepositoryCloneError {
    match error {
        WorkspacePathValidationError::Required => ProjectRepositoryCloneError::WorkspaceRequired,
        WorkspacePathValidationError::NotAbsolute => ProjectRepositoryCloneError::WorkspaceNotAbsolute,
        WorkspacePathValidationError::NotFound => ProjectRepositoryCloneError::WorkspaceNotFound,
        WorkspacePathValidationError::NotDirectory => {
            ProjectRepositoryCloneError::WorkspaceNotDirectory
        }
        WorkspacePathValidationError::PermissionDenied => {
            ProjectRepositoryCloneError::WorkspacePermissionDenied
        }
        WorkspacePathValidationError::Unreadable => ProjectRepositoryCloneError::WorkspaceUnreadable,
    }
}

fn map_group_path_error(error: io::Error) -> ProjectRepositoryCloneError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectRepositoryCloneError::GroupPathNotFound,
        io::ErrorKind::PermissionDenied => ProjectRepositoryCloneError::WorkspacePermissionDenied,
        _ => ProjectRepositoryCloneError::WorkspaceUnreadable,
    }
}

fn map_repository_path_error(error: io::Error) -> ProjectRepositoryGitError {
    match error.kind() {
        io::ErrorKind::NotFound => ProjectRepositoryGitError::PathNotFound,
        io::ErrorKind::PermissionDenied => ProjectRepositoryGitError::PathPermissionDenied,
        _ => ProjectRepositoryGitError::PathUnreadable,
    }
}

fn is_windows_reserved_name(name: &str) -> bool {
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
    use super::*;

    #[test]
    fn workspace_and_group_paths_resolve_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("temporary workspace");
        let workspace_root = fs::canonicalize(temp_dir.path()).expect("canonical workspace");
        let group_path = workspace_root.join("projects").join("hobby").join("opensource");
        fs::create_dir_all(&group_path).expect("group path");

        let validated_workspace =
            validate_workspace_root(&workspace_root.to_string_lossy()).expect("workspace root");
        let group_segments =
            validate_group_relative_path(" projects\\hobby/opensource ").expect("group segments");
        let resolved_group =
            resolve_group_path(&validated_workspace, &group_segments).expect("resolved group path");

        assert_eq!(validated_workspace, workspace_root);
        assert_eq!(
            group_segments,
            vec![
                "projects".to_string(),
                "hobby".to_string(),
                "opensource".to_string()
            ]
        );
        assert_eq!(resolved_group, group_path);
    }

    #[test]
    fn group_relative_path_must_stay_under_projects_tree() {
        assert!(matches!(
            validate_group_relative_path("projects/hobby"),
            Err(ProjectRepositoryCloneError::GroupPathInvalid)
        ));
        assert!(matches!(
            validate_group_relative_path("../projects/hobby/opensource"),
            Err(ProjectRepositoryCloneError::GroupPathInvalid)
        ));
        assert!(matches!(
            validate_group_relative_path("projects/hobby/../opensource"),
            Err(ProjectRepositoryCloneError::GroupPathInvalid)
        ));
    }

    #[test]
    fn repository_folder_name_rejects_windows_reserved_or_ambiguous_names() {
        for invalid_name in ["", ".", "..", "CON", "com1.txt", "repo.", "bad/name"] {
            assert!(
                matches!(
                    validate_repository_folder_name(invalid_name),
                    Err(
                        ProjectRepositoryCloneError::NameRequired
                            | ProjectRepositoryCloneError::NameInvalid
                    )
                ),
                "{invalid_name:?} should be rejected"
            );
        }

        assert_eq!(
            validate_repository_folder_name(" workduck ").expect("repository folder name"),
            "workduck"
        );
    }

    #[test]
    fn remote_url_rejects_embedded_http_credentials_and_malformed_scp_forms() {
        assert_eq!(
            validate_remote_url(" https://github.com/workduck/workduck.git ")
                .expect("https remote"),
            "https://github.com/workduck/workduck.git"
        );
        assert_eq!(
            validate_remote_url("git@github.com:workduck/workduck.git").expect("scp remote"),
            "git@github.com:workduck/workduck.git"
        );

        for invalid_url in [
            "",
            "https://token@github.com/workduck/workduck.git",
            "ftp://github.com/workduck/workduck.git",
            "https://github.com",
            "git@github.com:/workduck/workduck.git",
            "github.com/workduck/workduck.git",
            "https://github.com/workduck/work duck.git",
        ] {
            assert!(
                matches!(
                    validate_remote_url(invalid_url),
                    Err(ProjectRepositoryCloneError::RemoteUrlRequired | ProjectRepositoryCloneError::RemoteUrlInvalid)
                ),
                "{invalid_url:?} should be rejected"
            );
        }
    }

    #[test]
    fn github_publish_inputs_reject_ambiguous_names_messages_and_visibility() {
        assert_eq!(
            expect_git_success(validate_github_repository_name("owner/repo.git")),
            "owner/repo"
        );
        assert!(matches!(
            validate_github_repository_name(".repo"),
            Err(ProjectRepositoryGitError::GithubRepoNameInvalid)
        ));
        assert!(matches!(
            validate_github_repository_name("owner/repo/extra"),
            Err(ProjectRepositoryGitError::GithubRepoNameInvalid)
        ));

        assert_eq!(
            expect_git_success(validate_commit_message(" chore: initial commit ")),
            "chore: initial commit"
        );
        assert!(matches!(
            validate_commit_message("bad\nmessage"),
            Err(ProjectRepositoryGitError::GithubCommitMessageInvalid)
        ));

        assert_eq!(
            expect_git_success(validate_github_visibility(" private ")),
            "--private"
        );
        assert!(matches!(
            validate_github_visibility("internal"),
            Err(ProjectRepositoryGitError::GithubVisibilityInvalid)
        ));
    }

    fn expect_git_success<T>(result: Result<T, ProjectRepositoryGitError>) -> T {
        match result {
            Ok(value) => value,
            Err(_) => panic!("expected git validation success"),
        }
    }
}
