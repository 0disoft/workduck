import type {
	InspectableProjectRepositoryLinkRecord,
	ProjectRepositoryGitStatus
} from './project-board-selectors';

export const PROJECT_REPOSITORY_GIT_STATUS_CACHE_TTL_MS = 30_000;

const PROJECT_REPOSITORY_GIT_STATUS_CACHE_MAX_ENTRIES = 1_024;

interface ProjectRepositoryGitStatusCacheEntry {
	readonly path: string;
	readonly status: ProjectRepositoryGitStatus;
	readonly inspectedAt: number;
}

const repositoryGitStatusCache = new Map<string, ProjectRepositoryGitStatusCacheEntry>();

export interface ProjectRepositoryGitStatusCacheSnapshot {
	readonly statuses: Record<string, ProjectRepositoryGitStatus>;
	readonly freshRepositoryIds: ReadonlySet<string>;
}

export function selectProjectRepositoriesForGitInspection(
	repositories: readonly InspectableProjectRepositoryLinkRecord[],
	freshRepositoryIds: ReadonlySet<string>
) {
	return repositories.filter((repository) => !freshRepositoryIds.has(repository.id));
}

export function readProjectRepositoryGitStatusCache(
	workspaceId: string,
	repositories: readonly InspectableProjectRepositoryLinkRecord[],
	now = Date.now()
): ProjectRepositoryGitStatusCacheSnapshot {
	const statuses: Record<string, ProjectRepositoryGitStatus> = {};
	const freshRepositoryIds = new Set<string>();

	for (const repository of repositories) {
		const key = createProjectRepositoryGitStatusCacheKey(workspaceId, repository.id);
		const entry = repositoryGitStatusCache.get(key);

		if (entry === undefined) {
			continue;
		}

		if (entry.path !== repository.path) {
			repositoryGitStatusCache.delete(key);
			continue;
		}

		statuses[repository.id] = entry.status;
		if (Math.max(0, now - entry.inspectedAt) < PROJECT_REPOSITORY_GIT_STATUS_CACHE_TTL_MS) {
			freshRepositoryIds.add(repository.id);
		}
	}

	return { statuses, freshRepositoryIds };
}

export function writeProjectRepositoryGitStatusCache(
	workspaceId: string,
	repositories: readonly InspectableProjectRepositoryLinkRecord[],
	statuses: Readonly<Record<string, ProjectRepositoryGitStatus>>,
	inspectedAt = Date.now()
) {
	const acceptedStatuses: Record<string, ProjectRepositoryGitStatus> = {};

	for (const repository of repositories) {
		const status = statuses[repository.id];
		if (status === undefined) {
			continue;
		}

		const key = createProjectRepositoryGitStatusCacheKey(workspaceId, repository.id);
		const current = repositoryGitStatusCache.get(key);
		if (current !== undefined && current.path === repository.path && current.inspectedAt > inspectedAt) {
			continue;
		}

		repositoryGitStatusCache.set(
			key,
			{
				path: repository.path,
				status: { ...status },
				inspectedAt
			}
		);
		acceptedStatuses[repository.id] = status;
	}

	trimProjectRepositoryGitStatusCache();
	return acceptedStatuses;
}

export function writeSingleProjectRepositoryGitStatusCache(
	workspaceId: string,
	repositoryId: string,
	path: string,
	status: ProjectRepositoryGitStatus,
	inspectedAt = Date.now()
) {
	const key = createProjectRepositoryGitStatusCacheKey(workspaceId, repositoryId);
	const current = repositoryGitStatusCache.get(key);
	if (current !== undefined && current.path === path && current.inspectedAt > inspectedAt) {
		return false;
	}

	repositoryGitStatusCache.set(
		key,
		{ path, status: { ...status }, inspectedAt }
	);
	trimProjectRepositoryGitStatusCache();
	return true;
}

export function clearProjectRepositoryGitStatusCache() {
	repositoryGitStatusCache.clear();
}

function createProjectRepositoryGitStatusCacheKey(workspaceId: string, repositoryId: string) {
	return `${workspaceId}\u0000${repositoryId}`;
}

function trimProjectRepositoryGitStatusCache() {
	while (repositoryGitStatusCache.size > PROJECT_REPOSITORY_GIT_STATUS_CACHE_MAX_ENTRIES) {
		const oldestKey = repositoryGitStatusCache.keys().next().value;
		if (oldestKey === undefined) {
			return;
		}
		repositoryGitStatusCache.delete(oldestKey);
	}
}
