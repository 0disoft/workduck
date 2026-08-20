import {
	normalizeWorkspaceRegistry,
	parseWorkspaceRegistry,
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
} from '$lib/app-state/app-state-storage';

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
	const registry = parseWorkspaceRegistry(result.valueJson);

	return result.ok
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
	const normalizedRegistry = normalizeWorkspaceRegistry(registry);
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

	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<WorkspaceRegistryChangedDetail>(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, {
				detail: {
					registry: normalizedRegistry
				}
			})
		);
	}

	return { ok: true, registry: normalizedRegistry };
}

export function subscribeWorkspaceRegistry(
	callback: (registry: WorkspaceRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<WorkspaceRegistryChangedDetail>).detail;

		callback(
			detail?.registry === undefined
				? readWorkspaceRegistryFromBrowser().registry
				: normalizeWorkspaceRegistry(detail.registry)
		);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			!isWorkduckAppStateBrowserStorageActive() ||
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY
		) {
			return;
		}

		callback(parseWorkspaceRegistry(event.newValue));
	}

	const unsubscribeAppState = subscribeWorkduckAppStateValue(
		WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		(valueJson) => {
			callback(parseWorkspaceRegistry(valueJson));
		}
	);

	window.addEventListener(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		unsubscribeAppState();
		window.removeEventListener(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}
