use std::process::Command;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use zeroize::{Zeroize, Zeroizing};

pub(crate) enum GitCredential {
    GithubToken(Zeroizing<String>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum GitCommandProfile {
    Inspection,
    Mutation,
}

pub(crate) fn github_token_credential(token: String) -> GitCredential {
    GitCredential::GithubToken(Zeroizing::new(token))
}

pub(crate) fn apply_safe_git_config(
    command: &mut Command,
    allow_system_credentials: bool,
    profile: GitCommandProfile,
) {
    let untracked_cache = match profile {
        GitCommandProfile::Inspection => "keep",
        GitCommandProfile::Mutation => "false",
    };
    let mut config = vec![
        ("core.fsmonitor", "false"),
        ("core.untrackedCache", untracked_cache),
        ("core.hooksPath", disabled_hooks_path()),
        ("core.sshCommand", ""),
        ("protocol.ext.allow", "never"),
    ];

    #[cfg(target_os = "windows")]
    config.push(("core.longpaths", "true"));

    for (key, value) in config {
        command.arg("-c").arg(format!("{key}={value}"));
    }

    if !allow_system_credentials {
        command.arg("-c").arg("credential.helper=");
    }
}

#[cfg(target_os = "windows")]
fn disabled_hooks_path() -> &'static str {
    "NUL"
}

#[cfg(not(target_os = "windows"))]
fn disabled_hooks_path() -> &'static str {
    "/dev/null"
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

    Some(github_token_credential(trimmed_value.to_owned()))
}

pub(crate) fn apply_git_credential(command: &mut Command, credential: Option<&GitCredential>) {
    let Some(GitCredential::GithubToken(token)) = credential else {
        return;
    };

    let mut basic_source = format!("x-access-token:{}", token.as_str());
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

    command.env("GH_TOKEN", token.as_str());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_git_config_disables_repo_executed_helpers() {
        let mut command = Command::new("git");
        apply_safe_git_config(&mut command, false, GitCommandProfile::Mutation);

        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "core.fsmonitor=false"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "core.untrackedCache=false"));
        assert!(args.windows(2).any(|pair| pair[0] == "-c" && pair[1] == "core.sshCommand="));
        #[cfg(target_os = "windows")]
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "core.longpaths=true"));
        assert!(args.windows(2).any(|pair| pair[0] == "-c" && pair[1] == "credential.helper="));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "protocol.ext.allow=never"));
        assert!(args.iter().any(|arg| arg.starts_with("core.hooksPath=")));
    }

    #[test]
    fn safe_git_config_can_preserve_system_credentials() {
        let mut command = Command::new("git");
        apply_safe_git_config(&mut command, true, GitCommandProfile::Mutation);

        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "core.fsmonitor=false"));
        assert!(!args.windows(2).any(|pair| pair[0] == "-c" && pair[1] == "credential.helper="));
    }

    #[test]
    fn safe_git_inspection_preserves_the_untracked_cache() {
        let mut command = Command::new("git");
        apply_safe_git_config(&mut command, false, GitCommandProfile::Inspection);

        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args.windows(2).any(|pair| {
            pair[0] == "-c" && pair[1] == "core.untrackedCache=keep"
        }));
        assert!(!args.windows(2).any(|pair| {
            pair[0] == "-c" && pair[1] == "core.untrackedCache=false"
        }));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "core.fsmonitor=false"));
    }

    #[test]
    fn git_credential_parser_trims_token_and_rejects_control_characters() {
        let credential = parse_git_credential(
            Some(" github-token ".to_string()),
            Some("  ghp_secret_token  ".to_string()),
        )
        .expect("github token credential");

        let GitCredential::GithubToken(token) = credential;
        assert_eq!(token.as_str(), "ghp_secret_token");

        assert!(parse_git_credential(
            Some("github-token".to_string()),
            Some("ghp_\nsecret".to_string())
        )
        .is_none());
        assert!(parse_git_credential(
            Some("other".to_string()),
            Some("ghp_secret_token".to_string())
        )
        .is_none());
    }

    #[test]
    fn git_credential_is_applied_as_github_extraheader() {
        let credential = github_token_credential("ghp_secret_token".to_string());
        let mut command = Command::new("git");

        apply_git_credential(&mut command, Some(&credential));

        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().into_owned(),
                    value.map(|value| value.to_string_lossy().into_owned()),
                )
            })
            .collect::<Vec<_>>();

        assert!(envs.contains(&("GIT_CONFIG_COUNT".to_string(), Some("1".to_string()))));
        assert!(envs.contains(&(
            "GIT_CONFIG_KEY_0".to_string(),
            Some("http.https://github.com/.extraheader".to_string())
        )));
        assert!(envs.iter().any(|(key, value)| {
            key == "GIT_CONFIG_VALUE_0"
                && value
                    .as_deref()
                    .is_some_and(|value| value.starts_with("AUTHORIZATION: basic "))
        }));
    }
}
