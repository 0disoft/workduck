import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export type ProjectRepositoryTask =
	| 'open-terminal'
	| 'install-dependencies'
	| 'start-dev-server'
	| 'build';

export type ProjectRepositoryTaskError =
	| 'project-repository-task-unavailable'
	| 'project-repository-task-workspace-required'
	| 'project-repository-task-workspace-not-absolute'
	| 'project-repository-task-workspace-not-found'
	| 'project-repository-task-workspace-not-directory'
	| 'project-repository-task-workspace-unreadable'
	| 'project-repository-task-path-required'
	| 'project-repository-task-path-not-absolute'
	| 'project-repository-task-path-not-found'
	| 'project-repository-task-path-not-directory'
	| 'project-repository-task-path-outside-workspace'
	| 'project-repository-task-path-unreadable'
	| 'project-repository-task-invalid'
	| 'project-repository-task-command-unavailable'
	| 'project-repository-task-terminal-unavailable'
	| 'project-repository-task-launch-failed';

export type ProjectRepositoryTaskResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryTaskError;
	  };

interface ProjectRepositoryTaskInput {
	readonly workspacePath: string;
	readonly repositoryPath: string;
	readonly task: ProjectRepositoryTask;
}

interface ProjectRepositoryTaskResponse {
	readonly ok: boolean;
	readonly error?: ProjectRepositoryTaskError | null;
}

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

export async function runProjectRepositoryTask(
	input: ProjectRepositoryTaskInput
): Promise<ProjectRepositoryTaskResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-task-unavailable' };
	}

	try {
		const response = await invoke<ProjectRepositoryTaskResponse>('run_project_repository_task', {
			request: {
				workspacePath: normalizeWorkspacePathForStorage(input.workspacePath),
				repositoryPath: normalizeWorkspacePathForStorage(input.repositoryPath),
				task: input.task
			}
		});

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryTaskError(response.error)
						? response.error
						: 'project-repository-task-launch-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-task-launch-failed' };
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}

function isProjectRepositoryTaskError(value: unknown): value is ProjectRepositoryTaskError {
	return (
		value === 'project-repository-task-unavailable' ||
		value === 'project-repository-task-workspace-required' ||
		value === 'project-repository-task-workspace-not-absolute' ||
		value === 'project-repository-task-workspace-not-found' ||
		value === 'project-repository-task-workspace-not-directory' ||
		value === 'project-repository-task-workspace-unreadable' ||
		value === 'project-repository-task-path-required' ||
		value === 'project-repository-task-path-not-absolute' ||
		value === 'project-repository-task-path-not-found' ||
		value === 'project-repository-task-path-not-directory' ||
		value === 'project-repository-task-path-outside-workspace' ||
		value === 'project-repository-task-path-unreadable' ||
		value === 'project-repository-task-invalid' ||
		value === 'project-repository-task-command-unavailable' ||
		value === 'project-repository-task-terminal-unavailable' ||
		value === 'project-repository-task-launch-failed'
	);
}
