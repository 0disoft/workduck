import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import type {
	InspectableProjectRepositoryLinkRecord,
	ProjectRepositoryGitStatus
} from './project-board-selectors';
import {
	clearProjectRepositoryGitStatusCache,
	PROJECT_REPOSITORY_GIT_STATUS_CACHE_TTL_MS,
	readProjectRepositoryGitStatusCache,
	selectProjectRepositoriesForGitInspection,
	writeProjectRepositoryGitStatusCache
} from './project-repository-status-cache';

const repository: InspectableProjectRepositoryLinkRecord = {
	id: 'repository-1',
	name: 'workduck',
	path: 'C:\\workspace\\projects\\workduck',
	remoteUrl: 'https://github.com/0disoft/workduck',
	upstreamRemoteUrl: null,
	tags: [],
	favorite: false,
	githubCredentialSecretId: null,
	createdAt: '2026-07-15T00:00:00.000Z',
	updatedAt: '2026-07-15T00:00:00.000Z'
};

const status: ProjectRepositoryGitStatus = {
	isGitRepository: true,
	hasRemote: true,
	originUrl: 'https://github.com/0disoft/workduck',
	upstreamRemoteUrl: null,
	aheadCount: 0,
	behindCount: 0,
	hasUncommittedChanges: false,
	branch: 'main',
	error: null
};

afterEach(() => {
	clearProjectRepositoryGitStatusCache();
});

describe('project repository Git status cache', () => {
	test('hydrates a fresh status and skips another inspection', () => {
		writeProjectRepositoryGitStatusCache('workspace-1', [repository], {
			[repository.id]: status
		}, 1_000);

		const snapshot = readProjectRepositoryGitStatusCache('workspace-1', [repository], 1_001);

		assert.deepEqual(snapshot.statuses, { [repository.id]: status });
		assert.deepEqual([...snapshot.freshRepositoryIds], [repository.id]);
		assert.deepEqual(
			selectProjectRepositoriesForGitInspection([repository], snapshot.freshRepositoryIds),
			[]
		);
	});

	test('hydrates stale data but requires background revalidation', () => {
		writeProjectRepositoryGitStatusCache('workspace-1', [repository], {
			[repository.id]: status
		}, 1_000);

		const snapshot = readProjectRepositoryGitStatusCache(
			'workspace-1',
			[repository],
			1_000 + PROJECT_REPOSITORY_GIT_STATUS_CACHE_TTL_MS
		);

		assert.deepEqual(snapshot.statuses, { [repository.id]: status });
		assert.deepEqual([...snapshot.freshRepositoryIds], []);
	});

	test('rejects a cached status when the repository path changed', () => {
		writeProjectRepositoryGitStatusCache('workspace-1', [repository], {
			[repository.id]: status
		}, 1_000);

		const snapshot = readProjectRepositoryGitStatusCache(
			'workspace-1',
			[{ ...repository, path: 'C:\\workspace\\projects\\renamed' }],
			1_001
		);

		assert.deepEqual(snapshot.statuses, {});
		assert.deepEqual([...snapshot.freshRepositoryIds], []);
	});

	test('rejects an older inspection result that finishes after a newer refresh', () => {
		writeProjectRepositoryGitStatusCache('workspace-1', [repository], {
			[repository.id]: { ...status, branch: 'newer' }
		}, 2_000);

		const accepted = writeProjectRepositoryGitStatusCache('workspace-1', [repository], {
			[repository.id]: { ...status, branch: 'older' }
		}, 1_000);
		const snapshot = readProjectRepositoryGitStatusCache('workspace-1', [repository], 2_001);

		assert.deepEqual(accepted, {});
		assert.equal(snapshot.statuses[repository.id]?.branch, 'newer');
	});
});
