use std::collections::HashSet;

const MAX_CLI_ENVIRONMENT_VARIABLES: usize = 8;
const MAX_CLI_ENVIRONMENT_VALUE_LENGTH: usize = 16_384;
const ALLOWED_CLI_ENVIRONMENT_VARIABLE_NAMES: &[&str] = &[
    "OPENROUTER_API_KEY",
    "OPEN_ROUTER_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
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

    Ok(applied_names)
}

fn is_allowed_cli_environment_variable_name(name: &str) -> bool {
    ALLOWED_CLI_ENVIRONMENT_VARIABLE_NAMES.contains(&name)
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
