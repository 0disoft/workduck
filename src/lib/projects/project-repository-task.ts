import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export type ProjectRepositoryTask =
	| 'open-terminal'
	| 'install-dependencies'
	| 'update-dependencies'
	| 'start-dev-server'
	| 'preview'
	| 'build';

export type ProjectRepositoryTaskRunState = 'running' | 'succeeded' | 'failed' | 'stopped';

export interface ProjectRepositoryTaskRunRecord {
	readonly id: string;
	readonly task: ProjectRepositoryTask;
	readonly repositoryPath: string;
	readonly command: string;
	readonly state: ProjectRepositoryTaskRunState;
	readonly exitCode: number | null;
	readonly startedAt: string;
	readonly finishedAt: string | null;
	readonly outputTail: string | null;
	readonly recordPath: string;
}

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
	| 'project-repository-task-terminal-unsupported-platform'
	| 'project-repository-task-launch-failed'
	| 'project-repository-task-record-write-failed'
	| 'project-repository-task-record-read-failed';

export type ProjectRepositoryTaskResult =
	| {
			readonly ok: true;
			readonly command: string | null;
			readonly runRecord: ProjectRepositoryTaskRunRecord | null;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryTaskError;
	  };

export type ProjectRepositoryTaskRunRecordsResult =
	| {
			readonly ok: true;
			readonly records: readonly ProjectRepositoryTaskRunRecord[];
	  }
	| {
			readonly ok: false;
			readonly records: readonly ProjectRepositoryTaskRunRecord[];
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
	readonly runRecord?: ProjectRepositoryTaskRunRecordResponse | null;
}

interface ProjectRepositoryTaskRunRecordResponse {
	readonly id?: string | null;
	readonly task?: string | null;
	readonly repositoryPath?: string | null;
	readonly command?: string | null;
	readonly state?: string | null;
	readonly exitCode?: number | null;
	readonly startedAt?: string | null;
	readonly finishedAt?: string | null;
	readonly outputTail?: string | null;
	readonly recordPath?: string | null;
}

interface ProjectRepositoryTaskRunRecordsResponse {
	readonly ok: boolean;
	readonly records?: readonly ProjectRepositoryTaskRunRecordResponse[] | null;
	readonly error?: ProjectRepositoryTaskError | null;
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
			? {
					ok: true,
					command: normalizeTaskCommand(response.command),
					runRecord: normalizeTaskRunRecord(response.runRecord)
				}
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

export async function readProjectRepositoryTaskRunRecords(
	workspacePath: string
): Promise<ProjectRepositoryTaskRunRecordsResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true, records: [] };
	}

	try {
		const response = await invoke<ProjectRepositoryTaskRunRecordsResponse>(
			'read_project_repository_task_run_records',
			{ workspacePath: normalizeWorkspacePathForStorage(workspacePath) }
		);
		const records = Array.isArray(response.records)
			? response.records
					.map(normalizeTaskRunRecord)
					.filter((record): record is ProjectRepositoryTaskRunRecord => record !== null)
			: [];

		return response.ok
			? { ok: true, records }
			: {
					ok: false,
					records,
					error: isProjectRepositoryTaskError(response.error)
						? response.error
						: 'project-repository-task-record-read-failed'
				};
	} catch {
		return { ok: false, records: [], error: 'project-repository-task-record-read-failed' };
	}
}

function normalizeTaskCommand(value: unknown) {
	if (typeof value !== 'string') {
		return null;
	}

	const command = value.trim();

	return command.length > 0 ? command : null;
}

function normalizeTaskRunRecord(
	value: ProjectRepositoryTaskRunRecordResponse | null | undefined
): ProjectRepositoryTaskRunRecord | null {
	if (
		value === null ||
		value === undefined ||
		typeof value.id !== 'string' ||
		!isProjectRepositoryTask(value.task) ||
		typeof value.repositoryPath !== 'string' ||
		typeof value.command !== 'string' ||
		!isProjectRepositoryTaskRunState(value.state) ||
		typeof value.startedAt !== 'string' ||
		typeof value.recordPath !== 'string'
	) {
		return null;
	}

	return {
		id: value.id,
		task: value.task,
		repositoryPath: normalizeWorkspacePathForStorage(value.repositoryPath),
		command: value.command,
		state: value.state,
		exitCode: typeof value.exitCode === 'number' ? value.exitCode : null,
		startedAt: value.startedAt,
		finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
		outputTail: typeof value.outputTail === 'string' && value.outputTail.trim().length > 0
			? value.outputTail
			: null,
		recordPath: normalizeWorkspacePathForStorage(value.recordPath)
	};
}

function isProjectRepositoryTask(value: unknown): value is ProjectRepositoryTask {
	return (
		value === 'open-terminal' ||
		value === 'install-dependencies' ||
		value === 'update-dependencies' ||
		value === 'start-dev-server' ||
		value === 'preview' ||
		value === 'build'
	);
}

function isProjectRepositoryTaskRunState(
	value: unknown
): value is ProjectRepositoryTaskRunState {
	return value === 'running' || value === 'succeeded' || value === 'failed' || value === 'stopped';
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
		value === 'project-repository-task-terminal-unsupported-platform' ||
		value === 'project-repository-task-launch-failed' ||
		value === 'project-repository-task-record-write-failed' ||
		value === 'project-repository-task-record-read-failed'
	);
}
