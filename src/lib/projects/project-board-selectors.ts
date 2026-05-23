import type { ProjectRepositoryGitError } from './project-repository';
import {
	PROJECT_TAG_MAX_LENGTH,
	PROJECT_TAGS_MAX_COUNT,
	type ProjectNodeKind,
	type ProjectNodeRecord,
	type ProjectRepositoryLinkRecord
} from './project-registry';

export type ProjectRepositorySyncFilter = 'all' | 'pull' | 'push' | 'commit';

export interface ProjectRepositoryGitStatus {
	readonly isGitRepository: boolean;
	readonly hasRemote: boolean;
	readonly aheadCount: number;
	readonly behindCount: number;
	readonly hasUncommittedChanges: boolean;
	readonly branch: string | null;
	readonly error: ProjectRepositoryGitError | null;
}

export interface ProjectRepositoryFilterStats {
	readonly pullNeeded: number;
	readonly pushNeeded: number;
	readonly commitNeeded: number;
}

export type ProjectRepositoryGitStatusById = Readonly<Record<string, ProjectRepositoryGitStatus>>;

export function getNodeKindLabel(kind: ProjectNodeKind) {
	return kind === 'project' ? 'Project' : 'Group';
}

export function getProjectGroupCount(nodes: readonly ProjectNodeRecord[], projectId: string) {
	return listDescendantGroups(nodes, projectId).length;
}

export function getProjectRepositoryCount(nodes: readonly ProjectNodeRecord[], projectId: string) {
	return listDescendantGroups(nodes, projectId).reduce(
		(total, node) => total + node.repositories.length,
		0
	);
}

export function formatCountLabel(count: number, singularLabel: string, pluralLabel: string) {
	return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

export function selectProjectNodes(
	nodes: readonly ProjectNodeRecord[],
	gitStatusById: ProjectRepositoryGitStatusById,
	tagQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	const projects = nodes.filter((node) => node.kind === 'project' && node.parentId === null);

	if (tagQuery.length === 0 && syncFilter === 'all') {
		return projects;
	}

	return projects.filter(
		(node) =>
			projectMatchesTagFilter(nodes, node, tagQuery) &&
			projectMatchesRepositorySyncFilter(nodes, gitStatusById, node, syncFilter)
	);
}

export function selectProjectGroups(
	nodes: readonly ProjectNodeRecord[],
	gitStatusById: ProjectRepositoryGitStatusById,
	projectId: string,
	tagQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	const groups = nodes.filter((node) => node.kind === 'group' && node.parentId === projectId);

	if (tagQuery.length === 0 && syncFilter === 'all') {
		return groups;
	}

	return groups.filter(
		(node) =>
			groupMatchesTagFilter(nodes, node, tagQuery) &&
			groupMatchesRepositorySyncFilter(nodes, gitStatusById, node, syncFilter)
	);
}

export function selectGroupRepositories(
	group: ProjectNodeRecord,
	gitStatusById: ProjectRepositoryGitStatusById,
	tagQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	if (tagQuery.length === 0 && syncFilter === 'all') {
		return group.repositories;
	}

	return group.repositories.filter(
		(repository) =>
			repositoryMatchesTagFilter(repository, tagQuery) &&
			repositoryMatchesSyncFilter(gitStatusById, repository, syncFilter)
	);
}

export function resolveSelectedProject(
	projectNodes: readonly ProjectNodeRecord[],
	selectedProjectId: string | null
) {
	return projectNodes.find((node) => node.id === selectedProjectId) ?? projectNodes[0] ?? null;
}

export function resolveSelectedGroup(
	projectGroups: readonly ProjectNodeRecord[],
	selectedGroupId: string | null
) {
	return selectedGroupId === null
		? null
		: projectGroups.find((node) => node.id === selectedGroupId) ?? null;
}

export function getRepositoryFilterStats(
	nodes: readonly ProjectNodeRecord[],
	gitStatusById: ProjectRepositoryGitStatusById
): ProjectRepositoryFilterStats {
	return listRegisteredRepositories(nodes).reduce(
		(stats, repository) => ({
			pullNeeded:
				stats.pullNeeded +
				(repositoryMatchesSyncFilter(gitStatusById, repository, 'pull') ? 1 : 0),
			pushNeeded:
				stats.pushNeeded +
				(repositoryMatchesSyncFilter(gitStatusById, repository, 'push') ? 1 : 0),
			commitNeeded:
				stats.commitNeeded +
				(repositoryMatchesSyncFilter(gitStatusById, repository, 'commit') ? 1 : 0)
		}),
		{ pullNeeded: 0, pushNeeded: 0, commitNeeded: 0 }
	);
}

export function listRegisteredRepositories(nodes: readonly ProjectNodeRecord[]) {
	return nodes.flatMap((node) => node.repositories);
}

export function normalizeTagFilter(value: string) {
	return value.trim().replace(/^#+/u, '').toLocaleLowerCase('en-US');
}

export function parseTagsInput(value: string) {
	return value
		.split(',')
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0)
		.slice(0, PROJECT_TAGS_MAX_COUNT);
}

export function formatTagsInput(tags: readonly string[]) {
	return tags.join(', ');
}

export function getTagsInputMaxLength() {
	return PROJECT_TAGS_MAX_COUNT * (PROJECT_TAG_MAX_LENGTH + 2);
}

function projectMatchesTagFilter(
	nodes: readonly ProjectNodeRecord[],
	node: ProjectNodeRecord,
	tagQuery: string
) {
	if (tagQuery.length === 0) {
		return true;
	}

	return (
		matchesTagFilter(node.tags, tagQuery) ||
		listDescendantGroups(nodes, node.id).some((candidateNode) =>
			groupNodeMatchesTagFilter(candidateNode, tagQuery)
		)
	);
}

function groupMatchesTagFilter(
	nodes: readonly ProjectNodeRecord[],
	node: ProjectNodeRecord,
	tagQuery: string
) {
	return (
		tagQuery.length === 0 ||
		groupNodeMatchesTagFilter(node, tagQuery) ||
		listDescendantGroups(nodes, node.id).some((candidateNode) =>
			groupNodeMatchesTagFilter(candidateNode, tagQuery)
		)
	);
}

function groupNodeMatchesTagFilter(node: ProjectNodeRecord, tagQuery: string) {
	return (
		matchesTagFilter(node.tags, tagQuery) ||
		node.repositories.some((repository) => repositoryMatchesTagFilter(repository, tagQuery))
	);
}

function repositoryMatchesTagFilter(repository: ProjectRepositoryLinkRecord, tagQuery: string) {
	return tagQuery.length === 0 || matchesTagFilter(repository.tags, tagQuery);
}

function projectMatchesRepositorySyncFilter(
	nodes: readonly ProjectNodeRecord[],
	gitStatusById: ProjectRepositoryGitStatusById,
	node: ProjectNodeRecord,
	syncFilter: ProjectRepositorySyncFilter
) {
	return (
		syncFilter === 'all' ||
		listDescendantGroups(nodes, node.id).some((candidateNode) =>
			groupNodeMatchesRepositorySyncFilter(gitStatusById, candidateNode, syncFilter)
		)
	);
}

function groupMatchesRepositorySyncFilter(
	nodes: readonly ProjectNodeRecord[],
	gitStatusById: ProjectRepositoryGitStatusById,
	node: ProjectNodeRecord,
	syncFilter: ProjectRepositorySyncFilter
) {
	return (
		syncFilter === 'all' ||
		groupNodeMatchesRepositorySyncFilter(gitStatusById, node, syncFilter) ||
		listDescendantGroups(nodes, node.id).some((candidateNode) =>
			groupNodeMatchesRepositorySyncFilter(gitStatusById, candidateNode, syncFilter)
		)
	);
}

function groupNodeMatchesRepositorySyncFilter(
	gitStatusById: ProjectRepositoryGitStatusById,
	node: ProjectNodeRecord,
	syncFilter: ProjectRepositorySyncFilter
) {
	return node.repositories.some((repository) =>
		repositoryMatchesSyncFilter(gitStatusById, repository, syncFilter)
	);
}

function repositoryMatchesSyncFilter(
	gitStatusById: ProjectRepositoryGitStatusById,
	repository: ProjectRepositoryLinkRecord,
	syncFilter: ProjectRepositorySyncFilter
) {
	if (syncFilter === 'all') {
		return true;
	}

	const gitStatus = gitStatusById[repository.id];

	if (syncFilter === 'pull') {
		return gitStatus?.behindCount !== undefined && gitStatus.behindCount > 0;
	}

	return syncFilter === 'push'
		? gitStatus?.aheadCount !== undefined && gitStatus.aheadCount > 0
		: gitStatus?.hasUncommittedChanges === true;
}

function matchesTagFilter(tags: readonly string[], tagQuery: string) {
	return tags.some((tag) => tag.toLocaleLowerCase('en-US').includes(tagQuery));
}

function listDescendantGroups(nodes: readonly ProjectNodeRecord[], rootNodeId: string) {
	const childGroupsByParentId = new Map<string, ProjectNodeRecord[]>();

	for (const node of nodes) {
		if (node.kind !== 'group' || node.parentId === null) {
			continue;
		}

		const childGroups = childGroupsByParentId.get(node.parentId) ?? [];
		childGroups.push(node);
		childGroupsByParentId.set(node.parentId, childGroups);
	}

	const descendants: ProjectNodeRecord[] = [];
	const visitedNodeIds = new Set<string>();
	const pendingNodes = [...(childGroupsByParentId.get(rootNodeId) ?? [])];

	while (pendingNodes.length > 0) {
		const node = pendingNodes.shift();

		if (node === undefined || visitedNodeIds.has(node.id)) {
			continue;
		}

		visitedNodeIds.add(node.id);
		descendants.push(node);
		pendingNodes.push(...(childGroupsByParentId.get(node.id) ?? []));
	}

	return descendants;
}
