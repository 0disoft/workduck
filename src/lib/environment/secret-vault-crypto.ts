/* llmnav/1 module
id=workduck.secret-vault.crypto
role=Validate versioned encrypted secret-vault envelopes at the renderer persistence boundary.
owns=secret-vault envelope shape|encrypted vault format constants
excludes=plaintext vault access|native session lifecycle|password crypto
search=secret vault envelope|validate encrypted vault|native vault boundary
invariant=Renderer code may validate and persist encrypted envelopes but cannot encrypt or decrypt vault plaintext.
stability=contract
*/
import { isObjectRecord } from '$lib/shared/object-record';
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

/**
 * The WebView may validate and persist encrypted envelopes, but it cannot invoke
 * bulk vault encryption or decryption. Plaintext vault payloads are owned by the
 * native environment-vault session broker.
 */
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
