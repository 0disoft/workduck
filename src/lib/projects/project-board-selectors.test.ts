import { describe, expect, test } from 'bun:test';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';
import {
	createProjectBoardSelectionIndex, type ProjectRepositoryGitStatus,
	type ProjectRepositorySyncFilter
} from './project-board-selectors';
import { createProjectBoardSurfaceSelection } from './project-board-surface-selection';

const timestamp = '2026-10-10T00:00:00.000Z';
function repository(id: string, name: string): ProjectRepositoryLinkRecord {
	return { id, name, path: `C:/workspace/${id}`, remoteUrl: null, upstreamRemoteUrl: null,
		githubCredentialSecretId: null, tags: [], favorite: id === 'matching-status', createdAt: timestamp, updatedAt: timestamp };
}
function node(id: string, parentId: string | null, repositories: readonly ProjectRepositoryLinkRecord[] = []): ProjectNodeRecord {
	return { id, kind: parentId === null ? 'project' : 'group', parentId, name: id,
		path: `projects/${id}`, description: '', tags: [], githubCredentialSecretId: null,
		repositories, createdAt: timestamp, updatedAt: timestamp };
}
function status(): ProjectRepositoryGitStatus {
	return { isGitRepository: true, hasRemote: true, originUrl: null, upstreamRemoteUrl: null,
		aheadCount: 1, behindCount: 1, hasUncommittedChanges: true, branch: 'main', error: null };
}
function select(nodes: readonly ProjectNodeRecord[], filter: ProjectRepositorySyncFilter, query = 'needle') {
	return createProjectBoardSurfaceSelection({ selectionIndex: createProjectBoardSelectionIndex(nodes),
		repositoryGitStatusById: { 'matching-status': status() }, tagFilter: query,
		repositorySyncFilter: filter, selectedProjectId: null, selectedGroupId: null });
}

describe('combined project search and repository status filters', () => {
	for (const filter of ['favorite', 'pull', 'push', 'commit'] as const) {
		test(`hides projects when search and ${filter} match different groups`, () => {
			const nodes = [node('project', null),
				node('search-group', 'project', [repository('matching-search', 'needle')]),
				node('status-group', 'project', [repository('matching-status', 'other')])];
			expect(select(nodes, filter).projectNodes).toEqual([]);
		});
		test(`hides projects when search and ${filter} match different repositories in one group`, () => {
			const nodes = [node('project', null), node('group', 'project', [
				repository('matching-search', 'needle'), repository('matching-status', 'other')])];
			expect(select(nodes, filter).projectNodes).toEqual([]);
		});
	}

	test('keeps the ancestor chain of a nested repository satisfying both filters', () => {
		const nodes = [node('project', null), node('parent', 'project'),
			node('nested', 'parent', [repository('matching-status', 'needle')]),
			node('irrelevant', 'project', [repository('other', 'needle')])];
		const result = select(nodes, 'push');
		expect(result.projectNodes.map((entry) => entry.id)).toEqual(['project']);
		expect(result.selectedProjectGroups.map((entry) => entry.id)).toEqual(['parent']);
	});

	test('keeps project and group name matches when they contain a status match', () => {
		const nodes = [node('needle-project', null), node('needle-group', 'needle-project', [repository('matching-status', 'other')])];
		const result = select(nodes, 'push');
		expect(result.projectNodes.map((entry) => entry.id)).toEqual(['needle-project']);
		expect(result.selectedProjectGroups.map((entry) => entry.id)).toEqual(['needle-group']);
	});

	test('preserves searches and status filters used individually', () => {
		const nodes = [node('project', null),
			node('search-group', 'project', [repository('matching-search', 'needle')]),
			node('status-group', 'project', [repository('matching-status', 'other')])];
		expect(select(nodes, 'all').selectedProjectGroups.map((entry) => entry.id)).toEqual(['search-group']);
		expect(select(nodes, 'push', '').selectedProjectGroups.map((entry) => entry.id)).toEqual(['status-group']);
		expect(select(nodes, 'all', '').selectedProjectGroups.map((entry) => entry.id)).toEqual(['search-group', 'status-group']);
	});
});
