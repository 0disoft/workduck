import {
	parseWorkspaceRegistry,
	serializeWorkspaceRegistry,
	type WorkspaceRegistry
} from './workspace-registry';

export const WORKSPACE_SYNC_FORMAT = 'workduck.workspace-sync';
export const WORKSPACE_SYNC_VERSION = 1;

export type WorkspaceSyncCryptoError =
	| 'workspace-sync-password-required'
	| 'workspace-sync-plaintext-required'
	| 'workspace-sync-envelope-invalid'
	| 'workspace-sync-salt-invalid'
	| 'workspace-sync-nonce-invalid'
	| 'workspace-sync-ciphertext-invalid'
	| 'workspace-sync-key-derivation-failed'
	| 'workspace-sync-encryption-failed'
	| 'workspace-sync-decryption-failed'
	| 'workspace-sync-plaintext-invalid'
	| 'workspace-sync-unavailable';

export type WorkspaceSyncRegistryError =
	| WorkspaceSyncCryptoError
	| 'workspace-sync-registry-invalid';

export interface WorkspaceSyncEnvelope {
	readonly format: typeof WORKSPACE_SYNC_FORMAT;
	readonly version: typeof WORKSPACE_SYNC_VERSION;
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

export type WorkspaceSyncEncryptionResult =
	| {
			readonly ok: true;
			readonly envelope: WorkspaceSyncEnvelope;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncCryptoError;
	  };

export type WorkspaceSyncRegistryDecryptionResult =
	| {
			readonly ok: true;
			readonly registry: WorkspaceRegistry;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncRegistryError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface WorkspaceSyncEncryptionResponse {
	readonly ok: boolean;
	readonly envelope?: WorkspaceSyncEnvelope | null;
	readonly error?: WorkspaceSyncCryptoError | null;
}

interface WorkspaceSyncDecryptionResponse {
	readonly ok: boolean;
	readonly plaintext?: string | null;
	readonly error?: WorkspaceSyncCryptoError | null;
}

export async function encryptWorkspaceRegistryForSync(
	registry: WorkspaceRegistry,
	password: string
): Promise<WorkspaceSyncEncryptionResult> {
	return encryptWorkspaceSyncPayload(serializeWorkspaceRegistry(registry), password);
}

export async function decryptWorkspaceRegistryFromSync(
	envelope: WorkspaceSyncEnvelope,
	password: string
): Promise<WorkspaceSyncRegistryDecryptionResult> {
	const result = await decryptWorkspaceSyncPayload(envelope, password);

	if (!result.ok) {
		return result;
	}

	if (!looksLikeWorkspaceRegistryPlaintext(result.plaintext)) {
		return { ok: false, error: 'workspace-sync-registry-invalid' };
	}

	const registry = parseWorkspaceRegistry(result.plaintext);

	return { ok: true, registry };
}

export function parseWorkspaceSyncEnvelope(serializedEnvelope: string): WorkspaceSyncEnvelope | null {
	try {
		const value: unknown = JSON.parse(serializedEnvelope);

		return isWorkspaceSyncEnvelope(value) ? value : null;
	} catch {
		return null;
	}
}

async function encryptWorkspaceSyncPayload(
	plaintext: string,
	password: string
): Promise<WorkspaceSyncEncryptionResult> {
	if (password.length === 0) {
		return { ok: false, error: 'workspace-sync-password-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncEncryptionResponse>(
			'encrypt_workspace_sync_payload',
			{
				password,
				plaintext
			}
		);

		if (response.ok && isWorkspaceSyncEnvelope(response.envelope)) {
			return { ok: true, envelope: response.envelope };
		}

		return {
			ok: false,
			error: isWorkspaceSyncCryptoError(response.error)
				? response.error
				: 'workspace-sync-encryption-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-encryption-failed' };
	}
}

async function decryptWorkspaceSyncPayload(
	envelope: WorkspaceSyncEnvelope,
	password: string
): Promise<
	| {
			readonly ok: true;
			readonly plaintext: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncCryptoError;
	  }
> {
	if (password.length === 0) {
		return { ok: false, error: 'workspace-sync-password-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncDecryptionResponse>(
			'decrypt_workspace_sync_payload',
			{
				password,
				envelope
			}
		);

		if (response.ok && typeof response.plaintext === 'string') {
			return { ok: true, plaintext: response.plaintext };
		}

		return {
			ok: false,
			error: isWorkspaceSyncCryptoError(response.error)
				? response.error
				: 'workspace-sync-decryption-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-decryption-failed' };
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}

function isWorkspaceSyncEnvelope(value: unknown): value is WorkspaceSyncEnvelope {
	if (!isObjectRecord(value) || !isObjectRecord(value.kdf) || !isObjectRecord(value.cipher)) {
		return false;
	}

	return (
		value.format === WORKSPACE_SYNC_FORMAT &&
		value.version === WORKSPACE_SYNC_VERSION &&
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

function isWorkspaceSyncCryptoError(value: unknown): value is WorkspaceSyncCryptoError {
	return (
		value === 'workspace-sync-password-required' ||
		value === 'workspace-sync-plaintext-required' ||
		value === 'workspace-sync-envelope-invalid' ||
		value === 'workspace-sync-salt-invalid' ||
		value === 'workspace-sync-nonce-invalid' ||
		value === 'workspace-sync-ciphertext-invalid' ||
		value === 'workspace-sync-key-derivation-failed' ||
		value === 'workspace-sync-encryption-failed' ||
		value === 'workspace-sync-decryption-failed' ||
		value === 'workspace-sync-plaintext-invalid' ||
		value === 'workspace-sync-unavailable'
	);
}

function looksLikeWorkspaceRegistryPlaintext(plaintext: string) {
	try {
		const value: unknown = JSON.parse(plaintext);

		return isObjectRecord(value) && Array.isArray(value.workspaces);
	} catch {
		return false;
	}
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
