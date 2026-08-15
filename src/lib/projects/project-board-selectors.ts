/* llmnav/1 module
id=workduck.projects.board-selection
role=Precompute project-board search and filter indexes and derive visible project, group, and repository selections.
owns=project board index|search matching|repository sync filters
excludes=registry mutation|Git inspection execution
search=project board filters|repository selection index|project sync statistics
invariant=Derived sets and counts come only from supplied registry nodes and status snapshots without mutating them.
stability=architecture
*/
import type { ProjectRepositoryGitError } from './project-repository';
import {
	PROJECT_TAG_MAX_LENGTH,
	PROJECT_TAGS_MAX_COUNT,
	type ProjectNodeKind,
	type ProjectNodeRecord,
	type ProjectRepositoryLinkRecord,
	type ProjectTreeRow
} from './project-registry';

export type ProjectRepositorySyncFilter = 'all' | 'favorite' | 'pull' | 'push' | 'commit';

export interface ProjectRepositoryGitStatus {
	readonly isGitRepository: boolean;
	readonly hasRemote: boolean;
	readonly originUrl: string | null;
	readonly upstreamRemoteUrl: string | null;
	readonly aheadCount: number;
	readonly behindCount: number;
	readonly hasUncommittedChanges: boolean;
	readonly branch: string | null;
	readonly error: ProjectRepositoryGitError | null;
}

export interface ProjectRepositoryFilterStats {
	readonly favorites: number;
	readonly pullNeeded: number;
	readonly pushNeeded: number;
	readonly commitNeeded: number;
}

export type ProjectRepositoryGitStatusById = Readonly<Record<string, ProjectRepositoryGitStatus>>;

export type InspectableProjectRepositoryLinkRecord = ProjectRepositoryLinkRecord & {
	readonly path: string;
};

export interface ProjectBoardSelectionIndex {
	readonly projectNodes: readonly ProjectNodeRecord[];
	readonly projectRows: readonly ProjectTreeRow[];
	readonly childGroupsByParentId: ReadonlyMap<string, readonly ProjectNodeRecord[]>;
	readonly registeredRepositories: readonly ProjectRepositoryLinkRecord[];
	readonly repositoriesToInspect: readonly InspectableProjectRepositoryLinkRecord[];
	readonly registeredRepositoryIds: ReadonlySet<string>;
	readonly inspectableRepositoryIds: ReadonlySet<string>;
	readonly nodeSearchFieldsById: ReadonlyMap<string, readonly string[]>;
	readonly groupSearchFieldsById: ReadonlyMap<string, readonly string[]>;
	readonly repositorySearchFieldsById: ReadonlyMap<string, readonly string[]>;
	readonly groupCountByNodeId: ReadonlyMap<string, number>;
	readonly repositoryCountByNodeId: ReadonlyMap<string, number>;
}

export interface ProjectBoardFilterMatchIndex {
	readonly descendantGroupSearchMatchesByNodeId: ReadonlySet<string>;
	readonly descendantGroupSyncMatchesByNodeId: ReadonlySet<string>;
	readonly groupSearchMatchesByNodeId: ReadonlySet<string>;
	readonly groupSyncMatchesByNodeId: ReadonlySet<string>;
}

const EMPTY_PROJECT_BOARD_FILTER_MATCH_INDEX: ProjectBoardFilterMatchIndex = {
	descendantGroupSearchMatchesByNodeId: new Set<string>(),
	descendantGroupSyncMatchesByNodeId: new Set<string>(),
	groupSearchMatchesByNodeId: new Set<string>(),
	groupSyncMatchesByNodeId: new Set<string>()
};

export function getNodeKindLabel(kind: ProjectNodeKind) {
	return kind === 'project' ? 'Project' : 'Group';
}

export function createEmptyProjectBoardFilterMatchIndex() {
	return EMPTY_PROJECT_BOARD_FILTER_MATCH_INDEX;
}

export function createProjectBoardSelectionIndex(
	nodes: readonly ProjectNodeRecord[]
): ProjectBoardSelectionIndex {
	const projectNodes: ProjectNodeRecord[] = [];
	const projectRows: ProjectTreeRow[] = [];
	const childGroupsByParentId = new Map<string, ProjectNodeRecord[]>();
	const registeredRepositories: ProjectRepositoryLinkRecord[] = [];
	const repositoriesToInspect: InspectableProjectRepositoryLinkRecord[] = [];
	const registeredRepositoryIds = new Set<string>();
	const inspectableRepositoryIds = new Set<string>();
	const nodeSearchFieldsById = new Map<string, string[]>();
	const groupSearchFieldsById = new Map<string, string[]>();
	const repositorySearchFieldsById = new Map<string, string[]>();

	for (const node of nodes) {
		const nodeSearchFields = createProjectNodeSearchFields(node);
		const groupSearchFields = [...nodeSearchFields];

		for (const repository of node.repositories) {
			const repositorySearchFields = createProjectRepositorySearchFields(repository);

			registeredRepositories.push(repository);
			registeredRepositoryIds.add(repository.id);
			repositorySearchFieldsById.set(repository.id, repositorySearchFields);
			groupSearchFields.push(...repositorySearchFields);

			if (isInspectableProjectRepositoryLinkRecord(repository)) {
				repositoriesToInspect.push(repository);
				inspectableRepositoryIds.add(repository.id);
			}
		}

		nodeSearchFieldsById.set(node.id, nodeSearchFields);
		groupSearchFieldsById.set(node.id, groupSearchFields);

		if (node.kind === 'project' && node.parentId === null) {
			projectNodes.push(node);
			continue;
		}

		if (node.kind !== 'group' || node.parentId === null) {
			continue;
		}

		const childGroups = childGroupsByParentId.get(node.parentId) ?? [];
		childGroups.push(node);
		childGroupsByParentId.set(node.parentId, childGroups);
	}

	const groupCountByNodeId = new Map<string, number>();
	const repositoryCountByNodeId = new Map<string, number>();

	for (const node of nodes) {
		countDescendantGroupStats(
			node.id,
			childGroupsByParentId,
			groupCountByNodeId,
			repositoryCountByNodeId
		);
	}

	const visitedNodeIds = new Set<string>();

	for (const projectNode of projectNodes) {
		appendProjectTreeRows(projectRows, childGroupsByParentId, visitedNodeIds, projectNode, 0);
	}

	return {
		projectNodes,
		projectRows,
		childGroupsByParentId,
		registeredRepositories,
		repositoriesToInspect,
		registeredRepositoryIds,
		inspectableRepositoryIds,
		nodeSearchFieldsById,
		groupSearchFieldsById,
		repositorySearchFieldsById,
		groupCountByNodeId,
		repositoryCountByNodeId
	};
}

export function createProjectBoardFilterMatchIndex(
	index: ProjectBoardSelectionIndex,
	gitStatusById: ProjectRepositoryGitStatusById,
	searchQuery: string,
	syncFilter: ProjectRepositorySyncFilter
): ProjectBoardFilterMatchIndex {
	const descendantGroupSearchMatchesByNodeId = new Set<string>();
	const descendantGroupSyncMatchesByNodeId = new Set<string>();
	const groupSearchMatchesByNodeId = new Set<string>();
	const groupSyncMatchesByNodeId = new Set<string>();

	for (let rowIndex = index.projectRows.length - 1; rowIndex >= 0; rowIndex -= 1) {
		const row = index.projectRows[rowIndex];

		if (row === undefined) {
			continue;
		}

		const childGroups = index.childGroupsByParentId.get(row.node.id) ?? [];
		const descendantSearchMatches = childGroups.some((childGroup) =>
			groupSearchMatchesByNodeId.has(childGroup.id)
		);
		const descendantSyncMatches = childGroups.some((childGroup) =>
			groupSyncMatchesByNodeId.has(childGroup.id)
		);

		if (descendantSearchMatches) {
			descendantGroupSearchMatchesByNodeId.add(row.node.id);
		}

		if (descendantSyncMatches) {
			descendantGroupSyncMatchesByNodeId.add(row.node.id);
		}

		if (row.node.kind !== 'group') {
			continue;
		}

		if (
			groupNodeMatchesSearchFilter(index, row.node, searchQuery) ||
			descendantSearchMatches
		) {
			groupSearchMatchesByNodeId.add(row.node.id);
		}

		if (
			groupNodeMatchesRepositorySyncFilter(gitStatusById, row.node, syncFilter) ||
			descendantSyncMatches
		) {
			groupSyncMatchesByNodeId.add(row.node.id);
		}
	}

	return {
		descendantGroupSearchMatchesByNodeId,
		descendantGroupSyncMatchesByNodeId,
		groupSearchMatchesByNodeId,
		groupSyncMatchesByNodeId
	};
}

export function getProjectGroupCount(index: ProjectBoardSelectionIndex, projectId: string) {
	return index.groupCountByNodeId.get(projectId) ?? 0;
}

export function getProjectRepositoryCount(index: ProjectBoardSelectionIndex, projectId: string) {
	return index.repositoryCountByNodeId.get(projectId) ?? 0;
}

export function formatCountLabel(count: number, singularLabel: string, pluralLabel: string) {
	return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

export function selectProjectNodes(
	index: ProjectBoardSelectionIndex,
	filterMatchIndex: ProjectBoardFilterMatchIndex,
	gitStatusById: ProjectRepositoryGitStatusById,
	searchQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	const projects = index.projectNodes;

	if (searchQuery.length === 0 && syncFilter === 'all') {
		return projects;
	}

	return projects.filter(
		(node) =>
			projectMatchesSearchFilter(index, filterMatchIndex, node, searchQuery) &&
			projectMatchesRepositorySyncFilter(filterMatchIndex, node, syncFilter)
	);
}

export function selectProjectGroups(
	index: ProjectBoardSelectionIndex,
	filterMatchIndex: ProjectBoardFilterMatchIndex,
	gitStatusById: ProjectRepositoryGitStatusById,
	projectId: string,
	searchQuery: string,
	syncFilter: ProjectRepositorySyncFilter
) {
	const groups = index.childGroupsByParentId.get(projectId) ?? [];

	if (searchQuery.length === 0 && syncFilter === 'all') {
		return groups;
	}

	return groups.filter(
		(node) =>
			groupMatchesSearchFilter(filterMatchIndex, node, searchQuery) &&
			groupMatchesRepositorySyncFilter(filterMatchIndex, node, syncFilter)
	);
}

export function selectGroupRepositories(
	index: ProjectBoardSelectionIndex,
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
			repositoryMatchesSearchFilter(index, repository, searchQuery) &&
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
	index: ProjectBoardSelectionIndex,
	gitStatusById: ProjectRepositoryGitStatusById
): ProjectRepositoryFilterStats {
	let favorites = 0;
	let pullNeeded = 0;
	let pushNeeded = 0;
	let commitNeeded = 0;

	for (const repository of index.registeredRepositories) {
		favorites += repository.favorite ? 1 : 0;
		pullNeeded += repositoryMatchesSyncFilter(gitStatusById, repository, 'pull') ? 1 : 0;
		pushNeeded += repositoryMatchesSyncFilter(gitStatusById, repository, 'push') ? 1 : 0;
		commitNeeded += repositoryMatchesSyncFilter(gitStatusById, repository, 'commit') ? 1 : 0;
	}

	return { favorites, pullNeeded, pushNeeded, commitNeeded };
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
	index: ProjectBoardSelectionIndex,
	filterMatchIndex: ProjectBoardFilterMatchIndex,
	node: ProjectNodeRecord,
	searchQuery: string
) {
	if (searchQuery.length === 0) {
		return true;
	}

	return (
		matchesSearchFields(
			index.nodeSearchFieldsById.get(node.id) ?? createProjectNodeSearchFields(node),
			searchQuery
		) ||
		filterMatchIndex.descendantGroupSearchMatchesByNodeId.has(node.id)
	);
}

function groupMatchesSearchFilter(
	filterMatchIndex: ProjectBoardFilterMatchIndex,
	node: ProjectNodeRecord,
	searchQuery: string
) {
	return (
		searchQuery.length === 0 ||
		filterMatchIndex.groupSearchMatchesByNodeId.has(node.id)
	);
}

function groupNodeMatchesSearchFilter(
	index: ProjectBoardSelectionIndex,
	node: ProjectNodeRecord,
	searchQuery: string
) {
	return (
		searchQuery.length === 0 ||
		matchesSearchFields(
			index.groupSearchFieldsById.get(node.id) ?? createProjectGroupSearchFields(node),
			searchQuery
		)
	);
}

function repositoryMatchesSearchFilter(
	index: ProjectBoardSelectionIndex,
	repository: ProjectRepositoryLinkRecord,
	searchQuery: string
) {
	return (
		searchQuery.length === 0 ||
		matchesSearchFields(
			index.repositorySearchFieldsById.get(repository.id) ??
				createProjectRepositorySearchFields(repository),
			searchQuery
		)
	);
}

function projectMatchesRepositorySyncFilter(
	filterMatchIndex: ProjectBoardFilterMatchIndex,
	node: ProjectNodeRecord,
	syncFilter: ProjectRepositorySyncFilter
) {
	return (
		syncFilter === 'all' ||
		filterMatchIndex.descendantGroupSyncMatchesByNodeId.has(node.id)
	);
}

function groupMatchesRepositorySyncFilter(
	filterMatchIndex: ProjectBoardFilterMatchIndex,
	node: ProjectNodeRecord,
	syncFilter: ProjectRepositorySyncFilter
) {
	return (
		syncFilter === 'all' ||
		filterMatchIndex.groupSyncMatchesByNodeId.has(node.id)
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

	if (syncFilter === 'favorite') {
		return repository.favorite;
	}

	const gitStatus = gitStatusById[repository.id];

	if (syncFilter === 'pull') {
		return gitStatus?.behindCount !== undefined && gitStatus.behindCount > 0;
	}

	return syncFilter === 'push'
		? gitStatus?.aheadCount !== undefined && gitStatus.aheadCount > 0
		: gitStatus?.hasUncommittedChanges === true;
}

function matchesSearchFields(fields: readonly string[], searchQuery: string) {
	for (const field of fields) {
		if (field.includes(searchQuery)) {
			return true;
		}
	}

	return false;
}

function createProjectNodeSearchFields(node: ProjectNodeRecord) {
	return [node.name, ...node.tags].map(normalizeSearchField);
}

function createProjectRepositorySearchFields(repository: ProjectRepositoryLinkRecord) {
	return [repository.name, ...repository.tags].map(normalizeSearchField);
}

function normalizeSearchField(value: string) {
	return value.toLocaleLowerCase('en-US');
}

function createProjectGroupSearchFields(node: ProjectNodeRecord) {
	return [
		...createProjectNodeSearchFields(node),
		...node.repositories.flatMap((repository) => createProjectRepositorySearchFields(repository))
	];
}

function countDescendantGroupStats(
	nodeId: string,
	childGroupsByParentId: ReadonlyMap<string, readonly ProjectNodeRecord[]>,
	groupCountByNodeId: Map<string, number>,
	repositoryCountByNodeId: Map<string, number>
) {
	const cachedGroupCount = groupCountByNodeId.get(nodeId);

	if (cachedGroupCount !== undefined) {
		return {
			groupCount: cachedGroupCount,
			repositoryCount: repositoryCountByNodeId.get(nodeId) ?? 0
		};
	}

	let groupCount = 0;
	let repositoryCount = 0;

	for (const childGroup of childGroupsByParentId.get(nodeId) ?? []) {
		const childStats = countDescendantGroupStats(
			childGroup.id,
			childGroupsByParentId,
			groupCountByNodeId,
			repositoryCountByNodeId
		);

		groupCount += 1 + childStats.groupCount;
		repositoryCount += childGroup.repositories.length + childStats.repositoryCount;
	}

	groupCountByNodeId.set(nodeId, groupCount);
	repositoryCountByNodeId.set(nodeId, repositoryCount);

	return { groupCount, repositoryCount };
}

function appendProjectTreeRows(
	rows: ProjectTreeRow[],
	childGroupsByParentId: ReadonlyMap<string, readonly ProjectNodeRecord[]>,
	visitedNodeIds: Set<string>,
	node: ProjectNodeRecord,
	depth: number
) {
	if (visitedNodeIds.has(node.id)) {
		return;
	}

	visitedNodeIds.add(node.id);
	rows.push({ node, depth });

	for (const childGroup of childGroupsByParentId.get(node.id) ?? []) {
		appendProjectTreeRows(rows, childGroupsByParentId, visitedNodeIds, childGroup, depth + 1);
	}
}

function isInspectableProjectRepositoryLinkRecord(
	repository: ProjectRepositoryLinkRecord
): repository is InspectableProjectRepositoryLinkRecord {
	return repository.path !== null;
}
