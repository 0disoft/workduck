use std::process::Command;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use zeroize::Zeroize;

pub(crate) enum GitCredential {
    GithubToken(String),
}

pub(crate) fn apply_safe_git_config(command: &mut Command, allow_system_credentials: bool) {
    let mut config = vec![
        ("core.fsmonitor", "false"),
        ("core.untrackedCache", "false"),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_git_config_disables_repo_executed_helpers() {
        let mut command = Command::new("git");
        apply_safe_git_config(&mut command, false);

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
        apply_safe_git_config(&mut command, true);

        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "core.fsmonitor=false"));
        assert!(!args.windows(2).any(|pair| pair[0] == "-c" && pair[1] == "credential.helper="));
    }
}
