use std::process::Command;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use zeroize::Zeroize;

pub(crate) enum GitCredential {
    GithubToken(String),
}

pub(crate) fn parse_git_credential(
    credential_kind: Option<String>,
    credential_value: Option<String>,
) -> Option<GitCredential> {
    let kind = credential_kind?.trim().to_ascii_lowercase();
    let value = credential_value?;
    let trimmed_value = value.trim();

    if kind != "github-token"
        || trimmed_value.is_empty()
        || trimmed_value.chars().any(char::is_control)
    {
        return None;
    }

    Some(GitCredential::GithubToken(trimmed_value.to_owned()))
}

pub(crate) fn apply_git_credential(command: &mut Command, credential: Option<&GitCredential>) {
    let Some(GitCredential::GithubToken(token)) = credential else {
        return;
    };

    let mut basic_source = format!("x-access-token:{token}");
    let mut authorization_value =
        format!("AUTHORIZATION: basic {}", STANDARD.encode(&basic_source));
    basic_source.zeroize();

    command
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader")
        .env("GIT_CONFIG_VALUE_0", &authorization_value);
    authorization_value.zeroize();
}

pub(crate) fn clear_git_credential_environment(command: &mut Command) {
    command
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_KEY_0")
        .env_remove("GIT_CONFIG_VALUE_0")
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS");
}

pub(crate) fn apply_github_cli_credential(
    command: &mut Command,
    credential: Option<&GitCredential>,
) {
    let Some(GitCredential::GithubToken(token)) = credential else {
        return;
    };

    command.env("GH_TOKEN", token);
}
