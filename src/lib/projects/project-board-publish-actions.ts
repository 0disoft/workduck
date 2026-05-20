import type { ProjectRepositoryGithubVisibility } from './project-repository';
import type { ProjectFormError } from './project-board-errors';
import { DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE } from './project-board-publish-constants';
import {
	publishProjectRepositoryTarget,
	type ProjectRepositoryActionContext
} from './project-board-repository-actions';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';

export interface ProjectRepositoryPublishTarget {
	readonly node: ProjectNodeRecord;
	readonly repository: ProjectRepositoryLinkRecord;
}

export function openProjectRepositoryPublishDialog(
	target: ProjectRepositoryPublishTarget,
	context: {
		readonly isRepositoryPathInsideWorkspace: (path: string) => boolean;
		readonly isRepositoryBusy: (repositoryId: string) => boolean;
		readonly failRepositoryOperation: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord,
			name: 'publish',
			error: ProjectFormError
		) => Promise<void>;
		readonly setPublishTarget: (target: ProjectRepositoryPublishTarget | null) => void;
		readonly setRepositoryName: (name: string) => void;
		readonly setCommitMessage: (message: string) => void;
		readonly setVisibility: (visibility: ProjectRepositoryGithubVisibility) => void;
		readonly setFormError: (error: ProjectFormError | null) => void;
		readonly setStatus: (status: string | null) => void;
		readonly clearDeleteCandidate: () => void;
		readonly clearDialog: () => void;
		readonly closeContextMenu: () => void;
	}
) {
	const { node, repository } = target;

	if (repository.path === null) {
		context.setFormError('project-repository-not-found');
		return;
	}

	if (!context.isRepositoryPathInsideWorkspace(repository.path)) {
		context.setFormError('project-repository-path-outside-workspace');
		void context.failRepositoryOperation(
			node,
			repository,
			'publish',
			'project-repository-path-outside-workspace'
		);
		return;
	}

	if (context.isRepositoryBusy(repository.id)) {
		return;
	}

	context.setPublishTarget(target);
	context.setRepositoryName(repository.name);
	context.setCommitMessage(DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE);
	context.setVisibility('private');
	context.setFormError(null);
	context.setStatus(null);
	context.clearDeleteCandidate();
	context.clearDialog();
	context.closeContextMenu();
}

export function closeProjectRepositoryPublishDialog(context: {
	readonly setPublishTarget: (target: ProjectRepositoryPublishTarget | null) => void;
	readonly setRepositoryName: (name: string) => void;
	readonly setCommitMessage: (message: string) => void;
	readonly setVisibility: (visibility: ProjectRepositoryGithubVisibility) => void;
	readonly setIsPublishing: (isPublishing: boolean) => void;
}) {
	context.setPublishTarget(null);
	context.setRepositoryName('');
	context.setCommitMessage(DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE);
	context.setVisibility('private');
	context.setIsPublishing(false);
}

export function closeProjectRepositoryPublishDialogFromBackdrop(
	event: MouseEvent,
	input: {
		readonly isPublishing: boolean;
		readonly closeDialog: () => void;
	}
) {
	if (event.target === event.currentTarget && !input.isPublishing) {
		input.closeDialog();
	}
}

export async function submitProjectRepositoryPublishDialog(
	event: SubmitEvent,
	input: {
		readonly target: ProjectRepositoryPublishTarget | null;
		readonly isPublishing: boolean;
		readonly repositoryName: string;
		readonly commitMessage: string;
		readonly visibility: ProjectRepositoryGithubVisibility;
	},
	context: {
		readonly createRepositoryActionContext: () => ProjectRepositoryActionContext;
	}
) {
	event.preventDefault();

	if (input.target === null || input.isPublishing) {
		return;
	}

	await publishProjectRepositoryTarget(
		input.target,
		{
			repositoryName: input.repositoryName,
			commitMessage: input.commitMessage,
			visibility: input.visibility
		},
		context.createRepositoryActionContext()
	);
}
