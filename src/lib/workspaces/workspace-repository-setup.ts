import { normalizeWorkspacePathForStorage } from './workspace-path-format';

export type WorkspaceRepositorySetupError =
	| 'workspace-repository-workspace-required'
	| 'workspace-repository-workspace-not-absolute'
	| 'workspace-repository-workspace-not-found'
	| 'workspace-repository-workspace-not-directory'
	| 'workspace-repository-workspace-permission-denied'
	| 'workspace-repository-workspace-unreadable'
	| 'workspace-repository-layout-invalid'
	| 'workspace-repository-create-failed'
	| 'workspace-repository-git-unavailable'
	| 'workspace-repository-git-timed-out'
	| 'workspace-repository-git-init-failed'
	| 'workspace-repository-mustflow-unavailable'
	| 'workspace-repository-mustflow-timed-out'
	| 'workspace-repository-mustflow-failed'
	| 'workspace-repository-gitignore-failed'
	| 'workspace-repository-unavailable';

export interface WorkspaceRepositorySetupOptions {
	readonly initializeGit: boolean;
	readonly installMustflow: boolean;
	readonly installGitignore: boolean;
}

export type WorkspaceRepositorySetupResult =
	| {
			readonly ok: true;
			readonly initializedGit: boolean;
			readonly installedMustflow: boolean;
			readonly installedGitignore: boolean;
			readonly createdPaths: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceRepositorySetupError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface WorkspaceRepositorySetupResponse {
	readonly ok: boolean;
	readonly initializedGit?: boolean;
	readonly installedMustflow?: boolean;
	readonly installedGitignore?: boolean;
	readonly createdPaths?: readonly string[];
	readonly error?: WorkspaceRepositorySetupError | null;
}

export async function setupWorkspaceRepository(
	workspacePath: string,
	options: WorkspaceRepositorySetupOptions
): Promise<WorkspaceRepositorySetupResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-repository-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceRepositorySetupResponse>('setup_workspace_repository', {
			workspacePath: normalizeWorkspacePathForStorage(workspacePath),
			options
		});

		if (response.ok) {
			return {
				ok: true,
				initializedGit: response.initializedGit ?? false,
				installedMustflow: response.installedMustflow ?? false,
				installedGitignore: response.installedGitignore ?? false,
				createdPaths: response.createdPaths ?? []
			};
		}

		return {
			ok: false,
			error: isWorkspaceRepositorySetupError(response.error)
				? response.error
				: 'workspace-repository-create-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-repository-create-failed' };
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}

function isWorkspaceRepositorySetupError(
	value: WorkspaceRepositorySetupResponse['error']
): value is WorkspaceRepositorySetupError {
	return (
		value === 'workspace-repository-workspace-required' ||
		value === 'workspace-repository-workspace-not-absolute' ||
		value === 'workspace-repository-workspace-not-found' ||
		value === 'workspace-repository-workspace-not-directory' ||
		value === 'workspace-repository-workspace-permission-denied' ||
		value === 'workspace-repository-workspace-unreadable' ||
		value === 'workspace-repository-layout-invalid' ||
		value === 'workspace-repository-create-failed' ||
		value === 'workspace-repository-git-unavailable' ||
		value === 'workspace-repository-git-timed-out' ||
		value === 'workspace-repository-git-init-failed' ||
		value === 'workspace-repository-mustflow-unavailable' ||
		value === 'workspace-repository-mustflow-timed-out' ||
		value === 'workspace-repository-mustflow-failed' ||
		value === 'workspace-repository-gitignore-failed' ||
		value === 'workspace-repository-unavailable'
	);
}
