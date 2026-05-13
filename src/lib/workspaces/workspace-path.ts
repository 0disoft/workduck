export type WorkspacePathValidationError =
	| 'workspace-path-required'
	| 'workspace-path-not-absolute'
	| 'workspace-path-not-found'
	| 'workspace-path-not-directory'
	| 'workspace-path-permission-denied'
	| 'workspace-path-unreadable'
	| 'workspace-path-validation-unavailable';

export type WorkspacePathValidationResult =
	| {
			readonly ok: true;
			readonly path: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspacePathValidationError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface WorkspacePathValidationResponse {
	readonly ok: boolean;
	readonly normalizedPath?: string | null;
	readonly error?: WorkspacePathValidationError | null;
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
			const normalizedPath = response.normalizedPath?.trim() ?? '';

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

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
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
