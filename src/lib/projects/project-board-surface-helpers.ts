import type { EnvironmentVault } from '$lib/environment/environment-vault';
import type { ProjectRepositoryGitCredentialInput } from './project-repository';
import type {
	ProjectNodeRecord,
	ProjectRepositoryLinkRecord
} from './project-registry';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryGitStatus } from './project-board-selectors';
import {
	getNodeGithubCredentialName,
	getRepositoryGithubCredentialName,
	resolveRepositoryGithubCredential,
	type GithubCredentialOption
} from './project-board-github-credentials';
import { getProjectContextMenuNode } from './project-board-targets';
import type {
	ProjectContextMenuState,
	ProjectContextMenuTarget,
	ProjectDeleteCandidate,
	ProjectRepositoryTarget
} from './project-board-types';

export function getProjectBoardContextRepositoryGitStatus(
	target: ProjectRepositoryTarget | null,
	statusByRepositoryId: Record<string, ProjectRepositoryGitStatus>
) {
	return target === null ? null : statusByRepositoryId[target.repository.id] ?? null;
}

export function canOpenProjectBoardContextFolder(input: {
	readonly contextMenu: ProjectContextMenuState | null;
	readonly contextMenuNode: ProjectNodeRecord | null;
	readonly contextMenuRepository: ProjectRepositoryTarget | null;
	readonly contextMenuRepositoryGitStatus: ProjectRepositoryGitStatus | null;
	readonly isOpeningFolder: boolean;
}) {
	const target = input.contextMenu?.target ?? null;

	if (target === null || input.isOpeningFolder) {
		return false;
	}

	if (target.type === 'node') {
		return input.contextMenuNode !== null;
	}

	return (
		input.contextMenuRepository?.repository.path !== null &&
		input.contextMenuRepositoryGitStatus?.error !== 'project-repository-git-path-not-found'
	);
}

export function isProjectBoardDeleteLocalFolderAvailable(
	deleteCandidate: ProjectDeleteCandidate | null,
	statusByRepositoryId: Record<string, ProjectRepositoryGitStatus>,
	isRepositoryPathInsideProjectsFolder: (repositoryPath: string) => boolean
) {
	if (deleteCandidate === null) {
		return false;
	}

	if (deleteCandidate.type === 'node') {
		return deleteCandidate.node.path.trim().length > 0;
	}

	const repositoryStatus = statusByRepositoryId[deleteCandidate.repository.id];

	return (
		deleteCandidate.repository.path !== null &&
		repositoryStatus?.error !== 'project-repository-git-path-not-found' &&
		isRepositoryPathInsideProjectsFolder(deleteCandidate.repository.path)
	);
}

export function isProjectBoardRepositoryTarget(
	target: ProjectContextMenuTarget | null,
	nodeId: string,
	repositoryId: string
) {
	return (
		target?.type === 'repository' &&
		target.nodeId === nodeId &&
		target.repositoryId === repositoryId
	);
}

export function getProjectBoardNodeGithubCredentialName(input: {
	readonly environmentVault: EnvironmentVault | null;
	readonly githubCredentialOptions: readonly GithubCredentialOption[];
	readonly node: ProjectNodeRecord;
}) {
	return getNodeGithubCredentialName(
		input.environmentVault,
		input.githubCredentialOptions,
		input.node
	);
}

export function getProjectBoardRepositoryGithubCredentialName(input: {
	readonly nodes: readonly ProjectNodeRecord[];
	readonly environmentVault: EnvironmentVault | null;
	readonly githubCredentialOptions: readonly GithubCredentialOption[];
	readonly selectedProject: ProjectNodeRecord | null;
	readonly node: ProjectNodeRecord;
	readonly repository: ProjectRepositoryLinkRecord;
}) {
	if (input.selectedProject?.githubCredentialSecretId !== null && input.selectedProject !== null) {
		return 'System Git';
	}

	return getRepositoryGithubCredentialName(
		input.nodes,
		input.environmentVault,
		input.githubCredentialOptions,
		input.node,
		input.repository
	);
}

export function childGithubCredentialMenuIsAvailable(selectedProject: ProjectNodeRecord | null) {
	return selectedProject?.githubCredentialSecretId === null;
}

export function canEditProjectBoardContextGithubCredential(input: {
	readonly target: ProjectContextMenuTarget | null;
	readonly nodes: readonly ProjectNodeRecord[];
	readonly selectedProject: ProjectNodeRecord | null;
}) {
	if (input.target === null) {
		return false;
	}

	if (input.target.type === 'node') {
		const node = getProjectContextMenuNode(input.nodes, input.target);

		return node?.kind === 'project' || childGithubCredentialMenuIsAvailable(input.selectedProject);
	}

	return childGithubCredentialMenuIsAvailable(input.selectedProject);
}

export function resolveProjectBoardRepositoryGithubCredential(input: {
	readonly nodes: readonly ProjectNodeRecord[];
	readonly environmentVault: EnvironmentVault | null;
	readonly githubCredentialOptions: readonly GithubCredentialOption[];
	readonly node: ProjectNodeRecord;
	readonly repository: ProjectRepositoryLinkRecord;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
}): ProjectRepositoryGitCredentialInput | null | undefined {
	const credential = resolveRepositoryGithubCredential(
		input.nodes,
		input.environmentVault,
		input.githubCredentialOptions,
		input.node,
		input.repository
	);

	if (typeof credential === 'string') {
		input.setFormError(credential);
		input.setStatus(null);
		return undefined;
	}

	return credential;
}
