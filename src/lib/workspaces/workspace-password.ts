export const WORKSPACE_PASSWORD_MIN_LENGTH = 8;

export type WorkspacePasswordError =
	| 'workspace-password-required'
	| 'workspace-password-too-short'
	| 'workspace-password-hash-failed'
	| 'workspace-password-invalid-hash'
	| 'workspace-password-unavailable';

export type WorkspacePasswordHashResult =
	| {
			readonly ok: true;
			readonly passwordHash: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspacePasswordError;
	  };

export type WorkspacePasswordVerificationResult =
	| {
			readonly ok: true;
			readonly matched: boolean;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspacePasswordError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface WorkspacePasswordHashResponse {
	readonly ok: boolean;
	readonly passwordHash?: string | null;
	readonly error?: WorkspacePasswordError | null;
}

interface WorkspacePasswordVerificationResponse {
	readonly ok: boolean;
	readonly matched?: boolean | null;
	readonly error?: WorkspacePasswordError | null;
}

export async function createWorkspacePasswordHash(
	password: string
): Promise<WorkspacePasswordHashResult> {
	if (password.length === 0) {
		return { ok: false, error: 'workspace-password-required' };
	}

	if (password.length < WORKSPACE_PASSWORD_MIN_LENGTH) {
		return { ok: false, error: 'workspace-password-too-short' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-password-unavailable' };
	}

	try {
		const response = await invoke<WorkspacePasswordHashResponse>('create_workspace_password_hash', {
			password
		});

		if (response.ok && typeof response.passwordHash === 'string') {
			return { ok: true, passwordHash: response.passwordHash };
		}

		return {
			ok: false,
			error: isWorkspacePasswordError(response.error)
				? response.error
				: 'workspace-password-hash-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-password-hash-failed' };
	}
}

export async function verifyWorkspacePassword(
	password: string,
	passwordHash: string
): Promise<WorkspacePasswordVerificationResult> {
	if (password.length === 0) {
		return { ok: false, error: 'workspace-password-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-password-unavailable' };
	}

	try {
		const response = await invoke<WorkspacePasswordVerificationResponse>(
			'verify_workspace_password',
			{
				password,
				passwordHash
			}
		);

		if (response.ok && typeof response.matched === 'boolean') {
			return { ok: true, matched: response.matched };
		}

		return {
			ok: false,
			error: isWorkspacePasswordError(response.error)
				? response.error
				: 'workspace-password-invalid-hash'
		};
	} catch {
		return { ok: false, error: 'workspace-password-invalid-hash' };
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}

function isWorkspacePasswordError(value: unknown): value is WorkspacePasswordError {
	return (
		value === 'workspace-password-required' ||
		value === 'workspace-password-too-short' ||
		value === 'workspace-password-hash-failed' ||
		value === 'workspace-password-invalid-hash' ||
		value === 'workspace-password-unavailable'
	);
}
