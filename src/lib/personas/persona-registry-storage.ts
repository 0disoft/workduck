import {
	createEmptyPersonaRegistry,
	parsePersonaRegistry,
	serializePersonaRegistry,
	type PersonaRegistry
} from './persona-registry';

export const WORKDUCK_PERSONA_REGISTRIES_STORAGE_KEY = 'workduck.personaRegistries.v1';
export const WORKDUCK_PERSONA_REGISTRY_CHANGED_EVENT = 'workduck:persona-registry-changed';

export type PersonaRegistryStorageError =
	| 'persona-registry-storage-read-failed'
	| 'persona-registry-storage-write-failed';

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

export function readPersonaRegistry(workspaceId: string): PersonaRegistryStorageResult {
	const emptyRegistry = createEmptyPersonaRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	try {
		const storage = readStorageRecord();
		const serializedRegistry = storage.registries[workspaceId];

		if (serializedRegistry === undefined) {
			return { ok: true, registry: emptyRegistry };
		}

		const registry = parsePersonaRegistry(serializedRegistry, workspaceId);

		if (registry === null) {
			return {
				ok: false,
				registry: emptyRegistry,
				error: 'persona-registry-storage-read-failed'
			};
		}

		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry: emptyRegistry,
			error: 'persona-registry-storage-read-failed'
		};
	}
}

export function writePersonaRegistry(registry: PersonaRegistry): PersonaRegistryStorageResult {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'persona-registry-storage-write-failed'
		};
	}

	try {
		const storage = readStorageRecord();
		const nextStorage = {
			version: 1,
			registries: {
				...storage.registries,
				[registry.workspaceId]: serializePersonaRegistry(registry)
			}
		} satisfies PersonaRegistryStorageRecord;

		writeStorageRecord(nextStorage);
		dispatchPersonaRegistryChanged(registry);
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

		callback(readPersonaRegistry(workspaceId).registry);
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

function dispatchPersonaRegistryChanged(registry: PersonaRegistry) {
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
