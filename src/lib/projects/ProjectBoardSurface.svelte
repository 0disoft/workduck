	<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import {
		getWorkduckMessages,
		type WorkduckLanguageId
	} from '$lib/i18n/workduck-language';
	import type { EnvironmentVault } from '$lib/environment/environment-vault';
	import StatusToast from '$lib/ui/StatusToast.svelte';
	import {
		type SecretVaultEnvelope
	} from '$lib/environment/secret-vault-crypto';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import {
		getQueueFolderLocalizedError
	} from '$lib/queue/queue-panel-errors';
	import type { QueueFolderError } from '$lib/queue/queue-folder';
	import {
		applySsealedScaffoldToRepository,
		getDefaultSsealedScaffoldApplyScope,
		getDefaultSsealedScaffoldProfile,
		previewSsealedScaffoldForRepository,
		type ProjectFolderError,
		type SsealedScaffoldApplyScope,
		type SsealedScaffoldPlan,
		type SsealedScaffoldProfile,
		type SsealedScaffoldScope
	} from './project-folder';
	import { type ProjectRepositoryGithubVisibility } from './project-repository';

	import {
		createEmptyProjectRegistry,
		setProjectRepositoryFavorite,
		type ProjectNodeRecord,
		type ProjectRegistry,
		type ProjectRepositoryLinkRecord
	} from './project-registry';
	import { type ProjectRegistryStorageError } from './project-storage';
	import {
		type ProjectRepositoryOperationName,
		type ProjectRepositoryOperationStorageError
	} from './project-operation-storage';
	import {
		createProjectBoardSelectionIndex,
		getTagsInputMaxLength,
		type ProjectRepositoryGitStatus,
		type ProjectRepositorySyncFilter
	} from './project-board-selectors';
	import {
		getProjectFormErrorMessage,
		type ProjectFormError
	} from './project-board-errors';
	import {
		canSubmitProjectDialog,
		getProjectDeleteDialogText,
		getProjectDeleteDialogTitle,
		getProjectDeleteLocalFolderLabel,
		getProjectDeleteLocalFolderUnavailableText,
		getProjectDialogSubmitLabel,
		getProjectDialogTitle,
		isProjectRepositoryRemoteUrlError
	} from './project-board-dialog-rules';
	import { createProjectBoardContextMenuHandlers } from './project-board-context-menu-handlers';
	import { createProjectBoardEditorHandlers } from './project-board-editor-handlers';
	import { closeProjectBoardOverlayFromEscape } from './project-board-close-actions';
	import { createProjectBoardDialogHandlers } from './project-board-dialog-handlers';
	import {
		type ProjectRepositoryGitAction,
		type ProjectRepositoryOperation
	} from './project-board-operations';
	import {
		canEditProjectBoardContextGithubCredential,
		canOpenProjectBoardContextFolder,
		getProjectBoardContextRepositoryGitStatus,
		getProjectBoardNodeGithubCredentialName,
		getProjectBoardRepositoryGithubCredentialName,
		isProjectBoardDeleteLocalFolderAvailable,
		isProjectBoardRepositoryTarget,
		resolveProjectBoardRepositoryGithubCredential
	} from './project-board-surface-helpers';
	import { createProjectBoardSurfaceSelection } from './project-board-surface-selection';
	import {
		runProjectRepositoryRemoteGitAction,
		type ProjectRepositoryActionContext
	} from './project-board-repository-actions';
	import {
		createProjectBoardRepositoryActionContext,
		finishProjectBoardRepositoryOperation,
		getProjectBoardRepositoryOperation,
		isProjectBoardRepositoryBusy,
		isProjectBoardRepositoryOperationRunning,
		startProjectBoardRepositoryOperation
	} from './project-board-repository-action-context';
	import {
		closeProjectRepositoryPublishDialog,
		closeProjectRepositoryPublishDialogFromBackdrop,
		openProjectRepositoryPublishDialog,
		submitProjectRepositoryPublishDialog,
		type ProjectRepositoryPublishTarget
	} from './project-board-publish-actions';
	import {
		type ProjectRepositoryTaskRunRecordByRepositoryId
	} from './project-repository-task-runs';
	import {
		type ProjectRepositoryTaskRunRecord
	} from './project-repository-task';
	import {
		createWorkspacePathBoundaryKey,
		isRepositoryPathInsideProjectsFolderBoundary,
		isRepositoryPathInsideWorkspaceBoundary
	} from './project-board-paths';
	import { DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE } from './project-board-publish-constants';
	import {
		canCloneProjectRepository,
		canInitializeProjectRepository,
		canPublishProjectRepositoryToGithub,
		canRunRemoteProjectRepositoryGitAction,
		getProjectRepositoryCardKind
	} from './project-board-repository-rules';
	import {
		canQueueProjectRepositoryCommitWorkOrder,
		queueProjectRepositoryCommitWorkOrder
	} from './project-board-repository-commit-work-order';
	import { refreshProjectRepositoryGitStatusForBoard } from './project-board-runtime-state';
	import {
		getProjectContextMenuNode,
		getProjectContextMenuRepository,
		getProjectDialogTargetNode,
		getProjectRepositoryTarget
	} from './project-board-targets';
	import {
		writeProjectRegistryForBoard
	} from './project-board-storage-actions';
	import type {
		ProjectContextMenuState,
		ProjectContextMenuTarget,
		ProjectDeleteCandidate,
		ProjectDialogState,
		ProjectGithubCredentialEditorTarget,
		ProjectRepositoryRemoteUrlEditorTarget,
		ProjectRepositoryTarget,
		ProjectRepositorySourceMode,
		ProjectTagEditorTarget
	} from './project-board-types';
	import {
		createGithubCredentialNameById,
		getDefaultRepositoryGithubCredentialSecretId as getDefaultRepositoryGithubCredentialSecretIdFromRegistry,
		getGithubCredentialOptions,
		resolveRepositoryDialogForkCredential as resolveRepositoryDialogForkCredentialFromVault,
	} from './project-board-github-credentials';
	import ProjectBoardLanes from './ProjectBoardLanes.svelte';
	import ProjectContextMenuLifecycle from './ProjectContextMenuLifecycle.svelte';
	import ProjectBoardWorkspaceLifecycle from './ProjectBoardWorkspaceLifecycle.svelte';
	import ProjectBoardRepositoryLifecycle from './ProjectBoardRepositoryLifecycle.svelte';
	import ProjectBoardRepositoryTaskRunLifecycle from './ProjectBoardRepositoryTaskRunLifecycle.svelte';

	const PROJECT_TAG_FILTER_DEBOUNCE_MS = 500;
	type ProjectBoardOverlaysComponent = typeof import('./ProjectBoardOverlays.svelte').default;

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly title: string;
		readonly projectMessages: WorkduckMessages['projects'];
		readonly languageId: WorkduckLanguageId;
	}

	let { workspace, title, projectMessages, languageId }: Props = $props();
	let messages = $derived(getWorkduckMessages(languageId));

	let registry = $state<ProjectRegistry>(createEmptyProjectRegistry(''));
	let contextMenu = $state<ProjectContextMenuState | null>(null);
	let dialog = $state<ProjectDialogState | null>(null);
	let deleteCandidate = $state<ProjectDeleteCandidate | null>(null);
	let shouldDeleteLocalFolder = $state(false);
	let formName = $state('');
	let formDescription = $state('');
	let formTags = $state('');
	let tagFilterInput = $state('');
	let tagFilter = $state('');
	let tagFilterDebounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let repositorySyncFilter = $state<ProjectRepositorySyncFilter>('all');
	let tagEditor = $state<ProjectTagEditorTarget | null>(null);
	let tagInput = $state('');
	let githubCredentialEditor = $state<ProjectGithubCredentialEditorTarget | null>(null);
	let remoteUrlEditor = $state<ProjectRepositoryRemoteUrlEditorTarget | null>(null);
	let remoteUrlInput = $state('');
	let detailsEditor = $state<ProjectNodeRecord | null>(null);
	let detailsNameInput = $state('');
	let detailsPathInput = $state('');
	let selectedGithubCredentialSecretId = $state('');
	let environmentVaultEnvelope = $state<SecretVaultEnvelope | null>(null);
	let environmentVault = $state<EnvironmentVault | null>(null);
	let environmentVaultPassword = $state('');
	let isEnvironmentVaultBusy = $state(false);
	let environmentVaultError = $state<string | null>(null);
	let descriptionEditor = $state<ProjectNodeRecord | null>(null);
	let descriptionInput = $state('');
	let repositorySourceMode = $state<ProjectRepositorySourceMode>('folder');
	let repositoryRemoteUrl = $state('');
	let repositoryGithubCredentialSecretId = $state('');
	let repositorySsealedScaffoldScope = $state<SsealedScaffoldScope>('none');
	let repositorySsealedScaffoldProfile = $state<SsealedScaffoldProfile>(
		getDefaultSsealedScaffoldProfile()
	);
	let formError = $state<ProjectFormError | null>(null);
	let status = $state<string | null>(null);
	let storageError = $state<ProjectRegistryStorageError | null>(null);
	let operationStorageError = $state<ProjectRepositoryOperationStorageError | null>(null);
	let queueFolderError = $state<QueueFolderError | null>(null);
	let folderRepairError = $state<ProjectFolderError | null>(null);
	let folderRepairSignature = $state('');
	let repositoryGitInspectionSignature = $state('');
	let repositoryGitStatusById = $state<Record<string, ProjectRepositoryGitStatus>>({});
	let repositoryOperationById = $state<Record<string, ProjectRepositoryOperation>>({});
	let repositoryTaskRunById = $state<ProjectRepositoryTaskRunRecordByRepositoryId>({});
	let selectedProjectId = $state<string | null>(null);
	let selectedGroupId = $state<string | null>(null);
	let isSubmitting = $state(false);
	let isDeleting = $state(false);
	let cloneTarget = $state<ProjectContextMenuTarget | null>(null);
	let gitActionTarget = $state<ProjectContextMenuTarget | null>(null);
	let commitWorkOrderTargetRepositoryId = $state<string | null>(null);
	let publishTarget = $state<ProjectRepositoryPublishTarget | null>(null);
	let ssealedTarget = $state<ProjectRepositoryTarget | null>(null);
	let ssealedScaffoldApplyScope = $state<SsealedScaffoldApplyScope>(
		getDefaultSsealedScaffoldApplyScope()
	);
	let ssealedScaffoldApplyProfile = $state<SsealedScaffoldProfile>(
		getDefaultSsealedScaffoldProfile()
	);
	let ssealedPreview = $state<SsealedScaffoldPlan | null>(null);
	let githubRepositoryName = $state('');
	let githubRepositoryCommitMessage = $state(DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE);
	let githubRepositoryVisibility = $state<ProjectRepositoryGithubVisibility>('private');
	let isPublishingRepository = $state(false);
	let isPreviewingSsealed = $state(false);
	let isApplyingSsealed = $state(false);
	let isSavingTags = $state(false);
	let isSavingDescription = $state(false);
	let isSavingDetails = $state(false);
	let isSavingRemoteUrl = $state(false);
	let isOpeningFolder = $state(false);
	let contextMenuElement = $state<HTMLElement | undefined>(undefined);
	let ProjectBoardOverlays = $state<ProjectBoardOverlaysComponent | null>(null);
	let projectBoardOverlaysLoad: Promise<void> | null = null;

	let selectionIndex = $derived(createProjectBoardSelectionIndex(registry.nodes));
	let projectRows = $derived(selectionIndex.projectRows);
	let workspacePathBoundaryKey = $derived(createWorkspacePathBoundaryKey(workspace.path));
	let boardSelection = $derived(createProjectBoardSurfaceSelection({
		selectionIndex,
		repositoryGitStatusById,
		tagFilter,
		repositorySyncFilter,
		selectedProjectId,
		selectedGroupId
	}));
	let normalizedTagFilter = $derived(boardSelection.normalizedTagFilter);
	let repositoryFilterStats = $derived(boardSelection.repositoryFilterStats);
	let projectNodes = $derived(boardSelection.projectNodes);
	let selectedProject = $derived(boardSelection.selectedProject);
	let selectedProjectGroups = $derived(boardSelection.selectedProjectGroups);
	let selectedGroup = $derived(boardSelection.selectedGroup);
	let selectedRepositories = $derived(boardSelection.selectedRepositories);
	let dialogTargetNode = $derived(getDialogTargetNode());
	let contextMenuRepository = $derived(getContextMenuRepository());
	let contextMenuNode = $derived(getContextMenuNode());
	let boardError = $derived(folderRepairError ?? storageError ?? operationStorageError);
	let standaloneError = $derived(formError ?? boardError);
	let contextMenuRepositoryGitStatus = $derived(getContextMenuRepositoryGitStatus());
	let canOpenContextFolder = $derived(canOpenContextMenuFolder());
	let canSaveTags = $derived(tagEditor !== null && !isSavingTags);
	let canSaveDetails = $derived(detailsEditor !== null && !isSavingDetails);
	let githubCredentialOptions = $derived(getGithubCredentialOptions(environmentVault));
	let githubCredentialNameById = $derived(createGithubCredentialNameById(githubCredentialOptions));
	let canSaveGithubCredential = $derived(
		githubCredentialEditor !== null && !isSubmitting && environmentVault !== null
	);
	let canSaveRemoteUrl = $derived(remoteUrlEditor !== null && !isSavingRemoteUrl);
	let canSaveDescription = $derived(descriptionEditor !== null && !isSavingDescription);
	let canSubmitDialog = $derived(
		canSubmitProjectDialog(
			dialog,
			repositorySourceMode,
			formName,
			repositoryRemoteUrl,
			repositoryGithubCredentialSecretId
		) &&
			!isSubmitting
	);
	let canConfirmDelete = $derived(deleteCandidate !== null && !isDeleting);
	let canDeleteLocalFolder = $derived(isDeleteLocalFolderAvailable());
	let canCloneContextRepository = $derived(
		contextMenuRepository !== null &&
			canCloneProjectRepository(
				contextMenuRepository.repository,
				contextMenuRepositoryGitStatus ?? undefined,
				contextMenuRepository.repository.path !== null &&
					isRepositoryPathInsideWorkspace(contextMenuRepository.repository.path),
				isRepositoryBusy(contextMenuRepository.repository.id)
			)
	);
	let canInitializeContextRepository = $derived(
		contextMenuRepository !== null &&
			contextMenuRepository.repository.path !== null &&
			isRepositoryPathInsideWorkspace(contextMenuRepository.repository.path) &&
			contextMenuRepositoryGitStatus !== null &&
			!contextMenuRepositoryGitStatus.isGitRepository &&
			contextMenuRepositoryGitStatus.error === null &&
			!isRepositoryBusy(contextMenuRepository.repository.id)
	);
	let canPublishContextRepository = $derived(
		contextMenuRepository !== null &&
			canPublishRepositoryToGithub(contextMenuRepository.repository)
	);
	let canApplySsealedContextRepository = $derived(
		contextMenuRepository !== null &&
			canApplySsealedToRepository(contextMenuRepository.repository)
	);
	let canSubmitPublishRepository = $derived(
		publishTarget !== null &&
			githubRepositoryName.trim().length > 0 &&
			githubRepositoryCommitMessage.trim().length > 0 &&
			!isPublishingRepository &&
			!isRepositoryBusy(publishTarget.repository.id)
	);
	let canApplySsealedScaffold = $derived(
		ssealedTarget !== null &&
			ssealedPreview !== null &&
			ssealedPreview.missingCount > 0 &&
			!isPreviewingSsealed &&
			!isApplyingSsealed
	);
	let hasActiveOverlay = $derived(
		contextMenu !== null ||
			deleteCandidate !== null ||
			descriptionEditor !== null ||
			detailsEditor !== null ||
			tagEditor !== null ||
			githubCredentialEditor !== null ||
			remoteUrlEditor !== null ||
			publishTarget !== null ||
			ssealedTarget !== null ||
			dialog !== null
	);

	async function persistRegistry(nextRegistry: ProjectRegistry) {
		return writeProjectRegistryForBoard(nextRegistry, (next) => {
			registry = next.registry;
			storageError = next.storageError;
		});
	}

	function loadProjectBoardOverlays() {
		if (ProjectBoardOverlays !== null) {
			return Promise.resolve();
		}

		projectBoardOverlaysLoad ??= import('./ProjectBoardOverlays.svelte').then((module) => {
			ProjectBoardOverlays = module.default;
		});

		return projectBoardOverlaysLoad;
	}

	function preloadProjectBoardOverlays() {
		void loadProjectBoardOverlays();
	}

	const editorActions = createProjectBoardEditorHandlers({
		getRegistry: () => registry,
		getWorkspaceId: () => workspace.id,
		getDescriptionEditor: () => descriptionEditor,
		getDescriptionInput: () => descriptionInput,
		getIsSavingDescription: () => isSavingDescription,
		getDetailsEditor: () => detailsEditor,
		getDetailsNameInput: () => detailsNameInput,
		getDetailsPathInput: () => detailsPathInput,
		getDetailsSavedStatus: () => projectMessages.detailsDialog.saved,
		getGithubCredentialSavedStatus: () => projectMessages.repository.githubCredentialSaved,
		getIsSavingDetails: () => isSavingDetails,
		getTagEditor: () => tagEditor,
		getTagInput: () => tagInput,
		getIsSavingTags: () => isSavingTags,
		getGithubCredentialEditor: () => githubCredentialEditor,
		getRemoteUrlEditor: () => remoteUrlEditor,
		getRemoteUrlInput: () => remoteUrlInput,
		getSelectedGithubCredentialSecretId: () => selectedGithubCredentialSecretId,
		getIsSubmitting: () => isSubmitting,
		getIsSavingRemoteUrl: () => isSavingRemoteUrl,
		getEnvironmentVault: () => environmentVault,
		getEnvironmentVaultEnvelope: () => environmentVaultEnvelope,
		getEnvironmentVaultPassword: () => environmentVaultPassword,
		getIsEnvironmentVaultBusy: () => isEnvironmentVaultBusy,
		getEnvironmentMessages: () => messages.environment,
		persistRegistry,
		setDescriptionEditor: (editor) => { descriptionEditor = editor; },
		setDescriptionInput: (input) => { descriptionInput = input; },
		setIsSavingDescription: (isSaving) => { isSavingDescription = isSaving; },
		setDetailsEditor: (editor) => { detailsEditor = editor; },
		setDetailsNameInput: (input) => { detailsNameInput = input; },
		setDetailsPathInput: (input) => { detailsPathInput = input; },
		setIsSavingDetails: (isSaving) => { isSavingDetails = isSaving; },
		setTagEditor: (editor) => { tagEditor = editor; },
		setTagInput: (input) => { tagInput = input; },
		setIsSavingTags: (isSaving) => { isSavingTags = isSaving; },
		setGithubCredentialEditor: (editor) => { githubCredentialEditor = editor; },
		setRemoteUrlEditor: (editor) => { remoteUrlEditor = editor; },
		setRemoteUrlInput: (input) => { remoteUrlInput = input; },
		setSelectedGithubCredentialSecretId: (secretId) => {
			selectedGithubCredentialSecretId = secretId;
		},
		setIsSubmitting: (nextIsSubmitting) => { isSubmitting = nextIsSubmitting; },
		setIsSavingRemoteUrl: (isSaving) => { isSavingRemoteUrl = isSaving; },
		setEnvironmentVault: (vault) => { environmentVault = vault; },
		setEnvironmentVaultPassword: (password) => { environmentVaultPassword = password; },
		setEnvironmentVaultError: (error) => { environmentVaultError = error; },
		setIsEnvironmentVaultBusy: (isBusy) => { isEnvironmentVaultBusy = isBusy; },
		setFormError: (error) => { formError = error; },
		setStatus: (nextStatus) => { status = nextStatus; },
		clearDeleteCandidate: () => { deleteCandidate = null; },
		clearPublishTarget: () => { publishTarget = null; },
		clearTagEditor: () => { tagEditor = null; },
		clearDescriptionEditor: () => { descriptionEditor = null; },
		clearDetailsEditor: () => { detailsEditor = null; },
		clearRemoteUrlEditor: () => { remoteUrlEditor = null; },
		clearDialog: () => { dialog = null; }
	});

	const contextMenuActions = createProjectBoardContextMenuHandlers({
		getContextMenuTarget: () => contextMenu?.target ?? null,
		getContextMenuRepository: () => contextMenuRepository,
		getRegistryNodes: () => registry.nodes,
		getWorkspacePath: () => workspace.path,
		getProjectMessages: () => projectMessages,
		getIsOpeningFolder: () => isOpeningFolder,
		createRepositoryActionContext,
		setContextMenu: (nextContextMenu) => { contextMenu = nextContextMenu; },
		setFormError: (error) => { formError = error; },
		setStatus: (nextStatus) => { status = nextStatus; },
		setRepositoryTaskRun: setRepositoryTaskRun,
		setDeleteCandidate: (candidate) => { deleteCandidate = candidate; },
		setShouldDeleteLocalFolder: (shouldDelete) => { shouldDeleteLocalFolder = shouldDelete; },
		setDescriptionEditor: (editor) => { descriptionEditor = editor; },
		setIsOpeningFolder: (isOpening) => { isOpeningFolder = isOpening; },
		openTagEditor: editorActions.openTagEditor,
		openGithubCredentialEditor: editorActions.openGithubCredentialEditor,
		openRemoteUrlEditor: editorActions.openRemoteUrlEditor,
		openDescriptionEditor: editorActions.openDescriptionEditor,
		openDetailsEditor: editorActions.openDetailsEditor,
		openPublishRepositoryDialog,
		openApplySsealedRepositoryDialog
	});

	const dialogActions = createProjectBoardDialogHandlers({
		getWorkspacePath: () => workspace.path,
		getRegistry: () => registry,
		getDialog: () => dialog,
		getFormName: () => formName,
		getFormDescription: () => formDescription,
		getFormTags: () => formTags,
		getRepositorySourceMode: () => repositorySourceMode,
		getRepositoryRemoteUrl: () => repositoryRemoteUrl,
		getRepositoryGithubCredentialSecretId: () => repositoryGithubCredentialSecretId,
		getRepositorySsealedScaffoldScope: () => repositorySsealedScaffoldScope,
		getRepositorySsealedScaffoldProfile: () => repositorySsealedScaffoldProfile,
		getIsSubmitting: () => isSubmitting,
		getDeleteCandidate: () => deleteCandidate,
		getIsDeleting: () => isDeleting,
		getShouldDeleteLocalFolder: () => shouldDeleteLocalFolder,
		getCanDeleteLocalFolder: isDeleteLocalFolderAvailable,
		getDeleteDialogMessages: () => projectMessages.deleteDialog,
		getDefaultRepositoryGithubCredentialSecretId,
		persistRegistry,
		resolveForkCredential: resolveRepositoryDialogForkCredential,
		closeContextMenu,
		setDialog: (nextDialog) => { dialog = nextDialog; },
		setFormName: (name) => { formName = name; },
		setFormDescription: (description) => { formDescription = description; },
		setFormTags: (tags) => { formTags = tags; },
		setRepositorySourceMode: (sourceMode) => { repositorySourceMode = sourceMode; },
		setRepositoryRemoteUrl: (remoteUrl) => { repositoryRemoteUrl = remoteUrl; },
		setRepositoryGithubCredentialSecretId: (secretId) => {
			repositoryGithubCredentialSecretId = secretId;
		},
		setRepositorySsealedScaffoldScope: (scope) => { repositorySsealedScaffoldScope = scope; },
		setRepositorySsealedScaffoldProfile: (profile) => {
			repositorySsealedScaffoldProfile = profile;
		},
		setFormError: (error) => { formError = error; },
		setStatus: (nextStatus) => { status = nextStatus; },
		setDeleteCandidate: (candidate) => { deleteCandidate = candidate; },
		setShouldDeleteLocalFolder: (shouldDelete) => { shouldDeleteLocalFolder = shouldDelete; },
		setIsSubmitting: (nextIsSubmitting) => { isSubmitting = nextIsSubmitting; },
		setIsDeleting: (nextIsDeleting) => { isDeleting = nextIsDeleting; },
		setSelectedProjectId: (projectId) => { selectedProjectId = projectId; },
		setSelectedGroupId: (groupId) => { selectedGroupId = groupId; },
		clearDescriptionEditor: () => { descriptionEditor = null; },
		clearPublishTarget: () => { publishTarget = null; }
	});

	function closeContextMenu() {
		contextMenuActions.closeContextMenu();
	}

	function openProjectBoardDialog(
		mode: 'project' | 'group' | 'repository',
		targetNodeId?: string
	) {
		preloadProjectBoardOverlays();
		dialogActions.openDialog(mode, targetNodeId ?? null);
	}

	function openProjectBoardProjectContextMenu(event: MouseEvent, node: ProjectNodeRecord) {
		preloadProjectBoardOverlays();
		contextMenuActions.openProjectContextMenu(event, node);
	}

	function openProjectBoardRepositoryContextMenu(
		event: MouseEvent,
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		preloadProjectBoardOverlays();
		contextMenuActions.openRepositoryContextMenu(event, node, repository);
	}

	function openPublishRepositoryDialog(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		preloadProjectBoardOverlays();
		openProjectRepositoryPublishDialog(
			{ node, repository },
			{
				isRepositoryPathInsideWorkspace,
				isRepositoryBusy,
				failRepositoryOperation,
				setPublishTarget: (target) => { publishTarget = target; },
				setRepositoryName: (name) => { githubRepositoryName = name; },
				setCommitMessage: (message) => { githubRepositoryCommitMessage = message; },
				setVisibility: (visibility) => { githubRepositoryVisibility = visibility; },
				setFormError: (error) => { formError = error; },
				setStatus: (nextStatus) => { status = nextStatus; },
				clearDeleteCandidate: () => { deleteCandidate = null; },
				clearDialog: () => { dialog = null; },
				closeContextMenu
			}
		);
	}

	function closePublishRepositoryDialog() {
		closeProjectRepositoryPublishDialog({
			setPublishTarget: (target) => { publishTarget = target; },
			setRepositoryName: (name) => { githubRepositoryName = name; },
			setCommitMessage: (message) => { githubRepositoryCommitMessage = message; },
			setVisibility: (visibility) => { githubRepositoryVisibility = visibility; },
			setIsPublishing: (isPublishing) => { isPublishingRepository = isPublishing; }
		});
	}

	function openApplySsealedRepositoryDialog(target: ProjectRepositoryTarget) {
		preloadProjectBoardOverlays();

		if (!canApplySsealedToRepository(target.repository)) {
			formError =
				target.repository.path === null
					? 'project-repository-path-required'
					: 'project-repository-path-outside-workspace';
			return;
		}

		ssealedTarget = target;
		const defaultScope = getDefaultSsealedScaffoldApplyScope();
		const defaultProfile = getDefaultSsealedScaffoldProfile();
		ssealedScaffoldApplyScope = defaultScope;
		ssealedScaffoldApplyProfile = defaultProfile;
		ssealedPreview = null;
		isPreviewingSsealed = false;
		isApplyingSsealed = false;
		formError = null;
		status = null;
		deleteCandidate = null;
		publishTarget = null;
		dialog = null;
		closeContextMenu();
		void refreshSsealedScaffoldPreview(target, defaultScope, defaultProfile);
	}

	function closeSsealedScaffoldDialog() {
		ssealedTarget = null;
		ssealedScaffoldApplyScope = getDefaultSsealedScaffoldApplyScope();
		ssealedScaffoldApplyProfile = getDefaultSsealedScaffoldProfile();
		ssealedPreview = null;
		isPreviewingSsealed = false;
		isApplyingSsealed = false;
		formError = null;
	}

	function closeSsealedScaffoldDialogFromBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget && !isApplyingSsealed) {
			closeSsealedScaffoldDialog();
		}
	}

	function selectSsealedScaffoldApplyScope(scope: SsealedScaffoldApplyScope) {
		ssealedScaffoldApplyScope = scope;
		ssealedPreview = null;
		formError = null;
		status = null;
		void refreshSsealedScaffoldPreview(ssealedTarget, scope, ssealedScaffoldApplyProfile);
	}

	function selectSsealedScaffoldApplyProfile(profile: SsealedScaffoldProfile) {
		ssealedScaffoldApplyProfile = profile;
		ssealedPreview = null;
		formError = null;
		status = null;
		void refreshSsealedScaffoldPreview(ssealedTarget, ssealedScaffoldApplyScope, profile);
	}

	async function refreshSsealedScaffoldPreview(
		target = ssealedTarget,
		scope = ssealedScaffoldApplyScope,
		profile = ssealedScaffoldApplyProfile
	) {
		if (target === null || target.repository.path === null) {
			formError = 'project-repository-not-found';
			return;
		}

		const repositoryId = target.repository.id;

		isPreviewingSsealed = true;
		formError = null;
		status = null;

		try {
			const result = await previewSsealedScaffoldForRepository(
				workspace.path,
				target.repository.path,
				scope,
				profile
			);

			if (
				ssealedTarget?.repository.id !== repositoryId ||
				ssealedScaffoldApplyScope !== scope ||
				ssealedScaffoldApplyProfile !== profile
			) {
				return;
			}

			if (result.ok) {
				ssealedPreview = result.plan;
				return;
			}

			ssealedPreview = null;
			formError = result.error;
		} finally {
			if (
				ssealedTarget?.repository.id === repositoryId &&
				ssealedScaffoldApplyScope === scope &&
				ssealedScaffoldApplyProfile === profile
			) {
				isPreviewingSsealed = false;
			}
		}
	}

	async function applySsealedScaffoldToTarget() {
		const target = ssealedTarget;

		if (target === null || target.repository.path === null || isApplyingSsealed) {
			return;
		}

		if (!canApplySsealedToRepository(target.repository)) {
			formError = 'project-repository-path-outside-workspace';
			return;
		}

		const repositoryId = target.repository.id;
		const scope = ssealedScaffoldApplyScope;
		const profile = ssealedScaffoldApplyProfile;

		isApplyingSsealed = true;
		formError = null;
		status = null;

		try {
			const result = await applySsealedScaffoldToRepository(
				workspace.path,
				target.repository.path,
				scope,
				profile
			);

			if (
				ssealedTarget?.repository.id !== repositoryId ||
				ssealedScaffoldApplyScope !== scope ||
				ssealedScaffoldApplyProfile !== profile
			) {
				return;
			}

			if (!result.ok) {
				formError = result.error;
				return;
			}

			ssealedPreview = result.plan;
			status =
				result.plan.conflictCount > 0
					? projectMessages.ssealedScaffold.appliedWithSkippedConflictsSummary
							.replace('{added}', result.plan.addedCount.toString())
							.replace('{conflicts}', result.plan.conflictCount.toString())
					: projectMessages.ssealedScaffold.appliedSummary.replace(
							'{added}',
							result.plan.addedCount.toString()
						);
		} finally {
			if (
				ssealedTarget?.repository.id === repositoryId &&
				ssealedScaffoldApplyScope === scope &&
				ssealedScaffoldApplyProfile === profile
			) {
				isApplyingSsealed = false;
			}
		}
	}

	function handleGithubRepositoryNameInput() {
		formError = null;
		status = null;
	}

	function handleGithubRepositoryCommitMessageInput() {
		formError = null;
		status = null;
	}

	function clearTagFilterDebounce() {
		if (tagFilterDebounceTimeoutId === null) {
			return;
		}

		clearTimeout(tagFilterDebounceTimeoutId);
		tagFilterDebounceTimeoutId = null;
	}

	function handleTagFilterInput(nextTagFilterInput: string) {
		tagFilterInput = nextTagFilterInput;
		editorActions.handleTagFilterInput();
		clearTagFilterDebounce();

		if (nextTagFilterInput.trim().length === 0) {
			tagFilter = '';
			return;
		}

		tagFilterDebounceTimeoutId = setTimeout(() => {
			tagFilter = tagFilterInput;
			tagFilterDebounceTimeoutId = null;
		}, PROJECT_TAG_FILTER_DEBOUNCE_MS);
	}

	function selectGithubRepositoryVisibility(visibility: ProjectRepositoryGithubVisibility) {
		githubRepositoryVisibility = visibility;
		formError = null;
		status = null;
	}

	function handlePublishRepositoryBackdropClick(event: MouseEvent) {
		closeProjectRepositoryPublishDialogFromBackdrop(event, {
			isPublishing: isPublishingRepository,
			closeDialog: closePublishRepositoryDialog
		});
	}

	async function handlePublishRepositorySubmit(event: SubmitEvent) {
		await submitProjectRepositoryPublishDialog(
			event,
			{
				target: publishTarget,
				isPublishing: isPublishingRepository,
				repositoryName: githubRepositoryName,
				commitMessage: githubRepositoryCommitMessage,
				visibility: githubRepositoryVisibility
			},
			{ createRepositoryActionContext }
		);
	}

	async function runRepositoryGitAction(
		target: ProjectRepositoryTarget | null,
		action: ProjectRepositoryGitAction
	) {
		await runProjectRepositoryRemoteGitAction(target, action, createRepositoryActionContext());
	}

	async function queueRepositoryCommitWorkOrder(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		await queueProjectRepositoryCommitWorkOrder(
			{
				workspaceId: workspace.id,
				workspacePath: workspace.path,
				nodes: registry.nodes,
				node,
				repository,
				languageId,
				queuedMessageTemplate: projectMessages.repository.commitWorkOrderQueued
			},
			{
				canQueueRepositoryCommitWorkOrder,
				setCommitWorkOrderTargetRepositoryId: (repositoryId) => {
					commitWorkOrderTargetRepositoryId = repositoryId;
				},
				setFormError: (error) => {
					formError = error;
				},
				setQueueFolderError: (error) => {
					queueFolderError = error;
				},
				setStatus: (nextStatus) => {
					status = nextStatus;
				}
			}
		);
	}

	function createRepositoryActionContext(): ProjectRepositoryActionContext {
		return createProjectBoardRepositoryActionContext({
			workspacePath: workspace.path,
			registry,
			isRepositoryBusy,
			isRepositoryPathInsideWorkspace,
			resolveCredential: ({ node, repository }) =>
				resolveRepositoryGithubCredentialOrSetError(node, repository),
			startOperation: startRepositoryOperation,
			succeedOperation: ({ node, repository }, name) =>
				succeedRepositoryOperation(node, repository, name),
			failOperation: ({ node, repository }, name, error) =>
				failRepositoryOperation(node, repository, name, error),
			persistRegistry,
			refreshRepositoryGitStatus,
			setFormError: (error) => { formError = error; },
			setStatus: (nextStatus) => { status = nextStatus; },
			setSelectedGroupId: (groupId) => { selectedGroupId = groupId; },
			setCloneTarget: (target) => { cloneTarget = target; },
			setGitActionTarget: (target) => { gitActionTarget = target; },
			setIsPublishingRepository: (isPublishing) => { isPublishingRepository = isPublishing; },
			closePublishRepositoryDialog,
			operationMessages: projectMessages.operations
		});
	}

	function startRepositoryOperation(repositoryId: string, name: ProjectRepositoryOperationName) {
		repositoryOperationById = startProjectBoardRepositoryOperation(
			repositoryOperationById,
			repositoryId,
			name
		);
	}

	async function succeedRepositoryOperation(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord,
		name: ProjectRepositoryOperationName
	) {
		await finishRepositoryOperation(node, repository, name, 'succeeded', null);
	}

	async function failRepositoryOperation(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord,
		name: ProjectRepositoryOperationName,
		error: ProjectFormError
	) {
		await finishRepositoryOperation(node, repository, name, 'failed', error);
	}

	async function finishRepositoryOperation(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord,
		name: ProjectRepositoryOperationName,
		state: 'succeeded' | 'failed',
		error: string | null
	) {
		await finishProjectBoardRepositoryOperation(
			{
				workspaceId: workspace.id,
				node,
				repository,
				name,
				state,
				error,
				operations: repositoryOperationById,
				setOperations: (operations) => { repositoryOperationById = operations; },
				setOperationStorageError: (error) => { operationStorageError = error; }
			}
		);
	}

	function getRepositoryOperation(repositoryId: string) {
		return getProjectBoardRepositoryOperation(repositoryOperationById, repositoryId);
	}

	function getRepositoryTaskRun(repositoryId: string) {
		return repositoryTaskRunById[repositoryId] ?? null;
	}

	function setRepositoryTaskRun(
		repositoryId: string,
		record: ProjectRepositoryTaskRunRecord
	) {
		repositoryTaskRunById = {
			...repositoryTaskRunById,
			[repositoryId]: record
		};
	}

	function isRepositoryBusy(repositoryId: string) {
		return (
			isProjectBoardRepositoryBusy(repositoryOperationById, repositoryId) ||
			repositoryTaskRunById[repositoryId]?.state === 'running' ||
			commitWorkOrderTargetRepositoryId === repositoryId ||
			(isApplyingSsealed && ssealedTarget?.repository.id === repositoryId)
		);
	}

	function isRepositoryOperationRunning(
		repositoryId: string,
		name: ProjectRepositoryOperationName
	) {
		return isProjectBoardRepositoryOperationRunning(
			repositoryOperationById,
			repositoryId,
			name
		);
	}

	function getDialogTitle() { return getProjectDialogTitle(dialog?.mode, projectMessages); }

	function getDialogSubmitLabel() { return getProjectDialogSubmitLabel(dialog?.mode); }

	function getDialogTargetNode() { return getProjectDialogTargetNode(registry.nodes, dialog); }

	function getContextMenuRepository() {
		return getProjectContextMenuRepository(registry.nodes, contextMenu?.target ?? null);
	}

	function getContextMenuNode() {
		return getProjectContextMenuNode(registry.nodes, contextMenu?.target ?? null);
	}

	function getRepositoryTarget(nodeId: string, repositoryId: string) {
		return getProjectRepositoryTarget(registry.nodes, nodeId, repositoryId);
	}

	function getContextMenuRepositoryGitStatus() {
		return getProjectBoardContextRepositoryGitStatus(
			contextMenuRepository,
			repositoryGitStatusById
		);
	}

	function canOpenContextMenuFolder() {
		return canOpenProjectBoardContextFolder({
			contextMenu,
			contextMenuNode,
			contextMenuRepository,
			contextMenuRepositoryGitStatus,
			isOpeningFolder
		});
	}

	function selectProject(node: ProjectNodeRecord) {
		selectedProjectId = node.id;
		selectedGroupId = null;
		closeContextMenu();
	}

	function selectGroup(node: ProjectNodeRecord) {
		selectedGroupId = selectedGroupId === node.id ? null : node.id;
		closeContextMenu();
	}

	function selectRepositorySyncFilter(nextFilter: ProjectRepositorySyncFilter) {
		repositorySyncFilter = repositorySyncFilter === nextFilter ? 'all' : nextFilter;
		closeContextMenu();
	}

	async function setRepositoryFavorite(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord,
		favorite: boolean
	) {
		const result = setProjectRepositoryFavorite(
			registry,
			{
				nodeId: node.id,
				repositoryId: repository.id,
				favorite
			}
		);

		if (!result.ok) {
			formError = result.error;
			return;
		}

		formError = null;
		if (!(await persistRegistry(result.registry))) {
			return;
		}

		status = favorite
			? projectMessages.repository.favoriteAdded
			: projectMessages.repository.favoriteRemoved;
	}

	async function toggleRepositoryFavorite(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		await setRepositoryFavorite(node, repository, !repository.favorite);
	}

	async function toggleContextRepositoryFavorite() {
		const target = contextMenuRepository;

		closeContextMenu();

		if (target === null) {
			formError = 'project-repository-not-found';
			return;
		}

		await setRepositoryFavorite(target.node, target.repository, !target.repository.favorite);
	}

	function getDeleteDialogTitle() { return getProjectDeleteDialogTitle(deleteCandidate, projectMessages.deleteDialog); }

	function getDeleteDialogText() { return getProjectDeleteDialogText(deleteCandidate, projectMessages.deleteDialog); }

	function getDeleteLocalFolderLabel() { return getProjectDeleteLocalFolderLabel(deleteCandidate, projectMessages.deleteDialog); }

	function getDeleteLocalFolderUnavailableText() { return getProjectDeleteLocalFolderUnavailableText(deleteCandidate, projectMessages.deleteDialog); }

	function isDeleteLocalFolderAvailable() {
		return isProjectBoardDeleteLocalFolderAvailable(
			deleteCandidate,
			repositoryGitStatusById,
			isRepositoryPathInsideProjectsFolder
		);
	}

	function getVisibleFormErrorMessage() {
		const error = formError ?? storageError;

		return error === null ? '' : getProjectFormErrorMessage(error, projectMessages.errors);
	}

	function isRepositoryRemoteUrlError(error: ProjectFormError | null) {
		return isProjectRepositoryRemoteUrlError(error);
	}

	function getRepositoryCardKind(nodeId: string, repository: ProjectRepositoryLinkRecord) {
		return getProjectRepositoryCardKind(
			repository,
			getRepositoryOperation(repository.id),
			repositoryGitStatusById[repository.id],
			isRepositoryCloneTarget(nodeId, repository.id),
			isRepositoryGitActionTarget(nodeId, repository.id)
		);
	}

	function getNodeGithubCredentialName(node: ProjectNodeRecord) {
		return getProjectBoardNodeGithubCredentialName({
			environmentVault,
			githubCredentialNameById,
			node
		});
	}

	function getRepositoryGithubCredentialName(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		return getProjectBoardRepositoryGithubCredentialName({
			nodes: registry.nodes,
			environmentVault,
			githubCredentialNameById,
			selectedProject,
			node,
			repository
		});
	}

	function canEditContextGithubCredential() {
		return canEditProjectBoardContextGithubCredential({
			target: contextMenu?.target ?? null,
			nodes: registry.nodes,
			selectedProject
		});
	}

	function resolveRepositoryGithubCredentialOrSetError(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		return resolveProjectBoardRepositoryGithubCredential({
			nodes: registry.nodes,
			environmentVault,
			githubCredentialOptions,
			node,
			repository,
			setFormError: (error) => { formError = error; },
			setStatus: (nextStatus) => { status = nextStatus; }
		});
	}

	function getDefaultRepositoryGithubCredentialSecretId(targetNodeId: string | null) {
		return getDefaultRepositoryGithubCredentialSecretIdFromRegistry(
			registry.nodes,
			targetNodeId
		);
	}

	function resolveRepositoryDialogForkCredential(secretId: string) {
		return resolveRepositoryDialogForkCredentialFromVault(
			environmentVault,
			githubCredentialOptions,
			secretId
		);
	}

	function isRepositoryCloneTarget(nodeId: string, repositoryId: string) {
		return isProjectBoardRepositoryTarget(cloneTarget, nodeId, repositoryId);
	}

	function isRepositoryGitActionTarget(nodeId: string, repositoryId: string) {
		return isProjectBoardRepositoryTarget(gitActionTarget, nodeId, repositoryId);
	}

	function canCloneRepository(repository: ProjectRepositoryLinkRecord) {
		return canCloneProjectRepository(
			repository,
			repositoryGitStatusById[repository.id],
			repository.path !== null && isRepositoryPathInsideWorkspace(repository.path),
			isRepositoryBusy(repository.id)
		);
	}

	function canInitializeRepository(repository: ProjectRepositoryLinkRecord) {
		return canInitializeProjectRepository(
			repository,
			repositoryGitStatusById[repository.id],
			repository.path !== null && isRepositoryPathInsideWorkspace(repository.path),
			isRepositoryBusy(repository.id)
		);
	}

	function canPublishRepositoryToGithub(repository: ProjectRepositoryLinkRecord) {
		return canPublishProjectRepositoryToGithub(
			repository,
			repositoryGitStatusById[repository.id],
			repository.path !== null && isRepositoryPathInsideWorkspace(repository.path),
			publishTarget !== null,
			isRepositoryBusy(repository.id)
		);
	}

	function canApplySsealedToRepository(repository: ProjectRepositoryLinkRecord) {
		const gitStatus = repositoryGitStatusById[repository.id];

		return (
			repository.path !== null &&
			isRepositoryPathInsideWorkspace(repository.path) &&
			gitStatus !== undefined &&
			gitStatus.error === null &&
			!isRepositoryBusy(repository.id)
		);
	}

	function canRunRemoteRepositoryGitAction(
		repository: ProjectRepositoryLinkRecord,
		action: ProjectRepositoryGitAction
	) {
		return canRunRemoteProjectRepositoryGitAction(
			repository,
			repositoryGitStatusById[repository.id],
			repository.path !== null && isRepositoryPathInsideWorkspace(repository.path),
			isRepositoryBusy(repository.id),
			action
		);
	}

	function canQueueRepositoryCommitWorkOrder(repository: ProjectRepositoryLinkRecord) {
		return canQueueProjectRepositoryCommitWorkOrder({
			repository,
			gitStatus: repositoryGitStatusById[repository.id],
			isRepositoryPathInsideWorkspace:
				repository.path !== null && isRepositoryPathInsideWorkspace(repository.path),
			isRepositoryBusy: isRepositoryBusy(repository.id)
		});
	}

	function isRepositoryPathInsideWorkspace(repositoryPath: string) {
		return isRepositoryPathInsideWorkspaceBoundary(workspacePathBoundaryKey, repositoryPath);
	}

	function isRepositoryPathInsideProjectsFolder(repositoryPath: string) {
		return isRepositoryPathInsideProjectsFolderBoundary(workspacePathBoundaryKey, repositoryPath);
	}

	async function refreshRepositoryGitStatus(
		repositoryId: string,
		path: string | null,
		expectedSignature = repositoryGitInspectionSignature
	) {
		await refreshProjectRepositoryGitStatusForBoard(
			{ repositoryId, path, expectedSignature },
			{
				getRepositoryGitInspectionSignature: () => repositoryGitInspectionSignature,
				updateRepositoryGitStatus: (nextRepositoryId, gitStatus) => {
					repositoryGitStatusById = {
						...repositoryGitStatusById,
						[nextRepositoryId]: gitStatus
					};
				}
			}
		);
	}

	$effect(() => clearTagFilterDebounce);

	$effect(() => {
		if (hasActiveOverlay) {
			void loadProjectBoardOverlays();
		}
	});

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') {
			return;
		}

		closeProjectBoardOverlayFromEscape(
			{
				hasDialog: dialog !== null,
				hasDeleteCandidate: deleteCandidate !== null,
				hasTagEditor: tagEditor !== null,
				hasDescriptionEditor: descriptionEditor !== null,
				hasDetailsEditor: detailsEditor !== null,
				hasPublishTarget: publishTarget !== null,
				hasSsealedTarget: ssealedTarget !== null,
				hasGithubCredentialEditor: githubCredentialEditor !== null,
				isSavingTags,
				isSavingDescription,
				isSavingDetails,
				isPublishingRepository,
				isApplyingSsealed,
				isSubmitting,
				isEnvironmentVaultBusy
			},
			{
				closeDialog: dialogActions.closeDialog,
				closeDeleteDialog: dialogActions.closeDeleteDialog,
				closeTagEditor: editorActions.closeTagEditor,
				closeDescriptionEditor: editorActions.closeDescriptionEditor,
				closeDetailsEditor: editorActions.closeDetailsEditor,
				closePublishRepositoryDialog,
				closeSsealedScaffoldDialog,
				closeGithubCredentialEditor: editorActions.closeGithubCredentialEditor,
				closeContextMenu
			}
		);
	}

</script>

<svelte:window onkeydown={handleWindowKeydown} />

<ProjectBoardWorkspaceLifecycle
	{workspace}
	bind:registry
	bind:storageError
	bind:operationStorageError
	bind:folderRepairError
	bind:folderRepairSignature
	bind:selectedProjectId
	bind:selectedGroupId
	bind:environmentVaultEnvelope
	bind:environmentVault
	bind:environmentVaultPassword
	bind:environmentVaultError
	bind:repositoryOperationById
/>

<ProjectBoardRepositoryLifecycle
	{workspace}
	{projectRows}
	{selectionIndex}
	{registry}
	{persistRegistry}
	bind:folderRepairError
	bind:folderRepairSignature
	bind:repositoryGitInspectionSignature
	bind:repositoryGitStatusById
	bind:repositoryOperationById
/>

<ProjectBoardRepositoryTaskRunLifecycle
	{workspace}
	repositories={selectionIndex.registeredRepositories}
	bind:repositoryTaskRunById
/>

<ProjectContextMenuLifecycle
	bind:contextMenu
	{contextMenuElement}
	onClose={closeContextMenu}
/>

<ProjectBoardLanes
	{title}
	{projectMessages}
	{languageId}
	{tagFilterInput}
	{repositorySyncFilter}
	{repositoryFilterStats}
	{selectionIndex}
	{projectNodes}
	{selectedProject}
	{selectedProjectGroups}
	{selectedGroup}
	{selectedRepositories}
	{repositoryGitStatusById}
	onBoardContextMenu={contextMenuActions.openBoardContextMenu}
	onRepositorySyncFilterSelect={selectRepositorySyncFilter}
	onTagFilterInput={handleTagFilterInput}
	onOverlayIntent={preloadProjectBoardOverlays}
	onOpenDialog={openProjectBoardDialog}
	onSelectProject={selectProject}
	onSelectGroup={selectGroup}
	onProjectContextMenu={openProjectBoardProjectContextMenu}
	onRepositoryContextMenu={openProjectBoardRepositoryContextMenu}
	{getNodeGithubCredentialName}
	{getRepositoryGithubCredentialName}
	{getRepositoryOperation}
	{getRepositoryTaskRun}
	{isRepositoryBusy}
	{isRepositoryPathInsideWorkspace}
	{getRepositoryCardKind}
	{canCloneRepository}
	{canInitializeRepository}
	{canPublishRepositoryToGithub}
	{canQueueRepositoryCommitWorkOrder}
	{canRunRemoteRepositoryGitAction}
	{isRepositoryOperationRunning}
	onCloneRepository={contextMenuActions.openContextCloneRepositoryForTarget}
	onInitializeRepository={contextMenuActions.openInitializeRepositoryForTarget}
	onPublishRepository={openPublishRepositoryDialog}
	onQueueRepositoryCommitWorkOrder={queueRepositoryCommitWorkOrder}
	onRepositoryFavoriteToggle={toggleRepositoryFavorite}
	onGitAction={(node, repository, action) => runRepositoryGitAction({ node, repository }, action)}
/>

{#if standaloneError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && detailsEditor === null && githubCredentialEditor === null && publishTarget === null && ssealedTarget === null}
	<p class="workduck-inline-error" aria-live="polite">{getProjectFormErrorMessage(standaloneError, projectMessages.errors)}</p>
{/if}
{#if queueFolderError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && detailsEditor === null && githubCredentialEditor === null && publishTarget === null && ssealedTarget === null}
	<p class="workduck-inline-error" aria-live="polite">
		{getQueueFolderLocalizedError(messages, queueFolderError)}
	</p>
{/if}

{#if hasActiveOverlay && ProjectBoardOverlays !== null}
<ProjectBoardOverlays
	{contextMenu}
	{projectMessages}
	bind:contextMenuElement
	bind:shouldDeleteLocalFolder
	bind:descriptionInput
	bind:detailsNameInput
	bind:detailsPathInput
	bind:tagInput
	bind:environmentVaultPassword
	bind:selectedGithubCredentialSecretId
	bind:githubRepositoryName
	bind:githubRepositoryCommitMessage
	bind:formName
	bind:formDescription
	bind:formTags
	bind:repositoryRemoteUrl
	bind:repositoryGithubCredentialSecretId
	bind:repositorySsealedScaffoldScope
	bind:repositorySsealedScaffoldProfile
	{deleteCandidate}
	{descriptionEditor}
	{detailsEditor}
	{tagEditor}
	{githubCredentialEditor}
	{publishTarget}
	{ssealedTarget}
	{dialog}
	dialogTargetNodeName={dialogTargetNode?.name ?? null}
	{repositorySourceMode}
	{formError}
	{storageError}
	{isDeleting}
	{canConfirmDelete}
	{canDeleteLocalFolder}
	{isSavingDescription}
	{canSaveDescription}
	{isSavingDetails}
	{canSaveDetails}
	{isSavingTags}
	{canSaveTags}
	{remoteUrlEditor}
	bind:remoteUrlInput
	{isSavingRemoteUrl}
	{canSaveRemoteUrl}
	{environmentVaultEnvelope}
	{environmentVault}
	{environmentVaultError}
	{githubCredentialOptions}
	{isEnvironmentVaultBusy}
	{isSubmitting}
	{canSaveGithubCredential}
	{githubRepositoryVisibility}
	{isPublishingRepository}
	{isPreviewingSsealed}
	{isApplyingSsealed}
	{canSubmitPublishRepository}
	{canApplySsealedScaffold}
	{canSubmitDialog}
	{canOpenContextFolder}
	{canCloneContextRepository}
	{canInitializeContextRepository}
	{canPublishContextRepository}
	{canApplySsealedContextRepository}
	contextRepositoryFavorite={contextMenuRepository?.repository.favorite === true}
	{ssealedScaffoldApplyScope}
	{ssealedScaffoldApplyProfile}
	{ssealedPreview}
	canEditContextGithubCredential={canEditContextGithubCredential()}
	{getDeleteDialogTitle}
	{getDeleteDialogText}
	{getDeleteLocalFolderLabel}
	{getDeleteLocalFolderUnavailableText}
	{getVisibleFormErrorMessage}
	{getTagsInputMaxLength}
	{getDialogTitle}
	{getDialogSubmitLabel}
	{isRepositoryRemoteUrlError}
	onOpenFolder={contextMenuActions.openContextFolder}
	onEditDetails={contextMenuActions.openContextDetailsEditor}
	onEditDescription={contextMenuActions.openContextDescriptionEditor}
	onEditGithubCredential={contextMenuActions.openContextGithubCredentialEditor}
	onEditRemoteUrl={contextMenuActions.openContextRemoteUrlEditor}
	onEditTags={contextMenuActions.openContextTagEditor}
	onDelete={contextMenuActions.openContextDeleteDialog}
	onCloneRepository={contextMenuActions.openContextCloneRepository}
	onInitializeRepository={contextMenuActions.openContextInitializeRepository}
	onPublishRepository={contextMenuActions.openContextPublishRepository}
	onApplySsealedRepository={contextMenuActions.openContextApplySsealedRepository}
	onToggleRepositoryFavorite={toggleContextRepositoryFavorite}
	onRepositoryTask={contextMenuActions.openContextRepositoryTask}
	onSsealedScopeSelect={selectSsealedScaffoldApplyScope}
	onSsealedProfileSelect={selectSsealedScaffoldApplyProfile}
	onSsealedPreviewRefresh={refreshSsealedScaffoldPreview}
	onSsealedApply={applySsealedScaffoldToTarget}
	onSsealedBackdropClick={closeSsealedScaffoldDialogFromBackdrop}
	onSsealedClose={closeSsealedScaffoldDialog}
	onDeleteBackdropClick={dialogActions.handleDeleteConfirmationBackdropClick}
	onDeleteClose={dialogActions.closeDeleteDialog}
	onDeleteConfirm={dialogActions.handleDeleteConfirm}
	onDescriptionInput={editorActions.handleDescriptionEditorInput}
	onDescriptionSubmit={editorActions.handleDescriptionEditorSubmit}
	onDescriptionBackdropClick={editorActions.handleDescriptionEditorBackdropClick}
	onDescriptionClose={editorActions.closeDescriptionEditor}
	onDetailsInput={editorActions.handleDetailsEditorInput}
	onDetailsSubmit={editorActions.handleDetailsEditorSubmit}
	onDetailsBackdropClick={editorActions.handleDetailsEditorBackdropClick}
	onDetailsClose={editorActions.closeDetailsEditor}
	onTagInput={editorActions.handleTagEditorInput}
	onTagSubmit={editorActions.handleTagEditorSubmit}
	onTagBackdropClick={editorActions.handleTagEditorBackdropClick}
	onTagClose={editorActions.closeTagEditor}
	onRemoteUrlInput={editorActions.handleRemoteUrlEditorInput}
	onRemoteUrlSubmit={editorActions.handleRemoteUrlEditorSubmit}
	onRemoteUrlBackdropClick={editorActions.handleRemoteUrlEditorBackdropClick}
	onRemoteUrlClose={editorActions.closeRemoteUrlEditor}
	onUnlock={editorActions.handleUnlockProjectEnvironmentVault}
	onGithubCredentialSubmit={editorActions.handleGithubCredentialSubmit}
	onGithubCredentialBackdropClick={editorActions.handleGithubCredentialEditorBackdropClick}
	onGithubCredentialClose={editorActions.closeGithubCredentialEditor}
	onRepositoryNameInput={handleGithubRepositoryNameInput}
	onCommitMessageInput={handleGithubRepositoryCommitMessageInput}
	onSelectVisibility={selectGithubRepositoryVisibility}
	onPublishSubmit={handlePublishRepositorySubmit}
	onPublishBackdropClick={handlePublishRepositoryBackdropClick}
	onPublishClose={closePublishRepositoryDialog}
	onNameInput={dialogActions.handleNameInput}
	onDialogDescriptionInput={editorActions.handleDescriptionEditorInput}
	onDialogTagsInput={editorActions.handleTagInput}
	onRepositoryRemoteUrlInput={dialogActions.handleRepositoryRemoteUrlInput}
	onRepositoryGithubCredentialSelect={(event) => {
		const target = event.currentTarget;

		if (target instanceof HTMLSelectElement) {
			repositoryGithubCredentialSecretId = target.value;
			formError = null;
			status = null;
		}
	}}
	onRepositorySsealedScaffoldScopeSelect={dialogActions.handleRepositorySsealedScaffoldScopeSelect}
	onRepositorySsealedScaffoldProfileSelect={dialogActions.handleRepositorySsealedScaffoldProfileSelect}
	onSelectRepositorySourceMode={dialogActions.selectRepositorySourceMode}
	onDialogSubmit={dialogActions.handleDialogSubmit}
	onDialogBackdropClick={dialogActions.handleDialogBackdropClick}
	onDialogClose={dialogActions.closeDialog}
/>
{/if}

<StatusToast message={status} />
