import {
	createEmptyProjectBoardFilterMatchIndex,
	createProjectBoardFilterMatchIndex,
	getRepositoryFilterStats,
	normalizeProjectSearchFilter,
	resolveSelectedGroup,
	resolveSelectedProject,
	selectGroupRepositories,
	selectProjectGroups,
	selectProjectNodes,
	type ProjectBoardSelectionIndex,
	type ProjectRepositoryGitStatus,
	type ProjectRepositorySyncFilter
} from './project-board-selectors';

export function createProjectBoardSurfaceSelection(input: {
	readonly selectionIndex: ProjectBoardSelectionIndex;
	readonly repositoryGitStatusById: Record<string, ProjectRepositoryGitStatus>;
	readonly tagFilter: string;
	readonly repositorySyncFilter: ProjectRepositorySyncFilter;
	readonly selectedProjectId: string | null;
	readonly selectedGroupId: string | null;
}) {
	const normalizedTagFilter = normalizeProjectSearchFilter(input.tagFilter);
	const hasActiveFilter = normalizedTagFilter.length > 0 || input.repositorySyncFilter !== 'all';
	const filterMatchIndex = hasActiveFilter
		? createProjectBoardFilterMatchIndex(
				input.selectionIndex,
				input.repositoryGitStatusById,
				normalizedTagFilter,
				input.repositorySyncFilter
			)
		: createEmptyProjectBoardFilterMatchIndex();
	const repositoryFilterStats = getRepositoryFilterStats(
		input.selectionIndex,
		input.repositoryGitStatusById
	);
	const projectNodes = selectProjectNodes(
		input.selectionIndex,
		filterMatchIndex,
		input.repositoryGitStatusById,
		normalizedTagFilter,
		input.repositorySyncFilter
	);
	const selectedProject = resolveSelectedProject(projectNodes, input.selectedProjectId);
	const selectedProjectGroups =
		selectedProject === null
			? []
			: selectProjectGroups(
					input.selectionIndex,
					filterMatchIndex,
					input.repositoryGitStatusById,
					selectedProject.id,
					normalizedTagFilter,
					input.repositorySyncFilter
				);
	const selectedGroup = resolveSelectedGroup(selectedProjectGroups, input.selectedGroupId);
	const selectedRepositories =
		selectedGroup === null
			? []
			: selectGroupRepositories(
					input.selectionIndex,
					selectedGroup,
					input.repositoryGitStatusById,
					normalizedTagFilter,
					input.repositorySyncFilter
				);

	return {
		normalizedTagFilter,
		repositoryFilterStats,
		projectNodes,
		selectedProject,
		selectedProjectGroups,
		selectedGroup,
		selectedRepositories
	};
}
