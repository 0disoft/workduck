import {
	createEmptyReferenceRegistry,
	parseReferenceRegistry,
	serializeReferenceRegistry,
	type ReferenceRegistry
} from './reference-registry';
import {
	readWorkspaceDataFile,
	workspaceDataFilesAreAvailable,
	writeWorkspaceDataFile,
	type WorkspaceDataFileError
} from '$lib/workspaces/workspace-data-file';

export const WORKDUCK_REFERENCE_REGISTRIES_STORAGE_KEY = 'workduck.referenceRegistries.v1';
export const WORKDUCK_REFERENCE_REGISTRY_CHANGED_EVENT = 'workduck:reference-registry-changed';
const REFERENCE_REGISTRY_FILE_NAME = 'references.json';

export type ReferenceRegistryStorageError =
	| 'reference-registry-storage-read-failed'
	| 'reference-registry-storage-write-failed'
	| WorkspaceDataFileError;

export type ReferenceRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: ReferenceRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: ReferenceRegistry;
			readonly error: ReferenceRegistryStorageError;
	  };

interface ReferenceRegistryStorageRecord {
	readonly version: 1;
	readonly registries: Record<string, string>;
}

interface ReferenceRegistryChangedDetail {
	readonly workspaceId: string;
	readonly registry: ReferenceRegistry;
}

export async function readReferenceRegistry(
	workspaceId: string,
	workspacePath = ''
): Promise<ReferenceRegistryStorageResult> {
	const emptyRegistry = createEmptyReferenceRegistry(workspaceId);
	const legacyRegistry = readLegacyReferenceRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const fileResult = await readWorkspaceDataFile(workspacePath, REFERENCE_REGISTRY_FILE_NAME);

		if (!fileResult.ok) {
			return {
				ok: false,
				registry: legacyRegistry,
				error: fileResult.error
			};
		}

		if (fileResult.content !== null) {
			const registry = parseReferenceRegistry(fileResult.content, workspaceId);

			if (registry === null) {
				return {
					ok: false,
					registry: legacyRegistry,
					error: 'reference-registry-storage-read-failed'
				};
			}

			return { ok: true, registry };
		}

		if (legacyRegistry.references.length > 0) {
			const writeResult = await writeReferenceRegistry(legacyRegistry, workspacePath);

			return writeResult.ok ? { ok: true, registry: legacyRegistry } : writeResult;
		}

		return { ok: true, registry: emptyRegistry };
	}

	return { ok: true, registry: legacyRegistry };
}

export async function writeReferenceRegistry(
	registry: ReferenceRegistry,
	workspacePath = ''
): Promise<ReferenceRegistryStorageResult> {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'reference-registry-storage-write-failed'
		};
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const writeResult = await writeWorkspaceDataFile(
			workspacePath,
			REFERENCE_REGISTRY_FILE_NAME,
			serializeReferenceRegistry(registry)
		);

		if (!writeResult.ok) {
			return {
				ok: false,
				registry,
				error: writeResult.error
			};
		}

		dispatchReferenceRegistryChanged(registry);
		return { ok: true, registry };
	}

	try {
		writeLegacyReferenceRegistry(registry);
		dispatchReferenceRegistryChanged(registry);
		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry,
			error: 'reference-registry-storage-write-failed'
		};
	}
}

export function subscribeReferenceRegistry(
	workspaceId: string,
	callback: (registry: ReferenceRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<ReferenceRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(detail.registry);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_REFERENCE_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		void readReferenceRegistry(workspaceId).then((result) => {
			callback(result.registry);
		});
	}

	window.addEventListener(WORKDUCK_REFERENCE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_REFERENCE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): ReferenceRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_REFERENCE_REGISTRIES_STORAGE_KEY);

	if (serializedStorage === null) {
		return createEmptyStorageRecord();
	}

	try {
		const value: unknown = JSON.parse(serializedStorage);

		if (!isObjectRecord(value) || value.version !== 1 || !isObjectRecord(value.registries)) {
			return createEmptyStorageRecord();
		}

		return {
			version: 1,
			registries: Object.fromEntries(
				Object.entries(value.registries).flatMap(([workspaceId, registry]) =>
					typeof registry === 'string' ? [[workspaceId, registry]] : []
				)
			)
		};
	} catch {
		return createEmptyStorageRecord();
	}
}

function writeStorageRecord(record: ReferenceRegistryStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(WORKDUCK_REFERENCE_REGISTRIES_STORAGE_KEY, JSON.stringify(record));
}

function readLegacyReferenceRegistry(workspaceId: string) {
	const storage = readStorageRecord();
	const serializedRegistry = storage.registries[workspaceId];

	if (serializedRegistry === undefined) {
		return createEmptyReferenceRegistry(workspaceId);
	}

	return (
		parseReferenceRegistry(serializedRegistry, workspaceId) ?? createEmptyReferenceRegistry(workspaceId)
	);
}

function writeLegacyReferenceRegistry(registry: ReferenceRegistry) {
	const storage = readStorageRecord();
	const nextStorage = {
		version: 1,
		registries: {
			...storage.registries,
			[registry.workspaceId]: serializeReferenceRegistry(registry)
		}
	} satisfies ReferenceRegistryStorageRecord;

	writeStorageRecord(nextStorage);
}

function dispatchReferenceRegistryChanged(registry: ReferenceRegistry) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<ReferenceRegistryChangedDetail>(WORKDUCK_REFERENCE_REGISTRY_CHANGED_EVENT, {
			detail: { workspaceId: registry.workspaceId, registry }
		})
	);
}

function createEmptyStorageRecord(): ReferenceRegistryStorageRecord {
	return {
		version: 1,
		registries: {}
	};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
