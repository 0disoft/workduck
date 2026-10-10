/* llmnav/1 module
id=workduck.workspace.repository-setup-client
role=Send normalized workspace directory and repository preparation options to the native setup boundary and adapt its result.
owns=repository preparation command client|setup option transport|setup result normalization
excludes=native filesystem mutation|registration persistence|Git status inspection
search=workspace repository setup client|initialize workspace git|install workspace gitignore
invariant=Setup uses the provided directory and option pair; native failures return setup errors; successful results expose prepared paths and Git configuration outcomes.
stability=contract
*/
import { getTauriInvoke } from '#lib/tauri/tauri-invoke.ts';
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
	| 'workspace-repository-agent-instructions-failed'
	| 'workspace-repository-gitignore-failed'
	| 'workspace-repository-unavailable';

export interface WorkspaceRepositorySetupOptions {
	readonly initializeGit: boolean;
	readonly installGitignore: boolean;
}

export type WorkspaceRepositorySetupResult =
	| {
			readonly ok: true;
			readonly initializedGit: boolean;
			readonly installedGitignore: boolean;
			readonly createdPaths: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceRepositorySetupError;
	  };

interface WorkspaceRepositorySetupResponse {
	readonly ok: boolean;
	readonly initializedGit?: boolean;
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
		value === 'workspace-repository-agent-instructions-failed' ||
		value === 'workspace-repository-gitignore-failed' ||
		value === 'workspace-repository-unavailable'
	);
}
