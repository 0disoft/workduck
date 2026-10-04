	<script lang="ts">
	import { createProjectBoardRepositoryController } from './project-board-repository-controller.svelte';
	import { getQueueFolderLocalizedError } from '#lib/queue/queue-panel-errors.ts';
	import { getTagsInputMaxLength } from './project-board-selectors';
	import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
	import { getWorkduckMessages, type WorkduckLanguageId } from '#lib/i18n/workduck-language.ts';
	import type { EnvironmentVault } from '#lib/environment/environment-vault.ts';
	import StatusToast from '#lib/ui/StatusToast.svelte';
	import { type SecretVaultEnvelope } from '#lib/environment/secret-vault-crypto.ts';
	import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';

	import type { QueueFolderError } from '#lib/queue/queue-folder.ts';
	import { getDefaultSsealedScaffoldProfile, type ProjectFolderError, type SsealedScaffoldProfile, type SsealedScaffoldScope } from './project-folder';
	import { createProjectBoardScaffoldDialog } from './project-board-scaffold-dialog.svelte';

	import { createEmptyProjectRegistry, type ProjectNodeRecord, type ProjectRegistry, type ProjectRepositoryLinkRecord } from './project-registry';
	import { type ProjectRegistryStorageError } from './project-storage';
	import { type ProjectRepositoryOperationStorageError } from './project-operation-storage';
	import { createProjectBoardSelectionIndex, type ProjectRepositoryGitStatus, type ProjectRepositorySyncFilter } from './project-board-selectors';
	import { getProjectFormErrorMessage, type ProjectFormError } from './project-board-errors';
	import { canSubmitProjectDialog, getProjectDeleteDialogText, getProjectDeleteDialogTitle, getProjectDeleteLocalFolderLabel, getProjectDeleteLocalFolderUnavailableText, getProjectDialogSubmitLabel, getProjectDialogTitle, isProjectRepositoryRemoteUrlError } from './project-board-dialog-rules';
	import { createProjectBoardContextMenuHandlers } from './project-board-context-menu-handlers';
	import { createProjectBoardEditorHandlers } from './project-board-editor-handlers';
	import { closeProjectBoardOverlayFromEscape } from './project-board-close-actions';
	import { createProjectBoardDialogHandlers } from './project-board-dialog-handlers';
	import { type ProjectRepositoryOperation } from './project-board-operations';
	import { canEditProjectBoardContextGithubCredential, canOpenProjectBoardContextFolder, getProjectBoardContextRepositoryGitStatus, isProjectBoardDeleteLocalFolderAvailable } from './project-board-surface-helpers';
	import { createProjectBoardSurfaceSelection } from './project-board-surface-selection';

	import { type ProjectRepositoryTaskRunRecordByRepositoryId } from './project-repository-task-runs';

	import { createWorkspacePathBoundaryKey } from './project-board-paths';

	import { canCloneProjectRepository } from './project-board-repository-rules';

	import { refreshProjectRepositoryGitStatusForBoard } from './project-board-runtime-state';
	import { getProjectContextMenuNode, getProjectContextMenuRepository, getProjectDialogTargetNode, getProjectRepositoryTarget } from './project-board-targets';
	import { createProjectBoardRegistryWriter } from './project-board-registry-writer.svelte';
	import type { ProjectContextMenuState, ProjectDeleteCandidate, ProjectDialogState, ProjectGithubCredentialEditorTarget, ProjectRepositoryRemoteUrlEditorTarget, ProjectRepositorySourceMode, ProjectTagEditorTarget } from './project-board-types';
	import { createGithubCredentialNameById, getDefaultRepositoryGithubCredentialSecretId as getDefaultRepositoryGithubCredentialSecretIdFromRegistry, getGithubCredentialOptions, resolveRepositoryDialogForkCredential as resolveRepositoryDialogForkCredentialFromVault } from './project-board-github-credentials';
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

	let storedRegistry = $state<ProjectRegistry>(createEmptyProjectRegistry(''));
	const persistRegistry = createProjectBoardRegistryWriter({
		workspace: () => workspace,
		registry: () => storedRegistry,
		update: (next) => {
			storedRegistry = next.registry;
			storedStorageError = next.storageError;
		}
	});
	let registry = $derived(persistRegistry.getRegistry());
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
	let storedStorageError = $state<ProjectRegistryStorageError | null>(null);
	let storageError = $derived(persistRegistry.getSaveError() ?? storedStorageError);
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

	const repositoryController = createProjectBoardRepositoryController({
		registryWriter: persistRegistry, registry: () => registry,
		operations: () => repositoryOperationById, setOperations: (value) => { repositoryOperationById = value; },
		taskRuns: () => repositoryTaskRunById, setTaskRuns: (value) => { repositoryTaskRunById = value; },
		gitStatusById: () => repositoryGitStatusById, pathBoundaryKey: () => workspacePathBoundaryKey,
		environmentVault: () => environmentVault, githubCredentialNameById: () => githubCredentialNameById,
		githubCredentialOptions: () => githubCredentialOptions, selectedProject: () => selectedProject,
		messages: () => projectMessages, languageId: () => languageId,
		scaffoldState: () => ({ isApplying: scaffoldDialog.isApplyingSsealed, target: scaffoldDialog.ssealedTarget }),
		preloadOverlays: preloadProjectBoardOverlays, closeContextMenu,
		clearDeleteCandidate: () => { deleteCandidate = null; }, clearDialog: () => { dialog = null; },
		setFormError: (value) => { formError = value; }, setStatus: (value) => { status = value; },
		setQueueFolderError: (value) => { queueFolderError = value; },
		setOperationStorageError: (value) => { operationStorageError = value; },
		setSelectedGroupId: (value) => { selectedGroupId = value; },
		refreshRepositoryGitStatus: (id, path, isCurrent) => refreshRepositoryGitStatus(id, path, repositoryGitInspectionSignature, isCurrent)
	});
	const {
		openPublishRepositoryDialog,
		closePublishRepositoryDialog,
		handleGithubRepositoryNameInput,
		handleGithubRepositoryCommitMessageInput,
		selectGithubRepositoryVisibility,
		handlePublishRepositoryBackdropClick,
		handlePublishRepositorySubmit,
		runRepositoryGitAction,
		queueRepositoryCommitWorkOrder,
		createRepositoryActionContext,
		getRepositoryOperation,
		getRepositoryTaskRun,
		setRepositoryTaskRun,
		isRepositoryBusy,
		isRepositoryOperationRunning,
		setRepositoryFavorite,
		toggleRepositoryFavorite,
		getRepositoryCardKind,
		getNodeGithubCredentialName,
		getRepositoryGithubCredentialName,
		isRepositoryCloneTarget,
		isRepositoryGitActionTarget,
		canCloneRepository,
		canInitializeRepository,
		canPublishRepositoryToGithub,
		canApplySsealedToRepository,
		canRunRemoteRepositoryGitAction,
		canQueueRepositoryCommitWorkOrder,
		isRepositoryPathInsideWorkspace,
		isRepositoryPathInsideProjectsFolder
	} = repositoryController;

	const scaffoldDialog = createProjectBoardScaffoldDialog({
		captureWorkspace: () => persistRegistry.capture(),
		messages: () => projectMessages,
		canApplyToRepository: canApplySsealedToRepository,
		preloadOverlays: preloadProjectBoardOverlays,
		onOpen: () => {
			deleteCandidate = null;
			repositoryController.publishTarget = null;
			dialog = null;
			closeContextMenu();
		},
		setFormError: (error) => { formError = error; },
		setStatus: (value) => { status = value; }
	});
	let ssealedTarget = $derived(scaffoldDialog.ssealedTarget);
	let ssealedScaffoldApplyScope = $derived(scaffoldDialog.ssealedScaffoldApplyScope);
	let ssealedScaffoldApplyProfile = $derived(scaffoldDialog.ssealedScaffoldApplyProfile);
	let ssealedPreview = $derived(scaffoldDialog.ssealedPreview);
	let isPreviewingSsealed = $derived(scaffoldDialog.isPreviewingSsealed);
	let isApplyingSsealed = $derived(scaffoldDialog.isApplyingSsealed);
	const openApplySsealedRepositoryDialog = scaffoldDialog.openApplySsealedRepositoryDialog;
	const closeSsealedScaffoldDialog = scaffoldDialog.closeSsealedScaffoldDialog;
	const closeSsealedScaffoldDialogFromBackdrop = scaffoldDialog.closeSsealedScaffoldDialogFromBackdrop;
	const selectSsealedScaffoldApplyScope = scaffoldDialog.selectSsealedScaffoldApplyScope;
	const selectSsealedScaffoldApplyProfile = scaffoldDialog.selectSsealedScaffoldApplyProfile;
	const refreshSsealedScaffoldPreview = scaffoldDialog.refreshSsealedScaffoldPreview;
	const applySsealedScaffoldToTarget = scaffoldDialog.applySsealedScaffoldToTarget;

	let repositoryActionWorkspaceId = $derived(workspace.id);
	let repositoryActionWorkspacePath = $derived(workspace.path);
	$effect(() => {
		void repositoryActionWorkspaceId;
		void repositoryActionWorkspacePath;
		repositoryController.resetWorkspace();
		formError = null;
		queueFolderError = null;
		status = null;
	});
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
	let priorityRepositoryIds = $derived(
		new Set(selectedRepositories.map((repository) => repository.id))
	);
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

	let canApplySsealedScaffold = $derived(scaffoldDialog.canApplySsealedScaffold);
	let hasActiveOverlay = $derived(
		contextMenu !== null ||
			deleteCandidate !== null ||
			descriptionEditor !== null ||
			detailsEditor !== null ||
			tagEditor !== null ||
			githubCredentialEditor !== null ||
			remoteUrlEditor !== null ||
			repositoryController.publishTarget !== null ||
			ssealedTarget !== null ||
			dialog !== null
	);

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
		clearPublishTarget: () => { repositoryController.publishTarget = null; },
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
		clearPublishTarget: () => { repositoryController.publishTarget = null; }
	});

	function closeContextMenu() {
		contextMenuActions.closeContextMenu();
	}

	async function reloadConflictedProjects() {
		if (!(await persistRegistry.reload())) return;
		formError = null;
		dialogActions.closeDialog();
		dialogActions.closeDeleteDialog();
		editorActions.closeTagEditor();
		editorActions.closeDescriptionEditor();
		editorActions.closeDetailsEditor();
		editorActions.closeRemoteUrlEditor();
		editorActions.closeGithubCredentialEditor();
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

	function canEditContextGithubCredential() {
		return canEditProjectBoardContextGithubCredential({
			target: contextMenu?.target ?? null,
			nodes: registry.nodes,
			selectedProject
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

	async function refreshRepositoryGitStatus(
		repositoryId: string,
		path: string | null,
		expectedSignature = repositoryGitInspectionSignature,
		isCurrent: () => boolean = () => true
	) {
		await refreshProjectRepositoryGitStatusForBoard(
			{ workspaceId: workspace.id, repositoryId, path, expectedSignature },
			{
				getRepositoryGitInspectionSignature: () => repositoryGitInspectionSignature,
				updateRepositoryGitStatus: (nextRepositoryId, gitStatus) => {
					if (!isCurrent()) return;
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
				hasPublishTarget: repositoryController.publishTarget !== null,
				hasSsealedTarget: ssealedTarget !== null,
				hasGithubCredentialEditor: githubCredentialEditor !== null,
				isSavingTags,
				isSavingDescription,
				isSavingDetails,
				isPublishingRepository: repositoryController.isPublishingRepository,
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
	bind:registry={storedRegistry}
	bind:storageError={storedStorageError}
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
	{priorityRepositoryIds}
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

{#if persistRegistry.hasConflict()}
	<button type="button" class="workduck-button" disabled={persistRegistry.isReloading()} onclick={reloadConflictedProjects}>
		{projectMessages.reloadProjects}
	</button>
{/if}

{#if standaloneError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && detailsEditor === null && githubCredentialEditor === null && repositoryController.publishTarget === null && ssealedTarget === null}
	<p class="workduck-inline-error" aria-live="polite">{getProjectFormErrorMessage(standaloneError, projectMessages.errors)}</p>
{/if}
{#if queueFolderError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && detailsEditor === null && githubCredentialEditor === null && repositoryController.publishTarget === null && ssealedTarget === null}
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
	bind:githubRepositoryName={repositoryController.githubRepositoryName}
	bind:githubRepositoryCommitMessage={repositoryController.githubRepositoryCommitMessage}
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
	publishTarget={repositoryController.publishTarget}
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
	githubRepositoryVisibility={repositoryController.githubRepositoryVisibility}
	isPublishingRepository={repositoryController.isPublishingRepository}
	{isPreviewingSsealed}
	{isApplyingSsealed}
	canSubmitPublishRepository={repositoryController.canSubmitPublishRepository}
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
