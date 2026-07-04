import { isObjectRecord } from '$lib/shared/object-record';
import { isSecretVaultEnvelope, type SecretVaultEnvelope } from './secret-vault-crypto';
import {
	readWorkspaceDataFile,
	workspaceDataFilesAreAvailable,
	writeWorkspaceDataFile
} from '$lib/workspaces/workspace-data-file';

export const WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY = 'workduck.environmentVaults.v1';
export const WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT = 'workduck:environment-vault-changed';
export const WORKDUCK_ENVIRONMENT_VAULT_FILE_NAME = 'secrets.sync.json';

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

export async function readEnvironmentVaultEnvelopeForWorkspace(
	workspaceId: string,
	workspacePath: string | null | undefined
): Promise<EnvironmentVaultEnvelopeStorageResult> {
	if (canUseWorkspaceVaultFile(workspacePath)) {
		const fileResult = await readWorkspaceDataFile(
			workspacePath.trim(),
			WORKDUCK_ENVIRONMENT_VAULT_FILE_NAME
		);

		if (!fileResult.ok) {
			return fileResult.error === 'workspace-data-unavailable'
				? readEnvironmentVaultEnvelope(workspaceId)
				: {
						ok: false,
						envelope: null,
						error: 'environment-vault-storage-read-failed'
					};
		}

		if (fileResult.content !== null) {
			const workspaceEnvelopeResult = parseWorkspaceVaultEnvelope(fileResult.content);

			if (workspaceEnvelopeResult.ok) {
				return workspaceEnvelopeResult;
			}

			const browserMirrorResult = readEnvironmentVaultEnvelope(workspaceId);

			return browserMirrorResult.ok && browserMirrorResult.envelope !== null
				? browserMirrorResult
				: workspaceEnvelopeResult;
		}
	}

	return readEnvironmentVaultEnvelope(workspaceId);
}

export async function writeEnvironmentVaultEnvelopeForWorkspace(
	workspaceId: string,
	envelope: SecretVaultEnvelope,
	workspacePath: string | null | undefined
): Promise<EnvironmentVaultEnvelopeWriteResult> {
	if (canUseWorkspaceVaultFile(workspacePath)) {
		const fileResult = await writeWorkspaceDataFile(
			workspacePath.trim(),
			WORKDUCK_ENVIRONMENT_VAULT_FILE_NAME,
			`${JSON.stringify(envelope, null, 2)}\n`
		);

		if (fileResult.ok) {
			const browserMirrorResult = writeEnvironmentVaultEnvelope(workspaceId, envelope);

			if (!browserMirrorResult.ok) {
				dispatchEnvironmentVaultChanged(workspaceId, envelope);
			}

			return { ok: true };
		}

		if (fileResult.error !== 'workspace-data-unavailable') {
			return { ok: false, error: 'environment-vault-storage-write-failed' };
		}
	}

	return writeEnvironmentVaultEnvelope(workspaceId, envelope);
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

export function subscribeEnvironmentVaultEnvelopeForWorkspace(
	workspaceId: string,
	workspacePath: string | null | undefined,
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

		void readEnvironmentVaultEnvelopeForWorkspace(workspaceId, workspacePath).then((result) => {
			if (result.ok) {
				callback(result.envelope);
			}
		});
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

function parseWorkspaceVaultEnvelope(content: string): EnvironmentVaultEnvelopeStorageResult {
	try {
		const value: unknown = JSON.parse(content);

		if (!isSecretVaultEnvelope(value)) {
			return {
				ok: false,
				envelope: null,
				error: 'environment-vault-storage-read-failed'
			};
		}

		return { ok: true, envelope: value };
	} catch {
		return {
			ok: false,
			envelope: null,
			error: 'environment-vault-storage-read-failed'
		};
	}
}

function canUseWorkspaceVaultFile(
	workspacePath: string | null | undefined
): workspacePath is string {
	return (
		typeof workspacePath === 'string' &&
		workspacePath.trim().length > 0 &&
		workspaceDataFilesAreAvailable()
	);
}

function createEmptyStorageRecord(): EnvironmentVaultStorageRecord {
	return {
		version: 1,
		vaults: {}
	};
}
