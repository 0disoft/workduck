use argon2::{
    password_hash::{
        rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};

#[derive(serde::Serialize)]
pub enum WorkspacePasswordError {
    #[serde(rename = "workspace-password-required")]
    Required,
    #[serde(rename = "workspace-password-hash-failed")]
    HashFailed,
    #[serde(rename = "workspace-password-invalid-hash")]
    InvalidHash,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePasswordHash {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    password_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspacePasswordError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePasswordVerification {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    matched: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspacePasswordError>,
}

#[tauri::command]
pub fn create_workspace_password_hash(password: String) -> WorkspacePasswordHash {
    if password.is_empty() {
        return invalid_hash(WorkspacePasswordError::Required);
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    match argon2.hash_password(password.as_bytes(), &salt) {
        Ok(password_hash) => WorkspacePasswordHash {
            ok: true,
            password_hash: Some(password_hash.to_string()),
            error: None,
        },
        Err(_) => invalid_hash(WorkspacePasswordError::HashFailed),
    }
}

#[tauri::command]
pub fn verify_workspace_password(
    password: String,
    password_hash: String,
) -> WorkspacePasswordVerification {
    if password.is_empty() {
        return invalid_verification(WorkspacePasswordError::Required);
    }

    let parsed_hash = match PasswordHash::new(&password_hash) {
        Ok(parsed_hash) => parsed_hash,
        Err(_) => return invalid_verification(WorkspacePasswordError::InvalidHash),
    };

    WorkspacePasswordVerification {
        ok: true,
        matched: Some(
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed_hash)
                .is_ok(),
        ),
        error: None,
    }
}

fn invalid_hash(error: WorkspacePasswordError) -> WorkspacePasswordHash {
    WorkspacePasswordHash {
        ok: false,
        password_hash: None,
        error: Some(error),
    }
}

fn invalid_verification(error: WorkspacePasswordError) -> WorkspacePasswordVerification {
    WorkspacePasswordVerification {
        ok: false,
        matched: None,
        error: Some(error),
    }
}
