import {
	deleteProjectNodeFolder,
	deleteProjectRepositoryFolder
} from './project-folder';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { ProjectFormError } from './project-board-errors';
import { getProjectDeleteSuccessStatus } from './project-board-dialog-rules';
import type { ProjectDeleteCandidate } from './project-board-types';
import {
	removeProjectNode,
	removeProjectRepositoryLink,
	type ProjectRegistry
} from './project-registry';

export interface ProjectDeleteActionInput {
	readonly candidate: ProjectDeleteCandidate;
	readonly registry: ProjectRegistry;
	readonly workspacePath: string;
	readonly shouldDeleteLocalFolder: boolean;
	readonly canDeleteLocalFolder: boolean;
}

export interface ProjectDeleteActionContext {
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly deleteDialogMessages: WorkduckMessages['projects']['deleteDialog'];
	readonly setFormError: (error: ProjectFormError) => void;
	readonly setStatus: (status: string) => void;
	readonly setIsDeleting: (isDeleting: boolean) => void;
	readonly closeDeleteDialog: () => void;
}

export async function deleteProjectCandidate(
	input: ProjectDeleteActionInput,
	context: ProjectDeleteActionContext
) {
	if (input.shouldDeleteLocalFolder) {
		if (!input.canDeleteLocalFolder) {
			context.setFormError('project-folder-delete-path-outside-workspace');
			context.setIsDeleting(false);
			return;
		}

		const deleteFolderResult = await deleteSelectedLocalFolder(input.candidate, input.workspacePath);

		if (!deleteFolderResult.ok) {
			context.setFormError(deleteFolderResult.error);
			context.setIsDeleting(false);
			return;
		}
	}

	const result =
		input.candidate.type === 'repository'
			? removeProjectRepositoryLink(input.registry, {
					nodeId: input.candidate.node.id,
					repositoryId: input.candidate.repository.id
				})
			: removeProjectNode(input.registry, input.candidate.node.id);

	if (!result.ok) {
		context.setFormError(result.error);
		context.setIsDeleting(false);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setStatus(
			getProjectDeleteSuccessStatus(
				input.candidate,
				input.shouldDeleteLocalFolder,
				context.deleteDialogMessages
			)
		);
		context.closeDeleteDialog();
		return;
	}

	context.setIsDeleting(false);
}

async function deleteSelectedLocalFolder(
	candidate: ProjectDeleteCandidate,
	workspacePath: string
) {
	if (candidate.type === 'repository') {
		if (candidate.repository.path === null) {
			return {
				ok: false,
				error: 'project-folder-delete-path-required'
			} as const;
		}

		return deleteProjectRepositoryFolder(workspacePath, candidate.repository.path);
	}

	return deleteProjectNodeFolder(workspacePath, candidate.node.path);
}
