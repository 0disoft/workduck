use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chacha20poly1305::{
    Key, XChaCha20Poly1305, XNonce,
    aead::{
        Aead, KeyInit, Payload,
        rand_core::{OsRng, RngCore},
    },
};
use zeroize::Zeroize;

const VAULT_FORMAT: &str = "workduck.secret-vault";
const VAULT_VERSION: u8 = 1;
const VAULT_AAD: &[u8] = b"workduck.secret-vault.v1";
const VAULT_KDF_ALGORITHM: &str = "argon2id";
const VAULT_KDF_VERSION: u32 = 19;
const VAULT_KDF_MEMORY_KIB: u32 = 19 * 1024;
const VAULT_KDF_ITERATIONS: u32 = 2;
const VAULT_KDF_PARALLELISM: u32 = 1;
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

    let mut key = match derive_vault_key(password.as_bytes(), &salt) {
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

    let mut key = match derive_vault_key(password.as_bytes(), &salt) {
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
) -> Result<[u8; VAULT_KEY_LENGTH], SecretVaultCryptoError> {
    let params = Params::new(
        VAULT_KDF_MEMORY_KIB,
        VAULT_KDF_ITERATIONS,
        VAULT_KDF_PARALLELISM,
        Some(VAULT_KEY_LENGTH),
    )
    .map_err(|_| SecretVaultCryptoError::KeyDerivationFailed)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0_u8; VAULT_KEY_LENGTH];

    argon2
        .hash_password_into(password, salt, &mut key)
        .map_err(|_| SecretVaultCryptoError::KeyDerivationFailed)?;

    Ok(key)
}

fn is_supported_envelope(envelope: &SecretVaultEnvelope) -> bool {
    envelope.format == VAULT_FORMAT
        && envelope.version == VAULT_VERSION
        && envelope.kdf.algorithm == VAULT_KDF_ALGORITHM
        && envelope.kdf.version == VAULT_KDF_VERSION
        && envelope.kdf.memory_kib == VAULT_KDF_MEMORY_KIB
        && envelope.kdf.iterations == VAULT_KDF_ITERATIONS
        && envelope.kdf.parallelism == VAULT_KDF_PARALLELISM
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
