import {
	createEmptySkillRegistry,
	parseSkillRegistry,
	serializeSkillRegistry,
	type SkillRegistry
} from './skill-registry';

export const WORKDUCK_SKILL_REGISTRIES_STORAGE_KEY = 'workduck.skillRegistries.v1';
export const WORKDUCK_SKILL_REGISTRY_CHANGED_EVENT = 'workduck:skill-registry-changed';

export type SkillRegistryStorageError =
	| 'skill-registry-storage-read-failed'
	| 'skill-registry-storage-write-failed';

export type SkillRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: SkillRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: SkillRegistry;
			readonly error: SkillRegistryStorageError;
	  };

interface SkillRegistryStorageRecord {
	readonly version: 1;
	readonly registries: Record<string, string>;
}

interface SkillRegistryChangedDetail {
	readonly workspaceId: string;
	readonly registry: SkillRegistry;
}

export function readSkillRegistry(workspaceId: string): SkillRegistryStorageResult {
	const emptyRegistry = createEmptySkillRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	try {
		const storage = readStorageRecord();
		const serializedRegistry = storage.registries[workspaceId];

		if (serializedRegistry === undefined) {
			return { ok: true, registry: emptyRegistry };
		}

		const registry = parseSkillRegistry(serializedRegistry, workspaceId);

		if (registry === null) {
			return {
				ok: false,
				registry: emptyRegistry,
				error: 'skill-registry-storage-read-failed'
			};
		}

		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry: emptyRegistry,
			error: 'skill-registry-storage-read-failed'
		};
	}
}

export function writeSkillRegistry(registry: SkillRegistry): SkillRegistryStorageResult {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'skill-registry-storage-write-failed'
		};
	}

	try {
		const storage = readStorageRecord();
		const nextStorage = {
			version: 1,
			registries: {
				...storage.registries,
				[registry.workspaceId]: serializeSkillRegistry(registry)
			}
		} satisfies SkillRegistryStorageRecord;

		writeStorageRecord(nextStorage);
		dispatchSkillRegistryChanged(registry);
		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry,
			error: 'skill-registry-storage-write-failed'
		};
	}
}

export function subscribeSkillRegistry(
	workspaceId: string,
	callback: (registry: SkillRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<SkillRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(detail.registry);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_SKILL_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		callback(readSkillRegistry(workspaceId).registry);
	}

	window.addEventListener(WORKDUCK_SKILL_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_SKILL_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): SkillRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_SKILL_REGISTRIES_STORAGE_KEY);

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

function writeStorageRecord(record: SkillRegistryStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(WORKDUCK_SKILL_REGISTRIES_STORAGE_KEY, JSON.stringify(record));
}

function dispatchSkillRegistryChanged(registry: SkillRegistry) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<SkillRegistryChangedDetail>(WORKDUCK_SKILL_REGISTRY_CHANGED_EVENT, {
			detail: { workspaceId: registry.workspaceId, registry }
		})
	);
}

function createEmptyStorageRecord(): SkillRegistryStorageRecord {
	return {
		version: 1,
		registries: {}
	};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
