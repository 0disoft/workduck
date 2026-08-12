/* llmnav/1 module
id=workduck.secret-vault.crypto
role=Encrypt and decrypt versioned secret-vault payloads through the native Argon2id and XChaCha20-Poly1305 boundary.
owns=secret-vault envelope|vault crypto invocation|crypto error normalization
excludes=vault record storage|password UI
search=encrypt secret vault|decrypt vault payload|argon2 xchacha envelope
invariant=Empty credentials, malformed envelopes, and unknown native responses fail without returning plaintext or a valid envelope.
stability=contract
*/
import { isObjectRecord } from '$lib/shared/object-record';
import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
export const SECRET_VAULT_FORMAT = 'workduck.secret-vault';
export const SECRET_VAULT_VERSION = 1;

export type SecretVaultCryptoError =
	| 'secret-vault-password-required'
	| 'secret-vault-plaintext-required'
	| 'secret-vault-envelope-invalid'
	| 'secret-vault-salt-invalid'
	| 'secret-vault-nonce-invalid'
	| 'secret-vault-ciphertext-invalid'
	| 'secret-vault-key-derivation-failed'
	| 'secret-vault-encryption-failed'
	| 'secret-vault-decryption-failed'
	| 'secret-vault-plaintext-invalid'
	| 'secret-vault-unavailable';

export interface SecretVaultEnvelope {
	readonly format: typeof SECRET_VAULT_FORMAT;
	readonly version: typeof SECRET_VAULT_VERSION;
	readonly kdf: {
		readonly algorithm: 'argon2id';
		readonly version: 19;
		readonly memoryKiB: number;
		readonly iterations: number;
		readonly parallelism: number;
		readonly salt: string;
	};
	readonly cipher: {
		readonly algorithm: 'xchacha20poly1305';
		readonly nonce: string;
	};
	readonly ciphertext: string;
}

export type SecretVaultEncryptionResult =
	| {
			readonly ok: true;
			readonly envelope: SecretVaultEnvelope;
	  }
	| {
			readonly ok: false;
			readonly error: SecretVaultCryptoError;
	  };

export type SecretVaultDecryptionResult =
	| {
			readonly ok: true;
			readonly plaintext: string;
	  }
	| {
			readonly ok: false;
			readonly error: SecretVaultCryptoError;
	  };

interface SecretVaultEncryptionResponse {
	readonly ok: boolean;
	readonly envelope?: SecretVaultEnvelope | null;
	readonly error?: SecretVaultCryptoError | null;
}

interface SecretVaultDecryptionResponse {
	readonly ok: boolean;
	readonly plaintext?: string | null;
	readonly error?: SecretVaultCryptoError | null;
}

export async function encryptSecretVaultPayload(
	plaintext: string,
	password: string
): Promise<SecretVaultEncryptionResult> {
	if (password.length === 0) {
		return { ok: false, error: 'secret-vault-password-required' };
	}

	if (plaintext.length === 0) {
		return { ok: false, error: 'secret-vault-plaintext-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'secret-vault-unavailable' };
	}

	try {
		const response = await invoke<SecretVaultEncryptionResponse>('encrypt_secret_vault_payload', {
			password,
			plaintext
		});

		if (response.ok && isSecretVaultEnvelope(response.envelope)) {
			return { ok: true, envelope: response.envelope };
		}

		return {
			ok: false,
			error: isSecretVaultCryptoError(response.error)
				? response.error
				: 'secret-vault-encryption-failed'
		};
	} catch {
		return { ok: false, error: 'secret-vault-encryption-failed' };
	}
}

export async function decryptSecretVaultPayload(
	envelope: SecretVaultEnvelope,
	password: string
): Promise<SecretVaultDecryptionResult> {
	if (password.length === 0) {
		return { ok: false, error: 'secret-vault-password-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'secret-vault-unavailable' };
	}

	try {
		const response = await invoke<SecretVaultDecryptionResponse>('decrypt_secret_vault_payload', {
			password,
			envelope
		});

		if (response.ok && typeof response.plaintext === 'string') {
			return { ok: true, plaintext: response.plaintext };
		}

		return {
			ok: false,
			error: isSecretVaultCryptoError(response.error)
				? response.error
				: 'secret-vault-decryption-failed'
		};
	} catch {
		return { ok: false, error: 'secret-vault-decryption-failed' };
	}
}

export function isSecretVaultEnvelope(value: unknown): value is SecretVaultEnvelope {
	if (!isObjectRecord(value) || !isObjectRecord(value.kdf) || !isObjectRecord(value.cipher)) {
		return false;
	}

	return (
		value.format === SECRET_VAULT_FORMAT &&
		value.version === SECRET_VAULT_VERSION &&
		value.kdf.algorithm === 'argon2id' &&
		value.kdf.version === 19 &&
		typeof value.kdf.memoryKiB === 'number' &&
		typeof value.kdf.iterations === 'number' &&
		typeof value.kdf.parallelism === 'number' &&
		typeof value.kdf.salt === 'string' &&
		value.cipher.algorithm === 'xchacha20poly1305' &&
		typeof value.cipher.nonce === 'string' &&
		typeof value.ciphertext === 'string'
	);
}

function isSecretVaultCryptoError(value: unknown): value is SecretVaultCryptoError {
	return (
		value === 'secret-vault-password-required' ||
		value === 'secret-vault-plaintext-required' ||
		value === 'secret-vault-envelope-invalid' ||
		value === 'secret-vault-salt-invalid' ||
		value === 'secret-vault-nonce-invalid' ||
		value === 'secret-vault-ciphertext-invalid' ||
		value === 'secret-vault-key-derivation-failed' ||
		value === 'secret-vault-encryption-failed' ||
		value === 'secret-vault-decryption-failed' ||
		value === 'secret-vault-plaintext-invalid' ||
		value === 'secret-vault-unavailable'
	);
}
