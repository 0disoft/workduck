import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
import { PROJECT_REPOSITORY_NAME_MAX_LENGTH } from './project-registry';
export { createProjectFolderNameFromDisplayName } from './project-folder-name';

export function isRepositoryPathInsideWorkspace(workspacePath: string, repositoryPath: string) {
	return isRepositoryPathInsideWorkspaceBoundary(
		createWorkspacePathBoundaryKey(workspacePath),
		repositoryPath
	);
}

export function isRepositoryPathInsideProjectsFolder(workspacePath: string, repositoryPath: string) {
	return isRepositoryPathInsideProjectsFolderBoundary(
		createWorkspacePathBoundaryKey(workspacePath),
		repositoryPath
	);
}

export function createWorkspacePathBoundaryKey(workspacePath: string) {
	return createLocalPathBoundaryKey(workspacePath);
}

export function isRepositoryPathInsideWorkspaceBoundary(
	workspacePathKey: string,
	repositoryPath: string
) {
	const repositoryPathKey = createLocalPathBoundaryKey(repositoryPath);

	return (
		workspacePathKey.length > 0 &&
		(repositoryPathKey === workspacePathKey || repositoryPathKey.startsWith(`${workspacePathKey}/`))
	);
}

export function isRepositoryPathInsideProjectsFolderBoundary(
	workspacePathKey: string,
	repositoryPath: string
) {
	const repositoryPathKey = createLocalPathBoundaryKey(repositoryPath);
	const projectsPathKey = `${workspacePathKey}/projects`;

	return (
		workspacePathKey.length > 0 &&
		(repositoryPathKey === projectsPathKey || repositoryPathKey.startsWith(`${projectsPathKey}/`))
	);
}

export function createRepositoryNameFromRemoteUrl(remoteUrl: string) {
	const trimmedUrl = remoteUrl.trim().replace(/\.git$/iu, '');

	if (trimmedUrl.length === 0) {
		return '';
	}

	const pathSource = getRemoteUrlPathSource(trimmedUrl);
	const segments = pathSource.split(/[\\/]+/).filter(Boolean);

	return segments.at(-1)?.slice(0, PROJECT_REPOSITORY_NAME_MAX_LENGTH) ?? '';
}

export function createWorkspaceChildPath(workspacePath: string, relativePath: string) {
	const normalizedWorkspacePath = normalizeWorkspacePathForStorage(workspacePath).replace(/[\\/]+$/u, '');
	const separator = normalizedWorkspacePath.includes('\\') ? '\\' : '/';
	const normalizedRelativePath = relativePath.split('/').filter(Boolean).join(separator);

	return `${normalizedWorkspacePath}${separator}${normalizedRelativePath}`;
}

function createLocalPathBoundaryKey(path: string) {
	return normalizeWorkspacePathForStorage(path)
		.replaceAll('\\', '/')
		.replace(/^\/\/\?\//u, '')
		.replace(/\/+$/u, '')
		.toLocaleLowerCase('en-US');
}

function getRemoteUrlPathSource(trimmedUrl: string) {
	if (!trimmedUrl.includes('://')) {
		return trimmedUrl.split(':').at(-1) ?? trimmedUrl;
	}

	try {
		return new URL(trimmedUrl).pathname;
	} catch {
		return '';
	}
}
