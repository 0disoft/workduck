import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from './workspace-path-format';

export const DEFAULT_WORKSPACE_SYNC_FILE_NAME = 'workduck-workspaces.sync.json';
export const WORKSPACE_SYNC_FILE_NAME_MAX_LENGTH = 120;

export type WorkspaceSyncFileError =
	| 'workspace-sync-folder-required'
	| 'workspace-sync-folder-not-absolute'
	| 'workspace-sync-folder-not-found'
	| 'workspace-sync-folder-not-directory'
	| 'workspace-sync-folder-permission-denied'
	| 'workspace-sync-file-name-required'
	| 'workspace-sync-file-name-invalid'
	| 'workspace-sync-content-required'
	| 'workspace-sync-file-not-found'
	| 'workspace-sync-file-too-large'
	| 'workspace-sync-file-target-invalid'
	| 'workspace-sync-file-read-failed'
	| 'workspace-sync-file-write-failed'
	| 'workspace-sync-file-unavailable';

export type WorkspaceSyncFileWriteResult =
	| {
			readonly ok: true;
			readonly path: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncFileError;
	  };

export type WorkspaceSyncFileReadResult =
	| {
			readonly ok: true;
			readonly path: string;
			readonly content: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncFileError;
	  };

interface WorkspaceSyncFileWriteResponse {
	readonly ok: boolean;
	readonly normalizedPath?: string | null;
	readonly error?: WorkspaceSyncFileError | null;
}

interface WorkspaceSyncFileReadResponse {
	readonly ok: boolean;
	readonly normalizedPath?: string | null;
	readonly content?: string | null;
	readonly error?: WorkspaceSyncFileError | null;
}

export async function writeWorkspaceSyncFile(
	folderPath: string,
	fileName: string,
	content: string
): Promise<WorkspaceSyncFileWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-file-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncFileWriteResponse>('write_workspace_sync_file', {
			folderPath: normalizeWorkspacePathForStorage(folderPath),
			fileName: normalizeWorkspaceSyncFileName(fileName),
			content
		});

		if (response.ok && typeof response.normalizedPath === 'string') {
			return {
				ok: true,
				path: normalizeWorkspacePathForStorage(response.normalizedPath)
			};
		}

		return {
			ok: false,
			error: isWorkspaceSyncFileError(response.error)
				? response.error
				: 'workspace-sync-file-write-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-file-write-failed' };
	}
}

export async function readWorkspaceSyncFile(
	folderPath: string,
	fileName: string
): Promise<WorkspaceSyncFileReadResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-file-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncFileReadResponse>('read_workspace_sync_file', {
			folderPath: normalizeWorkspacePathForStorage(folderPath),
			fileName: normalizeWorkspaceSyncFileName(fileName)
		});

		if (
			response.ok &&
			typeof response.normalizedPath === 'string' &&
			typeof response.content === 'string'
		) {
			return {
				ok: true,
				path: normalizeWorkspacePathForStorage(response.normalizedPath),
				content: response.content
			};
		}

		return {
			ok: false,
			error: isWorkspaceSyncFileError(response.error)
				? response.error
				: 'workspace-sync-file-read-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-file-read-failed' };
	}
}

export function normalizeWorkspaceSyncFileName(fileName: string) {
	return fileName.trim().slice(0, WORKSPACE_SYNC_FILE_NAME_MAX_LENGTH);
}

export function isWorkspaceSyncFileNameUsable(fileName: string) {
	const normalizedFileName = normalizeWorkspaceSyncFileName(fileName);

	return (
		normalizedFileName.length > 0 &&
		normalizedFileName !== '.' &&
		normalizedFileName !== '..' &&
		!/[/\\<>:"|?*\u0000-\u001F]/u.test(normalizedFileName)
	);
}

function isWorkspaceSyncFileError(value: unknown): value is WorkspaceSyncFileError {
	return (
		value === 'workspace-sync-folder-required' ||
		value === 'workspace-sync-folder-not-absolute' ||
		value === 'workspace-sync-folder-not-found' ||
		value === 'workspace-sync-folder-not-directory' ||
		value === 'workspace-sync-folder-permission-denied' ||
		value === 'workspace-sync-file-name-required' ||
		value === 'workspace-sync-file-name-invalid' ||
		value === 'workspace-sync-content-required' ||
		value === 'workspace-sync-file-not-found' ||
		value === 'workspace-sync-file-too-large' ||
		value === 'workspace-sync-file-target-invalid' ||
		value === 'workspace-sync-file-read-failed' ||
		value === 'workspace-sync-file-write-failed' ||
		value === 'workspace-sync-file-unavailable'
	);
}
