import { isObjectRecord } from '$lib/shared/object-record';
import {
	createEmptyTerminalRegistry,
	parseTerminalRegistry,
	serializeTerminalRegistry,
	type TerminalRegistry
} from './terminal-registry';

export const WORKDUCK_TERMINAL_REGISTRIES_STORAGE_KEY = 'workduck.terminalRegistries.v1';
export const WORKDUCK_TERMINAL_REGISTRY_CHANGED_EVENT = 'workduck:terminal-registry-changed';

export type TerminalRegistryStorageError =
	| 'terminal-registry-storage-read-failed'
	| 'terminal-registry-storage-write-failed';

export type TerminalRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: TerminalRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: TerminalRegistry;
			readonly error: TerminalRegistryStorageError;
	  };

interface TerminalRegistryStorageRecord {
	readonly version: 1;
	readonly registries: Record<string, string>;
}

interface TerminalRegistryChangedDetail {
	readonly workspaceId: string;
	readonly registry: TerminalRegistry;
}

export function readTerminalRegistry(workspaceId: string): TerminalRegistryStorageResult {
	const emptyRegistry = createEmptyTerminalRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	try {
		const storage = readStorageRecord();
		const serializedRegistry = storage.registries[workspaceId];

		if (serializedRegistry === undefined) {
			return { ok: true, registry: emptyRegistry };
		}

		const registry = parseTerminalRegistry(serializedRegistry, workspaceId);

		if (registry === null) {
			return {
				ok: false,
				registry: emptyRegistry,
				error: 'terminal-registry-storage-read-failed'
			};
		}

		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry: emptyRegistry,
			error: 'terminal-registry-storage-read-failed'
		};
	}
}

export function writeTerminalRegistry(
	registry: TerminalRegistry
): TerminalRegistryStorageResult {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'terminal-registry-storage-write-failed'
		};
	}

	try {
		const storage = readStorageRecord();
		const nextStorage = {
			version: 1,
			registries: {
				...storage.registries,
				[registry.workspaceId]: serializeTerminalRegistry(registry)
			}
		} satisfies TerminalRegistryStorageRecord;

		writeStorageRecord(nextStorage);
		dispatchTerminalRegistryChanged(registry);
		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry,
			error: 'terminal-registry-storage-write-failed'
		};
	}
}

export function subscribeTerminalRegistry(
	workspaceId: string,
	callback: (registry: TerminalRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<TerminalRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(detail.registry);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_TERMINAL_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		callback(readTerminalRegistry(workspaceId).registry);
	}

	window.addEventListener(WORKDUCK_TERMINAL_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_TERMINAL_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): TerminalRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_TERMINAL_REGISTRIES_STORAGE_KEY);

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

function writeStorageRecord(record: TerminalRegistryStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(
		WORKDUCK_TERMINAL_REGISTRIES_STORAGE_KEY,
		JSON.stringify(record)
	);
}

function dispatchTerminalRegistryChanged(registry: TerminalRegistry) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<TerminalRegistryChangedDetail>(WORKDUCK_TERMINAL_REGISTRY_CHANGED_EVENT, {
			detail: { workspaceId: registry.workspaceId, registry }
		})
	);
}

function createEmptyStorageRecord(): TerminalRegistryStorageRecord {
	return {
		version: 1,
		registries: {}
	};
}
