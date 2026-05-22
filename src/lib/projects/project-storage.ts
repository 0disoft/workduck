import { isObjectRecord } from '$lib/shared/object-record';
import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import {
	createEmptyProjectRegistry,
	normalizeProjectRegistry,
	parseStoredProjectRegistry,
	serializeProjectRegistry,
	WORKDUCK_PROJECT_REGISTRY_VERSION,
	type ProjectRegistry,
	type ProjectRegistryParseError
} from './project-registry';

const LEGACY_PROJECT_REGISTRIES_STORAGE_KEY = 'workduck.projectRegistries.v1';
const PROJECT_REGISTRY_SQLITE_MIGRATION_STORAGE_KEY = 'workduck.projectRegistries.sqliteMigrated.v1';
const PROJECT_REGISTRY_SQLITE_RETRY_ATTEMPTS = 3;
const PROJECT_REGISTRY_SQLITE_RETRY_DELAY_MS = 150;
export const WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT = 'workduck:project-registry-changed';

export type ProjectRegistryStorageError =
	| 'project-registry-read-failed'
	| 'project-registry-version-unsupported'
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

interface ProjectRegistryReadResponse {
	readonly ok: boolean;
	readonly registryJson?: string | null;
	readonly error?: ProjectRegistryStorageError | null;
}

interface ProjectRegistriesReadResponse {
	readonly ok: boolean;
	readonly registries?: Record<string, string> | null;
	readonly error?: ProjectRegistryStorageError | null;
}

interface ProjectRegistryWriteResponse {
	readonly ok: boolean;
	readonly error?: ProjectRegistryStorageError | null;
}

export async function readProjectRegistry(workspaceId: string): Promise<ProjectRegistryStorageResult> {
	const emptyRegistry = createEmptyProjectRegistry(workspaceId);
	const legacyRegistry = readLegacyProjectRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	if (getTauriInvoke() === undefined) {
		return { ok: true, registry: legacyRegistry };
	}

	const sqliteResult = await readProjectRegistryFromSqlite(workspaceId);

	if (!sqliteResult.ok) {
		return {
			ok: false,
			registry: legacyRegistry,
			error: sqliteResult.error
		};
	}

	const sqliteRegistryResult =
		sqliteResult.registryJson === null
			? ({ ok: true, registry: emptyRegistry } as const)
			: parseProjectRegistryJson(sqliteResult.registryJson, workspaceId);

	if (!sqliteRegistryResult.ok) {
		return {
			ok: false,
			registry: legacyRegistry,
			error: mapProjectRegistryParseError(sqliteRegistryResult.error)
		};
	}

	const sqliteRegistry = sqliteRegistryResult.registry;

	if (shouldPromoteLegacyRegistry(workspaceId, sqliteRegistry, legacyRegistry)) {
		const writeResult = await writeProjectRegistryToSqlite(legacyRegistry);

		if (!writeResult.ok) {
			return {
				ok: false,
				registry: legacyRegistry,
				error: writeResult.error
			};
		}

		markWorkspaceRegistryMigrated(workspaceId);
		return { ok: true, registry: legacyRegistry };
	}

	if (sqliteResult.registryJson !== null) {
		markWorkspaceRegistryMigrated(workspaceId);
	}

	return { ok: true, registry: sqliteRegistry };
}

export async function writeProjectRegistry(
	registry: ProjectRegistry
): Promise<ProjectRegistryStorageResult> {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);

	if (typeof window === 'undefined') {
		return { ok: false, registry: normalizedRegistry, error: 'project-registry-write-failed' };
	}

	if (getTauriInvoke() === undefined) {
		try {
			writeLegacyProjectRegistries({
				...readLegacyStorageRecord().registries,
				[normalizedRegistry.workspaceId]: normalizedRegistry
			});
			dispatchProjectRegistryChanged(normalizedRegistry.workspaceId, normalizedRegistry);
			return { ok: true, registry: normalizedRegistry };
		} catch {
			return { ok: false, registry: normalizedRegistry, error: 'project-registry-write-failed' };
		}
	}

	const writeResult = await writeProjectRegistryToSqlite(normalizedRegistry);

	if (!writeResult.ok) {
		return {
			ok: false,
			registry: normalizedRegistry,
			error: writeResult.error
		};
	}

	markWorkspaceRegistryMigrated(normalizedRegistry.workspaceId);
	dispatchProjectRegistryChanged(normalizedRegistry.workspaceId, normalizedRegistry);
	return { ok: true, registry: normalizedRegistry };
}

export async function readProjectRegistries(
	workspaceIds: readonly string[]
): Promise<ProjectRegistriesStorageResult> {
	const fallbackRegistries: Record<string, ProjectRegistry> = Object.fromEntries(
		workspaceIds.map((workspaceId) => [workspaceId, readLegacyProjectRegistry(workspaceId)])
	);

	if (typeof window === 'undefined') {
		return { ok: true, registries: fallbackRegistries };
	}

	if (getTauriInvoke() === undefined) {
		return { ok: true, registries: fallbackRegistries };
	}

	const sqliteResult = await readProjectRegistriesFromSqlite(workspaceIds);

	if (!sqliteResult.ok) {
		return {
			ok: false,
			registries: fallbackRegistries,
			error: sqliteResult.error
		};
	}

	const registries: Record<string, ProjectRegistry> = {};
	const registriesToPromote: Record<string, ProjectRegistry> = {};

	for (const workspaceId of workspaceIds) {
		const sqliteRegistryJson = sqliteResult.registries[workspaceId];
		const registryResult =
			sqliteRegistryJson === undefined
				? ({ ok: true, registry: createEmptyProjectRegistry(workspaceId) } as const)
				: parseProjectRegistryJson(sqliteRegistryJson, workspaceId);
		const fallbackRegistry = fallbackRegistries[workspaceId] ?? createEmptyProjectRegistry(workspaceId);

		if (!registryResult.ok) {
			return {
				ok: false,
				registries: fallbackRegistries,
				error: mapProjectRegistryParseError(registryResult.error)
			};
		}

		const registry = registryResult.registry;
		registries[workspaceId] = registry;

		if (shouldPromoteLegacyRegistry(workspaceId, registry, fallbackRegistry)) {
			registriesToPromote[workspaceId] = fallbackRegistry;
		}
	}

	if (Object.keys(registriesToPromote).length > 0) {
		const writeResult = await writeProjectRegistriesToSqlite(registriesToPromote);

		if (!writeResult.ok) {
			return {
				ok: false,
				registries: {
					...registries,
					...registriesToPromote
				},
				error: writeResult.error
			};
		}

		for (const workspaceId of Object.keys(registriesToPromote)) {
			markWorkspaceRegistryMigrated(workspaceId);
		}

		return {
			ok: true,
			registries: {
				...registries,
				...registriesToPromote
			}
		};
	}

	for (const workspaceId of workspaceIds) {
		if (sqliteResult.registries[workspaceId] !== undefined) {
			markWorkspaceRegistryMigrated(workspaceId);
		}
	}

	return { ok: true, registries };
}

export async function writeProjectRegistries(
	registries: Record<string, ProjectRegistry>
): Promise<ProjectRegistriesStorageResult> {
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

	if (getTauriInvoke() === undefined) {
		try {
			writeLegacyProjectRegistries({
				...readLegacyStorageRecord().registries,
				...normalizedRegistries
			});

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

	const writeResult = await writeProjectRegistriesToSqlite(normalizedRegistries);

	if (!writeResult.ok) {
		return {
			ok: false,
			registries: normalizedRegistries,
			error: writeResult.error
		};
	}

	for (const registry of Object.values(normalizedRegistries)) {
		markWorkspaceRegistryMigrated(registry.workspaceId);
		dispatchProjectRegistryChanged(registry.workspaceId, registry);
	}

	return { ok: true, registries: normalizedRegistries };
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
			event.key !== LEGACY_PROJECT_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		void readProjectRegistry(workspaceId).then((result) => {
			callback(result.registry);
		});
	}

	window.addEventListener(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

async function readProjectRegistryFromSqlite(workspaceId: string) {
	for (let attempt = 1; attempt <= PROJECT_REGISTRY_SQLITE_RETRY_ATTEMPTS; attempt += 1) {
		const result = await readProjectRegistryFromSqliteOnce(workspaceId);

		if (result.ok || attempt === PROJECT_REGISTRY_SQLITE_RETRY_ATTEMPTS) {
			return result;
		}

		await waitForProjectRegistrySqliteRetry();
	}

	return { ok: false, error: 'project-registry-read-failed' } as const;
}

async function readProjectRegistryFromSqliteOnce(workspaceId: string) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true, registryJson: getLegacyRegistryJson(workspaceId) } as const;
	}

	try {
		const response = await invoke<ProjectRegistryReadResponse>('read_project_registry', {
			workspaceId
		});

		if (response.ok) {
			return {
				ok: true,
				registryJson: typeof response.registryJson === 'string' ? response.registryJson : null
			} as const;
		}

		return {
			ok: false,
			error: isProjectRegistryStorageError(response.error)
				? response.error
				: 'project-registry-read-failed'
		} as const;
	} catch {
		return { ok: false, error: 'project-registry-read-failed' } as const;
	}
}

async function readProjectRegistriesFromSqlite(workspaceIds: readonly string[]) {
	for (let attempt = 1; attempt <= PROJECT_REGISTRY_SQLITE_RETRY_ATTEMPTS; attempt += 1) {
		const result = await readProjectRegistriesFromSqliteOnce(workspaceIds);

		if (result.ok || attempt === PROJECT_REGISTRY_SQLITE_RETRY_ATTEMPTS) {
			return result;
		}

		await waitForProjectRegistrySqliteRetry();
	}

	return { ok: false, error: 'project-registry-read-failed' } as const;
}

async function readProjectRegistriesFromSqliteOnce(workspaceIds: readonly string[]) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return {
			ok: true,
			registries: Object.fromEntries(
				workspaceIds.flatMap((workspaceId) => {
					const registryJson = getLegacyRegistryJson(workspaceId);

					return registryJson === null ? [] : [[workspaceId, registryJson]];
				})
			)
		} as const;
	}

	try {
		const response = await invoke<ProjectRegistriesReadResponse>('read_project_registries', {
			workspaceIds
		});

		if (response.ok && isStringRecord(response.registries)) {
			return { ok: true, registries: response.registries } as const;
		}

		return {
			ok: false,
			error: isProjectRegistryStorageError(response.error)
				? response.error
				: 'project-registry-read-failed'
		} as const;
	} catch {
		return { ok: false, error: 'project-registry-read-failed' } as const;
	}
}

function waitForProjectRegistrySqliteRetry() {
	return new Promise((resolve) => {
		window.setTimeout(resolve, PROJECT_REGISTRY_SQLITE_RETRY_DELAY_MS);
	});
}

async function writeProjectRegistryToSqlite(registry: ProjectRegistry) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		try {
			writeLegacyProjectRegistries({
				...readLegacyStorageRecord().registries,
				[registry.workspaceId]: registry
			});
			return { ok: true } as const;
		} catch {
			return { ok: false, error: 'project-registry-write-failed' } as const;
		}
	}

	try {
		const response = await invoke<ProjectRegistryWriteResponse>('write_project_registry', {
			workspaceId: registry.workspaceId,
			registryJson: serializeProjectRegistry(registry),
			updatedAt: registry.updatedAt
		});

		return response.ok
			? ({ ok: true } as const)
			: ({
					ok: false,
					error: isProjectRegistryStorageError(response.error)
						? response.error
						: 'project-registry-write-failed'
				} as const);
	} catch {
		return { ok: false, error: 'project-registry-write-failed' } as const;
	}
}

async function writeProjectRegistriesToSqlite(registries: Record<string, ProjectRegistry>) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		try {
			writeLegacyProjectRegistries({
				...readLegacyStorageRecord().registries,
				...registries
			});
			return { ok: true } as const;
		} catch {
			return { ok: false, error: 'project-registry-write-failed' } as const;
		}
	}

	try {
		const response = await invoke<ProjectRegistryWriteResponse>('write_project_registries', {
			registries: Object.fromEntries(
				Object.entries(registries).map(([workspaceId, registry]) => [
					workspaceId,
					{
						registryJson: serializeProjectRegistry(registry),
						updatedAt: registry.updatedAt
					}
				])
			)
		});

		return response.ok
			? ({ ok: true } as const)
			: ({
					ok: false,
					error: isProjectRegistryStorageError(response.error)
						? response.error
						: 'project-registry-write-failed'
				} as const);
	} catch {
		return { ok: false, error: 'project-registry-write-failed' } as const;
	}
}

function shouldPromoteLegacyRegistry(
	workspaceId: string,
	sqliteRegistry: ProjectRegistry,
	legacyRegistry: ProjectRegistry
) {
	return (
		!workspaceRegistryWasMigrated(workspaceId) &&
		sqliteRegistry.nodes.length === 0 &&
		legacyRegistry.nodes.length > 0
	);
}

function parseProjectRegistryJson(registryJson: string, workspaceId: string) {
	return parseStoredProjectRegistry(registryJson, workspaceId);
}

function mapProjectRegistryParseError(error: ProjectRegistryParseError): ProjectRegistryStorageError {
	return error === 'project-registry-version-unsupported'
		? 'project-registry-version-unsupported'
		: 'project-registry-read-failed';
}

function readLegacyProjectRegistry(workspaceId: string) {
	const storage = readLegacyStorageRecord();

	return normalizeProjectRegistry(storage.registries[workspaceId], workspaceId);
}

function getLegacyRegistryJson(workspaceId: string) {
	const registry = readLegacyProjectRegistry(workspaceId);

	return registry.nodes.length === 0 ? null : serializeProjectRegistry(registry);
}

function readLegacyStorageRecord(): ProjectRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyLegacyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(LEGACY_PROJECT_REGISTRIES_STORAGE_KEY);

	if (serializedStorage === null) {
		return createEmptyLegacyStorageRecord();
	}

	try {
		const value: unknown = JSON.parse(serializedStorage);

		if (!isObjectRecord(value) || value.version !== WORKDUCK_PROJECT_REGISTRY_VERSION) {
			return createEmptyLegacyStorageRecord();
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
		return createEmptyLegacyStorageRecord();
	}
}

function writeLegacyProjectRegistries(registries: Record<string, ProjectRegistry>) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(
		LEGACY_PROJECT_REGISTRIES_STORAGE_KEY,
		JSON.stringify({
			version: WORKDUCK_PROJECT_REGISTRY_VERSION,
			registries: Object.fromEntries(
				Object.entries(registries).map(([workspaceId, registry]) => [
					workspaceId,
					normalizeProjectRegistry(registry, workspaceId)
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

function createEmptyLegacyStorageRecord(): ProjectRegistryStorageRecord {
	return {
		version: WORKDUCK_PROJECT_REGISTRY_VERSION,
		registries: {}
	};
}

function workspaceRegistryWasMigrated(workspaceId: string) {
	return readMigratedWorkspaceIds().has(workspaceId);
}

function markWorkspaceRegistryMigrated(workspaceId: string) {
	if (typeof window === 'undefined') {
		return;
	}

	const workspaceIds = readMigratedWorkspaceIds();
	workspaceIds.add(workspaceId);
	window.localStorage.setItem(
		PROJECT_REGISTRY_SQLITE_MIGRATION_STORAGE_KEY,
		JSON.stringify([...workspaceIds])
	);
}

function readMigratedWorkspaceIds() {
	if (typeof window === 'undefined') {
		return new Set<string>();
	}

	try {
		const value: unknown = JSON.parse(
			window.localStorage.getItem(PROJECT_REGISTRY_SQLITE_MIGRATION_STORAGE_KEY) ?? '[]'
		);

		return new Set(
			Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
		);
	} catch {
		return new Set<string>();
	}
}

function isProjectRegistryStorageError(value: unknown): value is ProjectRegistryStorageError {
	return (
		value === 'project-registry-read-failed' ||
		value === 'project-registry-version-unsupported' ||
		value === 'project-registry-write-failed'
	);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		isObjectRecord(value) &&
		Object.values(value).every((item): item is string => typeof item === 'string')
	);
}
