/* llmnav/1 module
id=workduck.workspace.path-client
role=Select a workspace directory and normalize closed native validation responses for frontend callers.
owns=workspace directory picker|workspace validation client|path validation errors
excludes=native filesystem validation|workspace registry persistence
search=select workspace directory|validate workspace client|workspace picker
invariant=Validation succeeds only when the native boundary returns a non-empty normalized path; unavailable or malformed responses fail closed.
stability=contract
*/
import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { open } from '@tauri-apps/plugin-dialog';

import { normalizeWorkspacePathForStorage } from './workspace-path-format';

export type WorkspacePathValidationError =
	| 'workspace-path-required'
	| 'workspace-path-not-absolute'
	| 'workspace-path-not-found'
	| 'workspace-path-not-directory'
	| 'workspace-path-permission-denied'
	| 'workspace-path-unreadable'
	| 'workspace-path-validation-unavailable';

export type WorkspacePathSelectionError =
	| 'workspace-path-selection-unavailable'
	| 'workspace-path-selection-failed';

export type WorkspacePathError = WorkspacePathValidationError | WorkspacePathSelectionError;

export type WorkspacePathValidationResult =
	| {
			readonly ok: true;
			readonly path: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspacePathValidationError;
	  };

export type WorkspacePathSelectionResult =
	| {
			readonly ok: true;
			readonly path: string | null;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspacePathSelectionError;
	  };

interface WorkspacePathValidationResponse {
	readonly ok: boolean;
	readonly normalizedPath?: string | null;
	readonly error?: WorkspacePathValidationError | null;
}

export async function selectWorkspacePath(
	defaultPath: string
): Promise<WorkspacePathSelectionResult> {
	const trimmedDefaultPath = normalizeWorkspacePathForStorage(defaultPath);

	try {
		const selectedPath = await open({
			directory: true,
			multiple: false,
			...(trimmedDefaultPath.length > 0 ? { defaultPath: trimmedDefaultPath } : {})
		});

		if (Array.isArray(selectedPath)) {
			return { ok: false, error: 'workspace-path-selection-failed' };
		}

		return {
			ok: true,
			path: selectedPath === null ? null : normalizeWorkspacePathForStorage(selectedPath)
		};
	} catch {
		return { ok: false, error: 'workspace-path-selection-unavailable' };
	}
}

export async function validateWorkspacePath(
	path: string
): Promise<WorkspacePathValidationResult> {
	const trimmedPath = path.trim();

	if (trimmedPath.length === 0) {
		return { ok: false, error: 'workspace-path-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-path-validation-unavailable' };
	}

	try {
		const response = await invoke<WorkspacePathValidationResponse>('validate_workspace_path', {
			path: trimmedPath
		});

		if (response.ok) {
			const normalizedPath = normalizeWorkspacePathForStorage(response.normalizedPath ?? '');

			return normalizedPath.length > 0
				? { ok: true, path: normalizedPath }
				: { ok: false, error: 'workspace-path-unreadable' };
		}

		return {
			ok: false,
			error: isWorkspacePathValidationError(response.error)
				? response.error
				: 'workspace-path-unreadable'
		};
	} catch {
		return { ok: false, error: 'workspace-path-unreadable' };
	}
}

function isWorkspacePathValidationError(
	value: WorkspacePathValidationResponse['error']
): value is WorkspacePathValidationError {
	return (
		value === 'workspace-path-required' ||
		value === 'workspace-path-not-absolute' ||
		value === 'workspace-path-not-found' ||
		value === 'workspace-path-not-directory' ||
		value === 'workspace-path-permission-denied' ||
		value === 'workspace-path-unreadable' ||
		value === 'workspace-path-validation-unavailable'
	);
}
