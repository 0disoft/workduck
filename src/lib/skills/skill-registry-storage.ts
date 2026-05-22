import { isObjectRecord } from '$lib/shared/object-record';
import {
	createEmptySkillRegistry,
	parseSkillRegistry,
	serializeSkillRegistry,
	type SkillRegistry
} from './skill-registry';
import {
	readWorkspaceDataFile,
	workspaceDataFilesAreAvailable,
	writeWorkspaceDataFile,
	type WorkspaceDataFileError
} from '$lib/workspaces/workspace-data-file';

export const WORKDUCK_SKILL_REGISTRIES_STORAGE_KEY = 'workduck.skillRegistries.v1';
export const WORKDUCK_SKILL_REGISTRY_CHANGED_EVENT = 'workduck:skill-registry-changed';
const SKILL_REGISTRY_FILE_NAME = 'skills.json';

export type SkillRegistryStorageError =
	| 'skill-registry-storage-read-failed'
	| 'skill-registry-storage-write-failed'
	| WorkspaceDataFileError;

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

export async function readSkillRegistry(
	workspaceId: string,
	workspacePath = ''
): Promise<SkillRegistryStorageResult> {
	const emptyRegistry = createEmptySkillRegistry(workspaceId);
	const legacyRegistry = readLegacySkillRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const fileResult = await readWorkspaceDataFile(workspacePath, SKILL_REGISTRY_FILE_NAME);

		if (!fileResult.ok) {
			return {
				ok: false,
				registry: legacyRegistry,
				error: fileResult.error
			};
		}

		if (fileResult.content !== null) {
			const registry = parseSkillRegistry(fileResult.content, workspaceId);

			if (registry === null) {
				return {
					ok: false,
					registry: legacyRegistry,
					error: 'skill-registry-storage-read-failed'
				};
			}

			return { ok: true, registry };
		}

		if (legacyRegistry.skills.length > 0) {
			const writeResult = await writeSkillRegistry(legacyRegistry, workspacePath);

			return writeResult.ok ? { ok: true, registry: legacyRegistry } : writeResult;
		}

		return { ok: true, registry: emptyRegistry };
	}

	return { ok: true, registry: legacyRegistry };
}

export async function writeSkillRegistry(
	registry: SkillRegistry,
	workspacePath = ''
): Promise<SkillRegistryStorageResult> {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'skill-registry-storage-write-failed'
		};
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const writeResult = await writeWorkspaceDataFile(
			workspacePath,
			SKILL_REGISTRY_FILE_NAME,
			serializeSkillRegistry(registry)
		);

		if (!writeResult.ok) {
			return {
				ok: false,
				registry,
				error: writeResult.error
			};
		}

		dispatchSkillRegistryChanged(registry);
		return { ok: true, registry };
	}

	try {
		writeLegacySkillRegistry(registry);
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

		void readSkillRegistry(workspaceId).then((result) => {
			callback(result.registry);
		});
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

function readLegacySkillRegistry(workspaceId: string) {
	const storage = readStorageRecord();
	const serializedRegistry = storage.registries[workspaceId];

	if (serializedRegistry === undefined) {
		return createEmptySkillRegistry(workspaceId);
	}

	return parseSkillRegistry(serializedRegistry, workspaceId) ?? createEmptySkillRegistry(workspaceId);
}

function writeLegacySkillRegistry(registry: SkillRegistry) {
	const storage = readStorageRecord();
	const nextStorage = {
		version: 1,
		registries: {
			...storage.registries,
			[registry.workspaceId]: serializeSkillRegistry(registry)
		}
	} satisfies SkillRegistryStorageRecord;

	writeStorageRecord(nextStorage);
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
