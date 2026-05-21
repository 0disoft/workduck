import {
	createProjectFolder,
	createProjectGroupFolder
} from './project-folder';
import type { ProjectFormError } from './project-board-errors';
import {
	createProjectFolderNameFromDisplayName,
	createRepositoryNameFromRemoteUrl,
	createWorkspaceChildPath
} from './project-board-paths';
import { parseTagsInput } from './project-board-selectors';
import type {
	ProjectDialogState,
	ProjectRepositorySourceMode
} from './project-board-types';
import {
	addProjectNode,
	addProjectRepositoryLink,
	type ProjectRegistry
} from './project-registry';

export interface ProjectDialogSubmitInput {
	readonly dialog: ProjectDialogState;
	readonly workspacePath: string;
	readonly registry: ProjectRegistry;
	readonly formName: string;
	readonly formDescription: string;
	readonly formTags: string;
	readonly repositorySourceMode: ProjectRepositorySourceMode;
	readonly repositoryRemoteUrl: string;
}

export interface ProjectDialogSubmitContext {
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly setFormError: (error: ProjectFormError) => void;
	readonly setStatus: (status: string) => void;
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
		tags: parseTagsInput(input.formTags)
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

	const folderResult = await createProjectGroupFolder(
		input.workspacePath,
		targetNode.path,
		createProjectFolderNameFromDisplayName(input.formName)
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
		tags: parseTagsInput(input.formTags)
	});

	if (!result.ok) {
		context.setFormError(result.error);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setSelectedGroupId(targetNode.id);
		context.setStatus('Repository folder created.');
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

	const result = addProjectRepositoryLink(input.registry, {
		nodeId: targetNodeId,
		name: repositoryName,
		path: null,
		remoteUrl: input.repositoryRemoteUrl,
		tags: parseTagsInput(input.formTags)
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
