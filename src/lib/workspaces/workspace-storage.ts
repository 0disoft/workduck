import {
	createEmptyWorkspaceRegistry,
	parseWorkspaceRegistry,
	serializeWorkspaceRegistry,
	WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
	type WorkspaceRegistry
} from './workspace-registry';

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
	if (typeof window === 'undefined') {
		return { ok: true, registry: createEmptyWorkspaceRegistry() };
	}

	try {
		return {
			ok: true,
			registry: parseWorkspaceRegistry(
				window.localStorage.getItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)
			)
		};
	} catch {
		return {
			ok: false,
			registry: createEmptyWorkspaceRegistry(),
			error: 'workspace-registry-read-failed'
		};
	}
}

export function writeWorkspaceRegistryToBrowser(
	registry: WorkspaceRegistry
): WorkspaceRegistryStorageResult {
	if (typeof window === 'undefined') {
		return { ok: false, registry, error: 'workspace-registry-write-failed' };
	}

	const normalizedRegistry = parseWorkspaceRegistry(serializeWorkspaceRegistry(registry));

	try {
		window.localStorage.setItem(
			WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
			serializeWorkspaceRegistry(normalizedRegistry)
		);
		window.dispatchEvent(
			new CustomEvent<WorkspaceRegistryChangedDetail>(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, {
				detail: {
					registry: normalizedRegistry
				}
			})
		);
		return { ok: true, registry: normalizedRegistry };
	} catch {
		return {
			ok: false,
			registry: normalizedRegistry,
			error: 'workspace-registry-write-failed'
		};
	}
}

export function subscribeWorkspaceRegistry(
	callback: (registry: WorkspaceRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<WorkspaceRegistryChangedDetail>).detail;

		if (detail?.registry === undefined) {
			callback(readWorkspaceRegistryFromBrowser().registry);
			return;
		}

		callback(parseWorkspaceRegistry(serializeWorkspaceRegistry(detail.registry)));
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY
		) {
			return;
		}

		callback(parseWorkspaceRegistry(event.newValue));
	}

	window.addEventListener(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}
