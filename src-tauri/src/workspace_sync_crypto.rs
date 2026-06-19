use crate::password_envelope_crypto::{
    PasswordEnvelope, PasswordEnvelopeCipher, PasswordEnvelopeConfig, PasswordEnvelopeCryptoError,
    PasswordEnvelopeKdf, decrypt_password_envelope, encrypt_password_envelope,
};
use zeroize::Zeroizing;

const SYNC_FORMAT: &str = "workduck.workspace-sync";
const SYNC_VERSION: u8 = 1;
const SYNC_AAD: &[u8] = b"workduck.workspace-sync.v1";

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncEnvelope {
    format: String,
    version: u8,
    kdf: WorkspaceSyncKdf,
    cipher: WorkspaceSyncCipher,
    ciphertext: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSyncKdf {
    algorithm: String,
    version: u32,
    #[serde(rename = "memoryKiB")]
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    salt: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSyncCipher {
    algorithm: String,
    nonce: String,
}

#[derive(serde::Serialize)]
pub enum WorkspaceSyncCryptoError {
    #[serde(rename = "workspace-sync-password-required")]
    PasswordRequired,
    #[serde(rename = "workspace-sync-plaintext-required")]
    PlaintextRequired,
    #[serde(rename = "workspace-sync-envelope-invalid")]
    EnvelopeInvalid,
    #[serde(rename = "workspace-sync-salt-invalid")]
    SaltInvalid,
    #[serde(rename = "workspace-sync-nonce-invalid")]
    NonceInvalid,
    #[serde(rename = "workspace-sync-ciphertext-invalid")]
    CiphertextInvalid,
    #[serde(rename = "workspace-sync-key-derivation-failed")]
    KeyDerivationFailed,
    #[serde(rename = "workspace-sync-encryption-failed")]
    EncryptionFailed,
    #[serde(rename = "workspace-sync-decryption-failed")]
    DecryptionFailed,
    #[serde(rename = "workspace-sync-plaintext-invalid")]
    PlaintextInvalid,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncEncryption {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    envelope: Option<WorkspaceSyncEnvelope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceSyncCryptoError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSyncDecryption {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    plaintext: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<WorkspaceSyncCryptoError>,
}

#[tauri::command]
pub fn encrypt_workspace_sync_payload(
    password: String,
    plaintext: String,
) -> WorkspaceSyncEncryption {
    let password = Zeroizing::new(password);

    if password.is_empty() {
        return invalid_encryption(WorkspaceSyncCryptoError::PasswordRequired);
    }

    if plaintext.is_empty() {
        return invalid_encryption(WorkspaceSyncCryptoError::PlaintextRequired);
    }

    let envelope = match encrypt_password_envelope(
        password.as_bytes(),
        plaintext.as_bytes(),
        sync_envelope_config(),
    ) {
        Ok(envelope) => envelope,
        Err(error) => return invalid_encryption(map_password_envelope_error(error)),
    };

    WorkspaceSyncEncryption {
        ok: true,
        envelope: Some(from_password_envelope(envelope)),
        error: None,
    }
}

#[tauri::command]
pub fn decrypt_workspace_sync_payload(
    password: String,
    envelope: WorkspaceSyncEnvelope,
) -> WorkspaceSyncDecryption {
    let password = Zeroizing::new(password);

    if password.is_empty() {
        return invalid_decryption(WorkspaceSyncCryptoError::PasswordRequired);
    }

    let envelope = to_password_envelope(&envelope);
    match decrypt_password_envelope(password.as_bytes(), &envelope, sync_envelope_config()) {
        Ok(plaintext) => WorkspaceSyncDecryption {
            ok: true,
            plaintext: Some(plaintext),
            error: None,
        },
        Err(error) => invalid_decryption(map_password_envelope_error(error)),
    }
}

fn sync_envelope_config() -> PasswordEnvelopeConfig {
    PasswordEnvelopeConfig {
        format: SYNC_FORMAT,
        version: SYNC_VERSION,
        aad: SYNC_AAD,
    }
}

fn from_password_envelope(envelope: PasswordEnvelope) -> WorkspaceSyncEnvelope {
    WorkspaceSyncEnvelope {
        format: envelope.format,
        version: envelope.version,
        kdf: WorkspaceSyncKdf {
            algorithm: envelope.kdf.algorithm,
            version: envelope.kdf.version,
            memory_kib: envelope.kdf.memory_kib,
            iterations: envelope.kdf.iterations,
            parallelism: envelope.kdf.parallelism,
            salt: envelope.kdf.salt,
        },
        cipher: WorkspaceSyncCipher {
            algorithm: envelope.cipher.algorithm,
            nonce: envelope.cipher.nonce,
        },
        ciphertext: envelope.ciphertext,
    }
}

fn to_password_envelope(envelope: &WorkspaceSyncEnvelope) -> PasswordEnvelope {
    PasswordEnvelope {
        format: envelope.format.clone(),
        version: envelope.version,
        kdf: PasswordEnvelopeKdf {
            algorithm: envelope.kdf.algorithm.clone(),
            version: envelope.kdf.version,
            memory_kib: envelope.kdf.memory_kib,
            iterations: envelope.kdf.iterations,
            parallelism: envelope.kdf.parallelism,
            salt: envelope.kdf.salt.clone(),
        },
        cipher: PasswordEnvelopeCipher {
            algorithm: envelope.cipher.algorithm.clone(),
            nonce: envelope.cipher.nonce.clone(),
        },
        ciphertext: envelope.ciphertext.clone(),
    }
}

fn map_password_envelope_error(error: PasswordEnvelopeCryptoError) -> WorkspaceSyncCryptoError {
    match error {
        PasswordEnvelopeCryptoError::EnvelopeInvalid => WorkspaceSyncCryptoError::EnvelopeInvalid,
        PasswordEnvelopeCryptoError::SaltInvalid => WorkspaceSyncCryptoError::SaltInvalid,
        PasswordEnvelopeCryptoError::NonceInvalid => WorkspaceSyncCryptoError::NonceInvalid,
        PasswordEnvelopeCryptoError::CiphertextInvalid => {
            WorkspaceSyncCryptoError::CiphertextInvalid
        }
        PasswordEnvelopeCryptoError::KeyDerivationFailed => {
            WorkspaceSyncCryptoError::KeyDerivationFailed
        }
        PasswordEnvelopeCryptoError::EncryptionFailed => WorkspaceSyncCryptoError::EncryptionFailed,
        PasswordEnvelopeCryptoError::DecryptionFailed => WorkspaceSyncCryptoError::DecryptionFailed,
        PasswordEnvelopeCryptoError::PlaintextInvalid => WorkspaceSyncCryptoError::PlaintextInvalid,
    }
}

fn invalid_encryption(error: WorkspaceSyncCryptoError) -> WorkspaceSyncEncryption {
    WorkspaceSyncEncryption {
        ok: false,
        envelope: None,
        error: Some(error),
    }
}

fn invalid_decryption(error: WorkspaceSyncCryptoError) -> WorkspaceSyncDecryption {
    WorkspaceSyncDecryption {
        ok: false,
        plaintext: None,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::password_envelope_crypto::{
        ENVELOPE_CIPHER_ALGORITHM, ENVELOPE_KDF_ALGORITHM, ENVELOPE_KDF_ITERATIONS,
        ENVELOPE_KDF_MEMORY_KIB, ENVELOPE_KDF_PARALLELISM, ENVELOPE_KDF_VERSION,
        ENVELOPE_NONCE_LENGTH, ENVELOPE_SALT_LENGTH,
    };
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

    #[test]
    fn workspace_sync_payload_round_trips_with_supported_envelope_metadata() {
        let encryption =
            encrypt_workspace_sync_payload("correct horse battery staple".into(), "sync-json".into());

        assert!(encryption.ok);
        assert!(encryption.error.is_none());

        let envelope = encryption.envelope.expect("encrypted envelope");
        assert_eq!(envelope.format, SYNC_FORMAT);
        assert_eq!(envelope.version, SYNC_VERSION);
        assert_eq!(envelope.kdf.algorithm, ENVELOPE_KDF_ALGORITHM);
        assert_eq!(envelope.kdf.version, ENVELOPE_KDF_VERSION);
        assert_eq!(envelope.kdf.memory_kib, ENVELOPE_KDF_MEMORY_KIB);
        assert_eq!(envelope.kdf.iterations, ENVELOPE_KDF_ITERATIONS);
        assert_eq!(envelope.kdf.parallelism, ENVELOPE_KDF_PARALLELISM);
        assert_eq!(envelope.cipher.algorithm, ENVELOPE_CIPHER_ALGORITHM);
        assert_eq!(
            BASE64.decode(envelope.kdf.salt.as_bytes()).expect("salt").len(),
            ENVELOPE_SALT_LENGTH
        );
        assert_eq!(
            BASE64.decode(envelope.cipher.nonce.as_bytes()).expect("nonce").len(),
            ENVELOPE_NONCE_LENGTH
        );
        assert!(
            !BASE64
                .decode(envelope.ciphertext.as_bytes())
                .expect("ciphertext")
                .is_empty()
        );

        let decryption =
            decrypt_workspace_sync_payload("correct horse battery staple".into(), envelope);

        assert!(decryption.ok);
        assert_eq!(decryption.plaintext.as_deref(), Some("sync-json"));
        assert!(decryption.error.is_none());
    }

    #[test]
    fn workspace_sync_decryption_rejects_wrong_password() {
        let envelope = encrypt_workspace_sync_payload("right-password".into(), "sync-json".into())
            .envelope
            .expect("encrypted envelope");

        let decryption = decrypt_workspace_sync_payload("wrong-password".into(), envelope);

        assert!(!decryption.ok);
        assert!(decryption.plaintext.is_none());
        assert!(matches!(
            decryption.error,
            Some(WorkspaceSyncCryptoError::DecryptionFailed)
        ));
    }

    #[test]
    fn workspace_sync_rejects_empty_inputs_before_crypto_work() {
        let missing_password = encrypt_workspace_sync_payload(String::new(), "sync-json".into());
        let missing_plaintext =
            encrypt_workspace_sync_payload("correct horse battery staple".into(), String::new());

        assert!(!missing_password.ok);
        assert!(matches!(
            missing_password.error,
            Some(WorkspaceSyncCryptoError::PasswordRequired)
        ));
        assert!(!missing_plaintext.ok);
        assert!(matches!(
            missing_plaintext.error,
            Some(WorkspaceSyncCryptoError::PlaintextRequired)
        ));
    }

    #[test]
    fn workspace_sync_rejects_unsupported_envelope_metadata() {
        let mut envelope =
            encrypt_workspace_sync_payload("correct horse battery staple".into(), "sync-json".into())
                .envelope
                .expect("encrypted envelope");
        envelope.format = "workduck.other-sync".to_string();

        let decryption =
            decrypt_workspace_sync_payload("correct horse battery staple".into(), envelope);

        assert!(!decryption.ok);
        assert!(matches!(
            decryption.error,
            Some(WorkspaceSyncCryptoError::EnvelopeInvalid)
        ));
    }
}
