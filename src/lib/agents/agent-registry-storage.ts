import {
	createEmptyAgentRegistry,
	parseAgentRegistry,
	serializeAgentRegistry,
	type AgentRegistry
} from './agent-registry';
import {
	readWorkspaceDataFile,
	workspaceDataFilesAreAvailable,
	writeWorkspaceDataFile,
	type WorkspaceDataFileError
} from '$lib/workspaces/workspace-data-file';

export const WORKDUCK_AGENT_REGISTRIES_STORAGE_KEY = 'workduck.agentRegistries.v1';
export const WORKDUCK_AGENT_REGISTRY_CHANGED_EVENT = 'workduck:agent-registry-changed';
const AGENT_REGISTRY_FILE_NAME = 'agents.json';

export type AgentRegistryStorageError =
	| 'agent-registry-storage-read-failed'
	| 'agent-registry-storage-write-failed'
	| WorkspaceDataFileError;

export type AgentRegistryStorageResult =
	| {
			readonly ok: true;
			readonly registry: AgentRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: AgentRegistry;
			readonly error: AgentRegistryStorageError;
	  };

interface AgentRegistryStorageRecord {
	readonly version: 1;
	readonly registries: Record<string, string>;
}

interface AgentRegistryChangedDetail {
	readonly workspaceId: string;
	readonly registry: AgentRegistry;
}

export async function readAgentRegistry(
	workspaceId: string,
	workspacePath = ''
): Promise<AgentRegistryStorageResult> {
	const emptyRegistry = createEmptyAgentRegistry(workspaceId);
	const legacyRegistry = readLegacyAgentRegistry(workspaceId);

	if (typeof window === 'undefined') {
		return { ok: true, registry: emptyRegistry };
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const fileResult = await readWorkspaceDataFile(workspacePath, AGENT_REGISTRY_FILE_NAME);

		if (!fileResult.ok) {
			return {
				ok: false,
				registry: legacyRegistry,
				error: fileResult.error
			};
		}

		if (fileResult.content !== null) {
			const registry = parseAgentRegistry(fileResult.content, workspaceId);

			if (registry === null) {
				return {
					ok: false,
					registry: legacyRegistry,
					error: 'agent-registry-storage-read-failed'
				};
			}

			return { ok: true, registry };
		}

		if (legacyRegistry.agents.length > 0) {
			const writeResult = await writeAgentRegistry(legacyRegistry, workspacePath);

			return writeResult.ok ? { ok: true, registry: legacyRegistry } : writeResult;
		}

		return { ok: true, registry: emptyRegistry };
	}

	return { ok: true, registry: legacyRegistry };
}

export async function writeAgentRegistry(
	registry: AgentRegistry,
	workspacePath = ''
): Promise<AgentRegistryStorageResult> {
	if (typeof window === 'undefined') {
		return {
			ok: false,
			registry,
			error: 'agent-registry-storage-write-failed'
		};
	}

	if (workspacePath.length > 0 && workspaceDataFilesAreAvailable()) {
		const writeResult = await writeWorkspaceDataFile(
			workspacePath,
			AGENT_REGISTRY_FILE_NAME,
			serializeAgentRegistry(registry)
		);

		if (!writeResult.ok) {
			return {
				ok: false,
				registry,
				error: writeResult.error
			};
		}

		dispatchAgentRegistryChanged(registry);
		return { ok: true, registry };
	}

	try {
		writeLegacyAgentRegistry(registry);
		dispatchAgentRegistryChanged(registry);
		return { ok: true, registry };
	} catch {
		return {
			ok: false,
			registry,
			error: 'agent-registry-storage-write-failed'
		};
	}
}

export function subscribeAgentRegistry(
	workspaceId: string,
	callback: (registry: AgentRegistry) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	function handleRegistryChanged(event: Event) {
		const detail = (event as CustomEvent<AgentRegistryChangedDetail>).detail;

		if (detail?.workspaceId !== workspaceId) {
			return;
		}

		callback(detail.registry);
	}

	function handleStorageChanged(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_AGENT_REGISTRIES_STORAGE_KEY
		) {
			return;
		}

		void readAgentRegistry(workspaceId).then((result) => {
			callback(result.registry);
		});
	}

	window.addEventListener(WORKDUCK_AGENT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
	window.addEventListener('storage', handleStorageChanged);

	return () => {
		window.removeEventListener(WORKDUCK_AGENT_REGISTRY_CHANGED_EVENT, handleRegistryChanged);
		window.removeEventListener('storage', handleStorageChanged);
	};
}

function readStorageRecord(): AgentRegistryStorageRecord {
	if (typeof window === 'undefined') {
		return createEmptyStorageRecord();
	}

	const serializedStorage = window.localStorage.getItem(WORKDUCK_AGENT_REGISTRIES_STORAGE_KEY);

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

function writeStorageRecord(record: AgentRegistryStorageRecord) {
	if (typeof window === 'undefined') {
		return;
	}

	window.localStorage.setItem(WORKDUCK_AGENT_REGISTRIES_STORAGE_KEY, JSON.stringify(record));
}

function readLegacyAgentRegistry(workspaceId: string) {
	const storage = readStorageRecord();
	const serializedRegistry = storage.registries[workspaceId];

	if (serializedRegistry === undefined) {
		return createEmptyAgentRegistry(workspaceId);
	}

	return parseAgentRegistry(serializedRegistry, workspaceId) ?? createEmptyAgentRegistry(workspaceId);
}

function writeLegacyAgentRegistry(registry: AgentRegistry) {
	const storage = readStorageRecord();
	const nextStorage = {
		version: 1,
		registries: {
			...storage.registries,
			[registry.workspaceId]: serializeAgentRegistry(registry)
		}
	} satisfies AgentRegistryStorageRecord;

	writeStorageRecord(nextStorage);
}

function dispatchAgentRegistryChanged(registry: AgentRegistry) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<AgentRegistryChangedDetail>(WORKDUCK_AGENT_REGISTRY_CHANGED_EVENT, {
			detail: { workspaceId: registry.workspaceId, registry }
		})
	);
}

function createEmptyStorageRecord(): AgentRegistryStorageRecord {
	return {
		version: 1,
		registries: {}
	};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
