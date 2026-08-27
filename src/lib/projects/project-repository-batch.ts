
import {
	readProjectRepositoryTaskRunRecords,
	type ProjectRepositoryTaskError,
	type ProjectRepositoryTaskRunRecordsResult
} from './project-repository-task';

export const PROJECT_REPOSITORY_BATCH_DEFAULT_CONCURRENCY = 3;
export const PROJECT_REPOSITORY_BATCH_MAX_CONCURRENCY = 6;
export const PROJECT_REPOSITORY_BATCH_TASK_POLL_INTERVAL_MS = 1_500;
export const PROJECT_REPOSITORY_BATCH_TASK_MAX_ATTEMPTS = 4_800;

export const projectRepositoryBatchActions = [
	'fetch',
	'pull',
	'build',
	'update-dependencies'
] as const;

export type ProjectRepositoryBatchAction = (typeof projectRepositoryBatchActions)[number];

export type ProjectRepositoryBatchItemState =
	| 'queued'
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'skipped';

export type ProjectRepositoryBatchOutcomeState = Extract<
	ProjectRepositoryBatchItemState,
	'succeeded' | 'failed' | 'skipped'
>;

export type ProjectRepositoryBatchOwnError =
	| 'project-repository-batch-action-unavailable'
	| 'project-repository-batch-operation-failed'
	| 'project-repository-batch-operation-not-started'
	| 'project-repository-batch-repository-busy'
	| 'project-repository-batch-repository-path-missing'
	| 'project-repository-batch-task-failed'
	| 'project-repository-batch-task-stopped'
	| 'project-repository-batch-task-timeout'
	| 'project-repository-batch-unexpected-failure'
	| 'project-repository-batch-workspace-unavailable';

export type ProjectRepositoryBatchError = ProjectRepositoryTaskError | ProjectRepositoryBatchOwnError;

export interface ProjectRepositoryBatchOutcome {
	readonly state: ProjectRepositoryBatchOutcomeState;
	readonly error: string | null;
}

export interface ProjectRepositoryBatchProgress<T> {
	readonly item: T;
	readonly index: number;
	readonly state: ProjectRepositoryBatchItemState;
	readonly outcome: ProjectRepositoryBatchOutcome | null;
}

interface BoundedProjectRepositoryBatchOptions<T> {
	readonly concurrency: number;
	readonly execute: (item: T, index: number) => Promise<ProjectRepositoryBatchOutcome>;
	readonly onProgress?: (progress: ProjectRepositoryBatchProgress<T>) => void;
}

interface WaitForProjectRepositoryTaskRunOptions {
	readonly workspacePath: string;
	readonly runRecordId: string;
	readonly readRecords?: (
		workspacePath: string
	) => Promise<ProjectRepositoryTaskRunRecordsResult>;
	readonly sleep?: (delayMs: number) => Promise<void>;
	readonly pollIntervalMs?: number;
	readonly maxAttempts?: number;
}

export function normalizeProjectRepositoryBatchConcurrency(value: number) {
	if (!Number.isFinite(value)) {
		return PROJECT_REPOSITORY_BATCH_DEFAULT_CONCURRENCY;
	}

	return Math.min(
		PROJECT_REPOSITORY_BATCH_MAX_CONCURRENCY,
		Math.max(1, Math.trunc(value))
	);
}

export async function runBoundedProjectRepositoryBatch<T>(
	items: readonly T[],
	options: BoundedProjectRepositoryBatchOptions<T>
): Promise<readonly ProjectRepositoryBatchOutcome[]> {
	if (items.length === 0) {
		return [];
	}

	const concurrency = Math.min(
		normalizeProjectRepositoryBatchConcurrency(options.concurrency),
		items.length
	);
	const outcomes: Array<ProjectRepositoryBatchOutcome | undefined> = new Array(items.length);
	let nextIndex = 0;

	function takeNextIndex() {
		if (nextIndex >= items.length) {
			return null;
		}

		const index = nextIndex;
		nextIndex += 1;
		return index;
	}

	async function worker() {
		while (true) {
			const index = takeNextIndex();

			if (index === null) {
				return;
			}

			const item = items[index];

			if (item === undefined) {
				outcomes[index] = createProjectRepositoryBatchFailure(
					'project-repository-batch-unexpected-failure'
				);
				continue;
			}

			options.onProgress?.({
				item,
				index,
				state: 'running',
				outcome: null
			});

			let outcome: ProjectRepositoryBatchOutcome;

			try {
				outcome = normalizeProjectRepositoryBatchOutcome(
					await options.execute(item, index)
				);
			} catch {
				outcome = createProjectRepositoryBatchFailure(
					'project-repository-batch-unexpected-failure'
				);
			}

			outcomes[index] = outcome;
			options.onProgress?.({
				item,
				index,
				state: outcome.state,
				outcome
			});
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()));

	return outcomes.map(
		(outcome) =>
			outcome ??
			createProjectRepositoryBatchFailure('project-repository-batch-unexpected-failure')
	);
}

export async function waitForProjectRepositoryTaskRun(
	options: WaitForProjectRepositoryTaskRunOptions
): Promise<ProjectRepositoryBatchOutcome> {
	const readRecords = options.readRecords ?? readProjectRepositoryTaskRunRecords;
	const sleep = options.sleep ?? sleepForProjectRepositoryBatch;
	const pollIntervalMs = normalizeNonNegativeInteger(
		options.pollIntervalMs,
		PROJECT_REPOSITORY_BATCH_TASK_POLL_INTERVAL_MS
	);
	const maxAttempts = normalizePositiveInteger(
		options.maxAttempts,
		PROJECT_REPOSITORY_BATCH_TASK_MAX_ATTEMPTS
	);

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const result = await readRecords(options.workspacePath);

		if (!result.ok) {
			return createProjectRepositoryBatchFailure(result.error);
		}

		const runRecord = result.records.find((record) => record.id === options.runRecordId);

		if (runRecord?.state === 'succeeded') {
			return createProjectRepositoryBatchSuccess();
		}

		if (runRecord?.state === 'failed') {
			return createProjectRepositoryBatchFailure('project-repository-batch-task-failed');
		}

		if (runRecord?.state === 'stopped') {
			return createProjectRepositoryBatchFailure('project-repository-batch-task-stopped');
		}

		if (attempt + 1 < maxAttempts) {
			await sleep(pollIntervalMs);
		}
	}

	return createProjectRepositoryBatchFailure('project-repository-batch-task-timeout');
}

export function createProjectRepositoryBatchSuccess(): ProjectRepositoryBatchOutcome {
	return { state: 'succeeded', error: null };
}

export function createProjectRepositoryBatchFailure(error: string): ProjectRepositoryBatchOutcome {
	return { state: 'failed', error: error };
}

export function createProjectRepositoryBatchSkip(error: string): ProjectRepositoryBatchOutcome {
	return { state: 'skipped', error: error };
}

export function isProjectRepositoryBatchOwnError(
	value: string
): value is ProjectRepositoryBatchOwnError {
	return (
		value === 'project-repository-batch-action-unavailable' ||
		value === 'project-repository-batch-operation-failed' ||
		value === 'project-repository-batch-operation-not-started' ||
		value === 'project-repository-batch-repository-busy' ||
		value === 'project-repository-batch-repository-path-missing' ||
		value === 'project-repository-batch-task-failed' ||
		value === 'project-repository-batch-task-stopped' ||
		value === 'project-repository-batch-task-timeout' ||
		value === 'project-repository-batch-unexpected-failure' ||
		value === 'project-repository-batch-workspace-unavailable'
	);
}

function normalizeProjectRepositoryBatchOutcome(
	outcome: ProjectRepositoryBatchOutcome
): ProjectRepositoryBatchOutcome {
	if (
		outcome.state !== 'succeeded' &&
		outcome.state !== 'failed' &&
		outcome.state !== 'skipped'
	) {
		return createProjectRepositoryBatchFailure(
			'project-repository-batch-unexpected-failure'
		);
	}

	return {
		state: outcome.state,
		error: typeof outcome.error === 'string' && outcome.error.length > 0 ? outcome.error : null
	};
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number) {
	return value === undefined || !Number.isFinite(value)
		? fallback
		: Math.max(0, Math.trunc(value));
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
	return value === undefined || !Number.isFinite(value)
		? fallback
		: Math.max(1, Math.trunc(value));
}

function sleepForProjectRepositoryBatch(delayMs: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, delayMs);
	});
}
