import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';

import type { SecretVaultCryptoError } from './secret-vault-crypto';

type EnvironmentErrorMessages = WorkduckMessages['environment']['errors'];

export function createSecretVaultCryptoErrorMessage(
	error: SecretVaultCryptoError,
	messages: EnvironmentErrorMessages
) {
	switch (error) {
		case 'secret-vault-password-required':
			return messages.vaultPasswordRequired;
		case 'secret-vault-unavailable':
			return messages.vaultUnavailable;
		case 'secret-vault-decryption-failed':
		case 'secret-vault-envelope-invalid':
		case 'secret-vault-ciphertext-invalid':
			return messages.vaultPasswordMismatch;
		default:
			return messages.vaultOperationFailed;
	}
}
