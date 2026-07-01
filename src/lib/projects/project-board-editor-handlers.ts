import type { EnvironmentVault } from '$lib/environment/environment-vault';
import type { SecretVaultEnvelope } from '$lib/environment/secret-vault-crypto';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { ProjectFormError } from './project-board-errors';
import {
	saveProjectGithubCredential,
	unlockProjectEnvironmentVault
} from './project-board-github-credential-actions';
import {
	saveProjectDescription,
	saveProjectNodeDetails,
	saveProjectRepositoryRemoteUrl,
	saveProjectTags
} from './project-board-editor-actions';
import { formatTagsInput } from './project-board-selectors';
import type {
	ProjectGithubCredentialEditorTarget,
	ProjectRepositoryRemoteUrlEditorTarget,
	ProjectTagEditorTarget
} from './project-board-types';
import type { ProjectNodeRecord, ProjectRegistry } from './project-registry';

export function createProjectBoardEditorHandlers(context: {
	readonly getRegistry: () => ProjectRegistry;
	readonly getWorkspaceId: () => string;
	readonly getDescriptionEditor: () => ProjectNodeRecord | null;
	readonly getDescriptionInput: () => string;
	readonly getIsSavingDescription: () => boolean;
	readonly getDetailsEditor: () => ProjectNodeRecord | null;
	readonly getDetailsNameInput: () => string;
	readonly getDetailsPathInput: () => string;
	readonly getDetailsSavedStatus: () => string;
	readonly getGithubCredentialSavedStatus: () => string;
	readonly getIsSavingDetails: () => boolean;
	readonly getTagEditor: () => ProjectTagEditorTarget | null;
	readonly getTagInput: () => string;
	readonly getIsSavingTags: () => boolean;
	readonly getGithubCredentialEditor: () => ProjectGithubCredentialEditorTarget | null;
	readonly getRemoteUrlEditor: () => ProjectRepositoryRemoteUrlEditorTarget | null;
	readonly getRemoteUrlInput: () => string;
	readonly getSelectedGithubCredentialSecretId: () => string;
	readonly getIsSubmitting: () => boolean;
	readonly getIsSavingRemoteUrl: () => boolean;
	readonly getEnvironmentVault: () => EnvironmentVault | null;
	readonly getEnvironmentVaultEnvelope: () => SecretVaultEnvelope | null;
	readonly getEnvironmentVaultPassword: () => string;
	readonly getIsEnvironmentVaultBusy: () => boolean;
	readonly getEnvironmentMessages: () => WorkduckMessages['environment'];
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly setDescriptionEditor: (editor: ProjectNodeRecord | null) => void;
	readonly setDescriptionInput: (input: string) => void;
	readonly setIsSavingDescription: (isSaving: boolean) => void;
	readonly setDetailsEditor: (editor: ProjectNodeRecord | null) => void;
	readonly setDetailsNameInput: (input: string) => void;
	readonly setDetailsPathInput: (input: string) => void;
	readonly setIsSavingDetails: (isSaving: boolean) => void;
	readonly setTagEditor: (editor: ProjectTagEditorTarget | null) => void;
	readonly setTagInput: (input: string) => void;
	readonly setIsSavingTags: (isSaving: boolean) => void;
	readonly setGithubCredentialEditor: (
		editor: ProjectGithubCredentialEditorTarget | null
	) => void;
	readonly setRemoteUrlEditor: (editor: ProjectRepositoryRemoteUrlEditorTarget | null) => void;
	readonly setRemoteUrlInput: (input: string) => void;
	readonly setSelectedGithubCredentialSecretId: (secretId: string) => void;
	readonly setIsSubmitting: (isSubmitting: boolean) => void;
	readonly setIsSavingRemoteUrl: (isSaving: boolean) => void;
	readonly setEnvironmentVault: (vault: EnvironmentVault) => void;
	readonly setEnvironmentVaultPassword: (password: string) => void;
	readonly setEnvironmentVaultError: (error: string | null) => void;
	readonly setIsEnvironmentVaultBusy: (isBusy: boolean) => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly clearDeleteCandidate: () => void;
	readonly clearPublishTarget: () => void;
	readonly clearTagEditor: () => void;
	readonly clearDescriptionEditor: () => void;
	readonly clearDetailsEditor: () => void;
	readonly clearRemoteUrlEditor: () => void;
	readonly clearDialog: () => void;
}) {
	function clearFeedback() {
		context.setFormError(null);
		context.setStatus(null);
	}

	function closeDescriptionEditor() {
		context.setDescriptionEditor(null);
		context.setDescriptionInput('');
		context.setIsSavingDescription(false);
	}

	function closeDetailsEditor() {
		context.setDetailsEditor(null);
		context.setDetailsNameInput('');
		context.setDetailsPathInput('');
		context.setIsSavingDetails(false);
	}

	function closeTagEditor() {
		context.setTagEditor(null);
		context.setTagInput('');
		context.setIsSavingTags(false);
	}

	function closeGithubCredentialEditor() {
		context.setGithubCredentialEditor(null);
		context.setSelectedGithubCredentialSecretId('');
		context.setIsSubmitting(false);
	}

	function closeRemoteUrlEditor() {
		context.setRemoteUrlEditor(null);
		context.setRemoteUrlInput('');
		context.setIsSavingRemoteUrl(false);
	}

	return {
		openDescriptionEditor(node: ProjectNodeRecord) {
			context.setDescriptionEditor(node);
			context.setDescriptionInput(node.description);
			clearFeedback();
			context.clearDeleteCandidate();
			context.clearPublishTarget();
			context.clearTagEditor();
			context.clearDetailsEditor();
			context.clearRemoteUrlEditor();
			context.clearDialog();
		},
		closeDescriptionEditor,
		openDetailsEditor(node: ProjectNodeRecord) {
			context.setDetailsEditor(node);
			context.setDetailsNameInput(node.name);
			context.setDetailsPathInput(node.path);
			clearFeedback();
			context.clearDeleteCandidate();
			context.clearDescriptionEditor();
			context.clearPublishTarget();
			context.clearTagEditor();
			context.clearRemoteUrlEditor();
			context.clearDialog();
		},
		closeDetailsEditor,
		handleDetailsEditorInput: clearFeedback,
		handleDetailsEditorBackdropClick(event: MouseEvent) {
			if (event.target === event.currentTarget && !context.getIsSavingDetails()) {
				closeDetailsEditor();
			}
		},
		async handleDetailsEditorSubmit(event: SubmitEvent) {
			event.preventDefault();

			await saveProjectNodeDetails(
				{
					editor: context.getDetailsEditor(),
					name: context.getDetailsNameInput(),
					path: context.getDetailsPathInput(),
					registry: context.getRegistry(),
					isSaving: context.getIsSavingDetails()
				},
				{
					persistRegistry: context.persistRegistry,
					savedStatus: context.getDetailsSavedStatus(),
					setFormError: context.setFormError,
					setStatus: context.setStatus,
					setIsSaving: context.setIsSavingDetails,
					closeEditor: closeDetailsEditor
				}
			);
		},
		handleDescriptionEditorInput: clearFeedback,
		handleDescriptionEditorBackdropClick(event: MouseEvent) {
			if (event.target === event.currentTarget && !context.getIsSavingDescription()) {
				closeDescriptionEditor();
			}
		},
		async handleDescriptionEditorSubmit(event: SubmitEvent) {
			event.preventDefault();

			await saveProjectDescription(
				{
					editor: context.getDescriptionEditor(),
					description: context.getDescriptionInput(),
					registry: context.getRegistry(),
					isSaving: context.getIsSavingDescription()
				},
				{
					persistRegistry: context.persistRegistry,
					setFormError: context.setFormError,
					setStatus: context.setStatus,
					setIsSaving: context.setIsSavingDescription,
					closeEditor: closeDescriptionEditor
				}
			);
		},
		openTagEditor(target: ProjectTagEditorTarget) {
			context.setTagEditor(target);
			context.setTagInput(
				formatTagsInput(target.type === 'repository' ? target.repository.tags : target.node.tags)
			);
			clearFeedback();
			context.clearDeleteCandidate();
			context.clearDescriptionEditor();
			context.clearDetailsEditor();
			context.clearPublishTarget();
			context.clearRemoteUrlEditor();
			context.clearDialog();
		},
		closeTagEditor,
		openGithubCredentialEditor(target: ProjectGithubCredentialEditorTarget) {
			context.setGithubCredentialEditor(target);
			context.setSelectedGithubCredentialSecretId(
				target.type === 'repository'
					? target.repository.githubCredentialSecretId ?? ''
					: target.node.githubCredentialSecretId ?? ''
			);
			clearFeedback();
			context.clearDeleteCandidate();
			context.clearDescriptionEditor();
			context.clearTagEditor();
			context.clearDetailsEditor();
			context.clearPublishTarget();
			context.clearRemoteUrlEditor();
			context.clearDialog();
		},
		closeGithubCredentialEditor,
		handleGithubCredentialEditorBackdropClick(event: MouseEvent) {
			if (
				event.target === event.currentTarget &&
				!context.getIsSubmitting() &&
				!context.getIsEnvironmentVaultBusy()
			) {
				closeGithubCredentialEditor();
			}
		},
		async handleUnlockProjectEnvironmentVault(event: SubmitEvent) {
			event.preventDefault();

			await unlockProjectEnvironmentVault(
				{
					envelope: context.getEnvironmentVaultEnvelope(),
					password: context.getEnvironmentVaultPassword(),
					workspaceId: context.getWorkspaceId(),
					isBusy: context.getIsEnvironmentVaultBusy()
				},
				{
					setIsBusy: context.setIsEnvironmentVaultBusy,
					setVault: context.setEnvironmentVault,
					setPassword: context.setEnvironmentVaultPassword,
					setVaultError: context.setEnvironmentVaultError,
					setFormError: context.setFormError,
					getEnvironmentMessages: context.getEnvironmentMessages
				}
			);
		},
		async handleGithubCredentialSubmit(event: SubmitEvent) {
			event.preventDefault();

			await saveProjectGithubCredential(
				{
					editor: context.getGithubCredentialEditor(),
					registry: context.getRegistry(),
					selectedSecretId: context.getSelectedGithubCredentialSecretId(),
					isSubmitting: context.getIsSubmitting(),
					environmentVault: context.getEnvironmentVault()
				},
				{
					persistRegistry: context.persistRegistry,
					setIsSubmitting: context.setIsSubmitting,
					setFormError: context.setFormError,
					setStatus: context.setStatus,
					getSavedStatus: context.getGithubCredentialSavedStatus,
					closeEditor: closeGithubCredentialEditor
				}
			);
		},
		openRemoteUrlEditor(target: ProjectRepositoryRemoteUrlEditorTarget) {
			context.setRemoteUrlEditor(target);
			context.setRemoteUrlInput(target.repository.remoteUrl ?? '');
			clearFeedback();
			context.clearDeleteCandidate();
			context.clearDescriptionEditor();
			context.clearTagEditor();
			context.clearDetailsEditor();
			context.clearPublishTarget();
			context.clearDialog();
		},
		closeRemoteUrlEditor,
		handleRemoteUrlEditorInput: clearFeedback,
		handleRemoteUrlEditorBackdropClick(event: MouseEvent) {
			if (event.target === event.currentTarget && !context.getIsSavingRemoteUrl()) {
				closeRemoteUrlEditor();
			}
		},
		async handleRemoteUrlEditorSubmit(event: SubmitEvent) {
			event.preventDefault();

			await saveProjectRepositoryRemoteUrl(
				{
					editor: context.getRemoteUrlEditor(),
					remoteUrlInput: context.getRemoteUrlInput(),
					registry: context.getRegistry(),
					isSaving: context.getIsSavingRemoteUrl()
				},
				{
					persistRegistry: context.persistRegistry,
					setFormError: context.setFormError,
					setStatus: context.setStatus,
					setIsSaving: context.setIsSavingRemoteUrl,
					closeEditor: closeRemoteUrlEditor
				}
			);
		},
		handleTagInput: clearFeedback,
		handleTagEditorInput: clearFeedback,
		handleTagFilterInput() {
			context.setStatus(null);
		},
		handleTagEditorBackdropClick(event: MouseEvent) {
			if (event.target === event.currentTarget && !context.getIsSavingTags()) {
				closeTagEditor();
			}
		},
		async handleTagEditorSubmit(event: SubmitEvent) {
			event.preventDefault();

			await saveProjectTags(
				{
					editor: context.getTagEditor(),
					tagInput: context.getTagInput(),
					registry: context.getRegistry(),
					isSaving: context.getIsSavingTags()
				},
				{
					persistRegistry: context.persistRegistry,
					setFormError: context.setFormError,
					setStatus: context.setStatus,
					setIsSaving: context.setIsSavingTags,
					closeEditor: closeTagEditor
				}
			);
		}
	};
}
