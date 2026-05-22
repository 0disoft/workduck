use argon2::{Algorithm, Argon2, Params, Version};

pub const ARGON2ID_VERSION: u32 = 19;
pub const DEFAULT_MEMORY_KIB: u32 = 19 * 1024;
pub const DEFAULT_ITERATIONS: u32 = 2;
pub const DEFAULT_PARALLELISM: u32 = 1;

const MIN_MEMORY_KIB: u32 = 8 * 1024;
const MAX_MEMORY_KIB: u32 = 256 * 1024;
const MIN_ITERATIONS: u32 = 1;
const MAX_ITERATIONS: u32 = 8;
const MIN_PARALLELISM: u32 = 1;
const MAX_PARALLELISM: u32 = 4;

pub fn parameters_are_supported(
    version: u32,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> bool {
    version == ARGON2ID_VERSION
        && (MIN_MEMORY_KIB..=MAX_MEMORY_KIB).contains(&memory_kib)
        && (MIN_ITERATIONS..=MAX_ITERATIONS).contains(&iterations)
        && (MIN_PARALLELISM..=MAX_PARALLELISM).contains(&parallelism)
}

pub fn derive_argon2id_key<const KEY_LENGTH: usize>(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; KEY_LENGTH], ()> {
    let params = Params::new(memory_kib, iterations, parallelism, Some(KEY_LENGTH))
        .map_err(|_| ())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0_u8; KEY_LENGTH];

    argon2
        .hash_password_into(password, salt, &mut key)
        .map_err(|_| ())?;

    Ok(key)
}
