import {
	fetchProjectRepositoryGit,
	inspectProjectRepositoryGit,
	publishProjectRepositoryToGithub,
	pullProjectRepositoryGit,
	pushProjectRepositoryGit,
	type ProjectRepositoryGithubVisibility,
	type ProjectRepositoryGitError,
	type ProjectRepositoryGitInspectionResult,
	type ProjectRepositoryGitMutationResult
} from '$lib/projects/project-repository';

export type WorkspaceRepositoryGitError = ProjectRepositoryGitError;
export type WorkspaceRepositoryGithubVisibility = ProjectRepositoryGithubVisibility;
export type WorkspaceRepositoryGitInspectionResult = ProjectRepositoryGitInspectionResult;
export type WorkspaceRepositoryGitMutationResult = ProjectRepositoryGitMutationResult;

interface WorkspaceRepositoryGithubPublishInput {
	readonly path: string;
	readonly repositoryName: string;
	readonly commitMessage: string;
	readonly visibility: WorkspaceRepositoryGithubVisibility;
}

export function inspectWorkspaceRepositoryGit(
	path: string
): Promise<WorkspaceRepositoryGitInspectionResult> {
	return inspectProjectRepositoryGit(path);
}

export function fetchWorkspaceRepositoryGit(
	path: string
): Promise<WorkspaceRepositoryGitMutationResult> {
	return fetchProjectRepositoryGit(path);
}

export function pullWorkspaceRepositoryGit(
	path: string
): Promise<WorkspaceRepositoryGitMutationResult> {
	return pullProjectRepositoryGit(path);
}

export function pushWorkspaceRepositoryGit(
	path: string
): Promise<WorkspaceRepositoryGitMutationResult> {
	return pushProjectRepositoryGit(path);
}

export function publishWorkspaceRepositoryToGithub(
	input: WorkspaceRepositoryGithubPublishInput
): Promise<WorkspaceRepositoryGitMutationResult> {
	return publishProjectRepositoryToGithub(input);
}
