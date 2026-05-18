import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export type QueueFolderError =
	| 'queue-folder-workspace-required'
	| 'queue-folder-workspace-not-absolute'
	| 'queue-folder-workspace-not-found'
	| 'queue-folder-workspace-not-directory'
	| 'queue-folder-workspace-permission-denied'
	| 'queue-folder-workspace-unreadable'
	| 'queue-folder-root-invalid'
	| 'queue-folder-create-failed'
	| 'queue-folder-open-failed'
	| 'queue-folder-list-failed'
	| 'queue-folder-file-invalid'
	| 'queue-folder-file-not-found'
	| 'queue-folder-file-read-failed'
	| 'queue-folder-file-write-failed'
	| 'queue-folder-file-already-exists'
	| 'queue-folder-unavailable';

export type QueueFileKind = 'result-report' | 'work-order' | 'proposal' | 'unsupported';

export type QueueFolderResult =
	| {
			readonly ok: true;
			readonly path: string;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface QueueFolderResponse {
	readonly ok: boolean;
	readonly path?: string | null;
	readonly relativePath?: string | null;
	readonly error?: QueueFolderError | null;
}

export interface QueueFileEntry {
	readonly relativePath: string;
	readonly fileName: string;
	readonly kind: QueueFileKind;
}

type QueueFileListResult =
	| {
			readonly ok: true;
			readonly path: string;
			readonly files: readonly QueueFileEntry[];
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

type QueueFileReadResult =
	| {
			readonly ok: true;
			readonly relativePath: string;
			readonly content: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

interface QueueFileListResponse {
	readonly ok: boolean;
	readonly path?: string | null;
	readonly files?: readonly QueueFileEntry[] | null;
	readonly error?: QueueFolderError | null;
}

interface QueueFileReadResponse {
	readonly ok: boolean;
	readonly relativePath?: string | null;
	readonly content?: string | null;
	readonly error?: QueueFolderError | null;
}

export async function ensureQueueFolder(workspacePath: string): Promise<QueueFolderResult> {
	return runQueueFolderCommand('ensure_queue_folder', workspacePath);
}

export async function openQueueFolder(workspacePath: string): Promise<QueueFolderResult> {
	return runQueueFolderCommand('open_queue_folder', workspacePath);
}

export async function listQueueFiles(workspacePath: string): Promise<QueueFileListResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'queue-folder-unavailable' };
	}

	try {
		const response = await invoke<QueueFileListResponse>('list_queue_files', {
			workspacePath: normalizeWorkspacePathForStorage(workspacePath)
		});

		if (response.ok && typeof response.path === 'string' && Array.isArray(response.files)) {
			return {
				ok: true,
				path: normalizeWorkspacePathForStorage(response.path),
				files: response.files
			};
		}

		return {
			ok: false,
			error: isQueueFolderError(response.error) ? response.error : 'queue-folder-list-failed'
		};
	} catch {
		return { ok: false, error: 'queue-folder-list-failed' };
	}
}

export async function readQueueFile(
	workspacePath: string,
	relativePath: string
): Promise<QueueFileReadResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'queue-folder-unavailable' };
	}

	try {
		const response = await invoke<QueueFileReadResponse>('read_queue_file', {
			workspacePath: normalizeWorkspacePathForStorage(workspacePath),
			relativePath
		});

		if (
			response.ok &&
			typeof response.relativePath === 'string' &&
			typeof response.content === 'string'
		) {
			return {
				ok: true,
				relativePath: response.relativePath,
				content: response.content
			};
		}

		return {
			ok: false,
			error: isQueueFolderError(response.error) ? response.error : 'queue-folder-file-read-failed'
		};
	} catch {
		return { ok: false, error: 'queue-folder-file-read-failed' };
	}
}

export async function writeQueueWorkOrderFile(
	workspacePath: string,
	fileName: string,
	content: string
): Promise<QueueFileReadResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'queue-folder-unavailable' };
	}

	try {
		const response = await invoke<QueueFileReadResponse>('write_queue_work_order_file', {
			workspacePath: normalizeWorkspacePathForStorage(workspacePath),
			fileName,
			content
		});

		if (
			response.ok &&
			typeof response.relativePath === 'string' &&
			typeof response.content === 'string'
		) {
			return {
				ok: true,
				relativePath: response.relativePath,
				content: response.content
			};
		}

		return {
			ok: false,
			error: isQueueFolderError(response.error) ? response.error : 'queue-folder-file-write-failed'
		};
	} catch {
		return { ok: false, error: 'queue-folder-file-write-failed' };
	}
}

export async function updateQueueWorkOrderFile(
	workspacePath: string,
	relativePath: string,
	content: string
): Promise<QueueFileReadResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'queue-folder-unavailable' };
	}

	try {
		const response = await invoke<QueueFileReadResponse>('update_queue_work_order_file', {
			workspacePath: normalizeWorkspacePathForStorage(workspacePath),
			relativePath,
			content
		});

		if (
			response.ok &&
			typeof response.relativePath === 'string' &&
			typeof response.content === 'string'
		) {
			return {
				ok: true,
				relativePath: response.relativePath,
				content: response.content
			};
		}

		return {
			ok: false,
			error: isQueueFolderError(response.error) ? response.error : 'queue-folder-file-write-failed'
		};
	} catch {
		return { ok: false, error: 'queue-folder-file-write-failed' };
	}
}

export function getQueueFolderErrorMessage(error: QueueFolderError) {
	switch (error) {
		case 'queue-folder-workspace-required':
			return 'Workspace path is required.';
		case 'queue-folder-workspace-not-absolute':
			return 'Workspace path must be absolute.';
		case 'queue-folder-workspace-not-found':
			return 'Workspace path was not found.';
		case 'queue-folder-workspace-not-directory':
			return 'Workspace path must be a folder.';
		case 'queue-folder-workspace-permission-denied':
			return 'Workspace path is not writable.';
		case 'queue-folder-workspace-unreadable':
			return 'Workspace path could not be checked.';
		case 'queue-folder-root-invalid':
			return 'Queue folder is not usable.';
		case 'queue-folder-create-failed':
			return 'Queue folder could not be created.';
		case 'queue-folder-open-failed':
			return 'Queue folder could not be opened.';
		case 'queue-folder-list-failed':
			return 'Queue files could not be listed.';
		case 'queue-folder-file-invalid':
			return 'Queue file path is not allowed.';
		case 'queue-folder-file-not-found':
			return 'Queue file was not found.';
		case 'queue-folder-file-read-failed':
			return 'Queue file could not be read.';
		case 'queue-folder-file-write-failed':
			return 'Queue file could not be written.';
		case 'queue-folder-file-already-exists':
			return 'Queue file already exists.';
		case 'queue-folder-unavailable':
			return 'Queue folders are available in the desktop app.';
	}
}

async function runQueueFolderCommand(
	command: 'ensure_queue_folder' | 'open_queue_folder',
	workspacePath: string
): Promise<QueueFolderResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'queue-folder-unavailable' };
	}

	try {
		const response = await invoke<QueueFolderResponse>(command, {
			workspacePath: normalizeWorkspacePathForStorage(workspacePath)
		});

		if (
			response.ok &&
			typeof response.path === 'string' &&
			typeof response.relativePath === 'string'
		) {
			return {
				ok: true,
				path: normalizeWorkspacePathForStorage(response.path),
				relativePath: response.relativePath
			};
		}

		return {
			ok: false,
			error: isQueueFolderError(response.error)
				? response.error
				: 'queue-folder-create-failed'
		};
	} catch {
		return { ok: false, error: command === 'open_queue_folder' ? 'queue-folder-open-failed' : 'queue-folder-create-failed' };
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}

function isQueueFolderError(value: unknown): value is QueueFolderError {
	return (
		value === 'queue-folder-workspace-required' ||
		value === 'queue-folder-workspace-not-absolute' ||
		value === 'queue-folder-workspace-not-found' ||
		value === 'queue-folder-workspace-not-directory' ||
		value === 'queue-folder-workspace-permission-denied' ||
		value === 'queue-folder-workspace-unreadable' ||
		value === 'queue-folder-root-invalid' ||
		value === 'queue-folder-create-failed' ||
		value === 'queue-folder-open-failed' ||
		value === 'queue-folder-list-failed' ||
		value === 'queue-folder-file-invalid' ||
		value === 'queue-folder-file-not-found' ||
		value === 'queue-folder-file-read-failed' ||
		value === 'queue-folder-file-write-failed' ||
		value === 'queue-folder-file-already-exists' ||
		value === 'queue-folder-unavailable'
	);
}
