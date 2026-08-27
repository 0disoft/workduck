// llmnav/1 module
// id=workduck.secret-vault.crypto-native
// role=Bind secret-vault envelopes to native password crypto with versioned associated data and closed result errors.
// owns=native secret-vault encryption|vault envelope conversion|vault crypto error mapping
// excludes=vault persistence|password interface
// search=native secret vault crypto|vault envelope aad|encrypt vault payload
// invariant=Passwords and encryption plaintext remain zeroized, and decrypted plaintext is available only to native callers after authenticated envelope validation succeeds.
// stability=contract
// /llmnav
use crate::password_envelope_crypto::{
    PasswordEnvelope, PasswordEnvelopeCipher, PasswordEnvelopeConfig, PasswordEnvelopeCryptoError,
    PasswordEnvelopeKdf, decrypt_password_envelope, encrypt_password_envelope,
};
use zeroize::Zeroizing;

const VAULT_FORMAT: &str = "workduck.secret-vault";
const VAULT_VERSION: u8 = 1;
const VAULT_AAD: &[u8] = b"workduck.secret-vault.v1";

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultEnvelope {
    format: String,
    version: u8,
    kdf: SecretVaultKdf,
    cipher: SecretVaultCipher,
    ciphertext: String,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
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

#[derive(Clone, serde::Deserialize, serde::Serialize)]
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
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) envelope: Option<SecretVaultEnvelope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<SecretVaultCryptoError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultDecryption {
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) plaintext: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<SecretVaultCryptoError>,
}

pub fn encrypt_secret_vault_payload(password: String, plaintext: String) -> SecretVaultEncryption {
    let password = Zeroizing::new(password);
    let plaintext = Zeroizing::new(plaintext);

    if password.is_empty() {
        return invalid_encryption(SecretVaultCryptoError::PasswordRequired);
    }

    if plaintext.is_empty() {
        return invalid_encryption(SecretVaultCryptoError::PlaintextRequired);
    }

    let envelope = match encrypt_password_envelope(
        password.as_bytes(),
        plaintext.as_bytes(),
        vault_envelope_config(),
    ) {
        Ok(envelope) => envelope,
        Err(error) => return invalid_encryption(map_password_envelope_error(error)),
    };

    SecretVaultEncryption {
        ok: true,
        envelope: Some(from_password_envelope(envelope)),
        error: None,
    }
}

pub fn decrypt_secret_vault_payload(
    password: String,
    envelope: SecretVaultEnvelope,
) -> SecretVaultDecryption {
    let password = Zeroizing::new(password);

    if password.is_empty() {
        return invalid_decryption(SecretVaultCryptoError::PasswordRequired);
    }

    let envelope = to_password_envelope(&envelope);
    match decrypt_password_envelope(password.as_bytes(), &envelope, vault_envelope_config()) {
        Ok(plaintext) => SecretVaultDecryption {
            ok: true,
            plaintext: Some(plaintext),
            error: None,
        },
        Err(error) => invalid_decryption(map_password_envelope_error(error)),
    }
}

fn vault_envelope_config() -> PasswordEnvelopeConfig {
    PasswordEnvelopeConfig {
        format: VAULT_FORMAT,
        version: VAULT_VERSION,
        aad: VAULT_AAD,
    }
}

fn from_password_envelope(envelope: PasswordEnvelope) -> SecretVaultEnvelope {
    SecretVaultEnvelope {
        format: envelope.format,
        version: envelope.version,
        kdf: SecretVaultKdf {
            algorithm: envelope.kdf.algorithm,
            version: envelope.kdf.version,
            memory_kib: envelope.kdf.memory_kib,
            iterations: envelope.kdf.iterations,
            parallelism: envelope.kdf.parallelism,
            salt: envelope.kdf.salt,
        },
        cipher: SecretVaultCipher {
            algorithm: envelope.cipher.algorithm,
            nonce: envelope.cipher.nonce,
        },
        ciphertext: envelope.ciphertext,
    }
}

fn to_password_envelope(envelope: &SecretVaultEnvelope) -> PasswordEnvelope {
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

fn map_password_envelope_error(error: PasswordEnvelopeCryptoError) -> SecretVaultCryptoError {
    match error {
        PasswordEnvelopeCryptoError::EnvelopeInvalid => SecretVaultCryptoError::EnvelopeInvalid,
        PasswordEnvelopeCryptoError::SaltInvalid => SecretVaultCryptoError::SaltInvalid,
        PasswordEnvelopeCryptoError::NonceInvalid => SecretVaultCryptoError::NonceInvalid,
        PasswordEnvelopeCryptoError::CiphertextInvalid => {
            SecretVaultCryptoError::CiphertextInvalid
        }
        PasswordEnvelopeCryptoError::KeyDerivationFailed => {
            SecretVaultCryptoError::KeyDerivationFailed
        }
        PasswordEnvelopeCryptoError::EncryptionFailed => SecretVaultCryptoError::EncryptionFailed,
        PasswordEnvelopeCryptoError::DecryptionFailed => SecretVaultCryptoError::DecryptionFailed,
        PasswordEnvelopeCryptoError::PlaintextInvalid => SecretVaultCryptoError::PlaintextInvalid,
    }
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
    use crate::password_envelope_crypto::{
        ENVELOPE_CIPHER_ALGORITHM, ENVELOPE_KDF_ALGORITHM, ENVELOPE_KDF_ITERATIONS,
        ENVELOPE_KDF_MEMORY_KIB, ENVELOPE_KDF_PARALLELISM, ENVELOPE_KDF_VERSION,
        ENVELOPE_NONCE_LENGTH, ENVELOPE_SALT_LENGTH,
    };
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

    #[test]
    fn vault_payload_round_trips_with_supported_envelope_metadata() {
        let encryption =
            encrypt_secret_vault_payload("correct horse battery staple".into(), "secret-json".into());

        assert!(encryption.ok);
        assert!(encryption.error.is_none());

        let envelope = encryption.envelope.expect("encrypted envelope");
        assert_eq!(envelope.format, VAULT_FORMAT);
        assert_eq!(envelope.version, VAULT_VERSION);
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
