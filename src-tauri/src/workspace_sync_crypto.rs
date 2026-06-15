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

const SYNC_FORMAT: &str = "workduck.workspace-sync";
const SYNC_VERSION: u8 = 1;
const SYNC_AAD: &[u8] = b"workduck.workspace-sync.v1";
const SYNC_KDF_ALGORITHM: &str = "argon2id";
const SYNC_KDF_VERSION: u32 = ARGON2ID_VERSION;
const SYNC_KDF_MEMORY_KIB: u32 = DEFAULT_MEMORY_KIB;
const SYNC_KDF_ITERATIONS: u32 = DEFAULT_ITERATIONS;
const SYNC_KDF_PARALLELISM: u32 = DEFAULT_PARALLELISM;
const SYNC_KEY_LENGTH: usize = 32;
const SYNC_SALT_LENGTH: usize = 16;
const SYNC_CIPHER_ALGORITHM: &str = "xchacha20poly1305";
const SYNC_NONCE_LENGTH: usize = 24;

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

    let mut salt = [0_u8; SYNC_SALT_LENGTH];
    let mut nonce = [0_u8; SYNC_NONCE_LENGTH];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let mut key = match derive_sync_key(
        password.as_bytes(),
        &salt,
        SYNC_KDF_MEMORY_KIB,
        SYNC_KDF_ITERATIONS,
        SYNC_KDF_PARALLELISM,
    ) {
        Ok(key) => key,
        Err(error) => return invalid_encryption(error),
    };

    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let ciphertext_result = cipher.encrypt(
        XNonce::from_slice(&nonce),
        Payload {
            msg: plaintext.as_bytes(),
            aad: SYNC_AAD,
        },
    );
    key.zeroize();

    let ciphertext = match ciphertext_result {
        Ok(ciphertext) => ciphertext,
        Err(_) => return invalid_encryption(WorkspaceSyncCryptoError::EncryptionFailed),
    };

    WorkspaceSyncEncryption {
        ok: true,
        envelope: Some(WorkspaceSyncEnvelope {
            format: SYNC_FORMAT.to_string(),
            version: SYNC_VERSION,
            kdf: WorkspaceSyncKdf {
                algorithm: SYNC_KDF_ALGORITHM.to_string(),
                version: SYNC_KDF_VERSION,
                memory_kib: SYNC_KDF_MEMORY_KIB,
                iterations: SYNC_KDF_ITERATIONS,
                parallelism: SYNC_KDF_PARALLELISM,
                salt: BASE64.encode(salt),
            },
            cipher: WorkspaceSyncCipher {
                algorithm: SYNC_CIPHER_ALGORITHM.to_string(),
                nonce: BASE64.encode(nonce),
            },
            ciphertext: BASE64.encode(ciphertext),
        }),
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

    if !is_supported_envelope(&envelope) {
        return invalid_decryption(WorkspaceSyncCryptoError::EnvelopeInvalid);
    }

    let salt = match BASE64.decode(envelope.kdf.salt.as_bytes()) {
        Ok(salt) if salt.len() == SYNC_SALT_LENGTH => salt,
        _ => return invalid_decryption(WorkspaceSyncCryptoError::SaltInvalid),
    };
    let nonce = match BASE64.decode(envelope.cipher.nonce.as_bytes()) {
        Ok(nonce) if nonce.len() == SYNC_NONCE_LENGTH => nonce,
        _ => return invalid_decryption(WorkspaceSyncCryptoError::NonceInvalid),
    };
    let ciphertext = match BASE64.decode(envelope.ciphertext.as_bytes()) {
        Ok(ciphertext) if !ciphertext.is_empty() => ciphertext,
        _ => return invalid_decryption(WorkspaceSyncCryptoError::CiphertextInvalid),
    };

    let mut key = match derive_sync_key(
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
            aad: SYNC_AAD,
        },
    );
    key.zeroize();

    let plaintext = match plaintext_result {
        Ok(plaintext) => plaintext,
        Err(_) => return invalid_decryption(WorkspaceSyncCryptoError::DecryptionFailed),
    };

    match String::from_utf8(plaintext) {
        Ok(plaintext) => WorkspaceSyncDecryption {
            ok: true,
            plaintext: Some(plaintext),
            error: None,
        },
        Err(_) => invalid_decryption(WorkspaceSyncCryptoError::PlaintextInvalid),
    }
}

fn derive_sync_key(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; SYNC_KEY_LENGTH], WorkspaceSyncCryptoError> {
    derive_argon2id_key(password, salt, memory_kib, iterations, parallelism)
        .map_err(|_| WorkspaceSyncCryptoError::KeyDerivationFailed)
}

fn is_supported_envelope(envelope: &WorkspaceSyncEnvelope) -> bool {
    envelope.format == SYNC_FORMAT
        && envelope.version == SYNC_VERSION
        && envelope.kdf.algorithm == SYNC_KDF_ALGORITHM
        && envelope.kdf.version == SYNC_KDF_VERSION
        && parameters_are_supported(
            envelope.kdf.version,
            envelope.kdf.memory_kib,
            envelope.kdf.iterations,
            envelope.kdf.parallelism,
        )
        && envelope.cipher.algorithm == SYNC_CIPHER_ALGORITHM
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
