import {
	createEmptyProjectRegistry,
	normalizeProjectRegistry,
	serializeProjectRegistry,
	WORKDUCK_PROJECT_REGISTRY_VERSION,
	type ProjectRegistry
} from './project-registry';

export const WORKDUCK_PROJECT_REGISTRIES_STORAGE_KEY = 'workduck.projectRegistries.v1';
export const WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT = 'workduck:project-registry-changed';

export type ProjectRegistryStorageError =
	| 'project-registry-read-failed'
	| 'project-registry-write-failed';

export type ProjectRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: ProjectRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: ProjectRegistry;
			readonly error: ProjectRegistryStorageError;
	  };

export type ProjectRegistriesStorageResult =
	| {
			readonly ok: true;
			readonly registries: Record<string, ProjectRegistry>;
	  }
	| {
			readonly ok: false;
			readonly registries: Record<string, ProjectRegistry>;
			readonly error: ProjectRegistryStorageError;
	  };

interface ProjectRegistryStorageRecord {
	readonly version: typeof WORKDUCK_PROJECT_REGISTRY_VERSION;
	readonly registries: Record<string, ProjectRegistry>;
}

interface ProjectRegistryChangedDetail {
	readonly workspaceId: string;
	readonly registry: ProjectRegistry;
}

export function readProjectRegistryFromBrowser(
	workspaceId: string
): ProjectRegistryStorageResult {
	if (typeof window === 'undefined') {
		return { ok: true, registry: createEmptyProjectRegistry(workspaceId) };
	}

	try {
		const storage = readStorageRecord();

		return {
			ok: true,
			registry: normalizeProjectRegistry(storage.registries[workspaceId], workspaceId)
		};
	} catch {
		return {
			ok: false,
			registry: createEmptyProjectRegistry(workspaceId),
			error: 'project-registry-read-failed'
		};
	}
}

export function writeProjectRegistryToBrowser(
	registry: ProjectRegistry
): ProjectRegistryStorageResult {
	if (typeof window === 'undefined') {
		return { ok: false, registry, error: 'project-registry-write-failed' };
	}

	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);

	try {
		const storage = readStorageRecord();
		const nextStorage = {
			version: WORKDUCK_PROJECT_REGISTRY_VERSION,
			registries: {
				...storage.registries,
				[normalizedRegistry.workspaceId]: normalizedRegistry
			}
		} satisfies ProjectRegistryStorageRecord;

		writeStorageRecord(nextStorage);
		dispatchProjectRegistryChanged(normalizedRegistry.workspaceId, normalizedRegistry);
		return { ok: true, registry: normalizedRegistry };
	} catch {
		return {
			ok: false,
			registry: normalizedRegistry,
			error: 'project-registry-write-failed'
		};
	}
}

export function readProjectRegistriesFromBrowser(
	workspaceIds: readonly string[]
): ProjectRegistriesStorageResult {
	const registries = Object.fromEntries(
		workspaceIds.map((workspaceId) => [workspaceId, createEmptyProjectRegistry(workspaceId)])
	);

	if (typeof window === 'undefined') {
		return { ok: true, registries };
	}

	try {
		const storage = readStorageRecord();

		return {
			ok: true,
			registries: Object.fromEntries(
				workspaceIds.map((workspaceId) => [
					workspaceId,
					normalizeProjectRegistry(storage.registries[workspaceId], workspaceId)
				])
			)
		};
	} catch {
		return {
			ok: false,
			registries,
			error: 'project-registry-read-failed'
		};
	}
}

export function writeProjectRegistriesToBrowser(
	registries: Record<string, ProjectRegistry>
): ProjectRegistriesStorageResult {
	const normalizedRegistries = Object.fromEntries(
		Object.entries(registries).map(([workspaceId, registry]) => [
			workspaceId,
			normalizeProjectRegistry(registry, workspaceId)
		])
	);

	if (typeof window === 'undefined') {
		return {
			ok: false,
			registries: normalizedRegistries,
			error: 'project-registry-write-failed'
		};
	}

	try {
		const storage = readStorageRecord();
		const nextStorage = {
			version: WORKDUCK_PROJECT_REGISTRY_VERSION,
			registries: {
				...storage.registries,
				...normalizedRegistries
			}
		} satisfies ProjectRegistryStorageRecord;

		writeStorageRecord(nextStorage);

		for (const registry of Object.values(normalizedRegistries)) {
			dispatchProjectRegistryChanged(registry.workspaceId, registry);
		}

		return { ok: true, registries: normalizedRegistries };
	} catch {
		return {
			ok: false,
			registries: normalizedRegistries,
			error: 'project-registry-write-failed'
		};
	}
}

export function subscribeProjectRegistry(
	workspaceId: string,
	callback: (registry: ProjectRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<ProjectRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(normalizeProjectRegistry(detail.registry, workspaceId));
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_PROJECT_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		callback(readProjectRegistryFromBrowser(workspaceId).registry);
	}

	window.addEventListener(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): ProjectRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_PROJECT_REGISTRIES_STORAGE_KEY);

	if (serializedStorage === null) {
		return createEmptyStorageRecord();
	}

	try {
		const value: unknown = JSON.parse(serializedStorage);

		if (!isObjectRecord(value) || value.version !== WORKDUCK_PROJECT_REGISTRY_VERSION) {
			return createEmptyStorageRecord();
		}

		const rawRegistries = isObjectRecord(value.registries) ? value.registries : {};
		const registries = Object.fromEntries(
			Object.entries(rawRegistries).map(([workspaceId, registry]) => [
				workspaceId,
				normalizeProjectRegistry(registry, workspaceId)
			])
		);

		return {
			version: WORKDUCK_PROJECT_REGISTRY_VERSION,
			registries
		};
	} catch {
		return createEmptyStorageRecord();
	}
}

function writeStorageRecord(record: ProjectRegistryStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(
		WORKDUCK_PROJECT_REGISTRIES_STORAGE_KEY,
		JSON.stringify({
			version: WORKDUCK_PROJECT_REGISTRY_VERSION,
			registries: Object.fromEntries(
				Object.entries(record.registries).map(([workspaceId, registry]) => [
					workspaceId,
					JSON.parse(serializeProjectRegistry(registry))
				])
			)
		})
	);
}

function dispatchProjectRegistryChanged(workspaceId: string, registry: ProjectRegistry) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<ProjectRegistryChangedDetail>(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, {
			detail: { workspaceId, registry }
		})
	);
}

function createEmptyStorageRecord(): ProjectRegistryStorageRecord {
	return {
		version: WORKDUCK_PROJECT_REGISTRY_VERSION,
		registries: {}
	};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
