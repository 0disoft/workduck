/* llmnav/1 module
id=workduck.projects.repository-task
role=Invoke bounded repository tasks through Tauri and normalize their commands, run records, states, and failures for the UI.
owns=repository task invocation|run record normalization|task error mapping
excludes=native process execution|terminal rendering
search=repository task run|dependency install task|project build command
invariant=Malformed native responses never become successful typed task results.
stability=contract
*/

import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export const WORKDUCK_PROJECT_REPOSITORY_TASK_RUN_CHANGED_EVENT =
	'workduck:project-repository-task-run-changed';

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


const projectRepositoryTaskRunRecordsReadByWorkspace = new Map<
	string,
	Promise<ProjectRepositoryTaskRunRecordsResult>
>();

interface ProjectRepositoryTaskRunChangedDetail {
	readonly workspacePath: string;
	readonly runRecord: ProjectRepositoryTaskRunRecord;
}

export async function runProjectRepositoryTask(
	input: ProjectRepositoryTaskInput
): Promise<ProjectRepositoryTaskResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-task-unavailable' };
	}

	const workspacePath = normalizeWorkspacePathForStorage(input.workspacePath);

	try {
		const response = await invoke<ProjectRepositoryTaskResponse>('run_project_repository_task', {
			request: {
				workspacePath,
				repositoryPath: normalizeWorkspacePathForStorage(input.repositoryPath),
				task: input.task
			}
		});

		if (!response.ok) {
			return {
				ok: false,
				error: isProjectRepositoryTaskError(response.error)
					? response.error
					: 'project-repository-task-launch-failed'
			};
		}

		const runRecord = normalizeTaskRunRecord(response.runRecord);

		if (runRecord !== null) {
			dispatchProjectRepositoryTaskRunChanged(workspacePath, runRecord);
		}

		return {
			ok: true,
			command: normalizeTaskCommand(response.command),
			runRecord
		};
	} catch {
		return { ok: false, error: 'project-repository-task-launch-failed' };
	}
}

export function readProjectRepositoryTaskRunRecords(
	workspacePath: string
): Promise<ProjectRepositoryTaskRunRecordsResult> {
	const normalizedWorkspacePath = normalizeWorkspacePathForStorage(workspacePath);
	const activeRead = projectRepositoryTaskRunRecordsReadByWorkspace.get(
		normalizedWorkspacePath
	);

	if (activeRead !== undefined) {
		return activeRead;
	}

	const nextRead = readProjectRepositoryTaskRunRecordsFromNative(
		normalizedWorkspacePath
	).finally(() => {
		if (
			projectRepositoryTaskRunRecordsReadByWorkspace.get(normalizedWorkspacePath) ===
			nextRead
		) {
			projectRepositoryTaskRunRecordsReadByWorkspace.delete(normalizedWorkspacePath);
		}
	});

	projectRepositoryTaskRunRecordsReadByWorkspace.set(normalizedWorkspacePath, nextRead);
	return nextRead;
}

async function readProjectRepositoryTaskRunRecordsFromNative(
	workspacePath: string
): Promise<ProjectRepositoryTaskRunRecordsResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true, records: [] };
	}

	try {
		const response = await invoke<ProjectRepositoryTaskRunRecordsResponse>(
			'read_project_repository_task_run_records',
			{ workspacePath }
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

export function subscribeProjectRepositoryTaskRunChanges(
	workspacePath: string,
	callback: (runRecord: ProjectRepositoryTaskRunRecord) => void
) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const normalizedWorkspacePath = normalizeWorkspacePathForStorage(workspacePath);

	function handleTaskRunChanged(event: Event) {
		const detail = (event as CustomEvent<ProjectRepositoryTaskRunChangedDetail>).detail;

		if (detail?.workspacePath !== normalizedWorkspacePath) {
			return;
		}

		callback(detail.runRecord);
	}

	window.addEventListener(
		WORKDUCK_PROJECT_REPOSITORY_TASK_RUN_CHANGED_EVENT,
		handleTaskRunChanged
	);

	return () => {
		window.removeEventListener(
			WORKDUCK_PROJECT_REPOSITORY_TASK_RUN_CHANGED_EVENT,
			handleTaskRunChanged
		);
	};
}

function dispatchProjectRepositoryTaskRunChanged(
	workspacePath: string,
	runRecord: ProjectRepositoryTaskRunRecord
) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<ProjectRepositoryTaskRunChangedDetail>(
			WORKDUCK_PROJECT_REPOSITORY_TASK_RUN_CHANGED_EVENT,
			{
				detail: {
					workspacePath,
					runRecord
				}
			}
		)
	);
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
		outputTail:
			typeof value.outputTail === 'string' && value.outputTail.trim().length > 0
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
