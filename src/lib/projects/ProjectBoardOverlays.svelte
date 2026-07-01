<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { EnvironmentVault } from '$lib/environment/environment-vault';
	import type { SecretVaultEnvelope } from '$lib/environment/secret-vault-crypto';
	import type { ProjectFormError } from './project-board-errors';
	import type { GithubCredentialOption } from './project-board-github-credentials';
	import type {
		ProjectContextMenuState,
		ProjectDeleteCandidate,
		ProjectDialogState,
		ProjectGithubCredentialEditorTarget,
		ProjectRepositoryRemoteUrlEditorTarget,
		ProjectRepositorySourceMode,
		ProjectRepositoryTarget,
		ProjectTagEditorTarget
	} from './project-board-types';
	import type { ProjectRepositoryGithubVisibility } from './project-repository';
	import type { ProjectRepositoryTask } from './project-repository-task';
	import type { ProjectRegistryStorageError } from './project-storage';
	import ProjectContextMenu from './ProjectContextMenu.svelte';
	import ProjectDeleteDialog from './ProjectDeleteDialog.svelte';
	import ProjectDescriptionDialog from './ProjectDescriptionDialog.svelte';
	import ProjectGithubCredentialDialog from './ProjectGithubCredentialDialog.svelte';
	import ProjectNodeDetailsDialog from './ProjectNodeDetailsDialog.svelte';
	import ProjectNodeDialog from './ProjectNodeDialog.svelte';
	import ProjectPublishDialog from './ProjectPublishDialog.svelte';
	import ProjectRemoteUrlDialog from './ProjectRemoteUrlDialog.svelte';
	import ProjectTagDialog from './ProjectTagDialog.svelte';

	interface Props {
		readonly contextMenu: ProjectContextMenuState | null;
		readonly projectMessages: WorkduckMessages['projects'];
		contextMenuElement: HTMLElement | undefined;
		shouldDeleteLocalFolder: boolean;
		descriptionInput: string;
		detailsNameInput: string;
		detailsPathInput: string;
		tagInput: string;
		remoteUrlInput: string;
		environmentVaultPassword: string;
		selectedGithubCredentialSecretId: string;
		githubRepositoryName: string;
		githubRepositoryCommitMessage: string;
		formName: string;
		formDescription: string;
		formTags: string;
		repositoryRemoteUrl: string;
		repositoryGithubCredentialSecretId: string;
		readonly deleteCandidate: ProjectDeleteCandidate | null;
		readonly descriptionEditor: import('./project-registry').ProjectNodeRecord | null;
		readonly detailsEditor: import('./project-registry').ProjectNodeRecord | null;
		readonly tagEditor: ProjectTagEditorTarget | null;
		readonly githubCredentialEditor: ProjectGithubCredentialEditorTarget | null;
		readonly remoteUrlEditor: ProjectRepositoryRemoteUrlEditorTarget | null;
		readonly publishTarget: ProjectRepositoryTarget | null;
		readonly dialog: ProjectDialogState | null;
		readonly dialogTargetNodeName: string | null;
		readonly repositorySourceMode: ProjectRepositorySourceMode;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isDeleting: boolean;
		readonly canConfirmDelete: boolean;
		readonly canDeleteLocalFolder: boolean;
		readonly isSavingDescription: boolean;
		readonly canSaveDescription: boolean;
		readonly isSavingDetails: boolean;
		readonly canSaveDetails: boolean;
		readonly isSavingTags: boolean;
		readonly canSaveTags: boolean;
		readonly isSavingRemoteUrl: boolean;
		readonly canSaveRemoteUrl: boolean;
		readonly environmentVaultEnvelope: SecretVaultEnvelope | null;
		readonly environmentVault: EnvironmentVault | null;
		readonly environmentVaultError: string | null;
		readonly githubCredentialOptions: readonly GithubCredentialOption[];
		readonly isEnvironmentVaultBusy: boolean;
		readonly isSubmitting: boolean;
		readonly canSaveGithubCredential: boolean;
		readonly githubRepositoryVisibility: ProjectRepositoryGithubVisibility;
		readonly isPublishingRepository: boolean;
		readonly canSubmitPublishRepository: boolean;
		readonly canSubmitDialog: boolean;
		readonly canOpenContextFolder: boolean;
		readonly canCloneContextRepository: boolean;
		readonly canInitializeContextRepository: boolean;
		readonly canPublishContextRepository: boolean;
		readonly canEditContextGithubCredential: boolean;
		readonly getDeleteDialogTitle: () => string;
		readonly getDeleteDialogText: () => string;
		readonly getDeleteLocalFolderLabel: () => string;
		readonly getDeleteLocalFolderUnavailableText: () => string;
		readonly getVisibleFormErrorMessage: () => string;
		readonly getTagsInputMaxLength: () => number;
		readonly getDialogTitle: () => string;
		readonly getDialogSubmitLabel: () => string;
		readonly isRepositoryRemoteUrlError: (error: ProjectFormError | null) => boolean;
		readonly onOpenFolder: () => Promise<void>;
		readonly onEditDetails: () => void;
		readonly onEditDescription: () => void;
		readonly onEditGithubCredential: () => void;
		readonly onEditRemoteUrl: () => void;
		readonly onEditTags: () => void;
		readonly onDelete: () => void;
		readonly onCloneRepository: () => Promise<void>;
		readonly onInitializeRepository: () => Promise<void>;
		readonly onPublishRepository: () => void;
		readonly onRepositoryTask: (task: ProjectRepositoryTask) => Promise<void>;
		readonly onDeleteBackdropClick: (event: MouseEvent) => void;
		readonly onDeleteClose: () => void;
		readonly onDeleteConfirm: () => Promise<void>;
		readonly onDescriptionInput: () => void;
		readonly onDescriptionSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onDescriptionBackdropClick: (event: MouseEvent) => void;
		readonly onDescriptionClose: () => void;
		readonly onDetailsInput: () => void;
		readonly onDetailsSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onDetailsBackdropClick: (event: MouseEvent) => void;
		readonly onDetailsClose: () => void;
		readonly onTagInput: () => void;
		readonly onTagSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onTagBackdropClick: (event: MouseEvent) => void;
		readonly onTagClose: () => void;
		readonly onRemoteUrlInput: () => void;
		readonly onRemoteUrlSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onRemoteUrlBackdropClick: (event: MouseEvent) => void;
		readonly onRemoteUrlClose: () => void;
		readonly onUnlock: (event: SubmitEvent) => Promise<void>;
		readonly onGithubCredentialSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onGithubCredentialBackdropClick: (event: MouseEvent) => void;
		readonly onGithubCredentialClose: () => void;
		readonly onRepositoryNameInput: () => void;
		readonly onCommitMessageInput: () => void;
		readonly onSelectVisibility: (visibility: ProjectRepositoryGithubVisibility) => void;
		readonly onPublishSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onPublishBackdropClick: (event: MouseEvent) => void;
		readonly onPublishClose: () => void;
		readonly onNameInput: () => void;
		readonly onDialogDescriptionInput: () => void;
		readonly onDialogTagsInput: () => void;
		readonly onRepositoryRemoteUrlInput: (event: Event) => void;
		readonly onRepositoryGithubCredentialSelect: (event: Event) => void;
		readonly onSelectRepositorySourceMode: (sourceMode: ProjectRepositorySourceMode) => void;
		readonly onDialogSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onDialogBackdropClick: (event: MouseEvent) => void;
		readonly onDialogClose: () => void;
	}

	let {
		contextMenu, projectMessages, contextMenuElement = $bindable(), shouldDeleteLocalFolder = $bindable(),
		descriptionInput = $bindable(), detailsNameInput = $bindable(), detailsPathInput = $bindable(),
		tagInput = $bindable(), remoteUrlInput = $bindable(), environmentVaultPassword = $bindable(),
		selectedGithubCredentialSecretId = $bindable(), githubRepositoryName = $bindable(),
		githubRepositoryCommitMessage = $bindable(), formName = $bindable(), formDescription = $bindable(),
		formTags = $bindable(), repositoryRemoteUrl = $bindable(),
		repositoryGithubCredentialSecretId = $bindable(), deleteCandidate, descriptionEditor,
		detailsEditor, tagEditor, githubCredentialEditor, remoteUrlEditor, publishTarget, dialog, dialogTargetNodeName, repositorySourceMode,
		formError, storageError, isDeleting, canConfirmDelete, canDeleteLocalFolder, isSavingDescription,
		canSaveDescription, isSavingDetails, canSaveDetails, isSavingTags, canSaveTags,
		isSavingRemoteUrl, canSaveRemoteUrl, environmentVaultEnvelope, environmentVault,
		environmentVaultError, githubCredentialOptions, isEnvironmentVaultBusy, isSubmitting,
		canSaveGithubCredential, githubRepositoryVisibility, isPublishingRepository,
		canSubmitPublishRepository, canSubmitDialog, canOpenContextFolder, canCloneContextRepository,
		canInitializeContextRepository, canPublishContextRepository, canEditContextGithubCredential,
		getDeleteDialogTitle, getDeleteDialogText, getDeleteLocalFolderLabel, getDeleteLocalFolderUnavailableText,
		getVisibleFormErrorMessage, getTagsInputMaxLength, getDialogTitle, getDialogSubmitLabel,
		isRepositoryRemoteUrlError, onOpenFolder, onEditDetails, onEditDescription, onEditGithubCredential,
		onEditRemoteUrl, onEditTags, onDelete, onCloneRepository, onInitializeRepository, onPublishRepository,
		onRepositoryTask,
		onDeleteBackdropClick, onDeleteClose, onDeleteConfirm, onDescriptionInput, onDescriptionSubmit,
		onDescriptionBackdropClick, onDescriptionClose, onDetailsInput, onDetailsSubmit,
		onDetailsBackdropClick, onDetailsClose, onTagInput, onTagSubmit, onTagBackdropClick,
		onTagClose, onRemoteUrlInput, onRemoteUrlSubmit, onRemoteUrlBackdropClick,
		onRemoteUrlClose, onUnlock, onGithubCredentialSubmit, onGithubCredentialBackdropClick,
		onGithubCredentialClose, onRepositoryNameInput, onCommitMessageInput, onSelectVisibility,
		onPublishSubmit, onPublishBackdropClick, onPublishClose, onNameInput, onDialogDescriptionInput,
		onDialogTagsInput, onRepositoryRemoteUrlInput, onRepositoryGithubCredentialSelect,
		onSelectRepositorySourceMode, onDialogSubmit,
		onDialogBackdropClick, onDialogClose
	}: Props = $props();
</script>

{#if contextMenu !== null}
	<ProjectContextMenu {contextMenu} {projectMessages} bind:contextMenuElement {canOpenContextFolder}
		{canCloneContextRepository} {canInitializeContextRepository} {canPublishContextRepository}
		{canEditContextGithubCredential}
		onOpenFolder={onOpenFolder} onEditDetails={onEditDetails} onEditDescription={onEditDescription}
		onEditGithubCredential={onEditGithubCredential} onEditRemoteUrl={onEditRemoteUrl}
		onEditTags={onEditTags} onDelete={onDelete}
		onCloneRepository={onCloneRepository} onInitializeRepository={onInitializeRepository}
		onPublishRepository={onPublishRepository} onRepositoryTask={onRepositoryTask} />
{/if}

{#if deleteCandidate !== null}
	<ProjectDeleteDialog {projectMessages} bind:shouldDeleteLocalFolder {formError} {isDeleting} {canConfirmDelete}
		{canDeleteLocalFolder} {getDeleteDialogTitle} {getDeleteDialogText}
		{getDeleteLocalFolderLabel} {getDeleteLocalFolderUnavailableText}
		onBackdropClick={onDeleteBackdropClick} onClose={onDeleteClose} onConfirm={onDeleteConfirm} />
{/if}

{#if detailsEditor !== null}
	<ProjectNodeDetailsDialog editor={detailsEditor} {projectMessages} bind:nameInput={detailsNameInput}
		bind:pathInput={detailsPathInput} {formError} {storageError} {isSavingDetails}
		{canSaveDetails} {getVisibleFormErrorMessage}
		onInput={onDetailsInput} onSubmit={onDetailsSubmit}
		onBackdropClick={onDetailsBackdropClick} onClose={onDetailsClose} />
{/if}

{#if descriptionEditor !== null}
	<ProjectDescriptionDialog editor={descriptionEditor} bind:descriptionInput {formError} {storageError}
		{isSavingDescription} {canSaveDescription} {getVisibleFormErrorMessage}
		onInput={onDescriptionInput} onSubmit={onDescriptionSubmit}
		onBackdropClick={onDescriptionBackdropClick} onClose={onDescriptionClose} />
{/if}

{#if tagEditor !== null}
	<ProjectTagDialog editor={tagEditor} bind:tagInput {formError} {storageError} {isSavingTags}
		{canSaveTags} {getTagsInputMaxLength} {getVisibleFormErrorMessage} onInput={onTagInput}
		onSubmit={onTagSubmit} onBackdropClick={onTagBackdropClick} onClose={onTagClose} />
{/if}

{#if remoteUrlEditor !== null}
	<ProjectRemoteUrlDialog editor={remoteUrlEditor} bind:remoteUrlInput {formError} {storageError}
		{isSavingRemoteUrl} {canSaveRemoteUrl} {getVisibleFormErrorMessage}
		onInput={onRemoteUrlInput} onSubmit={onRemoteUrlSubmit}
		onBackdropClick={onRemoteUrlBackdropClick} onClose={onRemoteUrlClose} />
{/if}

{#if githubCredentialEditor !== null}
	<ProjectGithubCredentialDialog editor={githubCredentialEditor} bind:environmentVaultPassword
		bind:selectedGithubCredentialSecretId {environmentVaultEnvelope} {environmentVault}
		{environmentVaultError} {githubCredentialOptions} {formError} {storageError}
		{isEnvironmentVaultBusy} {isSubmitting} {canSaveGithubCredential}
		{getVisibleFormErrorMessage} onUnlock={onUnlock} onSubmit={onGithubCredentialSubmit}
		onBackdropClick={onGithubCredentialBackdropClick} onClose={onGithubCredentialClose} />
{/if}

{#if publishTarget !== null}
	<ProjectPublishDialog repositoryName={publishTarget.repository.name} bind:githubRepositoryName
		bind:githubRepositoryCommitMessage {githubRepositoryVisibility} {formError} {storageError}
		{isPublishingRepository} {canSubmitPublishRepository} {getVisibleFormErrorMessage}
		onRepositoryNameInput={onRepositoryNameInput} onCommitMessageInput={onCommitMessageInput}
		onSelectVisibility={onSelectVisibility} onSubmit={onPublishSubmit}
		onBackdropClick={onPublishBackdropClick} onClose={onPublishClose} />
{/if}

{#if dialog !== null}
	<ProjectNodeDialog mode={dialog.mode} targetNodeName={dialogTargetNodeName} bind:formName
		bind:formDescription bind:formTags bind:repositoryRemoteUrl bind:repositoryGithubCredentialSecretId
		{repositorySourceMode} {githubCredentialOptions} {formError} {storageError}
		{isSubmitting} {canSubmitDialog} {getDialogTitle} {getDialogSubmitLabel}
		{getTagsInputMaxLength} {getVisibleFormErrorMessage} {isRepositoryRemoteUrlError}
		onNameInput={onNameInput} onDescriptionInput={onDialogDescriptionInput}
		onTagsInput={onDialogTagsInput} onRepositoryRemoteUrlInput={onRepositoryRemoteUrlInput}
		onRepositoryGithubCredentialSelect={onRepositoryGithubCredentialSelect}
		onSelectRepositorySourceMode={onSelectRepositorySourceMode} onSubmit={onDialogSubmit}
		onBackdropClick={onDialogBackdropClick} onClose={onDialogClose} />
{/if}
