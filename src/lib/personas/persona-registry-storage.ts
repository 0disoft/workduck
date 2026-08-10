import { isObjectRecord } from '$lib/shared/object-record';
import {
	createEmptyPersonaRegistry,
	parsePersonaRegistry,
	serializePersonaRegistry,
	type PersonaRegistry
} from './persona-registry';
import {
	readWorkspaceDataFile,
	workspaceDataFilesAreAvailable,
	writeWorkspaceRegistryFile,
	type WorkspaceDataFileError
} from '$lib/workspaces/workspace-data-file';

export const WORKDUCK_PERSONA_REGISTRIES_STORAGE_KEY = 'workduck.personaRegistries.v1';
export const WORKDUCK_PERSONA_REGISTRY_CHANGED_EVENT = 'workduck:persona-registry-changed';
const PERSONA_REGISTRY_FILE_NAME = 'personas.json';

export type PersonaRegistryStorageError =
	| 'persona-registry-storage-read-failed'
	| 'persona-registry-storage-write-failed'
	| WorkspaceDataFileError;

export type PersonaRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: PersonaRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: PersonaRegistry;
			readonly error: PersonaRegistryStorageError;
	  };

interface PersonaRegistryStorageRecord {
	readonly version: 1;
	readonly registries: Record<string, string>;
}

interface PersonaRegistryChangedDetail {
	readonly workspaceId: string;
	readonly registry: PersonaRegistry;
}

export async function readPersonaRegistry(
	workspaceId: string,
	workspacePath = ''
): Promise<PersonaRegistryStorageResult> {
	const emptyRegistry = createEmptyPersonaRegistry(workspaceId);
	const legacyRegistry = readLegacyPersonaRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const fileResult = await readWorkspaceDataFile(workspacePath, PERSONA_REGISTRY_FILE_NAME);

		if (!fileResult.ok) {
			return {
				ok: false,
				registry: legacyRegistry,
				error: fileResult.error
			};
		}

		if (fileResult.content !== null) {
			const registry = parsePersonaRegistry(fileResult.content, workspaceId);

			if (registry === null) {
				return {
					ok: false,
					registry: legacyRegistry,
					error: 'persona-registry-storage-read-failed'
				};
			}

			return { ok: true, registry };
		}

		if (legacyRegistry.personas.length > 0) {
			const writeResult = await writePersonaRegistry(legacyRegistry, workspacePath);

			return writeResult;
		}

		return { ok: true, registry: emptyRegistry };
	}

	return { ok: true, registry: legacyRegistry };
}

export async function writePersonaRegistry(
	registry: PersonaRegistry,
	workspacePath = ''
): Promise<PersonaRegistryStorageResult> {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'persona-registry-storage-write-failed'
		};
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const writeResult = await writeWorkspaceRegistryFile(
			workspacePath,
			PERSONA_REGISTRY_FILE_NAME,
			registry.revision,
			serializePersonaRegistry(registry)
		);

		if (!writeResult.ok) {
			return {
				ok: false,
				registry,
				error: writeResult.error
			};
		}

		const persistedRegistry = parsePersonaRegistry(writeResult.content, registry.workspaceId);
		if (persistedRegistry === null) {
			return { ok: false, registry, error: 'persona-registry-storage-write-failed' };
		}

		notifyPersonaRegistryChanged(persistedRegistry);
		return { ok: true, registry: persistedRegistry };
	}

	try {
		writeLegacyPersonaRegistry(registry);
		notifyPersonaRegistryChanged(registry);
		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry,
			error: 'persona-registry-storage-write-failed'
		};
	}
}

export function subscribePersonaRegistry(
	workspaceId: string,
	callback: (registry: PersonaRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<PersonaRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(detail.registry);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_PERSONA_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		void readPersonaRegistry(workspaceId).then((result) => {
			callback(result.registry);
		});
	}

	window.addEventListener(WORKDUCK_PERSONA_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_PERSONA_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): PersonaRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_PERSONA_REGISTRIES_STORAGE_KEY);

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

function writeStorageRecord(record: PersonaRegistryStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(WORKDUCK_PERSONA_REGISTRIES_STORAGE_KEY, JSON.stringify(record));
}

function readLegacyPersonaRegistry(workspaceId: string) {
	const storage = readStorageRecord();
	const serializedRegistry = storage.registries[workspaceId];

	if (serializedRegistry === undefined) {
		return createEmptyPersonaRegistry(workspaceId);
	}

	return parsePersonaRegistry(serializedRegistry, workspaceId) ?? createEmptyPersonaRegistry(workspaceId);
}

function writeLegacyPersonaRegistry(registry: PersonaRegistry) {
	const storage = readStorageRecord();
	const nextStorage = {
		version: 1,
		registries: {
			...storage.registries,
			[registry.workspaceId]: serializePersonaRegistry(registry)
		}
	} satisfies PersonaRegistryStorageRecord;

	writeStorageRecord(nextStorage);
}

export function notifyPersonaRegistryChanged(registry: PersonaRegistry) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<PersonaRegistryChangedDetail>(WORKDUCK_PERSONA_REGISTRY_CHANGED_EVENT, {
			detail: { workspaceId: registry.workspaceId, registry }
		})
	);
}

function createEmptyStorageRecord(): PersonaRegistryStorageRecord {
	return {
		version: 1,
		registries: {}
	};
}
