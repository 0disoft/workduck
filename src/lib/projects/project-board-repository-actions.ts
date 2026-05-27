import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
import {
	cloneProjectRepository,
	initializeProjectRepositoryGit,
	publishProjectRepositoryToGithub,
	type ProjectRepositoryGitCredentialInput,
	type ProjectRepositoryGithubVisibility
} from './project-repository';
import {
	setProjectRepositoryLocalPath,
	type ProjectRegistry
} from './project-registry';
import type { ProjectFormError } from './project-board-errors';
import {
	getRepositoryGitActionDoneLabel,
	getRepositoryGitActionProgressLabel,
	runProjectRepositoryGitMutation,
	type ProjectRepositoryGitAction
} from './project-board-operations';
import type {
	ProjectContextMenuTarget,
	ProjectRepositoryTarget
} from './project-board-types';
import type { ProjectRepositoryOperationName } from './project-operation-storage';

export interface ProjectRepositoryActionContext {
	readonly workspacePath: string;
	readonly registry: ProjectRegistry;
	readonly isRepositoryBusy: (repositoryId: string) => boolean;
	readonly isRepositoryPathInsideWorkspace: (repositoryPath: string) => boolean;
	readonly resolveCredential: (
		target: ProjectRepositoryTarget
	) => ProjectRepositoryGitCredentialInput | null | undefined;
	readonly startOperation: (repositoryId: string, name: ProjectRepositoryOperationName) => void;
	readonly succeedOperation: (
		target: ProjectRepositoryTarget,
		name: ProjectRepositoryOperationName
	) => Promise<void>;
	readonly failOperation: (
		target: ProjectRepositoryTarget,
		name: ProjectRepositoryOperationName,
		error: ProjectFormError
	) => Promise<void>;
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly refreshRepositoryGitStatus: (repositoryId: string, path: string | null) => Promise<void>;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setSelectedGroupId: (groupId: string) => void;
	readonly setCloneTarget: (target: ProjectContextMenuTarget | null) => void;
	readonly setGitActionTarget: (target: ProjectContextMenuTarget | null) => void;
	readonly setIsPublishingRepository: (isPublishing: boolean) => void;
	readonly closePublishRepositoryDialog: () => void;
}

export async function cloneProjectRepositoryForTarget(
	target: ProjectRepositoryTarget | null,
	context: ProjectRepositoryActionContext
) {
	if (target === null) {
		context.setFormError('project-repository-not-found');
		return;
	}

	if (target.repository.remoteUrl === null) {
		context.setFormError('project-repository-remote-url-invalid');
		return;
	}

	const cloneLocation = resolveProjectRepositoryCloneLocation(target, context);

	if (!cloneLocation.ok) {
		context.setFormError(cloneLocation.error);
		await context.failOperation(target, 'clone', cloneLocation.error);
		return;
	}

	if (context.isRepositoryBusy(target.repository.id)) {
		return;
	}

	const credential = context.resolveCredential(target);

	if (credential === undefined) {
		return;
	}

	context.startOperation(target.repository.id, 'clone');
	context.setCloneTarget(createRepositoryContextMenuTarget(target));
	context.setFormError(null);
	context.setStatus('Cloning repository.');

	try {
		const cloneResult = await cloneProjectRepository({
			workspacePath: context.workspacePath,
			groupRelativePath: cloneLocation.groupRelativePath,
			repositoryName: cloneLocation.repositoryName,
			remoteUrl: target.repository.remoteUrl,
			credential
		});

		if (!cloneResult.ok) {
			context.setFormError(cloneResult.error);
			await context.failOperation(target, 'clone', cloneResult.error);
			context.setStatus(null);
			return;
		}

		const updateResult = setProjectRepositoryLocalPath(context.registry, {
			nodeId: target.node.id,
			repositoryId: target.repository.id,
			path: cloneResult.path
		});

		if (!updateResult.ok) {
			context.setFormError(updateResult.error);
			await context.failOperation(target, 'clone', updateResult.error);
			context.setStatus(null);
			return;
		}

		if (await context.persistRegistry(updateResult.registry)) {
			context.setSelectedGroupId(target.node.id);
			await context.refreshRepositoryGitStatus(target.repository.id, cloneResult.path);
			await context.succeedOperation(target, 'clone');
			context.setStatus('Repository cloned.');
		} else {
			await context.failOperation(target, 'clone', 'project-registry-write-failed');
		}
	} finally {
		context.setCloneTarget(null);
	}
}

export async function initializeProjectRepositoryForTarget(
	target: ProjectRepositoryTarget | null,
	context: ProjectRepositoryActionContext
) {
	if (target === null || target.repository.path === null) {
		context.setFormError('project-repository-not-found');
		return;
	}

	if (!context.isRepositoryPathInsideWorkspace(target.repository.path)) {
		context.setFormError('project-repository-path-outside-workspace');
		await context.failOperation(target, 'init', 'project-repository-path-outside-workspace');
		return;
	}

	if (context.isRepositoryBusy(target.repository.id)) {
		return;
	}

	context.startOperation(target.repository.id, 'init');
	context.setGitActionTarget(createRepositoryContextMenuTarget(target));
	context.setFormError(null);
	context.setStatus('Initializing Git repository.');

	try {
		const result = await initializeProjectRepositoryGit(target.repository.path);

		if (!result.ok) {
			context.setFormError(result.error);
			await context.failOperation(target, 'init', result.error);
			context.setStatus(null);
			return;
		}

		await context.refreshRepositoryGitStatus(target.repository.id, target.repository.path);
		await context.succeedOperation(target, 'init');
		context.setStatus('Git repository initialized.');
	} finally {
		context.setGitActionTarget(null);
	}
}

export async function publishProjectRepositoryTarget(
	target: ProjectRepositoryTarget | null,
	input: {
		readonly repositoryName: string;
		readonly commitMessage: string;
		readonly visibility: ProjectRepositoryGithubVisibility;
	},
	context: ProjectRepositoryActionContext
) {
	if (target === null || target.repository.path === null) {
		context.setFormError('project-repository-not-found');
		return;
	}

	if (!context.isRepositoryPathInsideWorkspace(target.repository.path)) {
		context.setFormError('project-repository-path-outside-workspace');
		await context.failOperation(target, 'publish', 'project-repository-path-outside-workspace');
		return;
	}

	const credential = context.resolveCredential(target);

	if (credential === undefined) {
		return;
	}

	context.startOperation(target.repository.id, 'publish');
	context.setIsPublishingRepository(true);
	context.setGitActionTarget(createRepositoryContextMenuTarget(target));
	context.setFormError(null);
	context.setStatus('Publishing repository.');

	try {
		const result = await publishProjectRepositoryToGithub({
			path: target.repository.path,
			repositoryName: input.repositoryName,
			commitMessage: input.commitMessage,
			visibility: input.visibility,
			credential
		});

		if (!result.ok) {
			context.setFormError(result.error);
			await context.failOperation(target, 'publish', result.error);
			context.setStatus(null);
			return;
		}

		await context.refreshRepositoryGitStatus(target.repository.id, target.repository.path);
		await context.succeedOperation(target, 'publish');
		context.setStatus('Repository published.');
		context.closePublishRepositoryDialog();
	} finally {
		context.setIsPublishingRepository(false);
		context.setGitActionTarget(null);
	}
}

export async function runProjectRepositoryRemoteGitAction(
	target: ProjectRepositoryTarget | null,
	action: ProjectRepositoryGitAction,
	context: ProjectRepositoryActionContext
) {
	if (target === null || target.repository.path === null) {
		context.setFormError('project-repository-not-found');
		return;
	}

	if (!context.isRepositoryPathInsideWorkspace(target.repository.path)) {
		context.setFormError('project-repository-path-outside-workspace');
		await context.failOperation(target, action, 'project-repository-path-outside-workspace');
		return;
	}

	if (context.isRepositoryBusy(target.repository.id)) {
		return;
	}

	const credential = context.resolveCredential(target);

	if (credential === undefined) {
		return;
	}

	context.startOperation(target.repository.id, action);
	context.setGitActionTarget(createRepositoryContextMenuTarget(target));
	context.setFormError(null);
	context.setStatus(`${getRepositoryGitActionProgressLabel(action)} repository.`);

	try {
		const result = await runProjectRepositoryGitMutation(action, target.repository.path, credential);

		if (!result.ok) {
			context.setFormError(result.error);
			await context.failOperation(target, action, result.error);
			context.setStatus(null);
			return;
		}

		await context.refreshRepositoryGitStatus(target.repository.id, target.repository.path);
		await context.succeedOperation(target, action);
		context.setStatus(`Repository ${getRepositoryGitActionDoneLabel(action)}.`);
	} finally {
		context.setGitActionTarget(null);
	}
}

function createRepositoryContextMenuTarget(
	target: ProjectRepositoryTarget
): ProjectContextMenuTarget {
	return {
		type: 'repository',
		nodeId: target.node.id,
		repositoryId: target.repository.id
	};
}

type ProjectRepositoryCloneLocation =
	| {
			readonly ok: true;
			readonly groupRelativePath: string;
			readonly repositoryName: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFormError;
	  };

function resolveProjectRepositoryCloneLocation(
	target: ProjectRepositoryTarget,
	context: ProjectRepositoryActionContext
): ProjectRepositoryCloneLocation {
	if (target.repository.path === null) {
		return {
			ok: true,
			groupRelativePath: target.node.path,
			repositoryName: target.repository.name
		};
	}

	if (!context.isRepositoryPathInsideWorkspace(target.repository.path)) {
		return { ok: false, error: 'project-repository-path-outside-workspace' };
	}

	const relativePath = createWorkspaceRelativePath(context.workspacePath, target.repository.path);

	if (relativePath === null) {
		return { ok: false, error: 'project-repository-path-outside-workspace' };
	}

	const segments = relativePath.split('/').filter(Boolean);
	const repositoryName = segments.at(-1);
	const groupSegments = segments.slice(0, -1);

	if (repositoryName === undefined || groupSegments.length === 0) {
		return { ok: false, error: 'project-repository-path-required' };
	}

	return {
		ok: true,
		groupRelativePath: groupSegments.join('/'),
		repositoryName
	};
}

function createWorkspaceRelativePath(workspacePath: string, repositoryPath: string) {
	const workspacePathKey = createPathBoundaryKey(workspacePath);
	const repositoryPathKey = createPathBoundaryKey(repositoryPath);

	if (
		workspacePathKey.length === 0 ||
		repositoryPathKey === workspacePathKey ||
		!repositoryPathKey.startsWith(`${workspacePathKey}/`)
	) {
		return null;
	}

	return normalizeWorkspacePathForStorage(repositoryPath)
		.replaceAll('\\', '/')
		.replace(/\/+$/u, '')
		.slice(workspacePathKey.length + 1);
}

function createPathBoundaryKey(path: string) {
	return normalizeWorkspacePathForStorage(path)
		.replaceAll('\\', '/')
		.replace(/\/+$/u, '')
		.toLocaleLowerCase('en-US');
}
