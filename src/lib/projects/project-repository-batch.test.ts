import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ProjectRepositoryTaskRunRecord } from './project-repository-task';
import {
	createProjectRepositoryBatchFailure,
	createProjectRepositoryBatchSuccess,
	normalizeProjectRepositoryBatchConcurrency,
	runBoundedProjectRepositoryBatch,
	waitForProjectRepositoryTaskRun
} from './project-repository-batch';

function createTaskRunRecord(
	id: string,
	state: ProjectRepositoryTaskRunRecord['state']
): ProjectRepositoryTaskRunRecord {
	return {
		id,
		task: 'build',
		repositoryPath: 'C:\\workspace\\repository',
		command: 'bun run build',
		state,
		exitCode: state === 'succeeded' ? 0 : state === 'failed' ? 1 : null,
		startedAt: '2026-08-20T00:00:00.000Z',
		finishedAt:
			state === 'succeeded' || state === 'failed' || state === 'stopped'
				? '2026-08-20T00:01:00.000Z'
				: null,
		outputTail: null,
		recordPath: 'C:\\workspace\\.workduck\\runs\\run.json'
	};
}

describe('normalizeProjectRepositoryBatchConcurrency', () => {
	test('clamps invalid and excessive values to the supported range', () => {
		assert.equal(normalizeProjectRepositoryBatchConcurrency(Number.NaN), 3);
		assert.equal(normalizeProjectRepositoryBatchConcurrency(0), 1);
		assert.equal(normalizeProjectRepositoryBatchConcurrency(2.8), 2);
		assert.equal(normalizeProjectRepositoryBatchConcurrency(99), 6);
	});
});

describe('runBoundedProjectRepositoryBatch', () => {
	test('limits active work and preserves input result order', async () => {
		let activeCount = 0;
		let maximumActiveCount = 0;

		const outcomes = await runBoundedProjectRepositoryBatch([0, 1, 2, 3, 4], {
			concurrency: 2,
			execute: async (item) => {
				activeCount += 1;
				maximumActiveCount = Math.max(maximumActiveCount, activeCount);
				await new Promise<void>((resolve) => {
					setTimeout(resolve, item % 2 === 0 ? 8 : 2);
				});
				activeCount -= 1;

				return item === 3
					? createProjectRepositoryBatchFailure('expected-failure')
					: createProjectRepositoryBatchSuccess();
			}
		});

		assert.equal(maximumActiveCount, 2);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['succeeded', 'succeeded', 'succeeded', 'failed', 'succeeded']
		);
	});

	test('continues remaining work after an executor throws', async () => {
		const outcomes = await runBoundedProjectRepositoryBatch(['first', 'broken', 'last'], {
			concurrency: 1,
			execute: async (item) => {
				if (item === 'broken') {
					throw new Error('boom');
				}

				return createProjectRepositoryBatchSuccess();
			}
		});

		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['succeeded', 'failed', 'succeeded']
		);
		assert.equal(outcomes[1]?.error, 'project-repository-batch-unexpected-failure');
	});
});

describe('waitForProjectRepositoryTaskRun', () => {
	test('waits through a running record and returns success after completion', async () => {
		let readCount = 0;

		const outcome = await waitForProjectRepositoryTaskRun({
			workspacePath: 'C:\\workspace',
			runRecordId: 'run-1',
			maxAttempts: 3,
			pollIntervalMs: 0,
			sleep: async () => {},
			readRecords: async () => {
				readCount += 1;
				return {
					ok: true,
					records: [createTaskRunRecord('run-1', readCount === 1 ? 'running' : 'succeeded')]
				};
			}
		});

		assert.equal(readCount, 2);
		assert.deepEqual(outcome, createProjectRepositoryBatchSuccess());
	});

	test('returns the native read failure without exhausting the polling budget', async () => {
		const outcome = await waitForProjectRepositoryTaskRun({
			workspacePath: 'C:\\workspace',
			runRecordId: 'run-1',
			maxAttempts: 3,
			sleep: async () => {},
			readRecords: async () => ({
				ok: false,
				records: [],
				error: 'project-repository-task-record-read-failed'
			})
		});

		assert.deepEqual(
			outcome,
			createProjectRepositoryBatchFailure('project-repository-task-record-read-failed')
		);
	});

	test('times out when the task never reaches a terminal record state', async () => {
		const outcome = await waitForProjectRepositoryTaskRun({
			workspacePath: 'C:\\workspace',
			runRecordId: 'run-1',
			maxAttempts: 2,
			pollIntervalMs: 0,
			sleep: async () => {},
			readRecords: async () => ({
				ok: true,
				records: [createTaskRunRecord('run-1', 'running')]
			})
		});

		assert.deepEqual(
			outcome,
			createProjectRepositoryBatchFailure('project-repository-batch-task-timeout')
		);
	});
});
