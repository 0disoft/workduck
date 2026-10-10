/* llmnav/1 module
id=workduck.projects.storage
role=Persist ordered project registry writes, atomically import workspace sync data in SQLite, and migrate browser legacy registries.
owns=project registry persistence|legacy registry promotion|registry change notifications|workspace operation ordering|atomic sync import
excludes=project domain normalization|repository Git operations
search=project registry storage|sqlite registry migration|atomic workspace sync import
invariant=Stored SQLite rows are independent of the legacy cache; bulk fallback reads share one snapshot per attempt; writes stay ordered and sync imports publish only after commit; legacy promotion guards missing rows and subscriptions publish only current results.
stability=architecture
*/

import { isObjectRecord } from '#lib/shared/object-record.ts';
import { getTauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import {
	commitWorkduckAppStateValueWithNativeTransaction,
	WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY
} from '#lib/app-state/app-state-storage.ts';
import {
	normalizeWorkspaceRegistry,
	serializeWorkspaceRegistry,
	WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
	type WorkspaceRegistry
} from '#lib/workspaces/workspace-registry.ts';
import { notifyWorkspaceRegistryChanged } from '#lib/workspaces/workspace-storage.ts';
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
const workspaceOperationTails = new Map<string, Promise<void>>();
const migratedWorkspaceIdsByStorage = new WeakMap<Storage, Set<string>>();

function sequenceProjectRegistryOperation<T>(workspaceIds: readonly string[], operation: () => Promise<T>) {
	const ids = [...new Set(workspaceIds)];
	const dependencies = ids.flatMap((id) => {
		const pending = workspaceOperationTails.get(id);
		return pending === undefined ? [] : [pending];
	});
	const result = Promise.all(dependencies).then(operation);
	// Completion tails release dependent operations even when the current operation fails.
	const completion = result.then(() => {}, () => {});
	for (const id of ids) workspaceOperationTails.set(id, completion);
	void completion.then(() => {
		for (const id of ids) {
			if (workspaceOperationTails.get(id) === completion) workspaceOperationTails.delete(id);
		}
	});
	return result;
}

export type ProjectRegistryStorageError =
	| 'project-registry-read-failed'
	| 'project-registry-version-unsupported'
	| 'project-registry-revision-conflict'
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

interface WorkspaceRegistryWriteInput {
	readonly valueJson: string;
	readonly expectedValueJson: string;
	readonly updatedAt: string;
}

export async function readProjectRegistry(workspaceId: string): Promise<ProjectRegistryStorageResult> {
	try {
		return await readProjectRegistryNow(workspaceId);
	} catch {
		return { ok: false, registry: createEmptyProjectRegistry(workspaceId), error: 'project-registry-read-failed' };
	}
}

async function readProjectRegistryNow(workspaceId: string, promotionQueued = false): Promise<ProjectRegistryStorageResult> {
	const emptyRegistry = createEmptyProjectRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	const sqliteResult = getTauriInvoke() === undefined ? undefined : await readProjectRegistryFromSqlite(workspaceId);
	const legacyRegistry = sqliteResult === undefined || !sqliteResult.ok || sqliteResult.registryJson === null
		? readLegacyProjectRegistry(workspaceId) : emptyRegistry;
	if (sqliteResult === undefined) {
		return { ok: true, registry: legacyRegistry };
	}

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

	if (sqliteResult.registryJson === null && shouldPromoteLegacyRegistry(workspaceId, legacyRegistry)) {
		if (!promotionQueued) {
			return sequenceProjectRegistryOperation([workspaceId], () => readProjectRegistryNow(workspaceId, true));
		}
		const writeResult = await writeProjectRegistryToSqlite(legacyRegistry, 'null');

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
	registry: ProjectRegistry,
	expectedRegistry?: () => Promise<ProjectRegistry>
): Promise<ProjectRegistryStorageResult> {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	return sequenceProjectRegistryOperation([normalizedRegistry.workspaceId], async () => {
		try {
			return await writeProjectRegistryNow(normalizedRegistry, await expectedRegistry?.());
		} catch {
			return { ok: false, registry: normalizedRegistry, error: 'project-registry-write-failed' } as const;
		}
	});
}

async function writeProjectRegistryNow(normalizedRegistry: ProjectRegistry, expectedRegistry?: ProjectRegistry): Promise<ProjectRegistryStorageResult> {

	if (typeof window === 'undefined') {
		return { ok: false, registry: normalizedRegistry, error: 'project-registry-write-failed' };
	}
	if (expectedRegistry !== undefined && expectedRegistry.workspaceId !== normalizedRegistry.workspaceId) {
		return { ok: false, registry: normalizedRegistry, error: 'project-registry-revision-conflict' };
	}

	if (getTauriInvoke() === undefined) {
		try {
			if (expectedRegistry !== undefined && !matchesExpectedRegistry(
				readLegacyStorageRecord().registries[normalizedRegistry.workspaceId], expectedRegistry
			)) {
				return { ok: false, registry: normalizedRegistry, error: 'project-registry-revision-conflict' };
			}
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

	let expectedRegistryJson: string | undefined;
	if (expectedRegistry !== undefined) {
		const current = await readProjectRegistryFromSqliteOnce(normalizedRegistry.workspaceId);
		if (!current.ok) return { ok: false, registry: normalizedRegistry, error: current.error };
		const parsed = current.registryJson === null ? null : parseProjectRegistryJson(current.registryJson, normalizedRegistry.workspaceId);
		if (parsed !== null && !parsed.ok) {
			return { ok: false, registry: normalizedRegistry, error: mapProjectRegistryParseError(parsed.error) };
		}
		if (!matchesExpectedRegistry(parsed?.registry, expectedRegistry)) {
			return { ok: false, registry: normalizedRegistry, error: 'project-registry-revision-conflict' };
		}
		expectedRegistryJson = current.registryJson ?? 'null';
	}
	const writeResult = await writeProjectRegistryToSqlite(normalizedRegistry, expectedRegistryJson);

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

function matchesExpectedRegistry(current: ProjectRegistry | undefined, expected: ProjectRegistry) {
	// A missing row has no timestamp; its domain state is an empty registry.
	return current === undefined ? expected.nodes.length === 0 :
		serializeProjectRegistry(current) === serializeProjectRegistry(expected);
}

export async function readProjectRegistries(
	workspaceIds: readonly string[]
): Promise<ProjectRegistriesStorageResult> {
	const ids = [...workspaceIds];
	try {
		return await readProjectRegistriesNow(ids);
	} catch {
		return { ok: false, registries: Object.fromEntries(ids.map((id) => [id, createEmptyProjectRegistry(id)])), error: 'project-registry-read-failed' };
	}
}

async function readProjectRegistriesNow(workspaceIds: readonly string[], promotionQueued = false): Promise<ProjectRegistriesStorageResult> {
	const sqliteResult = typeof window === 'undefined' || getTauriInvoke() === undefined
		? undefined : await readProjectRegistriesFromSqlite(workspaceIds);
	const needsLegacy = sqliteResult === undefined || !sqliteResult.ok ||
		workspaceIds.some((id) => sqliteResult.registries[id] === undefined);
	const legacyStorage = needsLegacy ? readLegacyStorageRecord() : createEmptyLegacyStorageRecord();
	const fallbackRegistries: Record<string, ProjectRegistry> = Object.fromEntries(
		workspaceIds.map((workspaceId) => [workspaceId, readLegacyProjectRegistry(workspaceId, legacyStorage)])
	);

	if (sqliteResult === undefined) {
		return { ok: true, registries: fallbackRegistries };
	}

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

		if (sqliteRegistryJson === undefined && shouldPromoteLegacyRegistry(workspaceId, fallbackRegistry)) {
			registriesToPromote[workspaceId] = fallbackRegistry;
		}
	}

	if (Object.keys(registriesToPromote).length > 0) {
		if (!promotionQueued) {
			return sequenceProjectRegistryOperation(workspaceIds, () => readProjectRegistriesNow(workspaceIds, true));
		}
		const writeResult = await writeProjectRegistriesToSqlite(registriesToPromote, { expectedRegistryJson: 'null' });

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

		markWorkspaceRegistriesMigrated(workspaceIds.filter((id) =>
			sqliteResult.registries[id] !== undefined || registriesToPromote[id] !== undefined
		));

		return {
			ok: true,
			registries: {
				...registries,
				...registriesToPromote
			}
		};
	}

	markWorkspaceRegistriesMigrated(workspaceIds.filter((id) => sqliteResult.registries[id] !== undefined));

	return { ok: true, registries };
}

export async function writeWorkspaceSyncRegistries(
	workspaceRegistry: WorkspaceRegistry,
	registries: Record<string, ProjectRegistry>
): Promise<ProjectRegistriesStorageResult> {
	const normalizedWorkspaceRegistry = normalizeWorkspaceRegistry(workspaceRegistry);
	const normalizedRegistries = Object.fromEntries(
		Object.entries(registries).map(([id, registry]) => [id, normalizeProjectRegistry(registry, id)])
	);
	return sequenceProjectRegistryOperation(Object.keys(normalizedRegistries), async () => {
		let error: ProjectRegistryStorageError = 'project-registry-write-failed';
		const valueJson = serializeWorkspaceRegistry(normalizedWorkspaceRegistry);
		const result = await commitWorkduckAppStateValueWithNativeTransaction(
			WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
			WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
			valueJson,
			async (expectedValueJson) => {
				const write = await writeProjectRegistriesToSqlite(normalizedRegistries, {
					workspaceRegistry: {
						valueJson, expectedValueJson: expectedValueJson ?? 'null',
						updatedAt: new Date().toISOString()
					}
				});
				if (!write.ok) error = write.error;
				return write.ok;
			}
		);
		if (!result.ok) return { ok: false, registries: normalizedRegistries, error };

		// SQLite and the workspace cache are committed before either notification.
		markWorkspaceRegistriesMigrated(Object.keys(normalizedRegistries));
		notifyWorkspaceRegistryChanged(normalizedWorkspaceRegistry);
		for (const registry of Object.values(normalizedRegistries)) {
			dispatchProjectRegistryChanged(registry.workspaceId, registry);
		}
		return { ok: true, registries: normalizedRegistries };
	});
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
	return sequenceProjectRegistryOperation(Object.keys(normalizedRegistries), () =>
		writeProjectRegistriesNow(normalizedRegistries)
	);
}

async function writeProjectRegistriesNow(normalizedRegistries: Record<string, ProjectRegistry>): Promise<ProjectRegistriesStorageResult> {

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

	markWorkspaceRegistriesMigrated(Object.keys(normalizedRegistries));
	for (const registry of Object.values(normalizedRegistries)) {
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
	let isActive = true;
	let readGeneration = 0;

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<ProjectRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		readGeneration += 1;
		callback(normalizeProjectRegistry(detail.registry, workspaceId));
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== LEGACY_PROJECT_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		const generation = ++readGeneration;
		void readProjectRegistry(workspaceId).then((result) => {
			if (isActive && generation === readGeneration && result.ok) callback(result.registry);
		});
	}

	window.addEventListener(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		isActive = false;
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

async function writeProjectRegistryToSqlite(registry: ProjectRegistry, expectedRegistryJson?: string) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		if (expectedRegistryJson !== undefined) return { ok: false, error: 'project-registry-write-failed' } as const;
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
			updatedAt: registry.updatedAt,
			...(expectedRegistryJson === undefined ? {} : { expectedRegistryJson })
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

async function writeProjectRegistriesToSqlite(
	registries: Record<string, ProjectRegistry>,
	{ workspaceRegistry, expectedRegistryJson }: {
		readonly workspaceRegistry?: WorkspaceRegistryWriteInput;
		readonly expectedRegistryJson?: string;
	} = {}
) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		if (workspaceRegistry !== undefined || expectedRegistryJson !== undefined) {
			return { ok: false, error: 'project-registry-write-failed' } as const;
		}
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
			...(workspaceRegistry === undefined ? {} : { workspaceRegistry }),
			registries: Object.fromEntries(
				Object.entries(registries).map(([workspaceId, registry]) => [
					workspaceId,
					{
						registryJson: serializeProjectRegistry(registry),
						updatedAt: registry.updatedAt,
						...(expectedRegistryJson === undefined ? {} : { expectedRegistryJson })
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
	legacyRegistry: ProjectRegistry
) {
	return (
		!workspaceRegistryWasMigrated(workspaceId) &&
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

function readLegacyProjectRegistry(workspaceId: string, storage = readLegacyStorageRecord()) {
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
	try {
		if (typeof window !== 'undefined' && migratedWorkspaceIdsByStorage.get(window.localStorage)?.has(workspaceId)) return true;
	} catch { /* Persisted migration state remains available when possible. */ }
	return readMigratedWorkspaceIds().has(workspaceId);
}

function markWorkspaceRegistryMigrated(workspaceId: string) {
	markWorkspaceRegistriesMigrated([workspaceId]);
}

function markWorkspaceRegistriesMigrated(workspaceIds: readonly string[]) {
	if (typeof window === 'undefined' || workspaceIds.length === 0) {
		return;
	}

	try {
		const storage = window.localStorage;
		const stored = storage.getItem(PROJECT_REGISTRY_SQLITE_MIGRATION_STORAGE_KEY);
		const migratedIds = new Set([
			...readMigratedWorkspaceIds(stored),
			...(migratedWorkspaceIdsByStorage.get(storage) ?? []),
			...workspaceIds
		]);
		migratedWorkspaceIdsByStorage.set(storage, migratedIds);
		const serialized = JSON.stringify([...migratedIds]);
		if (stored !== serialized) storage.setItem(PROJECT_REGISTRY_SQLITE_MIGRATION_STORAGE_KEY, serialized);
	} catch { /* Marker failure cannot undo a successful native commit. */ }
}

function readMigratedWorkspaceIds(serialized?: string | null) {
	if (typeof window === 'undefined') {
		return new Set<string>();
	}

	try {
		const value: unknown = JSON.parse(
			(serialized === undefined ? window.localStorage.getItem(PROJECT_REGISTRY_SQLITE_MIGRATION_STORAGE_KEY) : serialized) ?? '[]'
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
		value === 'project-registry-revision-conflict' ||
		value === 'project-registry-write-failed'
	);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		isObjectRecord(value) &&
		Object.values(value).every((item): item is string => typeof item === 'string')
	);
}
