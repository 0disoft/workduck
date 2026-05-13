import { isSecretVaultEnvelope, type SecretVaultEnvelope } from './secret-vault-crypto';

export const WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY = 'workduck.environmentVaults.v1';
export const WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT = 'workduck:environment-vault-changed';

export type EnvironmentVaultStorageError =
	| 'environment-vault-storage-read-failed'
	| 'environment-vault-storage-write-failed';

export type EnvironmentVaultEnvelopeStorageResult =
	| {
			readonly ok: true;
			readonly envelope: SecretVaultEnvelope | null;
	  }
	| {
			readonly ok: false;
			readonly envelope: null;
			readonly error: EnvironmentVaultStorageError;
	  };

export type EnvironmentVaultEnvelopeWriteResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: EnvironmentVaultStorageError;
	  };

interface EnvironmentVaultStorageRecord {
	readonly version: 1;
	readonly vaults: Record<string, SecretVaultEnvelope>;
}

interface EnvironmentVaultChangedDetail {
	readonly workspaceId: string;
	readonly envelope: SecretVaultEnvelope | null;
}

export function readEnvironmentVaultEnvelope(
	workspaceId: string
): EnvironmentVaultEnvelopeStorageResult {
	if (typeof window === 'undefined') {
		return { ok: true, envelope: null };
	}

	try {
		const storage = readStorageRecord();
		const envelope = storage.vaults[workspaceId];

		return {
			ok: true,
			envelope: isSecretVaultEnvelope(envelope) ? envelope : null
		};
	} catch {
		return {
			ok: false,
			envelope: null,
			error: 'environment-vault-storage-read-failed'
		};
	}
}

export function writeEnvironmentVaultEnvelope(
	workspaceId: string,
	envelope: SecretVaultEnvelope
): EnvironmentVaultEnvelopeWriteResult {
	if (typeof window === 'undefined') {
		return { ok: false, error: 'environment-vault-storage-write-failed' };
	}

	try {
		const storage = readStorageRecord();
		const nextStorage = {
			version: 1,
			vaults: {
				...storage.vaults,
				[workspaceId]: envelope
			}
		} satisfies EnvironmentVaultStorageRecord;

		writeStorageRecord(nextStorage);
		dispatchEnvironmentVaultChanged(workspaceId, envelope);
		return { ok: true };
	} catch {
		return { ok: false, error: 'environment-vault-storage-write-failed' };
	}
}

export function subscribeEnvironmentVaultEnvelope(
	workspaceId: string,
	callback: (envelope: SecretVaultEnvelope | null) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleVaultChanged(event: Event) {
		const detail = (event as CustomEvent<EnvironmentVaultChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(detail.envelope);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY
		) {
			return;
		}

		callback(readEnvironmentVaultEnvelope(workspaceId).envelope);
	}

	window.addEventListener(WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT, handleVaultChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT, handleVaultChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): EnvironmentVaultStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY);

	if (serializedStorage === null) {
		return createEmptyStorageRecord();
	}

	try {
		const value: unknown = JSON.parse(serializedStorage);

		if (!isObjectRecord(value) || value.version !== 1 || !isObjectRecord(value.vaults)) {
			return createEmptyStorageRecord();
		}

		return {
			version: 1,
			vaults: Object.fromEntries(
				Object.entries(value.vaults).flatMap(([workspaceId, envelope]) =>
					isSecretVaultEnvelope(envelope) ? [[workspaceId, envelope]] : []
				)
			)
		};
	} catch {
		return createEmptyStorageRecord();
	}
}

function writeStorageRecord(record: EnvironmentVaultStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY, JSON.stringify(record));
}

function dispatchEnvironmentVaultChanged(
	workspaceId: string,
	envelope: SecretVaultEnvelope | null
) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<EnvironmentVaultChangedDetail>(WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT, {
			detail: { workspaceId, envelope }
		})
	);
}

function createEmptyStorageRecord(): EnvironmentVaultStorageRecord {
	return {
		version: 1,
		vaults: {}
	};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
