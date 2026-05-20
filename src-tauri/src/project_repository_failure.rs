use std::process::Output;

use crate::project_repository::{ProjectRepositoryCloneError, ProjectRepositoryGitError};

pub(crate) struct CloneFailure {
    pub(crate) error: ProjectRepositoryCloneError,
}

pub(crate) fn classify_git_clone_failure(
    output: &Output,
    credential_present: bool,
) -> CloneFailure {
    let normalized_output = normalize_git_output(output);

    CloneFailure {
        error: classify_git_clone_output(&normalized_output, credential_present),
    }
}

pub(crate) fn classify_github_initial_commit_failure(
    output: &Output,
) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if normalized_output.contains("author identity unknown")
        || normalized_output.contains("please tell me who you are")
        || normalized_output.contains("unable to auto-detect email address")
    {
        ProjectRepositoryGitError::GithubCommitIdentityMissing
    } else if normalized_output.contains("index.lock")
        || normalized_output.contains("another git process")
    {
        ProjectRepositoryGitError::GithubCommitIndexLocked
    } else if normalized_output.contains("hook declined")
        || normalized_output.contains("pre-commit hook")
        || normalized_output.contains("commit-msg hook")
    {
        ProjectRepositoryGitError::GithubCommitHookFailed
    } else {
        ProjectRepositoryGitError::GithubCommitFailed
    }
}

pub(crate) fn classify_git_push_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("authentication failed")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied")
    {
        ProjectRepositoryGitError::PushAuthRequired
    } else if normalized_output.contains("src refspec")
        || normalized_output.contains("does not match any")
        || normalized_output.contains("no commits")
    {
        ProjectRepositoryGitError::PushEmpty
    } else {
        ProjectRepositoryGitError::PushFailed
    }
}

pub(crate) fn classify_git_fetch_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if git_output_needs_authentication(&normalized_output) {
        ProjectRepositoryGitError::FetchAuthRequired
    } else {
        ProjectRepositoryGitError::FetchFailed
    }
}

pub(crate) fn classify_git_pull_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if git_output_needs_authentication(&normalized_output) {
        ProjectRepositoryGitError::PullAuthRequired
    } else if normalized_output.contains("not possible to fast-forward")
        || normalized_output.contains("would be overwritten by merge")
        || normalized_output.contains("local changes")
        || normalized_output.contains("conflict")
    {
        ProjectRepositoryGitError::PullConflict
    } else {
        ProjectRepositoryGitError::PullFailed
    }
}

pub(crate) fn classify_github_publish_failure(output: &Output) -> ProjectRepositoryGitError {
    let normalized_output = normalize_git_output(output);

    if normalized_output.contains("not logged into")
        || normalized_output.contains("gh auth login")
        || normalized_output.contains("authentication")
        || normalized_output.contains("http 401")
        || normalized_output.contains("http 403")
    {
        ProjectRepositoryGitError::GithubAuthRequired
    } else if normalized_output.contains("remote origin already exists") {
        ProjectRepositoryGitError::GithubRemoteExists
    } else if normalized_output.contains("src refspec")
        || normalized_output.contains("does not match any")
        || normalized_output.contains("no commits")
    {
        ProjectRepositoryGitError::GithubEmpty
    } else {
        ProjectRepositoryGitError::GithubCreateFailed
    }
}

fn classify_git_clone_output(
    normalized_output: &str,
    credential_present: bool,
) -> ProjectRepositoryCloneError {
    if normalized_output.contains("already exists and is not an empty directory") {
        return ProjectRepositoryCloneError::CloneTargetExists;
    }

    if git_clone_output_has_organization_restriction(normalized_output) {
        return ProjectRepositoryCloneError::CloneOrganizationRestricted;
    }

    if git_clone_output_has_invalid_token(normalized_output, credential_present) {
        return ProjectRepositoryCloneError::CloneTokenInvalid;
    }

    if git_clone_output_needs_authentication(normalized_output) {
        return ProjectRepositoryCloneError::CloneAuthRequired;
    }

    if git_clone_output_has_missing_repository(normalized_output) {
        return ProjectRepositoryCloneError::CloneRepositoryNotFound;
    }

    if git_clone_output_has_permission_denial(normalized_output) {
        return ProjectRepositoryCloneError::ClonePermissionDenied;
    }

    ProjectRepositoryCloneError::CloneFailed
}

fn git_clone_output_has_organization_restriction(normalized_output: &str) -> bool {
    normalized_output.contains("saml")
        || normalized_output.contains("single sign-on")
        || normalized_output.contains("resource protected by organization")
        || normalized_output.contains("organization has enabled")
        || normalized_output.contains("oauth app access restrictions")
        || normalized_output.contains("personal access token is not authorized")
        || normalized_output.contains("credential is not authorized")
        || normalized_output.contains("must grant your personal access token")
        || normalized_output.contains("requires approval")
}

fn git_clone_output_has_invalid_token(
    normalized_output: &str,
    credential_present: bool,
) -> bool {
    normalized_output.contains("invalid username or token")
        || normalized_output.contains("bad credentials")
        || normalized_output.contains("password authentication is not supported")
        || normalized_output.contains("support for password authentication was removed")
        || (credential_present && normalized_output.contains("authentication failed"))
}

fn git_clone_output_needs_authentication(normalized_output: &str) -> bool {
    normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied (publickey)")
        || normalized_output.contains("authentication required")
        || normalized_output.contains("authentication failed")
}

fn git_clone_output_has_missing_repository(normalized_output: &str) -> bool {
    normalized_output.contains("repository not found")
        || normalized_output.contains("the requested url returned error: 404")
}

fn git_clone_output_has_permission_denial(normalized_output: &str) -> bool {
    normalized_output.contains("the requested url returned error: 403")
        || normalized_output.contains("access denied")
        || normalized_output.contains("not authorized")
        || normalized_output.contains("insufficient scope")
        || normalized_output.contains("does not have permission")
        || normalized_output.contains("read access to repository not granted")
        || normalized_output.contains("permission to")
}

fn normalize_git_output(output: &Output) -> String {
    let mut output_text = String::new();
    output_text.push_str(&String::from_utf8_lossy(&output.stdout));
    output_text.push_str(&String::from_utf8_lossy(&output.stderr));

    output_text.to_ascii_lowercase()
}

fn git_output_needs_authentication(normalized_output: &str) -> bool {
    normalized_output.contains("terminal prompts disabled")
        || normalized_output.contains("authentication failed")
        || normalized_output.contains("could not read username")
        || normalized_output.contains("permission denied")
}
