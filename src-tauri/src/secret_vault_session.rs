use std::{
    collections::{HashMap, HashSet},
    sync::{OnceLock, RwLock},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serializer;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use zeroize::{Zeroize, Zeroizing};

use crate::secret_vault_crypto::{
    SecretVaultEnvelope, decrypt_secret_vault_payload, encrypt_secret_vault_payload,
};

const ENVIRONMENT_VAULT_VERSION: u8 = 1;
const ENVIRONMENT_SECRET_COUNT_MAX: usize = 1_024;
const ENVIRONMENT_SECRET_ID_MAX_LENGTH: usize = 200;
const ENVIRONMENT_SECRET_NAME_MAX_LENGTH: usize = 120;
const ENVIRONMENT_SECRET_VALUE_MAX_LENGTH: usize = 16_384;
const ENVIRONMENT_SECRET_TAGS_MAX_COUNT: usize = 8;
const SECRET_REFERENCE_PREFIX: &str = "workduck-secret-ref:v1:";

const ERROR_WORKSPACE_REQUIRED: &str = "environment-vault-session-workspace-required";
const ERROR_PASSWORD_REQUIRED: &str = "environment-vault-session-password-required";
const ERROR_DECRYPT_FAILED: &str = "environment-vault-session-decrypt-failed";
const ERROR_INVALID: &str = "environment-vault-session-invalid";
const ERROR_LOCKED: &str = "environment-vault-session-locked";
const ERROR_STORE_FAILED: &str = "environment-vault-session-store-failed";
const ERROR_SECRET_NAME_REQUIRED: &str = "environment-secret-name-required";
const ERROR_SECRET_KIND_REQUIRED: &str = "environment-secret-kind-required";
const ERROR_SECRET_TAG_REQUIRED: &str = "environment-secret-tag-required";
const ERROR_SECRET_NAME_DUPLICATE: &str = "environment-secret-name-duplicate";
const ERROR_SECRET_VALUE_REQUIRED: &str = "environment-secret-value-required";
const ERROR_SECRET_NOT_FOUND: &str = "environment-secret-not-found";

static ENVIRONMENT_VAULT_SESSIONS: OnceLock<
    RwLock<HashMap<String, EnvironmentVaultSession>>,
> = OnceLock::new();

struct EnvironmentVaultSession {
    password: Zeroizing<String>,
    vault: EnvironmentVaultPayload,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentVaultPayload {
    version: u8,
    workspace_id: String,
    #[serde(default)]
    secrets: Vec<EnvironmentSecretPayload>,
    updated_at: String,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentSecretPayload {
    id: String,
    name: String,
    kind: String,
    #[serde(default)]
    tags: Vec<String>,
    value: String,
    created_at: String,
    updated_at: String,
}

impl Drop for EnvironmentSecretPayload {
    fn drop(&mut self) {
        self.value.zeroize();
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVaultSessionView {
    version: u8,
    workspace_id: String,
    secrets: Vec<EnvironmentSecretSessionView>,
    updated_at: String,
    native_managed: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentSecretSessionView {
    id: String,
    name: String,
    kind: String,
    tags: Vec<String>,
    /// Compatibility field for existing callers. This is an opaque native reference, never plaintext.
    value: String,
    value_length: usize,
    created_at: String,
    updated_at: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSecretMutationInput {
    #[serde(default)]
    id: Option<String>,
    name: String,
    kind: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    value: Option<String>,
}

struct SecretValueOutput(String);

impl serde::Serialize for SecretValueOutput {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl Drop for SecretValueOutput {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVaultSessionCommandResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    vault: Option<EnvironmentVaultSessionView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    envelope: Option<SecretVaultEnvelope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<SecretValueOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SecretReferenceError {
    InvalidReference,
    SessionLocked,
    SecretNotFound,
    StoreUnavailable,
}

#[tauri::command]
pub fn create_environment_vault_session(
    workspace_id: String,
    password: String,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim().to_owned();
    let password = Zeroizing::new(password);

    if !workspace_id_is_valid(&workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    if password.is_empty() {
        return failed(ERROR_PASSWORD_REQUIRED);
    }

    let vault = EnvironmentVaultPayload {
        version: ENVIRONMENT_VAULT_VERSION,
        workspace_id: workspace_id.clone(),
        secrets: Vec::new(),
        updated_at: current_timestamp(),
    };
    let envelope = match encrypt_vault_payload(password.as_str(), &vault) {
        Ok(envelope) => envelope,
        Err(error) => return failed(error),
    };
    let view = create_session_view(&vault);

    let mut sessions = match environment_vault_sessions().write() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    sessions.insert(
        workspace_id,
        EnvironmentVaultSession {
            password,
            vault,
        },
    );

    succeeded_with_vault_and_envelope(view, envelope)
}

#[tauri::command]
pub fn open_environment_vault_session(
    workspace_id: String,
    password: String,
    envelope: SecretVaultEnvelope,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim().to_owned();
    let password = Zeroizing::new(password);

    if !workspace_id_is_valid(&workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    if password.is_empty() {
        return failed(ERROR_PASSWORD_REQUIRED);
    }

    let decryption = decrypt_secret_vault_payload(password.as_str().to_owned(), envelope);
    if !decryption.ok {
        return failed(ERROR_DECRYPT_FAILED);
    }

    let Some(plaintext) = decryption.plaintext else {
        return failed(ERROR_DECRYPT_FAILED);
    };
    let plaintext = Zeroizing::new(plaintext);
    let mut vault = match serde_json::from_str::<EnvironmentVaultPayload>(plaintext.as_str()) {
        Ok(vault) => vault,
        Err(_) => return failed(ERROR_INVALID),
    };

    if normalize_loaded_vault(&mut vault, &workspace_id).is_err() {
        return failed(ERROR_INVALID);
    }

    let view = create_session_view(&vault);
    let mut sessions = match environment_vault_sessions().write() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    sessions.insert(
        workspace_id,
        EnvironmentVaultSession {
            password,
            vault,
        },
    );

    succeeded_with_vault(view)
}

#[tauri::command]
pub fn read_environment_vault_session(
    workspace_id: String,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim();

    if !workspace_id_is_valid(workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    let sessions = match environment_vault_sessions().read() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    let Some(session) = sessions.get(workspace_id) else {
        return failed(ERROR_LOCKED);
    };

    succeeded_with_vault(create_session_view(&session.vault))
}

#[tauri::command]
pub fn close_environment_vault_session(
    workspace_id: String,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim();

    if !workspace_id_is_valid(workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    let mut sessions = match environment_vault_sessions().write() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    sessions.remove(workspace_id);

    succeeded()
}

#[tauri::command]
pub fn upsert_environment_vault_secret(
    workspace_id: String,
    input: EnvironmentSecretMutationInput,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim();

    if !workspace_id_is_valid(workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    let mut sessions = match environment_vault_sessions().write() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    let Some(session) = sessions.get_mut(workspace_id) else {
        return failed(ERROR_LOCKED);
    };
    let mut next_vault = session.vault.clone();

    if let Err(error) = apply_secret_upsert(&mut next_vault, input) {
        return failed(error);
    }

    let envelope = match encrypt_vault_payload(session.password.as_str(), &next_vault) {
        Ok(envelope) => envelope,
        Err(error) => return failed(error),
    };
    let view = create_session_view(&next_vault);
    session.vault = next_vault;

    succeeded_with_vault_and_envelope(view, envelope)
}

#[tauri::command]
pub fn remove_environment_vault_secret(
    workspace_id: String,
    secret_id: String,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim();
    let secret_id = secret_id.trim();

    if !workspace_id_is_valid(workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    let mut sessions = match environment_vault_sessions().write() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    let Some(session) = sessions.get_mut(workspace_id) else {
        return failed(ERROR_LOCKED);
    };
    let mut next_vault = session.vault.clone();
    let previous_count = next_vault.secrets.len();
    next_vault.secrets.retain(|secret| secret.id != secret_id);

    if next_vault.secrets.len() == previous_count {
        return failed(ERROR_SECRET_NOT_FOUND);
    }

    next_vault.updated_at = current_timestamp();
    let envelope = match encrypt_vault_payload(session.password.as_str(), &next_vault) {
        Ok(envelope) => envelope,
        Err(error) => return failed(error),
    };
    let view = create_session_view(&next_vault);
    session.vault = next_vault;

    succeeded_with_vault_and_envelope(view, envelope)
}

#[tauri::command]
pub fn read_environment_vault_secret_value(
    workspace_id: String,
    secret_id: String,
) -> EnvironmentVaultSessionCommandResult {
    let workspace_id = workspace_id.trim();
    let secret_id = secret_id.trim();

    if !workspace_id_is_valid(workspace_id) {
        return failed(ERROR_WORKSPACE_REQUIRED);
    }

    let sessions = match environment_vault_sessions().read() {
        Ok(sessions) => sessions,
        Err(_) => return failed(ERROR_STORE_FAILED),
    };
    let Some(session) = sessions.get(workspace_id) else {
        return failed(ERROR_LOCKED);
    };
    let Some(secret) = session
        .vault
        .secrets
        .iter()
        .find(|secret| secret.id == secret_id)
    else {
        return failed(ERROR_SECRET_NOT_FOUND);
    };

    EnvironmentVaultSessionCommandResult {
        ok: true,
        vault: None,
        envelope: None,
        value: Some(SecretValueOutput(secret.value.clone())),
        error: None,
    }
}

pub(crate) fn resolve_secret_reference_or_value(
    value: &str,
) -> Result<Zeroizing<String>, SecretReferenceError> {
    if !value.starts_with(SECRET_REFERENCE_PREFIX) {
        return Ok(Zeroizing::new(value.to_owned()));
    }

    let (workspace_id, secret_id) = parse_secret_reference(value)?;
    let sessions = environment_vault_sessions()
        .read()
        .map_err(|_| SecretReferenceError::StoreUnavailable)?;
    let session = sessions
        .get(&workspace_id)
        .ok_or(SecretReferenceError::SessionLocked)?;
    let secret = session
        .vault
        .secrets
        .iter()
        .find(|secret| secret.id == secret_id)
        .ok_or(SecretReferenceError::SecretNotFound)?;

    Ok(Zeroizing::new(secret.value.clone()))
}

pub(crate) fn shutdown_all_secret_vault_sessions() {
    if let Some(sessions) = ENVIRONMENT_VAULT_SESSIONS.get()
        && let Ok(mut sessions) = sessions.write()
    {
        sessions.clear();
    }
}

fn environment_vault_sessions() -> &'static RwLock<HashMap<String, EnvironmentVaultSession>> {
    ENVIRONMENT_VAULT_SESSIONS.get_or_init(|| RwLock::new(HashMap::new()))
}

fn encrypt_vault_payload(
    password: &str,
    vault: &EnvironmentVaultPayload,
) -> Result<SecretVaultEnvelope, &'static str> {
    let plaintext = Zeroizing::new(
        serde_json::to_string(vault).map_err(|_| ERROR_INVALID)?,
    );
    let encryption = encrypt_secret_vault_payload(
        password.to_owned(),
        plaintext.as_str().to_owned(),
    );

    if encryption.ok {
        encryption.envelope.ok_or(ERROR_STORE_FAILED)
    } else {
        Err(ERROR_STORE_FAILED)
    }
}

fn normalize_loaded_vault(
    vault: &mut EnvironmentVaultPayload,
    expected_workspace_id: &str,
) -> Result<(), ()> {
    if vault.version != ENVIRONMENT_VAULT_VERSION
        || vault.workspace_id.trim() != expected_workspace_id
        || vault.secrets.len() > ENVIRONMENT_SECRET_COUNT_MAX
    {
        return Err(());
    }

    vault.workspace_id = expected_workspace_id.to_owned();
    if vault.updated_at.trim().is_empty() {
        vault.updated_at = current_timestamp();
    }

    let mut seen_ids = HashSet::new();
    let mut seen_names = HashSet::new();

    for secret in &mut vault.secrets {
        secret.id = secret.id.trim().to_owned();
        secret.name = normalize_secret_name(&secret.name);
        secret.kind = normalize_secret_kind(&secret.kind).ok_or(())?.to_owned();
        secret.tags = normalize_secret_tags(&secret.tags);

        if !secret_id_is_valid(&secret.id)
            || secret.name.is_empty()
            || secret.value.is_empty()
            || secret.value.chars().count() > ENVIRONMENT_SECRET_VALUE_MAX_LENGTH
            || !seen_ids.insert(secret.id.clone())
            || !seen_names.insert(secret.name.to_lowercase())
        {
            return Err(());
        }

        if secret.created_at.trim().is_empty() {
            secret.created_at = secret.updated_at.clone();
        }
        if secret.updated_at.trim().is_empty() {
            secret.updated_at = secret.created_at.clone();
        }
    }

    sort_secrets(&mut vault.secrets);
    Ok(())
}

fn apply_secret_upsert(
    vault: &mut EnvironmentVaultPayload,
    input: EnvironmentSecretMutationInput,
) -> Result<(), &'static str> {
    let id = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned);
    let name = normalize_secret_name(&input.name);
    let kind = normalize_secret_kind(&input.kind).ok_or(ERROR_SECRET_KIND_REQUIRED)?;
    let tags = normalize_secret_tags(&input.tags);

    if name.is_empty() {
        return Err(ERROR_SECRET_NAME_REQUIRED);
    }
    if tags.is_empty() {
        return Err(ERROR_SECRET_TAG_REQUIRED);
    }

    let existing_index = id
        .as_deref()
        .and_then(|id| vault.secrets.iter().position(|secret| secret.id == id));

    if id.is_some() && existing_index.is_none() {
        return Err(ERROR_SECRET_NOT_FOUND);
    }

    if vault.secrets.iter().enumerate().any(|(index, secret)| {
        Some(index) != existing_index && secret.name.eq_ignore_ascii_case(&name)
    }) {
        return Err(ERROR_SECRET_NAME_DUPLICATE);
    }

    let value = input.value.unwrap_or_default();
    let timestamp = current_timestamp();

    match existing_index {
        Some(index) => {
            if !value.is_empty() && value.chars().count() > ENVIRONMENT_SECRET_VALUE_MAX_LENGTH {
                return Err(ERROR_SECRET_VALUE_REQUIRED);
            }

            let secret = &mut vault.secrets[index];
            secret.name = name;
            secret.kind = kind.to_owned();
            secret.tags = tags;
            if !value.is_empty() {
                secret.value.zeroize();
                secret.value = value;
            }
            secret.updated_at = timestamp.clone();
        }
        None => {
            if value.is_empty() || value.chars().count() > ENVIRONMENT_SECRET_VALUE_MAX_LENGTH {
                return Err(ERROR_SECRET_VALUE_REQUIRED);
            }
            if vault.secrets.len() >= ENVIRONMENT_SECRET_COUNT_MAX {
                return Err(ERROR_STORE_FAILED);
            }

            let id = create_secret_id()?;
            vault.secrets.push(EnvironmentSecretPayload {
                id,
                name,
                kind: kind.to_owned(),
                tags,
                value,
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            });
        }
    }

    vault.updated_at = timestamp;
    sort_secrets(&mut vault.secrets);
    Ok(())
}

fn create_session_view(vault: &EnvironmentVaultPayload) -> EnvironmentVaultSessionView {
    EnvironmentVaultSessionView {
        version: vault.version,
        workspace_id: vault.workspace_id.clone(),
        secrets: vault
            .secrets
            .iter()
            .map(|secret| EnvironmentSecretSessionView {
                id: secret.id.clone(),
                name: secret.name.clone(),
                kind: secret.kind.clone(),
                tags: secret.tags.clone(),
                value: create_secret_reference(&vault.workspace_id, &secret.id),
                value_length: secret.value.chars().count(),
                created_at: secret.created_at.clone(),
                updated_at: secret.updated_at.clone(),
            })
            .collect(),
        updated_at: vault.updated_at.clone(),
        native_managed: true,
    }
}

fn create_secret_reference(workspace_id: &str, secret_id: &str) -> String {
    let mut raw = String::with_capacity(workspace_id.len() + secret_id.len() + 1);
    raw.push_str(workspace_id);
    raw.push('\0');
    raw.push_str(secret_id);

    format!("{SECRET_REFERENCE_PREFIX}{}", URL_SAFE_NO_PAD.encode(raw.as_bytes()))
}

fn parse_secret_reference(value: &str) -> Result<(String, String), SecretReferenceError> {
    let encoded = value
        .strip_prefix(SECRET_REFERENCE_PREFIX)
        .ok_or(SecretReferenceError::InvalidReference)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(encoded.as_bytes())
        .map_err(|_| SecretReferenceError::InvalidReference)?;
    let decoded = String::from_utf8(decoded)
        .map_err(|_| SecretReferenceError::InvalidReference)?;
    let mut parts = decoded.split('\0');
    let workspace_id = parts.next().unwrap_or_default();
    let secret_id = parts.next().unwrap_or_default();

    if parts.next().is_some()
        || !workspace_id_is_valid(workspace_id)
        || !secret_id_is_valid(secret_id)
    {
        return Err(SecretReferenceError::InvalidReference);
    }

    Ok((workspace_id.to_owned(), secret_id.to_owned()))
}

fn create_secret_id() -> Result<String, &'static str> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random).map_err(|_| ERROR_STORE_FAILED)?;

    Ok(format!("secret_{}", URL_SAFE_NO_PAD.encode(random)))
}

fn normalize_secret_name(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(ENVIRONMENT_SECRET_NAME_MAX_LENGTH)
        .collect()
}

fn normalize_secret_kind(value: &str) -> Option<&'static str> {
    match value.trim() {
        "api-key" => Some("api-key"),
        "token" => Some("token"),
        "ssh-key" => Some("ssh-key"),
        "account" => Some("account"),
        "password" => Some("password"),
        "other" => Some("other"),
        _ => None,
    }
}

fn normalize_secret_tags(tags: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();

    for tag in tags {
        let tag = tag.trim();
        if !environment_secret_tag_is_allowed(tag)
            || normalized.iter().any(|existing| existing == tag)
        {
            continue;
        }
        normalized.push(tag.to_owned());

        if normalized.len() >= ENVIRONMENT_SECRET_TAGS_MAX_COUNT {
            break;
        }
    }

    normalized
}

fn environment_secret_tag_is_allowed(value: &str) -> bool {
    matches!(
        value,
        "llm"
            | "github"
            | "gitlab"
            | "openai"
            | "anthropic"
            | "openrouter"
            | "umans"
            | "cloud"
            | "database"
            | "auth"
            | "sync"
            | "deployment"
            | "monitoring"
            | "payment"
            | "storage"
    )
}

fn workspace_id_is_valid(value: &str) -> bool {
    !value.is_empty() && value.len() <= ENVIRONMENT_SECRET_ID_MAX_LENGTH && !value.contains('\0')
}

fn secret_id_is_valid(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= ENVIRONMENT_SECRET_ID_MAX_LENGTH
        && !value.chars().any(char::is_control)
}

fn sort_secrets(secrets: &mut [EnvironmentSecretPayload]) {
    secrets.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

fn succeeded() -> EnvironmentVaultSessionCommandResult {
    EnvironmentVaultSessionCommandResult {
        ok: true,
        vault: None,
        envelope: None,
        value: None,
        error: None,
    }
}

fn succeeded_with_vault(
    vault: EnvironmentVaultSessionView,
) -> EnvironmentVaultSessionCommandResult {
    EnvironmentVaultSessionCommandResult {
        ok: true,
        vault: Some(vault),
        envelope: None,
        value: None,
        error: None,
    }
}

fn succeeded_with_vault_and_envelope(
    vault: EnvironmentVaultSessionView,
    envelope: SecretVaultEnvelope,
) -> EnvironmentVaultSessionCommandResult {
    EnvironmentVaultSessionCommandResult {
        ok: true,
        vault: Some(vault),
        envelope: Some(envelope),
        value: None,
        error: None,
    }
}

fn failed(error: &'static str) -> EnvironmentVaultSessionCommandResult {
    EnvironmentVaultSessionCommandResult {
        ok: false,
        vault: None,
        envelope: None,
        value: None,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_workspace_id(label: &str) -> String {
        let mut random = [0_u8; 8];
        getrandom::fill(&mut random).expect("random test workspace suffix");
        format!("workspace_{label}_{}", URL_SAFE_NO_PAD.encode(random))
    }

    fn add_secret(workspace_id: &str, value: &str) -> EnvironmentVaultSessionCommandResult {
        upsert_environment_vault_secret(
            workspace_id.to_owned(),
            EnvironmentSecretMutationInput {
                id: None,
                name: "OpenRouter API key".to_owned(),
                kind: "api-key".to_owned(),
                tags: vec!["llm".to_owned(), "openrouter".to_owned()],
                value: Some(value.to_owned()),
            },
        )
    }

    #[test]
    fn session_view_never_serializes_plaintext_secret_values() {
        let workspace_id = test_workspace_id("metadata");
        let created = create_environment_vault_session(
            workspace_id.clone(),
            "correct horse battery staple".to_owned(),
        );
        assert!(created.ok);

        let updated = add_secret(&workspace_id, "sk-super-secret-value");
        assert!(updated.ok);
        let serialized = serde_json::to_string(&updated.vault).expect("serialized session view");

        assert!(!serialized.contains("sk-super-secret-value"));
        assert!(serialized.contains(SECRET_REFERENCE_PREFIX));
        assert!(serialized.contains("\"nativeManaged\":true"));
        assert!(serialized.contains("\"valueLength\":21"));

        shutdown_all_secret_vault_sessions();
    }

    #[test]
    fn opaque_reference_resolves_only_while_native_session_is_open() {
        let workspace_id = test_workspace_id("reference");
        assert!(create_environment_vault_session(
            workspace_id.clone(),
            "password".to_owned(),
        )
        .ok);
        let updated = add_secret(&workspace_id, "native-only-value");
        let secret_reference = updated
            .vault
            .expect("session view")
            .secrets
            .first()
            .expect("secret metadata")
            .value
            .clone();

        let resolved = resolve_secret_reference_or_value(&secret_reference)
            .expect("resolved native reference");
        assert_eq!(resolved.as_str(), "native-only-value");
        drop(resolved);

        assert!(close_environment_vault_session(workspace_id.clone()).ok);
        assert_eq!(
            resolve_secret_reference_or_value(&secret_reference),
            Err(SecretReferenceError::SessionLocked)
        );
    }

    #[test]
    fn empty_edit_value_preserves_the_existing_native_secret() {
        let workspace_id = test_workspace_id("preserve");
        assert!(create_environment_vault_session(
            workspace_id.clone(),
            "password".to_owned(),
        )
        .ok);
        let added = add_secret(&workspace_id, "preserved-value");
        let secret_id = added
            .vault
            .expect("session view")
            .secrets
            .first()
            .expect("secret metadata")
            .id
            .clone();

        let edited = upsert_environment_vault_secret(
            workspace_id.clone(),
            EnvironmentSecretMutationInput {
                id: Some(secret_id.clone()),
                name: "Renamed API key".to_owned(),
                kind: "api-key".to_owned(),
                tags: vec!["llm".to_owned()],
                value: Some(String::new()),
            },
        );
        assert!(edited.ok);

        let revealed = read_environment_vault_secret_value(workspace_id.clone(), secret_id);
        assert!(revealed.ok);
        assert_eq!(
            revealed.value.as_ref().map(|value| value.0.as_str()),
            Some("preserved-value")
        );

        assert!(close_environment_vault_session(workspace_id).ok);
    }

    #[test]
    fn encrypted_session_can_be_closed_and_reopened_without_webview_plaintext() {
        let workspace_id = test_workspace_id("reopen");
        assert!(create_environment_vault_session(
            workspace_id.clone(),
            "password".to_owned(),
        )
        .ok);
        let updated = add_secret(&workspace_id, "round-trip-value");
        let envelope = updated.envelope.expect("updated envelope");

        assert!(close_environment_vault_session(workspace_id.clone()).ok);
        let reopened = open_environment_vault_session(
            workspace_id.clone(),
            "password".to_owned(),
            envelope,
        );

        assert!(reopened.ok);
        let serialized = serde_json::to_string(&reopened.vault).expect("serialized reopened view");
        assert!(!serialized.contains("round-trip-value"));
        assert!(serialized.contains(SECRET_REFERENCE_PREFIX));

        assert!(close_environment_vault_session(workspace_id).ok);
    }
}
