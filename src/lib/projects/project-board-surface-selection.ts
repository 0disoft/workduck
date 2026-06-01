import {
	createProjectTreeRows,
	type ProjectNodeRecord
} from './project-registry';
import {
	getRepositoryFilterStats,
	normalizeProjectSearchFilter,
	resolveSelectedGroup,
	resolveSelectedProject,
	selectGroupRepositories,
	selectProjectGroups,
	selectProjectNodes,
	type ProjectRepositoryGitStatus,
	type ProjectRepositorySyncFilter
} from './project-board-selectors';

export function createProjectBoardSurfaceSelection(input: {
	readonly nodes: readonly ProjectNodeRecord[];
	readonly repositoryGitStatusById: Record<string, ProjectRepositoryGitStatus>;
	readonly tagFilter: string;
	readonly repositorySyncFilter: ProjectRepositorySyncFilter;
	readonly selectedProjectId: string | null;
	readonly selectedGroupId: string | null;
}) {
	const projectRows = createProjectTreeRows(input.nodes);
	const normalizedTagFilter = normalizeProjectSearchFilter(input.tagFilter);
	const repositoryFilterStats = getRepositoryFilterStats(
		input.nodes,
		input.repositoryGitStatusById
	);
	const projectNodes = selectProjectNodes(
		input.nodes,
		input.repositoryGitStatusById,
		normalizedTagFilter,
		input.repositorySyncFilter
	);
	const selectedProject = resolveSelectedProject(projectNodes, input.selectedProjectId);
	const selectedProjectGroups =
		selectedProject === null
			? []
			: selectProjectGroups(
					input.nodes,
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
					selectedGroup,
					input.repositoryGitStatusById,
					normalizedTagFilter,
					input.repositorySyncFilter
				);

	return {
		projectRows,
		normalizedTagFilter,
		repositoryFilterStats,
		projectNodes,
		selectedProject,
		selectedProjectGroups,
		selectedGroup,
		selectedRepositories
	};
}
