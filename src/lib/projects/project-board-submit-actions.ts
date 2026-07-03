import {
	createProjectFolder,
	createProjectGroupFolder,
	type SsealedScaffoldScope
} from './project-folder';
import type { ProjectFormError } from './project-board-errors';
import {
	createProjectFolderNameFromDisplayName,
	createRepositoryNameFromRemoteUrl,
	createWorkspaceChildPath
} from './project-board-paths';
import { validateTagsInput } from './project-board-selectors';
import type {
	ProjectDialogState,
	ProjectRepositorySourceMode
} from './project-board-types';
import {
	addProjectNode,
	addProjectRepositoryLink,
	type ProjectRegistry
} from './project-registry';
import {
	cloneForkedProjectRepository,
	createGithubRepositoryFork,
	type ProjectRepositoryGitCredentialInput
} from './project-repository';
import {
	writeProjectRepositoryImportAttemptRecord,
	type ProjectRepositoryImportAttemptPhase,
	type ProjectRepositoryImportAttemptRecord,
	type ProjectRepositoryImportAttemptState
} from './project-import-attempt-storage';

export interface ProjectDialogSubmitInput {
	readonly dialog: ProjectDialogState;
	readonly workspacePath: string;
	readonly registry: ProjectRegistry;
	readonly formName: string;
	readonly formDescription: string;
	readonly formTags: string;
	readonly repositorySourceMode: ProjectRepositorySourceMode;
	readonly repositoryRemoteUrl: string;
	readonly repositoryGithubCredentialSecretId: string;
	readonly repositorySsealedScaffoldScope: SsealedScaffoldScope;
}

export interface ProjectDialogSubmitContext {
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly resolveForkCredential: (
		secretId: string
	) => ProjectRepositoryGitCredentialInput | ProjectFormError;
	readonly setFormError: (error: ProjectFormError) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setSelectedProjectId: (projectId: string | null) => void;
	readonly setSelectedGroupId: (groupId: string | null) => void;
	readonly closeDialog: () => void;
}

export async function submitProjectDialog(
	input: ProjectDialogSubmitInput,
	context: ProjectDialogSubmitContext
) {
	if (input.dialog.mode === 'repository') {
		await submitRepositoryLink(input.dialog.targetNodeId, input, context);
		return;
	}

	const tagsResult = validateTagsInput(input.formTags);

	if (!tagsResult.ok) {
		context.setFormError(tagsResult.error);
		return;
	}

	const folderResult =
		input.dialog.mode === 'project'
			? await createProjectFolder(
					input.workspacePath,
					createProjectFolderNameFromDisplayName(input.formName)
				)
			: await createGroupFolder(input.dialog.targetNodeId, input.formName, input, context);

	if (!folderResult.ok) {
		context.setFormError(folderResult.error);
		return;
	}

	const result = addProjectNode(input.registry, {
		kind: input.dialog.mode,
		parentId: input.dialog.targetNodeId,
		name: input.formName,
		description: input.formDescription,
		path: folderResult.relativePath,
		tags: tagsResult.tags
	});

	if (!result.ok) {
		context.setFormError(result.error);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		const createdNode =
			result.registry.nodes.find((node) => node.path === folderResult.relativePath) ?? null;

		if (createdNode?.kind === 'project') {
			context.setSelectedProjectId(createdNode.id);
			context.setSelectedGroupId(null);
		} else if (createdNode?.kind === 'group') {
			context.setSelectedProjectId(createdNode.parentId);
			context.setSelectedGroupId(createdNode.id);
		}

		context.setStatus(input.dialog.mode === 'project' ? 'Project created.' : 'Group created.');
		context.closeDialog();
	}
}

async function createGroupFolder(
	targetNodeId: string | null,
	name: string,
	input: ProjectDialogSubmitInput,
	context: ProjectDialogSubmitContext
) {
	if (targetNodeId === null) {
		return { ok: false, error: 'project-parent-not-found' } as const;
	}

	const targetNode = input.registry.nodes.find((node) => node.id === targetNodeId);

	if (targetNode === undefined) {
		return { ok: false, error: 'project-parent-not-found' } as const;
	}

	if (targetNode.kind !== 'project') {
		return { ok: false, error: 'project-parent-invalid' } as const;
	}

	return createProjectGroupFolder(
		input.workspacePath,
		targetNode.path,
		createProjectFolderNameFromDisplayName(name)
	);
}

async function submitRepositoryLink(
	targetNodeId: string | null,
	input: ProjectDialogSubmitInput,
	context: ProjectDialogSubmitContext
) {
	if (targetNodeId === null) {
		context.setFormError('project-node-not-found');
		return;
	}

	const targetNode = input.registry.nodes.find((node) => node.id === targetNodeId);

	if (targetNode === undefined) {
		context.setFormError('project-node-not-found');
		return;
	}

	if (targetNode.kind !== 'group') {
		context.setFormError('project-repository-target-invalid');
		return;
	}

	if (input.repositorySourceMode === 'remote') {
		await submitRemoteRepositoryLink(targetNodeId, input, context);
		return;
	}

	if (input.repositorySourceMode === 'fork') {
		await submitForkedRepositoryLink(targetNodeId, targetNode.path, input, context);
		return;
	}

	const tagsResult = validateTagsInput(input.formTags);

	if (!tagsResult.ok) {
		context.setFormError(tagsResult.error);
		return;
	}

	const folderResult = await createProjectGroupFolder(
		input.workspacePath,
		targetNode.path,
		createProjectFolderNameFromDisplayName(input.formName),
		{ ssealedScaffoldScope: input.repositorySsealedScaffoldScope }
	);

	if (!folderResult.ok) {
		context.setFormError(folderResult.error);
		return;
	}

	const result = addProjectRepositoryLink(input.registry, {
		nodeId: targetNodeId,
		name: input.formName,
		path: createWorkspaceChildPath(input.workspacePath, folderResult.relativePath),
		remoteUrl: null,
		tags: tagsResult.tags
	});

	if (!result.ok) {
		context.setFormError(result.error);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setSelectedGroupId(targetNode.id);
		context.setStatus(
			input.repositorySsealedScaffoldScope === 'none'
				? 'Repository folder created.'
				: `Repository folder created with ssealed ${input.repositorySsealedScaffoldScope} scaffold.`
		);
		context.closeDialog();
	}
}

async function submitRemoteRepositoryLink(
	targetNodeId: string,
	input: ProjectDialogSubmitInput,
	context: ProjectDialogSubmitContext
) {
	const repositoryName = createRepositoryNameFromRemoteUrl(input.repositoryRemoteUrl);

	if (repositoryName.length === 0) {
		context.setFormError('project-repository-remote-url-invalid');
		return;
	}

	const tagsResult = validateTagsInput(input.formTags);

	if (!tagsResult.ok) {
		context.setFormError(tagsResult.error);
		return;
	}

	const result = addProjectRepositoryLink(input.registry, {
		nodeId: targetNodeId,
		name: repositoryName,
		path: null,
		remoteUrl: input.repositoryRemoteUrl,
		tags: tagsResult.tags
	});

	if (!result.ok) {
		context.setFormError(result.error);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setSelectedGroupId(targetNodeId);
		context.setStatus('Repository registered.');
		context.closeDialog();
	}
}

async function submitForkedRepositoryLink(
	targetNodeId: string,
	groupRelativePath: string,
	input: ProjectDialogSubmitInput,
	context: ProjectDialogSubmitContext
) {
	const repositoryName = createRepositoryNameFromRemoteUrl(input.repositoryRemoteUrl);

	if (repositoryName.length === 0) {
		context.setFormError('project-repository-remote-url-invalid');
		return;
	}

	const tagsResult = validateTagsInput(input.formTags);

	if (!tagsResult.ok) {
		context.setFormError(tagsResult.error);
		return;
	}

	const predictedRepositoryPath = createWorkspaceChildPath(
		input.workspacePath,
		`${groupRelativePath}/${repositoryName}`
	);
	const preflightResult = addProjectRepositoryLink(input.registry, {
		nodeId: targetNodeId,
		name: repositoryName,
		path: predictedRepositoryPath,
		remoteUrl: null,
		tags: tagsResult.tags
	});

	if (!preflightResult.ok) {
		context.setFormError(preflightResult.error);
		return;
	}

	let importAttempt: ProjectRepositoryImportAttemptRecord = createProjectRepositoryImportAttempt({
		workspaceId: input.registry.workspaceId,
		nodeId: targetNodeId,
		repositoryName,
		upstreamRemoteUrl: input.repositoryRemoteUrl,
		targetPath: predictedRepositoryPath
	});
	await recordProjectRepositoryImportAttempt(importAttempt);

	const credential = context.resolveForkCredential(input.repositoryGithubCredentialSecretId);

	if (typeof credential === 'string') {
		importAttempt = await finishProjectRepositoryImportAttempt(importAttempt, {
			state: 'failed',
			phase: 'preflight',
			errorCode: credential
		});
		context.setFormError(credential);
		return;
	}

	context.setStatus('Creating fork.');
	importAttempt = await updateProjectRepositoryImportAttempt(importAttempt, {
		phase: 'creating-fork'
	});
	const forkResult = await createGithubRepositoryFork({
		upstreamRemoteUrl: input.repositoryRemoteUrl,
		credential
	});

	if (!forkResult.ok) {
		importAttempt = await finishProjectRepositoryImportAttempt(importAttempt, {
			state: 'failed',
			phase: 'creating-fork',
			errorCode: forkResult.error
		});
		context.setFormError(forkResult.error);
		context.setStatus(null);
		return;
	}

	importAttempt = await updateProjectRepositoryImportAttempt(importAttempt, {
		phase: 'cloning-fork',
		upstreamRemoteUrl: forkResult.upstreamRemoteUrl,
		forkRemoteUrl: forkResult.remoteUrl
	});
	const forkPreflightResult = addProjectRepositoryLink(input.registry, {
		nodeId: targetNodeId,
		name: repositoryName,
		path: predictedRepositoryPath,
		remoteUrl: forkResult.remoteUrl,
		upstreamRemoteUrl: forkResult.upstreamRemoteUrl,
		githubCredentialSecretId: input.repositoryGithubCredentialSecretId,
		tags: tagsResult.tags
	});

	if (!forkPreflightResult.ok) {
		importAttempt = await finishProjectRepositoryImportAttempt(importAttempt, {
			state: 'failed',
			phase: 'cloning-fork',
			errorCode: forkPreflightResult.error
		});
		context.setFormError(forkPreflightResult.error);
		return;
	}

	context.setStatus('Cloning fork.');
	const cloneResult = await cloneForkedProjectRepository({
		workspacePath: input.workspacePath,
		groupRelativePath,
		repositoryName,
		remoteUrl: forkResult.remoteUrl,
		upstreamRemoteUrl: forkResult.upstreamRemoteUrl,
		credential
	});

	if (!cloneResult.ok) {
		importAttempt = await finishProjectRepositoryImportAttempt(importAttempt, {
			state: 'failed',
			phase: 'cloning-fork',
			errorCode: cloneResult.error
		});
		context.setFormError(cloneResult.error);
		context.setStatus(null);
		return;
	}

	importAttempt = await updateProjectRepositoryImportAttempt(importAttempt, {
		phase: 'persisting-registry',
		targetPath: cloneResult.path
	});
	const result = addProjectRepositoryLink(input.registry, {
		nodeId: targetNodeId,
		name: repositoryName,
		path: cloneResult.path,
		remoteUrl: forkResult.remoteUrl,
		upstreamRemoteUrl: forkResult.upstreamRemoteUrl,
		githubCredentialSecretId: input.repositoryGithubCredentialSecretId,
		tags: tagsResult.tags
	});

	if (!result.ok) {
		importAttempt = await finishProjectRepositoryImportAttempt(importAttempt, {
			state: 'failed',
			phase: 'persisting-registry',
			errorCode: result.error
		});
		context.setFormError(result.error);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		await finishProjectRepositoryImportAttempt(importAttempt, {
			state: 'succeeded',
			phase: 'completed',
			errorCode: null
		});
		context.setSelectedGroupId(targetNodeId);
		context.setStatus('Fork cloned.');
		context.closeDialog();
		return;
	}

	await finishProjectRepositoryImportAttempt(importAttempt, {
		state: 'failed',
		phase: 'persisting-registry',
		errorCode: 'project-registry-write-failed'
	});
}

function createProjectRepositoryImportAttempt(input: {
	readonly workspaceId: string;
	readonly nodeId: string;
	readonly repositoryName: string;
	readonly upstreamRemoteUrl: string;
	readonly targetPath: string;
}): ProjectRepositoryImportAttemptRecord {
	const now = new Date().toISOString();

	return {
		id: createProjectRepositoryImportAttemptRecordId(),
		workspaceId: input.workspaceId,
		nodeId: input.nodeId,
		repositoryName: input.repositoryName,
		sourceKind: 'fork',
		state: 'running',
		phase: 'preflight',
		upstreamRemoteUrl: input.upstreamRemoteUrl,
		forkRemoteUrl: null,
		targetPath: input.targetPath,
		errorCode: null,
		startedAt: now,
		updatedAt: now,
		finishedAt: null
	} satisfies ProjectRepositoryImportAttemptRecord;
}

async function updateProjectRepositoryImportAttempt(
	attempt: ProjectRepositoryImportAttemptRecord,
	update: Partial<
		Pick<
			ProjectRepositoryImportAttemptRecord,
			'phase' | 'upstreamRemoteUrl' | 'forkRemoteUrl' | 'targetPath'
		>
	>
) {
	const nextAttempt = {
		...attempt,
		...update,
		updatedAt: new Date().toISOString()
	} satisfies ProjectRepositoryImportAttemptRecord;

	await recordProjectRepositoryImportAttempt(nextAttempt);

	return nextAttempt;
}

async function finishProjectRepositoryImportAttempt(
	attempt: ProjectRepositoryImportAttemptRecord,
	update: {
		readonly state: Exclude<ProjectRepositoryImportAttemptState, 'running'>;
		readonly phase: ProjectRepositoryImportAttemptPhase;
		readonly errorCode: string | null;
	}
) {
	const now = new Date().toISOString();
	const nextAttempt = {
		...attempt,
		state: update.state,
		phase: update.phase,
		errorCode: update.errorCode,
		updatedAt: now,
		finishedAt: now
	} satisfies ProjectRepositoryImportAttemptRecord;

	await recordProjectRepositoryImportAttempt(nextAttempt);

	return nextAttempt;
}

async function recordProjectRepositoryImportAttempt(
	attempt: ProjectRepositoryImportAttemptRecord
) {
	await writeProjectRepositoryImportAttemptRecord(attempt);
}

function createProjectRepositoryImportAttemptRecordId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `repository-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
