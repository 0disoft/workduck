use crate::argon2_kdf::{
    ARGON2ID_VERSION, DEFAULT_ITERATIONS, DEFAULT_MEMORY_KIB, DEFAULT_PARALLELISM,
    derive_argon2id_key, parameters_are_supported,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{Aead, KeyInit, Payload},
};
use zeroize::Zeroize;

pub(crate) const ENVELOPE_KDF_ALGORITHM: &str = "argon2id";
pub(crate) const ENVELOPE_KDF_VERSION: u32 = ARGON2ID_VERSION;
pub(crate) const ENVELOPE_KDF_MEMORY_KIB: u32 = DEFAULT_MEMORY_KIB;
pub(crate) const ENVELOPE_KDF_ITERATIONS: u32 = DEFAULT_ITERATIONS;
pub(crate) const ENVELOPE_KDF_PARALLELISM: u32 = DEFAULT_PARALLELISM;
pub(crate) const ENVELOPE_CIPHER_ALGORITHM: &str = "xchacha20poly1305";
pub(crate) const ENVELOPE_KEY_LENGTH: usize = 32;
pub(crate) const ENVELOPE_SALT_LENGTH: usize = 16;
pub(crate) const ENVELOPE_NONCE_LENGTH: usize = 24;

#[derive(Clone, Copy)]
pub(crate) struct PasswordEnvelopeConfig {
    pub(crate) format: &'static str,
    pub(crate) version: u8,
    pub(crate) aad: &'static [u8],
}

pub(crate) struct PasswordEnvelope {
    pub(crate) format: String,
    pub(crate) version: u8,
    pub(crate) kdf: PasswordEnvelopeKdf,
    pub(crate) cipher: PasswordEnvelopeCipher,
    pub(crate) ciphertext: String,
}

pub(crate) struct PasswordEnvelopeKdf {
    pub(crate) algorithm: String,
    pub(crate) version: u32,
    pub(crate) memory_kib: u32,
    pub(crate) iterations: u32,
    pub(crate) parallelism: u32,
    pub(crate) salt: String,
}

pub(crate) struct PasswordEnvelopeCipher {
    pub(crate) algorithm: String,
    pub(crate) nonce: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PasswordEnvelopeCryptoError {
    EnvelopeInvalid,
    SaltInvalid,
    NonceInvalid,
    CiphertextInvalid,
    KeyDerivationFailed,
    EncryptionFailed,
    DecryptionFailed,
    PlaintextInvalid,
}

pub(crate) fn encrypt_password_envelope(
    password: &[u8],
    plaintext: &[u8],
    config: PasswordEnvelopeConfig,
) -> Result<PasswordEnvelope, PasswordEnvelopeCryptoError> {
    let mut salt = [0_u8; ENVELOPE_SALT_LENGTH];
    let mut nonce = [0_u8; ENVELOPE_NONCE_LENGTH];
    getrandom::fill(&mut salt).map_err(|_| PasswordEnvelopeCryptoError::EncryptionFailed)?;
    getrandom::fill(&mut nonce).map_err(|_| PasswordEnvelopeCryptoError::EncryptionFailed)?;

    let mut key = derive_envelope_key(
        password,
        &salt,
        ENVELOPE_KDF_MEMORY_KIB,
        ENVELOPE_KDF_ITERATIONS,
        ENVELOPE_KDF_PARALLELISM,
    )?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|_| PasswordEnvelopeCryptoError::EncryptionFailed)?;
    let xnonce = <&XNonce>::try_from(nonce.as_slice())
        .map_err(|_| PasswordEnvelopeCryptoError::EncryptionFailed)?;
    let ciphertext_result = cipher.encrypt(
        xnonce,
        Payload {
            msg: plaintext,
            aad: config.aad,
        },
    );
    key.zeroize();

    let ciphertext = ciphertext_result.map_err(|_| PasswordEnvelopeCryptoError::EncryptionFailed)?;

    Ok(PasswordEnvelope {
        format: config.format.to_string(),
        version: config.version,
        kdf: PasswordEnvelopeKdf {
            algorithm: ENVELOPE_KDF_ALGORITHM.to_string(),
            version: ENVELOPE_KDF_VERSION,
            memory_kib: ENVELOPE_KDF_MEMORY_KIB,
            iterations: ENVELOPE_KDF_ITERATIONS,
            parallelism: ENVELOPE_KDF_PARALLELISM,
            salt: BASE64.encode(salt),
        },
        cipher: PasswordEnvelopeCipher {
            algorithm: ENVELOPE_CIPHER_ALGORITHM.to_string(),
            nonce: BASE64.encode(nonce),
        },
        ciphertext: BASE64.encode(ciphertext),
    })
}

pub(crate) fn decrypt_password_envelope(
    password: &[u8],
    envelope: &PasswordEnvelope,
    config: PasswordEnvelopeConfig,
) -> Result<String, PasswordEnvelopeCryptoError> {
    if !is_supported_envelope(envelope, config) {
        return Err(PasswordEnvelopeCryptoError::EnvelopeInvalid);
    }

    let salt = match BASE64.decode(envelope.kdf.salt.as_bytes()) {
        Ok(salt) if salt.len() == ENVELOPE_SALT_LENGTH => salt,
        _ => return Err(PasswordEnvelopeCryptoError::SaltInvalid),
    };
    let nonce = match BASE64.decode(envelope.cipher.nonce.as_bytes()) {
        Ok(nonce) if nonce.len() == ENVELOPE_NONCE_LENGTH => nonce,
        _ => return Err(PasswordEnvelopeCryptoError::NonceInvalid),
    };
    let ciphertext = match BASE64.decode(envelope.ciphertext.as_bytes()) {
        Ok(ciphertext) if !ciphertext.is_empty() => ciphertext,
        _ => return Err(PasswordEnvelopeCryptoError::CiphertextInvalid),
    };

    let mut key = derive_envelope_key(
        password,
        &salt,
        envelope.kdf.memory_kib,
        envelope.kdf.iterations,
        envelope.kdf.parallelism,
    )?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|_| PasswordEnvelopeCryptoError::DecryptionFailed)?;
    let xnonce = <&XNonce>::try_from(nonce.as_slice())
        .map_err(|_| PasswordEnvelopeCryptoError::DecryptionFailed)?;
    let plaintext_result = cipher.decrypt(
        xnonce,
        Payload {
            msg: ciphertext.as_ref(),
            aad: config.aad,
        },
    );
    key.zeroize();

    let plaintext = plaintext_result.map_err(|_| PasswordEnvelopeCryptoError::DecryptionFailed)?;

    String::from_utf8(plaintext).map_err(|_| PasswordEnvelopeCryptoError::PlaintextInvalid)
}

fn derive_envelope_key(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; ENVELOPE_KEY_LENGTH], PasswordEnvelopeCryptoError> {
    derive_argon2id_key(password, salt, memory_kib, iterations, parallelism)
        .map_err(|_| PasswordEnvelopeCryptoError::KeyDerivationFailed)
}

fn is_supported_envelope(
    envelope: &PasswordEnvelope,
    config: PasswordEnvelopeConfig,
) -> bool {
    envelope.format == config.format
        && envelope.version == config.version
        && envelope.kdf.algorithm == ENVELOPE_KDF_ALGORITHM
        && envelope.kdf.version == ENVELOPE_KDF_VERSION
        && parameters_are_supported(
            envelope.kdf.version,
            envelope.kdf.memory_kib,
            envelope.kdf.iterations,
            envelope.kdf.parallelism,
        )
        && envelope.cipher.algorithm == ENVELOPE_CIPHER_ALGORITHM
}
