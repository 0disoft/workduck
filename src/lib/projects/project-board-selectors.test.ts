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

describe('project hierarchy indexing', () => {
	test('indexes deep hierarchies without overflowing and keeps descendant counts', () => {
		const nodes = [node('project', null)];
		for (let index = 0; index < 12000; index += 1) {
			nodes.push(node(`group-${index}`, index === 0 ? 'project' : `group-${index - 1}`,
				index === 11999 ? [repository('deep-repository', 'needle')] : []));
		}
		const index = createProjectBoardSelectionIndex(nodes);
		expect(index.projectRows.length).toBe(nodes.length);
		expect(index.projectRows.at(-1)?.depth).toBe(12000);
		expect(index.groupCountByNodeId.get('project')).toBe(12000);
		expect(index.groupCountByNodeId.get('group-0')).toBe(11999);
		expect(index.groupCountByNodeId.get('group-11999')).toBe(0);
		expect(index.repositoryCountByNodeId.get('project')).toBe(1);
		expect(index.repositoryCountByNodeId.get('group-11999')).toBe(0);
	});

	test('keeps branching counts and preorder when children precede their parents', () => {
		const nodes = [node('leaf', 'first', [repository('leaf-repo', 'leaf')]),
			node('second', 'project', [repository('second-repo', 'second')]),
			node('first', 'project', [repository('first-repo', 'first')]), node('project', null)];
		const index = createProjectBoardSelectionIndex(nodes);
		expect(index.projectRows.map(row => [row.node.id, row.depth])).toEqual([
			['project', 0], ['second', 1], ['first', 1], ['leaf', 2]
		]);
		expect(index.groupCountByNodeId.get('project')).toBe(3);
		expect(index.repositoryCountByNodeId.get('project')).toBe(3);
		expect(index.groupCountByNodeId.get('first')).toBe(1);
		expect(index.repositoryCountByNodeId.get('first')).toBe(1);
	});
});

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
