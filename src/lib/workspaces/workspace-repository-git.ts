import {
	fetchProjectRepositoryGit,
	inspectProjectRepositoryGit,
	publishProjectRepositoryToGithub,
	pullProjectRepositoryGit,
	pushProjectRepositoryGit,
	type ProjectRepositoryGithubVisibility,
	type ProjectRepositoryGitCredentialInput,
	type ProjectRepositoryGitError,
	type ProjectRepositoryGitInspectionResult,
	type ProjectRepositoryGitMutationResult
} from '$lib/projects/project-repository';

export type WorkspaceRepositoryGitError = ProjectRepositoryGitError;
export type WorkspaceRepositoryGitCredentialInput = ProjectRepositoryGitCredentialInput;
export type WorkspaceRepositoryGithubVisibility = ProjectRepositoryGithubVisibility;
export type WorkspaceRepositoryGitInspectionResult = ProjectRepositoryGitInspectionResult;
export type WorkspaceRepositoryGitMutationResult = ProjectRepositoryGitMutationResult;

interface WorkspaceRepositoryGithubPublishInput {
	readonly path: string;
	readonly repositoryName: string;
	readonly commitMessage: string;
	readonly visibility: WorkspaceRepositoryGithubVisibility;
	readonly credential?: WorkspaceRepositoryGitCredentialInput | null;
}

export function inspectWorkspaceRepositoryGit(
	path: string
): Promise<WorkspaceRepositoryGitInspectionResult> {
	return inspectProjectRepositoryGit(path);
}

export function fetchWorkspaceRepositoryGit(
	path: string,
	credential: WorkspaceRepositoryGitCredentialInput | null = null
): Promise<WorkspaceRepositoryGitMutationResult> {
	return fetchProjectRepositoryGit(path, credential);
}

export function pullWorkspaceRepositoryGit(
	path: string,
	credential: WorkspaceRepositoryGitCredentialInput | null = null
): Promise<WorkspaceRepositoryGitMutationResult> {
	return pullProjectRepositoryGit(path, credential);
}

export function pushWorkspaceRepositoryGit(
	path: string,
	credential: WorkspaceRepositoryGitCredentialInput | null = null
): Promise<WorkspaceRepositoryGitMutationResult> {
	return pushProjectRepositoryGit(path, credential);
}

export function publishWorkspaceRepositoryToGithub(
	input: WorkspaceRepositoryGithubPublishInput
): Promise<WorkspaceRepositoryGitMutationResult> {
	return publishProjectRepositoryToGithub(input);
}
