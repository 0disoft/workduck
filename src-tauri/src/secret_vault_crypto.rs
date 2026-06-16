use crate::argon2_kdf::{
    ARGON2ID_VERSION, DEFAULT_ITERATIONS, DEFAULT_MEMORY_KIB, DEFAULT_PARALLELISM,
    derive_argon2id_key, parameters_are_supported,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chacha20poly1305::{
    Key, XChaCha20Poly1305, XNonce,
    aead::{
        Aead, KeyInit, Payload,
        rand_core::{OsRng, RngCore},
    },
};
use zeroize::{Zeroize, Zeroizing};

const VAULT_FORMAT: &str = "workduck.secret-vault";
const VAULT_VERSION: u8 = 1;
const VAULT_AAD: &[u8] = b"workduck.secret-vault.v1";
const VAULT_KDF_ALGORITHM: &str = "argon2id";
const VAULT_KDF_VERSION: u32 = ARGON2ID_VERSION;
const VAULT_KDF_MEMORY_KIB: u32 = DEFAULT_MEMORY_KIB;
const VAULT_KDF_ITERATIONS: u32 = DEFAULT_ITERATIONS;
const VAULT_KDF_PARALLELISM: u32 = DEFAULT_PARALLELISM;
const VAULT_KEY_LENGTH: usize = 32;
const VAULT_SALT_LENGTH: usize = 16;
const VAULT_CIPHER_ALGORITHM: &str = "xchacha20poly1305";
const VAULT_NONCE_LENGTH: usize = 24;

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultEnvelope {
    format: String,
    version: u8,
    kdf: SecretVaultKdf,
    cipher: SecretVaultCipher,
    ciphertext: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretVaultKdf {
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
struct SecretVaultCipher {
    algorithm: String,
    nonce: String,
}

#[derive(serde::Serialize)]
pub enum SecretVaultCryptoError {
    #[serde(rename = "secret-vault-password-required")]
    PasswordRequired,
    #[serde(rename = "secret-vault-plaintext-required")]
    PlaintextRequired,
    #[serde(rename = "secret-vault-envelope-invalid")]
    EnvelopeInvalid,
    #[serde(rename = "secret-vault-salt-invalid")]
    SaltInvalid,
    #[serde(rename = "secret-vault-nonce-invalid")]
    NonceInvalid,
    #[serde(rename = "secret-vault-ciphertext-invalid")]
    CiphertextInvalid,
    #[serde(rename = "secret-vault-key-derivation-failed")]
    KeyDerivationFailed,
    #[serde(rename = "secret-vault-encryption-failed")]
    EncryptionFailed,
    #[serde(rename = "secret-vault-decryption-failed")]
    DecryptionFailed,
    #[serde(rename = "secret-vault-plaintext-invalid")]
    PlaintextInvalid,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultEncryption {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    envelope: Option<SecretVaultEnvelope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<SecretVaultCryptoError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultDecryption {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    plaintext: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<SecretVaultCryptoError>,
}

#[tauri::command]
pub fn encrypt_secret_vault_payload(password: String, plaintext: String) -> SecretVaultEncryption {
    let password = Zeroizing::new(password);

    if password.is_empty() {
        return invalid_encryption(SecretVaultCryptoError::PasswordRequired);
    }

    if plaintext.is_empty() {
        return invalid_encryption(SecretVaultCryptoError::PlaintextRequired);
    }

    let mut salt = [0_u8; VAULT_SALT_LENGTH];
    let mut nonce = [0_u8; VAULT_NONCE_LENGTH];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let mut key = match derive_vault_key(
        password.as_bytes(),
        &salt,
        VAULT_KDF_MEMORY_KIB,
        VAULT_KDF_ITERATIONS,
        VAULT_KDF_PARALLELISM,
    ) {
        Ok(key) => key,
        Err(error) => return invalid_encryption(error),
    };

    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let ciphertext_result = cipher.encrypt(
        XNonce::from_slice(&nonce),
        Payload {
            msg: plaintext.as_bytes(),
            aad: VAULT_AAD,
        },
    );
    key.zeroize();

    let ciphertext = match ciphertext_result {
        Ok(ciphertext) => ciphertext,
        Err(_) => return invalid_encryption(SecretVaultCryptoError::EncryptionFailed),
    };

    SecretVaultEncryption {
        ok: true,
        envelope: Some(SecretVaultEnvelope {
            format: VAULT_FORMAT.to_string(),
            version: VAULT_VERSION,
            kdf: SecretVaultKdf {
                algorithm: VAULT_KDF_ALGORITHM.to_string(),
                version: VAULT_KDF_VERSION,
                memory_kib: VAULT_KDF_MEMORY_KIB,
                iterations: VAULT_KDF_ITERATIONS,
                parallelism: VAULT_KDF_PARALLELISM,
                salt: BASE64.encode(salt),
            },
            cipher: SecretVaultCipher {
                algorithm: VAULT_CIPHER_ALGORITHM.to_string(),
                nonce: BASE64.encode(nonce),
            },
            ciphertext: BASE64.encode(ciphertext),
        }),
        error: None,
    }
}

#[tauri::command]
pub fn decrypt_secret_vault_payload(
    password: String,
    envelope: SecretVaultEnvelope,
) -> SecretVaultDecryption {
    let password = Zeroizing::new(password);

    if password.is_empty() {
        return invalid_decryption(SecretVaultCryptoError::PasswordRequired);
    }

    if !is_supported_envelope(&envelope) {
        return invalid_decryption(SecretVaultCryptoError::EnvelopeInvalid);
    }

    let salt = match BASE64.decode(envelope.kdf.salt.as_bytes()) {
        Ok(salt) if salt.len() == VAULT_SALT_LENGTH => salt,
        _ => return invalid_decryption(SecretVaultCryptoError::SaltInvalid),
    };
    let nonce = match BASE64.decode(envelope.cipher.nonce.as_bytes()) {
        Ok(nonce) if nonce.len() == VAULT_NONCE_LENGTH => nonce,
        _ => return invalid_decryption(SecretVaultCryptoError::NonceInvalid),
    };
    let ciphertext = match BASE64.decode(envelope.ciphertext.as_bytes()) {
        Ok(ciphertext) if !ciphertext.is_empty() => ciphertext,
        _ => return invalid_decryption(SecretVaultCryptoError::CiphertextInvalid),
    };

    let mut key = match derive_vault_key(
        password.as_bytes(),
        &salt,
        envelope.kdf.memory_kib,
        envelope.kdf.iterations,
        envelope.kdf.parallelism,
    ) {
        Ok(key) => key,
        Err(error) => return invalid_decryption(error),
    };

    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let plaintext_result = cipher.decrypt(
        XNonce::from_slice(&nonce),
        Payload {
            msg: ciphertext.as_ref(),
            aad: VAULT_AAD,
        },
    );
    key.zeroize();

    let plaintext = match plaintext_result {
        Ok(plaintext) => plaintext,
        Err(_) => return invalid_decryption(SecretVaultCryptoError::DecryptionFailed),
    };

    match String::from_utf8(plaintext) {
        Ok(plaintext) => SecretVaultDecryption {
            ok: true,
            plaintext: Some(plaintext),
            error: None,
        },
        Err(_) => invalid_decryption(SecretVaultCryptoError::PlaintextInvalid),
    }
}

fn derive_vault_key(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; VAULT_KEY_LENGTH], SecretVaultCryptoError> {
    derive_argon2id_key(password, salt, memory_kib, iterations, parallelism)
        .map_err(|_| SecretVaultCryptoError::KeyDerivationFailed)
}

fn is_supported_envelope(envelope: &SecretVaultEnvelope) -> bool {
    envelope.format == VAULT_FORMAT
        && envelope.version == VAULT_VERSION
        && envelope.kdf.algorithm == VAULT_KDF_ALGORITHM
        && envelope.kdf.version == VAULT_KDF_VERSION
        && parameters_are_supported(
            envelope.kdf.version,
            envelope.kdf.memory_kib,
            envelope.kdf.iterations,
            envelope.kdf.parallelism,
        )
        && envelope.cipher.algorithm == VAULT_CIPHER_ALGORITHM
}

fn invalid_encryption(error: SecretVaultCryptoError) -> SecretVaultEncryption {
    SecretVaultEncryption {
        ok: false,
        envelope: None,
        error: Some(error),
    }
}

fn invalid_decryption(error: SecretVaultCryptoError) -> SecretVaultDecryption {
    SecretVaultDecryption {
        ok: false,
        plaintext: None,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_payload_round_trips_with_supported_envelope_metadata() {
        let encryption =
            encrypt_secret_vault_payload("correct horse battery staple".into(), "secret-json".into());

        assert!(encryption.ok);
        assert!(encryption.error.is_none());

        let envelope = encryption.envelope.expect("encrypted envelope");
        assert_eq!(envelope.format, VAULT_FORMAT);
        assert_eq!(envelope.version, VAULT_VERSION);
        assert_eq!(envelope.kdf.algorithm, VAULT_KDF_ALGORITHM);
        assert_eq!(envelope.kdf.version, VAULT_KDF_VERSION);
        assert_eq!(envelope.kdf.memory_kib, VAULT_KDF_MEMORY_KIB);
        assert_eq!(envelope.kdf.iterations, VAULT_KDF_ITERATIONS);
        assert_eq!(envelope.kdf.parallelism, VAULT_KDF_PARALLELISM);
        assert_eq!(envelope.cipher.algorithm, VAULT_CIPHER_ALGORITHM);
        assert_eq!(
            BASE64.decode(envelope.kdf.salt.as_bytes()).expect("salt").len(),
            VAULT_SALT_LENGTH
        );
        assert_eq!(
            BASE64.decode(envelope.cipher.nonce.as_bytes()).expect("nonce").len(),
            VAULT_NONCE_LENGTH
        );
        assert!(
            !BASE64
                .decode(envelope.ciphertext.as_bytes())
                .expect("ciphertext")
                .is_empty()
        );

        let decryption =
            decrypt_secret_vault_payload("correct horse battery staple".into(), envelope);

        assert!(decryption.ok);
        assert_eq!(decryption.plaintext.as_deref(), Some("secret-json"));
        assert!(decryption.error.is_none());
    }

    #[test]
    fn vault_decryption_rejects_wrong_password() {
        let envelope = encrypt_secret_vault_payload("right-password".into(), "secret-json".into())
            .envelope
            .expect("encrypted envelope");

        let decryption = decrypt_secret_vault_payload("wrong-password".into(), envelope);

        assert!(!decryption.ok);
        assert!(decryption.plaintext.is_none());
        assert!(matches!(
            decryption.error,
            Some(SecretVaultCryptoError::DecryptionFailed)
        ));
    }

    #[test]
    fn vault_rejects_empty_inputs_before_crypto_work() {
        let missing_password = encrypt_secret_vault_payload(String::new(), "secret-json".into());
        let missing_plaintext =
            encrypt_secret_vault_payload("correct horse battery staple".into(), String::new());

        assert!(!missing_password.ok);
        assert!(matches!(
            missing_password.error,
            Some(SecretVaultCryptoError::PasswordRequired)
        ));
        assert!(!missing_plaintext.ok);
        assert!(matches!(
            missing_plaintext.error,
            Some(SecretVaultCryptoError::PlaintextRequired)
        ));
    }

    #[test]
    fn vault_rejects_unsupported_envelope_metadata() {
        let mut envelope =
            encrypt_secret_vault_payload("correct horse battery staple".into(), "secret-json".into())
                .envelope
                .expect("encrypted envelope");
        envelope.format = "workduck.other-vault".to_string();

        let decryption =
            decrypt_secret_vault_payload("correct horse battery staple".into(), envelope);

        assert!(!decryption.ok);
        assert!(matches!(
            decryption.error,
            Some(SecretVaultCryptoError::EnvelopeInvalid)
        ));
    }
}
