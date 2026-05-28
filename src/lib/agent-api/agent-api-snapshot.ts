import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export type AgentApiSnapshotError =
	| 'agent-api-workspace-id-required'
	| 'agent-api-workspace-required'
	| 'agent-api-workspace-not-absolute'
	| 'agent-api-workspace-not-found'
	| 'agent-api-workspace-not-directory'
	| 'agent-api-workspace-unreadable'
	| 'agent-api-unavailable';

export interface AgentApiSnapshot {
	readonly version: number;
	readonly generatedAt: string;
	readonly capabilities: {
		readonly readOnly: true;
		readonly writeEndpoints: readonly string[];
		readonly secrets: 'metadata-only';
		readonly terminalInput: 'disabled';
	};
	readonly workspace: {
		readonly id: string;
		readonly path: string;
	};
	readonly queue: AgentApiQueueSnapshot;
	readonly projectRegistry: AgentApiProjectRegistrySnapshot;
	readonly repositoryTaskRuns: AgentApiRepositoryTaskRunsSnapshot;
	readonly workspaceMetadata: AgentApiWorkspaceMetadataSnapshot;
}

export interface AgentApiQueueSnapshot {
	readonly ok: boolean;
	readonly exists: boolean;
	readonly path: string;
	readonly counts: {
		readonly resultReports: number;
		readonly workOrders: number;
		readonly proposals: number;
		readonly unsupported: number;
	};
	readonly files: readonly {
		readonly relativePath: string;
		readonly fileName: string;
		readonly kind: 'result-report' | 'work-order' | 'proposal' | 'unsupported';
	}[];
	readonly error?: string | null;
}

export interface AgentApiProjectRegistrySnapshot {
	readonly ok: boolean;
	readonly exists: boolean;
	readonly counts: {
		readonly projects: number;
		readonly groups: number;
		readonly repositories: number;
		readonly credentialReferences: number;
	};
	readonly updatedAt?: string | null;
	readonly nodes: readonly {
		readonly id: string;
		readonly kind: 'project' | 'group';
		readonly parentId?: string | null;
		readonly name: string;
		readonly path: string;
		readonly tags: readonly string[];
		readonly hasGithubCredential: boolean;
		readonly repositories: readonly {
			readonly id: string;
			readonly name: string;
			readonly path?: string | null;
			readonly remoteUrl?: string | null;
			readonly tags: readonly string[];
			readonly hasGithubCredential: boolean;
		}[];
	}[];
	readonly error?: string | null;
}

export interface AgentApiRepositoryTaskRunsSnapshot {
	readonly ok: boolean;
	readonly records: readonly {
		readonly id: string;
		readonly task: string;
		readonly repositoryPath: string;
		readonly state: string;
		readonly hasCommand: boolean;
		readonly hasOutputTail: boolean;
		readonly startedAt: string;
		readonly finishedAt?: string | null;
		readonly exitCode?: number | null;
	}[];
	readonly error?: string | null;
}

export interface AgentApiWorkspaceMetadataSnapshot {
	readonly ok: boolean;
	readonly files: Readonly<Record<string, AgentApiMetadataFileSnapshot>>;
	readonly error?: string | null;
}

export interface AgentApiMetadataFileSnapshot {
	readonly exists: boolean;
	readonly count: number;
	readonly secretValuesExposed: false;
	readonly encrypted: boolean;
	readonly error?: string | null;
}

type AgentApiSnapshotResult =
	| {
			readonly ok: true;
			readonly snapshot: AgentApiSnapshot;
	  }
	| {
			readonly ok: false;
			readonly error: AgentApiSnapshotError;
	  };

interface AgentApiSnapshotResponse {
	readonly ok: boolean;
	readonly snapshot?: AgentApiSnapshot | null;
	readonly error?: AgentApiSnapshotError | null;
}

export async function readAgentApiSnapshot(
	workspaceId: string,
	workspacePath: string
): Promise<AgentApiSnapshotResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'agent-api-unavailable' };
	}

	try {
		const response = await invoke<AgentApiSnapshotResponse>('read_agent_api_snapshot', {
			request: {
				workspaceId,
				workspacePath: normalizeWorkspacePathForStorage(workspacePath)
			}
		});

		if (response.ok && response.snapshot !== undefined && response.snapshot !== null) {
			return { ok: true, snapshot: response.snapshot };
		}

		return {
			ok: false,
			error: isAgentApiSnapshotError(response.error)
				? response.error
				: 'agent-api-workspace-unreadable'
		};
	} catch {
		return { ok: false, error: 'agent-api-workspace-unreadable' };
	}
}

function isAgentApiSnapshotError(value: unknown): value is AgentApiSnapshotError {
	return (
		value === 'agent-api-workspace-id-required' ||
		value === 'agent-api-workspace-required' ||
		value === 'agent-api-workspace-not-absolute' ||
		value === 'agent-api-workspace-not-found' ||
		value === 'agent-api-workspace-not-directory' ||
		value === 'agent-api-workspace-unreadable' ||
		value === 'agent-api-unavailable'
	);
}
