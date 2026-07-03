import type { ProjectFormError } from './project-board-errors';
import { deleteProjectCandidate } from './project-board-delete-actions';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import { createRepositoryNameFromRemoteUrl } from './project-board-paths';
import type { SsealedScaffoldScope } from './project-folder';
import {
	submitProjectDialog,
	type ProjectDialogSubmitContext
} from './project-board-submit-actions';
import type {
	ProjectDeleteCandidate,
	ProjectDialogMode,
	ProjectDialogState,
	ProjectRepositorySourceMode
} from './project-board-types';
import type { ProjectRegistry } from './project-registry';

export function createProjectBoardDialogHandlers(context: {
	readonly getWorkspacePath: () => string;
	readonly getRegistry: () => ProjectRegistry;
	readonly getDialog: () => ProjectDialogState | null;
	readonly getFormName: () => string;
	readonly getFormDescription: () => string;
	readonly getFormTags: () => string;
	readonly getRepositorySourceMode: () => ProjectRepositorySourceMode;
	readonly getRepositoryRemoteUrl: () => string;
	readonly getRepositoryGithubCredentialSecretId: () => string;
	readonly getRepositorySsealedScaffoldScope: () => SsealedScaffoldScope;
	readonly getIsSubmitting: () => boolean;
	readonly getDeleteCandidate: () => ProjectDeleteCandidate | null;
	readonly getIsDeleting: () => boolean;
	readonly getShouldDeleteLocalFolder: () => boolean;
	readonly getCanDeleteLocalFolder: () => boolean;
	readonly getDeleteDialogMessages: () => WorkduckMessages['projects']['deleteDialog'];
	readonly getDefaultRepositoryGithubCredentialSecretId: (targetNodeId: string | null) => string;
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly resolveForkCredential: ProjectDialogSubmitContext['resolveForkCredential'];
	readonly closeContextMenu: () => void;
	readonly setDialog: (dialog: ProjectDialogState | null) => void;
	readonly setFormName: (name: string) => void;
	readonly setFormDescription: (description: string) => void;
	readonly setFormTags: (tags: string) => void;
	readonly setRepositorySourceMode: (sourceMode: ProjectRepositorySourceMode) => void;
	readonly setRepositoryRemoteUrl: (remoteUrl: string) => void;
	readonly setRepositoryGithubCredentialSecretId: (secretId: string) => void;
	readonly setRepositorySsealedScaffoldScope: (scope: SsealedScaffoldScope) => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setDeleteCandidate: (candidate: ProjectDeleteCandidate | null) => void;
	readonly setShouldDeleteLocalFolder: (shouldDelete: boolean) => void;
	readonly setIsSubmitting: (isSubmitting: boolean) => void;
	readonly setIsDeleting: (isDeleting: boolean) => void;
	readonly setSelectedProjectId: (projectId: string | null) => void;
	readonly setSelectedGroupId: (groupId: string | null) => void;
	readonly clearDescriptionEditor: () => void;
	readonly clearPublishTarget: () => void;
}) {
	function clearFeedback() {
		context.setFormError(null);
		context.setStatus(null);
	}

	function closeDialog() {
		context.setDialog(null);
		context.setFormName('');
		context.setFormDescription('');
		context.setFormTags('');
		context.setRepositorySourceMode('folder');
		context.setRepositoryRemoteUrl('');
		context.setRepositoryGithubCredentialSecretId('');
		context.setRepositorySsealedScaffoldScope('none');
		context.setFormError(null);
		context.setIsSubmitting(false);
	}

	function closeDeleteDialog() {
		context.setDeleteCandidate(null);
		context.setShouldDeleteLocalFolder(false);
		context.setIsDeleting(false);
	}

	return {
		openDialog(mode: ProjectDialogMode, targetNodeId: string | null = null) {
			context.setDialog({ mode, targetNodeId });
			context.setFormName('');
			context.setFormDescription('');
			context.setFormTags('');
			context.setRepositorySourceMode('folder');
			context.setRepositoryRemoteUrl('');
			context.setRepositoryGithubCredentialSecretId(
				mode === 'repository'
					? context.getDefaultRepositoryGithubCredentialSecretId(targetNodeId)
					: ''
			);
			context.setRepositorySsealedScaffoldScope('none');
			clearFeedback();
			context.setDeleteCandidate(null);
			context.clearDescriptionEditor();
			context.clearPublishTarget();
			context.closeContextMenu();
		},
		closeDialog,
		handleDialogBackdropClick(event: MouseEvent) {
			if (event.target === event.currentTarget) {
				closeDialog();
			}
		},
		selectRepositorySourceMode(sourceMode: ProjectRepositorySourceMode) {
			if (context.getRepositorySourceMode() === sourceMode) {
				return;
			}

			context.setRepositorySourceMode(sourceMode);
			context.setFormName('');
			context.setRepositoryRemoteUrl('');
			context.setRepositorySsealedScaffoldScope('none');
			context.setRepositoryGithubCredentialSecretId(
				sourceMode === 'fork'
					? context.getDefaultRepositoryGithubCredentialSecretId(
							context.getDialog()?.targetNodeId ?? null
						)
					: ''
			);
			clearFeedback();
		},
		closeDeleteDialog,
		handleNameInput: clearFeedback,
		handleRepositoryRemoteUrlInput(event: Event) {
			const target = event.currentTarget;

			if (!(target instanceof HTMLInputElement)) {
				return;
			}

			context.setRepositoryRemoteUrl(target.value);
			context.setFormName(createRepositoryNameFromRemoteUrl(target.value));
			clearFeedback();
		},
		handleRepositorySsealedScaffoldScopeSelect(event: Event) {
			const target = event.currentTarget;

			if (!(target instanceof HTMLSelectElement)) {
				return;
			}

			if (isSsealedScaffoldScope(target.value)) {
				context.setRepositorySsealedScaffoldScope(target.value);
			}

			clearFeedback();
		},
		async handleDialogSubmit(event: SubmitEvent) {
			event.preventDefault();

			const dialog = context.getDialog();

			if (dialog === null || context.getIsSubmitting()) {
				return;
			}

			context.setIsSubmitting(true);
			clearFeedback();

			try {
				await submitProjectDialog(
					{
						dialog,
						workspacePath: context.getWorkspacePath(),
						registry: context.getRegistry(),
						formName: context.getFormName(),
						formDescription: context.getFormDescription(),
						formTags: context.getFormTags(),
						repositorySourceMode: context.getRepositorySourceMode(),
						repositoryRemoteUrl: context.getRepositoryRemoteUrl(),
						repositoryGithubCredentialSecretId:
							context.getRepositoryGithubCredentialSecretId(),
						repositorySsealedScaffoldScope: context.getRepositorySsealedScaffoldScope()
					},
					{
						persistRegistry: context.persistRegistry,
						resolveForkCredential: context.resolveForkCredential,
						setFormError: context.setFormError,
						setStatus: context.setStatus,
						setSelectedProjectId: context.setSelectedProjectId,
						setSelectedGroupId: context.setSelectedGroupId,
						closeDialog
					}
				);
			} finally {
				context.setIsSubmitting(false);
			}
		},
		async handleDeleteConfirm() {
			const candidate = context.getDeleteCandidate();

			if (candidate === null || context.getIsDeleting()) {
				return;
			}

			context.setIsDeleting(true);
			clearFeedback();

			await deleteProjectCandidate(
				{
					candidate,
					registry: context.getRegistry(),
					workspacePath: context.getWorkspacePath(),
					shouldDeleteLocalFolder: context.getShouldDeleteLocalFolder(),
					canDeleteLocalFolder: context.getCanDeleteLocalFolder()
				},
				{
					persistRegistry: context.persistRegistry,
					deleteDialogMessages: context.getDeleteDialogMessages(),
					setFormError: context.setFormError,
					setStatus: context.setStatus,
					setIsDeleting: context.setIsDeleting,
					closeDeleteDialog
				}
			);
		},
		handleDeleteConfirmationBackdropClick(event: MouseEvent) {
			if (event.target === event.currentTarget && !context.getIsDeleting()) {
				closeDeleteDialog();
			}
		}
	};
}

function isSsealedScaffoldScope(value: string): value is SsealedScaffoldScope {
	return (
		value === 'none' ||
		value === 'design' ||
		value === 'frontend' ||
		value === 'backend' ||
		value === 'fullstack'
	);
}
