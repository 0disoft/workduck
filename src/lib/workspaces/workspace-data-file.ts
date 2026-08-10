import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
export type WorkspaceDataFileName =
	| 'agents.json'
	| 'personas.json'
	| 'references.json'
	| 'secrets.sync.json'
	| 'skills.json'
	| 'workspace.json';

export type WorkspaceDataFileError =
	| 'workspace-data-workspace-required'
	| 'workspace-data-workspace-not-absolute'
	| 'workspace-data-workspace-not-found'
	| 'workspace-data-workspace-not-directory'
	| 'workspace-data-workspace-permission-denied'
	| 'workspace-data-workspace-unreadable'
	| 'workspace-data-root-invalid'
	| 'workspace-data-file-invalid'
	| 'workspace-data-file-too-large'
	| 'workspace-data-file-read-failed'
	| 'workspace-data-file-write-failed'
	| 'workspace-data-revision-conflict'
	| 'workspace-data-unavailable';

export type WorkspaceDataFileReadResult =
	| {
			readonly ok: true;
			readonly content: string | null;
	  }
	| {
			readonly ok: false;
			readonly content: null;
			readonly error: WorkspaceDataFileError;
	  };

export type WorkspaceDataFileWriteResult =
	| {
			readonly ok: true;
			readonly content?: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceDataFileError;
	  };

export type WorkspaceRegistryFileWriteResult =
	| {
			readonly ok: true;
			readonly content: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceDataFileError;
	  };

export type WorkspaceRegistryPairWriteResult =
	| {
			readonly ok: true;
			readonly agentsContent: string;
			readonly personasContent: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceDataFileError;
	  };

interface WorkspaceDataFileReadResponse {
	readonly ok: boolean;
	readonly content?: string | null;
	readonly error?: WorkspaceDataFileError | null;
}

interface WorkspaceDataFileWriteResponse {
	readonly ok: boolean;
	readonly content?: string | null;
	readonly error?: WorkspaceDataFileError | null;
}

interface WorkspaceRegistryPairWriteResponse {
	readonly ok: boolean;
	readonly agentsContent?: string | null;
	readonly personasContent?: string | null;
	readonly error?: WorkspaceDataFileError | null;
}

export async function writeWorkspaceRegistryFile(
	workspacePath: string,
	fileName: 'agents.json' | 'personas.json',
	expectedRevision: number,
	content: string
): Promise<WorkspaceRegistryFileWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-data-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceDataFileWriteResponse>('write_workspace_registry_file', {
			workspacePath,
			fileName,
			expectedRevision,
			content
		});

		if (response.ok && typeof response.content === 'string') {
			return { ok: true, content: response.content };
		}

		return {
			ok: false,
			error: isWorkspaceDataFileError(response.error)
				? response.error
				: 'workspace-data-file-write-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-data-file-write-failed' };
	}
}

export async function writeWorkspaceRegistryPair(
	workspacePath: string,
	agentsExpectedRevision: number,
	agentsContent: string,
	personasExpectedRevision: number,
	personasContent: string
): Promise<WorkspaceRegistryPairWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-data-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceRegistryPairWriteResponse>(
			'write_workspace_registry_pair',
			{
				workspacePath,
				agentsExpectedRevision,
				agentsContent,
				personasExpectedRevision,
				personasContent
			}
		);

		if (
			response.ok &&
			typeof response.agentsContent === 'string' &&
			typeof response.personasContent === 'string'
		) {
			return {
				ok: true,
				agentsContent: response.agentsContent,
				personasContent: response.personasContent
			};
		}

		return {
			ok: false,
			error: isWorkspaceDataFileError(response.error)
				? response.error
				: 'workspace-data-file-write-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-data-file-write-failed' };
	}
}

export function workspaceDataFilesAreAvailable() {
	return getTauriInvoke() !== undefined;
}

export async function readWorkspaceDataFile(
	workspacePath: string,
	fileName: WorkspaceDataFileName
): Promise<WorkspaceDataFileReadResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, content: null, error: 'workspace-data-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceDataFileReadResponse>('read_workspace_data_file', {
			workspacePath,
			fileName
		});

		if (response.ok) {
			return {
				ok: true,
				content: typeof response.content === 'string' ? response.content : null
			};
		}

		return {
			ok: false,
			content: null,
			error: isWorkspaceDataFileError(response.error)
				? response.error
				: 'workspace-data-file-read-failed'
		};
	} catch {
		return { ok: false, content: null, error: 'workspace-data-file-read-failed' };
	}
}

export async function writeWorkspaceDataFile(
	workspacePath: string,
	fileName: WorkspaceDataFileName,
	content: string
): Promise<WorkspaceDataFileWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-data-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceDataFileWriteResponse>('write_workspace_data_file', {
			workspacePath,
			fileName,
			content
		});

		if (response.ok) {
			return { ok: true };
		}

		return {
			ok: false,
			error: isWorkspaceDataFileError(response.error)
				? response.error
				: 'workspace-data-file-write-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-data-file-write-failed' };
	}
}

function isWorkspaceDataFileError(value: unknown): value is WorkspaceDataFileError {
	return (
		value === 'workspace-data-workspace-required' ||
		value === 'workspace-data-workspace-not-absolute' ||
		value === 'workspace-data-workspace-not-found' ||
		value === 'workspace-data-workspace-not-directory' ||
		value === 'workspace-data-workspace-permission-denied' ||
		value === 'workspace-data-workspace-unreadable' ||
		value === 'workspace-data-root-invalid' ||
		value === 'workspace-data-file-invalid' ||
		value === 'workspace-data-file-too-large' ||
		value === 'workspace-data-file-read-failed' ||
		value === 'workspace-data-file-write-failed' ||
		value === 'workspace-data-revision-conflict' ||
		value === 'workspace-data-unavailable'
	);
}
