import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export type ProjectRepositoryTask =
	| 'open-terminal'
	| 'install-dependencies'
	| 'update-dependencies'
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
			readonly command: string | null;
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
	readonly command?: string | null;
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
			? { ok: true, command: normalizeTaskCommand(response.command) }
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

function normalizeTaskCommand(value: unknown) {
	if (typeof value !== 'string') {
		return null;
	}

	const command = value.trim();

	return command.length > 0 ? command : null;
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
