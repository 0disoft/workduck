/* llmnav/1 module
id=workduck.workspace.storage
role=Read, write, and publish workspace registry snapshots through application state without discarding damaged records.
owns=workspace storage admission|workspace change subscriptions|snapshot notification validation
excludes=workspace domain mutations|native SQLite transactions|browser journal implementation
search=workspace registry persistence|workspace read failure block saves|invalid workspace change notification
invariant=Reads preserve stored record and lock validity; saves validate the current and incoming snapshots; failed reads and malformed notifications never publish an empty replacement.
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
	isWorkduckAppStateBrowserStorageActive,
	readWorkduckAppStateValue,
	subscribeWorkduckAppStateValue,
	WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
	writeWorkduckAppStateValue
} from '#lib/app-state/app-state-storage.ts';

export const WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT = 'workduck:workspace-registry-changed';

export type WorkspaceRegistryStorageError =
	| 'workspace-registry-read-failed'
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

export function writeWorkspaceRegistryToBrowser(
	registry: WorkspaceRegistry
): WorkspaceRegistryStorageResult {
	const current = readWorkspaceRegistryFromBrowser();
	const parsed = normalizeStoredWorkspaceRegistry(registry);
	if (!current.ok || !parsed.ok) return { ok: false, registry: current.registry, error: 'workspace-registry-write-failed' };
	const normalizedRegistry = parsed.registry;
	const result = writeWorkduckAppStateValue(
		WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
		serializeWorkspaceRegistry(normalizedRegistry)
	);

	if (!result.ok) {
		return {
			ok: false,
			registry: normalizedRegistry,
			error: 'workspace-registry-write-failed'
		};
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
