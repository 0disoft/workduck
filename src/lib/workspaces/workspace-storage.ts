/* llmnav/1 module
id=workduck.workspace.storage
role=Read, conditionally save, and publish valid workspace registries.
owns=registry read/write admission|change subscriptions|notification validation
excludes=domain mutations|native SQLite|browser journals
search=workspace registry persistence|workspace read failure block saves|invalid workspace change notification
invariant=Cancellation stops before dispatch; commits compare original snapshots; reads and events reject damaged data; only confirmed saves publish.
stability=architecture
*/
import {
	createEmptyWorkspaceRegistry,
	normalizeStoredWorkspaceRegistry,
	parseStoredWorkspaceRegistry,
	serializeWorkspaceRegistry,
	WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
	type WorkspaceRegistry
} from './workspace-registry';
import {
	commitWorkduckAppStateValueWithNativeTransaction,
	isWorkduckAppStateBrowserStorageActive,
	readWorkduckAppStateValue,
	refreshWorkduckAppStateValues,
	subscribeWorkduckAppStateValue,
	WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
	writeWorkduckAppStateValue
} from '#lib/app-state/app-state-storage.ts';
import { getTauriInvoke } from '#lib/tauri/tauri-invoke.ts';

export const WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT = 'workduck:workspace-registry-changed';

export type WorkspaceRegistryStorageError =
	| 'workspace-registry-read-failed'
	| 'workspace-registry-conflict'
	| 'workspace-registry-write-failed';

export type WorkspaceRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: WorkspaceRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: WorkspaceRegistry;
			readonly error: WorkspaceRegistryStorageError;
	  };

interface WorkspaceRegistryChangedDetail {
	readonly registry: WorkspaceRegistry;
}

export function readWorkspaceRegistryFromBrowser(): WorkspaceRegistryStorageResult {
	const result = readWorkduckAppStateValue(
		WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY
	);
	const parsed = parseStoredWorkspaceRegistry(result.valueJson);
	const registry = parsed.ok ? parsed.registry : createEmptyWorkspaceRegistry();

	return result.ok && parsed.ok
		? { ok: true, registry }
		: {
				ok: false,
				registry,
				error: 'workspace-registry-read-failed'
			};
}

export async function writeWorkspaceRegistryToBrowser(
	registry: WorkspaceRegistry,
	expectedRegistry: WorkspaceRegistry,
	signal?: AbortSignal
): Promise<WorkspaceRegistryStorageResult> {
	const failed = (error: WorkspaceRegistryStorageError = 'workspace-registry-write-failed'): WorkspaceRegistryStorageResult =>
		({ ok: false, registry: readWorkspaceRegistryFromBrowser().registry, error });
	if (signal?.aborted) return failed();
	const parsed = normalizeStoredWorkspaceRegistry(registry);
	const expected = normalizeStoredWorkspaceRegistry(expectedRegistry);
	if (!parsed.ok || !expected.ok) return failed();
	const normalizedRegistry = parsed.registry;
	const expectedJson = serializeWorkspaceRegistry(expected.registry);
	const valueJson = serializeWorkspaceRegistry(normalizedRegistry);
	if (isWorkduckAppStateBrowserStorageActive()) {
		// localStorage read + write is not atomic across browser tabs.
		try {
			const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
			if (locks === undefined) return failed();
			return await locks.request('workduck:workspace-registry-write', () => {
				if (signal?.aborted) return failed();
				const current = readWorkspaceRegistryFromBrowser();
				if (!current.ok) return failed();
				if (serializeWorkspaceRegistry(current.registry) !== expectedJson) return failed('workspace-registry-conflict');
				const result = writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
					WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson);
				if (!result.ok) return failed();
				notifyWorkspaceRegistryChanged(normalizedRegistry);
				return { ok: true, registry: normalizedRegistry } as const;
			});
		} catch { return failed(); }
	}
	let conflict = false;
	const result = await commitWorkduckAppStateValueWithNativeTransaction(
		WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY, WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
		valueJson, async (expectedValueJson) => {
			if (signal?.aborted) return false;
			const current = parseStoredWorkspaceRegistry(expectedValueJson);
			if (!current.ok) return false;
			if (serializeWorkspaceRegistry(current.registry) !== expectedJson) { conflict = true; return false; }
			const invoke = getTauriInvoke();
			if (invoke === undefined) return false;
			const response = await invoke<{ ok: boolean; error?: string }>('compare_and_write_app_state_record', {
				key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY, expectedValueJson,
				record: { valueJson, updatedAt: new Date().toISOString() }
			});
			conflict = response?.error === 'app-state-conflict';
			return response?.ok === true;
		}
	);
	if (!result.ok) {
		if (conflict) await refreshWorkduckAppStateValues([WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]);
		return failed(conflict ? 'workspace-registry-conflict' : undefined);
	}
	notifyWorkspaceRegistryChanged(normalizedRegistry);
	return { ok: true, registry: normalizedRegistry };
}

export function notifyWorkspaceRegistryChanged(registry: WorkspaceRegistry) {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<WorkspaceRegistryChangedDetail>(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, {
				detail: {
					registry
				}
			})
		);
	}
}

export function subscribeWorkspaceRegistry(
	callback: (registry: WorkspaceRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}
	let isActive = true;

	function handleRegistryChanged(event: Event) {
		if (!isActive) return;
		const detail = (event as CustomEvent<WorkspaceRegistryChangedDetail>).detail;
		const result = detail?.registry === undefined
			? readWorkspaceRegistryFromBrowser() : normalizeStoredWorkspaceRegistry(detail.registry);
		if (result.ok) callback(result.registry);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			!isActive || !isWorkduckAppStateBrowserStorageActive() ||
			event.storageArea !== window.localStorage ||
			(event.key !== null && event.key !== WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)
		) {
			return;
		}

		const result = readWorkspaceRegistryFromBrowser();
		if (result.ok) callback(result.registry);
	}

	const unsubscribeAppState = subscribeWorkduckAppStateValue(
		WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		(valueJson) => {
			const parsed = parseStoredWorkspaceRegistry(valueJson);
			if (isActive && parsed.ok) callback(parsed.registry);
		}
	);

	window.addEventListener(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		if (!isActive) return;
		isActive = false;
		unsubscribeAppState();
		window.removeEventListener(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}
