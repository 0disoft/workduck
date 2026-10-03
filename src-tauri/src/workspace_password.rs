use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};

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

    let mut salt = [0_u8; argon2::RECOMMENDED_SALT_LEN];
    if getrandom::fill(&mut salt).is_err() {
        return invalid_hash(WorkspacePasswordError::HashFailed);
    }
    let argon2 = Argon2::default();

    match argon2.hash_password_with_salt(password.as_bytes(), &salt) {
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

#[cfg(test)]
mod tests {
    use super::*;

    // Generated with Argon2 0.5.3 before upgrading the password API.
    const LEGACY_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$d29ya2R1Y2stZml4dHVyZSE$Q+82fADtM3qki4fkFrs74wRic3pcSpobp4SjZ3zid10";

    #[test]
    fn verifies_existing_password_hashes_and_rejects_wrong_passwords() {
        let matching = verify_workspace_password("fixture-password".into(), LEGACY_HASH.into());
        assert!(matching.ok);
        assert_eq!(matching.matched, Some(true));
        let wrong = verify_workspace_password("wrong-password".into(), LEGACY_HASH.into());
        assert!(wrong.ok);
        assert_eq!(wrong.matched, Some(false));
    }

    #[test]
    fn creates_verifiable_hashes_with_independent_random_salts() {
        let first = create_workspace_password_hash("fixture-password".into());
        let second = create_workspace_password_hash("fixture-password".into());
        assert!(first.ok && second.ok);
        assert_ne!(first.password_hash, second.password_hash);
        let verified =
            verify_workspace_password("fixture-password".into(), first.password_hash.unwrap());
        assert!(verified.ok);
        assert_eq!(verified.matched, Some(true));
    }

    #[test]
    fn preserves_required_password_and_invalid_hash_errors() {
        assert!(!create_workspace_password_hash(String::new()).ok);
        let empty = verify_workspace_password(String::new(), LEGACY_HASH.into());
        assert!(matches!(
            empty.error,
            Some(WorkspacePasswordError::Required)
        ));
        let invalid = verify_workspace_password("fixture-password".into(), "invalid".into());
        assert!(matches!(
            invalid.error,
            Some(WorkspacePasswordError::InvalidHash)
        ));
    }
}
