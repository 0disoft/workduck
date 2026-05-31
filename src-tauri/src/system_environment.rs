use std::collections::HashSet;

const MAX_CLI_ENVIRONMENT_VARIABLES: usize = 64;
const MAX_CLI_ENVIRONMENT_NAME_LENGTH: usize = 128;
const MAX_CLI_ENVIRONMENT_VALUE_LENGTH: usize = 16_384;
const RESERVED_CLI_ENVIRONMENT_VARIABLE_NAMES: &[&str] = &[
    "ALLUSERSPROFILE",
    "APPDATA",
    "COMSPEC",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "LOGONSERVER",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_IDENTIFIER",
    "PROCESSOR_LEVEL",
    "PROCESSOR_REVISION",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "PSMODULEPATH",
    "PUBLIC",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERDOMAIN",
    "USERDOMAIN_ROAMINGPROFILE",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliEnvironmentVariableInput {
    name: String,
    value: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyCliEnvironmentVariablesResult {
    ok: bool,
    applied_names: Vec<String>,
    error: Option<&'static str>,
}

#[tauri::command]
pub fn apply_cli_environment_variables(
    variables: Vec<CliEnvironmentVariableInput>,
) -> ApplyCliEnvironmentVariablesResult {
    match apply_cli_environment_variables_to_user_scope(&variables) {
        Ok(applied_names) => ApplyCliEnvironmentVariablesResult {
            ok: true,
            applied_names,
            error: None,
        },
        Err(error) => ApplyCliEnvironmentVariablesResult {
            ok: false,
            applied_names: Vec::new(),
            error: Some(error),
        },
    }
}

pub fn read_cli_user_environment_variable(name: &str) -> Option<String> {
    if !is_allowed_cli_environment_variable_name(name) {
        return None;
    }

    read_user_environment_variable(name).filter(|value| !value.trim().is_empty())
}

fn apply_cli_environment_variables_to_user_scope(
    variables: &[CliEnvironmentVariableInput],
) -> Result<Vec<String>, &'static str> {
    if variables.is_empty() {
        return Err("cli-environment-empty");
    }

    if variables.len() > MAX_CLI_ENVIRONMENT_VARIABLES {
        return Err("cli-environment-too-large");
    }

    let mut seen_names = HashSet::new();
    let mut applied_names = Vec::with_capacity(variables.len());

    for variable in variables {
        let name = variable.name.trim();
        let value = variable.value.as_str();

        if !is_allowed_cli_environment_variable_name(name) {
            return Err("cli-environment-name-unsupported");
        }

        if !seen_names.insert(name.to_string()) {
            return Err("cli-environment-name-duplicate");
        }

        if value.trim().is_empty() || value.len() > MAX_CLI_ENVIRONMENT_VALUE_LENGTH {
            return Err("cli-environment-value-invalid");
        }

        if name.contains('\0') || value.contains('\0') {
            return Err("cli-environment-value-invalid");
        }

        write_user_environment_variable(name, value)?;
        applied_names.push(name.to_string());
    }

    notify_user_environment_changed();

    Ok(applied_names)
}

fn is_allowed_cli_environment_variable_name(name: &str) -> bool {
    if name.is_empty()
        || name.len() > MAX_CLI_ENVIRONMENT_NAME_LENGTH
        || RESERVED_CLI_ENVIRONMENT_VARIABLE_NAMES.contains(&name)
    {
        return false;
    }

    let mut chars = name.chars();
    let Some(first_char) = chars.next() else {
        return false;
    };

    if !(first_char == '_' || first_char.is_ascii_uppercase()) {
        return false;
    }

    chars.all(|character| {
        character == '_' || character.is_ascii_uppercase() || character.is_ascii_digit()
    })
}

#[cfg(windows)]
fn write_user_environment_variable(name: &str, value: &str) -> Result<(), &'static str> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (environment_key, _) = current_user
        .create_subkey("Environment")
        .map_err(|_| "cli-environment-write-failed")?;

    environment_key
        .set_value(name, &value)
        .map_err(|_| "cli-environment-write-failed")
}

#[cfg(not(windows))]
fn write_user_environment_variable(_name: &str, _value: &str) -> Result<(), &'static str> {
    Err("cli-environment-unsupported")
}

#[cfg(windows)]
fn notify_user_environment_changed() {
    use std::ffi::c_void;
    use std::ptr;

    const HWND_BROADCAST: isize = 0xffff;
    const WM_SETTINGCHANGE: u32 = 0x001a;
    const SMTO_ABORTIFHUNG: u32 = 0x0002;

    unsafe extern "system" {
        fn SendMessageTimeoutW(
            hwnd: *mut c_void,
            msg: u32,
            wparam: usize,
            lparam: isize,
            flags: u32,
            timeout: u32,
            result: *mut usize,
        ) -> isize;
    }

    let environment = "Environment"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    unsafe {
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST as *mut c_void,
            WM_SETTINGCHANGE,
            0,
            environment.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            ptr::null_mut(),
        );
    }
}

#[cfg(not(windows))]
fn notify_user_environment_changed() {}

#[cfg(windows)]
fn read_user_environment_variable(name: &str) -> Option<String> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let environment_key = current_user.open_subkey("Environment").ok()?;

    environment_key.get_value::<String, _>(name).ok()
}

#[cfg(not(windows))]
fn read_user_environment_variable(_name: &str) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::is_allowed_cli_environment_variable_name;

    #[test]
    fn allows_generic_safe_cli_environment_variable_names() {
        assert!(is_allowed_cli_environment_variable_name("OPENAI_API_KEY"));
        assert!(is_allowed_cli_environment_variable_name("NODE_AUTH_TOKEN"));
        assert!(is_allowed_cli_environment_variable_name("NPM_PUBLISH"));
        assert!(is_allowed_cli_environment_variable_name("_1PASSWORD_TOKEN"));
        assert!(is_allowed_cli_environment_variable_name("GITHUB_PAT_0DISOFT"));
    }

    #[test]
    fn rejects_reserved_or_malformed_cli_environment_variable_names() {
        assert!(!is_allowed_cli_environment_variable_name(""));
        assert!(!is_allowed_cli_environment_variable_name("npm_publish"));
        assert!(!is_allowed_cli_environment_variable_name("NPM-PUBLISH"));
        assert!(!is_allowed_cli_environment_variable_name("1PASSWORD_TOKEN"));
        assert!(!is_allowed_cli_environment_variable_name("PATH"));
        assert!(!is_allowed_cli_environment_variable_name("SYSTEMROOT"));
        assert!(!is_allowed_cli_environment_variable_name(&"A".repeat(129)));
    }
}
