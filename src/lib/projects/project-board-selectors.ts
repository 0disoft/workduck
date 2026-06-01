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
	searchQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	const projects = nodes.filter((node) => node.kind === 'project' && node.parentId === null);

	if (searchQuery.length === 0 && syncFilter === 'all') {
		return projects;
	}

	return projects.filter(
		(node) =>
			projectMatchesSearchFilter(nodes, node, searchQuery) &&
			projectMatchesRepositorySyncFilter(nodes, gitStatusById, node, syncFilter)
	);
}

export function selectProjectGroups(
	nodes: readonly ProjectNodeRecord[],
	gitStatusById: ProjectRepositoryGitStatusById,
	projectId: string,
	searchQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	const groups = nodes.filter((node) => node.kind === 'group' && node.parentId === projectId);

	if (searchQuery.length === 0 && syncFilter === 'all') {
		return groups;
	}

	return groups.filter(
		(node) =>
			groupMatchesSearchFilter(nodes, node, searchQuery) &&
			groupMatchesRepositorySyncFilter(nodes, gitStatusById, node, syncFilter)
	);
}

export function selectGroupRepositories(
	group: ProjectNodeRecord,
	gitStatusById: ProjectRepositoryGitStatusById,
	searchQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	if (searchQuery.length === 0 && syncFilter === 'all') {
		return group.repositories;
	}

	return group.repositories.filter(
		(repository) =>
			repositoryMatchesSearchFilter(repository, searchQuery) &&
			repositoryMatchesSyncFilter(gitStatusById, repository, syncFilter)
	);
}

export function resolveSelectedProject(
	projectNodes: readonly ProjectNodeRecord[],
	selectedProjectId: string | null
) {
	return selectedProjectId === null
		? projectNodes[0] ?? null
		: projectNodes.find((node) => node.id === selectedProjectId) ?? null;
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

export function normalizeProjectSearchFilter(value: string) {
	return value.trim().replace(/^#+/u, '').toLocaleLowerCase('en-US');
}

export function parseTagsInput(value: string) {
	return value
		.split(/[;,]/u)
		.map((tag) => normalizeTagInputValue(tag))
		.filter((tag) => tag.length > 0)
		.filter((tag, index, tags) => {
			const tagKey = tag.toLocaleLowerCase('en-US');

			return tags.findIndex((candidate) => candidate.toLocaleLowerCase('en-US') === tagKey) === index;
		});
}

export function formatTagsInput(tags: readonly string[]) {
	return tags.join(', ');
}

export function validateTagsInput(value: string) {
	const tags = parseTagsInput(value);

	if (tags.length > PROJECT_TAGS_MAX_COUNT) {
		return { ok: false, error: 'project-tags-too-many' } as const;
	}

	if (tags.some((tag) => tag.length > PROJECT_TAG_MAX_LENGTH)) {
		return { ok: false, error: 'project-tag-too-long' } as const;
	}

	return { ok: true, tags } as const;
}

export function getTagsInputMaxLength() {
	return PROJECT_TAGS_MAX_COUNT * (PROJECT_TAG_MAX_LENGTH + 2);
}

function normalizeTagInputValue(value: string) {
	return value.trim().replace(/^#+/u, '').replace(/\s+/gu, '-');
}

function projectMatchesSearchFilter(
	nodes: readonly ProjectNodeRecord[],
	node: ProjectNodeRecord,
	searchQuery: string
) {
	if (searchQuery.length === 0) {
		return true;
	}

	return (
		matchesSearchField(node.name, searchQuery) ||
		matchesTagSearchFilter(node.tags, searchQuery) ||
		listDescendantGroups(nodes, node.id).some((candidateNode) =>
			groupNodeMatchesSearchFilter(candidateNode, searchQuery)
		)
	);
}

function groupMatchesSearchFilter(
	nodes: readonly ProjectNodeRecord[],
	node: ProjectNodeRecord,
	searchQuery: string
) {
	return (
		searchQuery.length === 0 ||
		groupNodeMatchesSearchFilter(node, searchQuery) ||
		listDescendantGroups(nodes, node.id).some((candidateNode) =>
			groupNodeMatchesSearchFilter(candidateNode, searchQuery)
		)
	);
}

function groupNodeMatchesSearchFilter(node: ProjectNodeRecord, searchQuery: string) {
	return (
		matchesSearchField(node.name, searchQuery) ||
		matchesTagSearchFilter(node.tags, searchQuery) ||
		node.repositories.some((repository) => repositoryMatchesSearchFilter(repository, searchQuery))
	);
}

function repositoryMatchesSearchFilter(
	repository: ProjectRepositoryLinkRecord,
	searchQuery: string
) {
	return (
		searchQuery.length === 0 ||
		matchesSearchField(repository.name, searchQuery) ||
		matchesTagSearchFilter(repository.tags, searchQuery)
	);
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

function matchesSearchField(value: string, searchQuery: string) {
	return value.toLocaleLowerCase('en-US').includes(searchQuery);
}

function matchesTagSearchFilter(tags: readonly string[], searchQuery: string) {
	return tags.some((tag) => matchesSearchField(tag, searchQuery));
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
