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
		enqueueRepositoryCommitWorkOrder
	} from '$lib/queue/repository-commit-work-order';
	import {
		getQueueFolderLocalizedError
	} from '$lib/queue/queue-panel-errors';
	import type { QueueFolderError } from '$lib/queue/queue-folder';
	import { type ProjectFolderError } from './project-folder';
	import { type ProjectRepositoryGithubVisibility } from './project-repository';

	import {
		createEmptyProjectRegistry,
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
		mapLatestTaskRunsByRepositoryId,
		type ProjectRepositoryTaskRunRecordByRepositoryId
	} from './project-repository-task-runs';
	import {
		readProjectRepositoryTaskRunRecords,
		type ProjectRepositoryTaskRunRecord
	} from './project-repository-task';
	import {
		isRepositoryPathInsideProjectsFolder as isRepositoryPathInsideProjectsFolderPath,
		isRepositoryPathInsideWorkspace as isRepositoryPathInsideWorkspacePath
	} from './project-board-paths';
	import { DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE } from './project-board-publish-constants';
	import {
		canCloneProjectRepository,
		canInitializeProjectRepository,
		canPublishProjectRepositoryToGithub,
		canRunRemoteProjectRepositoryGitAction,
		getProjectRepositoryCardKind
	} from './project-board-repository-rules';
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
		ProjectRepositoryTarget,
		ProjectRepositorySourceMode,
		ProjectTagEditorTarget
	} from './project-board-types';
	import {
		getGithubCredentialOptions,
	} from './project-board-github-credentials';
	import ProjectBoardOverlays from './ProjectBoardOverlays.svelte';
	import ProjectBoardLanes from './ProjectBoardLanes.svelte';
	import ProjectContextMenuLifecycle from './ProjectContextMenuLifecycle.svelte';
	import ProjectBoardWorkspaceLifecycle from './ProjectBoardWorkspaceLifecycle.svelte';
	import ProjectBoardRepositoryLifecycle from './ProjectBoardRepositoryLifecycle.svelte';

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
	let tagFilter = $state('');
	let repositorySyncFilter = $state<ProjectRepositorySyncFilter>('all');
	let tagEditor = $state<ProjectTagEditorTarget | null>(null);
	let tagInput = $state('');
	let githubCredentialEditor = $state<ProjectGithubCredentialEditorTarget | null>(null);
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
	let githubRepositoryName = $state('');
	let githubRepositoryCommitMessage = $state(DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE);
	let githubRepositoryVisibility = $state<ProjectRepositoryGithubVisibility>('private');
	let isPublishingRepository = $state(false);
	let isSavingTags = $state(false);
	let isSavingDescription = $state(false);
	let isOpeningFolder = $state(false);
	let contextMenuElement = $state<HTMLElement | undefined>(undefined);

	let boardSelection = $derived(createProjectBoardSurfaceSelection({
		nodes: registry.nodes,
		repositoryGitStatusById,
		tagFilter,
		repositorySyncFilter,
		selectedProjectId,
		selectedGroupId
	}));
	let projectRows = $derived(boardSelection.projectRows);
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
	let githubCredentialOptions = $derived(getGithubCredentialOptions(environmentVault));
	let canSaveGithubCredential = $derived(
		githubCredentialEditor !== null && !isSubmitting && environmentVault !== null
	);
	let canSaveDescription = $derived(descriptionEditor !== null && !isSavingDescription);
	let canSubmitDialog = $derived(
		canSubmitProjectDialog(dialog, repositorySourceMode, formName, repositoryRemoteUrl) &&
			!isSubmitting
	);
	let canConfirmDelete = $derived(deleteCandidate !== null && !isDeleting);
	let canDeleteLocalFolder = $derived(isDeleteLocalFolderAvailable());
	let canCloneContextRepository = $derived(
		contextMenuRepository !== null &&
			contextMenuRepository.repository.remoteUrl !== null &&
			contextMenuRepository.repository.path === null &&
			!isRepositoryBusy(contextMenuRepository.repository.id)
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
	let canSubmitPublishRepository = $derived(
		publishTarget !== null &&
			githubRepositoryName.trim().length > 0 &&
			githubRepositoryCommitMessage.trim().length > 0 &&
			!isPublishingRepository &&
			!isRepositoryBusy(publishTarget.repository.id)
	);

	async function persistRegistry(nextRegistry: ProjectRegistry) {
		return writeProjectRegistryForBoard(nextRegistry, (next) => {
			registry = next.registry;
			storageError = next.storageError;
		});
	}

	const editorActions = createProjectBoardEditorHandlers({
		getRegistry: () => registry,
		getWorkspaceId: () => workspace.id,
		getDescriptionEditor: () => descriptionEditor,
		getDescriptionInput: () => descriptionInput,
		getIsSavingDescription: () => isSavingDescription,
		getTagEditor: () => tagEditor,
		getTagInput: () => tagInput,
		getIsSavingTags: () => isSavingTags,
		getGithubCredentialEditor: () => githubCredentialEditor,
		getSelectedGithubCredentialSecretId: () => selectedGithubCredentialSecretId,
		getIsSubmitting: () => isSubmitting,
		getEnvironmentVault: () => environmentVault,
		getEnvironmentVaultEnvelope: () => environmentVaultEnvelope,
		getEnvironmentVaultPassword: () => environmentVaultPassword,
		getIsEnvironmentVaultBusy: () => isEnvironmentVaultBusy,
		persistRegistry,
		setDescriptionEditor: (editor) => { descriptionEditor = editor; },
		setDescriptionInput: (input) => { descriptionInput = input; },
		setIsSavingDescription: (isSaving) => { isSavingDescription = isSaving; },
		setTagEditor: (editor) => { tagEditor = editor; },
		setTagInput: (input) => { tagInput = input; },
		setIsSavingTags: (isSaving) => { isSavingTags = isSaving; },
		setGithubCredentialEditor: (editor) => { githubCredentialEditor = editor; },
		setSelectedGithubCredentialSecretId: (secretId) => {
			selectedGithubCredentialSecretId = secretId;
		},
		setIsSubmitting: (nextIsSubmitting) => { isSubmitting = nextIsSubmitting; },
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
		openDescriptionEditor: editorActions.openDescriptionEditor,
		openPublishRepositoryDialog
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
		getIsSubmitting: () => isSubmitting,
		getDeleteCandidate: () => deleteCandidate,
		getIsDeleting: () => isDeleting,
		getShouldDeleteLocalFolder: () => shouldDeleteLocalFolder,
		getCanDeleteLocalFolder: isDeleteLocalFolderAvailable,
		persistRegistry,
		closeContextMenu,
		setDialog: (nextDialog) => { dialog = nextDialog; },
		setFormName: (name) => { formName = name; },
		setFormDescription: (description) => { formDescription = description; },
		setFormTags: (tags) => { formTags = tags; },
		setRepositorySourceMode: (sourceMode) => { repositorySourceMode = sourceMode; },
		setRepositoryRemoteUrl: (remoteUrl) => { repositoryRemoteUrl = remoteUrl; },
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

	function openPublishRepositoryDialog(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
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

	function handleGithubRepositoryNameInput() {
		formError = null;
		status = null;
	}

	function handleGithubRepositoryCommitMessageInput() {
		formError = null;
		status = null;
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
		if (!canQueueRepositoryCommitWorkOrder(repository) || repository.path === null) {
			return;
		}

		commitWorkOrderTargetRepositoryId = repository.id;
		formError = null;
		queueFolderError = null;
		status = null;

		try {
			const rootProjectId = resolveRootProjectId(node);
			const result = await enqueueRepositoryCommitWorkOrder({
				workspacePath: workspace.path,
				repositoryName: repository.name,
				repositoryPath: repository.path,
				source: 'project',
				responseLanguage: languageId === 'en' ? 'en' : 'ko',
				projectIds: rootProjectId === null ? [] : [rootProjectId]
			});

			if (!result.ok) {
				queueFolderError = result.error;
				return;
			}

			status = projectMessages.repository.commitWorkOrderQueued.replace(
				'{relativePath}',
				result.relativePath
			);
		} finally {
			commitWorkOrderTargetRepositoryId = null;
		}
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
			closePublishRepositoryDialog
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

	function getAllRepositories() {
		return registry.nodes.flatMap((node) => node.repositories);
	}

	async function refreshRepositoryTaskRuns() {
		const result = await readProjectRepositoryTaskRunRecords(workspace.path);

		if (!result.ok) {
			return;
		}

		repositoryTaskRunById = mapLatestTaskRunsByRepositoryId(
			getAllRepositories(),
			result.records
		);
	}

	function isRepositoryBusy(repositoryId: string) {
		return (
			isProjectBoardRepositoryBusy(repositoryOperationById, repositoryId) ||
			repositoryTaskRunById[repositoryId]?.state === 'running' ||
			commitWorkOrderTargetRepositoryId === repositoryId
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

	function getDeleteDialogTitle() { return getProjectDeleteDialogTitle(deleteCandidate); }

	function getDeleteDialogText() { return getProjectDeleteDialogText(deleteCandidate); }

	function getDeleteLocalFolderLabel() { return getProjectDeleteLocalFolderLabel(deleteCandidate); }

	function getDeleteLocalFolderUnavailableText() { return getProjectDeleteLocalFolderUnavailableText(deleteCandidate); }

	function isDeleteLocalFolderAvailable() {
		return isProjectBoardDeleteLocalFolderAvailable(
			deleteCandidate,
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
			githubCredentialOptions,
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
			githubCredentialOptions,
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

	function isRepositoryCloneTarget(nodeId: string, repositoryId: string) {
		return isProjectBoardRepositoryTarget(cloneTarget, nodeId, repositoryId);
	}

	function isRepositoryGitActionTarget(nodeId: string, repositoryId: string) {
		return isProjectBoardRepositoryTarget(gitActionTarget, nodeId, repositoryId);
	}

	function canCloneRepository(repository: ProjectRepositoryLinkRecord) {
		return canCloneProjectRepository(repository, isRepositoryBusy(repository.id));
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
		const gitStatus = repositoryGitStatusById[repository.id];

		return (
			repository.path !== null &&
			isRepositoryPathInsideWorkspace(repository.path) &&
			gitStatus?.isGitRepository === true &&
			gitStatus.hasUncommittedChanges &&
			!isRepositoryBusy(repository.id)
		);
	}

	function resolveRootProjectId(node: ProjectNodeRecord) {
		let currentNode: ProjectNodeRecord | undefined = node;

		while (currentNode !== undefined && currentNode.kind !== 'project') {
			currentNode = registry.nodes.find((candidate) => candidate.id === currentNode?.parentId);
		}

		return currentNode?.id ?? null;
	}

	function isRepositoryPathInsideWorkspace(repositoryPath: string) {
		return isRepositoryPathInsideWorkspacePath(workspace.path, repositoryPath);
	}

	function isRepositoryPathInsideProjectsFolder(repositoryPath: string) {
		return isRepositoryPathInsideProjectsFolderPath(workspace.path, repositoryPath);
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

	$effect(() => {
		const workspacePath = workspace.path;
		const repositorySignature = registry.nodes
			.flatMap((node) =>
				node.repositories.map((repository) => `${repository.id}:${repository.path ?? ''}`)
			)
			.join('|');
		let isCurrent = true;

		void repositorySignature;

		const refresh = async () => {
			const result = await readProjectRepositoryTaskRunRecords(workspacePath);

			if (!isCurrent || !result.ok) {
				return;
			}

			repositoryTaskRunById = mapLatestTaskRunsByRepositoryId(
				getAllRepositories(),
				result.records
			);
		};

		void refresh();
		const interval = window.setInterval(() => void refresh(), 2000);

		return () => {
			isCurrent = false;
			window.clearInterval(interval);
		};
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
				hasPublishTarget: publishTarget !== null,
				hasGithubCredentialEditor: githubCredentialEditor !== null,
				isSavingTags,
				isSavingDescription,
				isPublishingRepository,
				isSubmitting,
				isEnvironmentVaultBusy
			},
			{
				closeDialog: dialogActions.closeDialog,
				closeDeleteDialog: dialogActions.closeDeleteDialog,
				closeTagEditor: editorActions.closeTagEditor,
				closeDescriptionEditor: editorActions.closeDescriptionEditor,
				closePublishRepositoryDialog,
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
	{registry}
	{persistRegistry}
	bind:folderRepairError
	bind:folderRepairSignature
	bind:repositoryGitInspectionSignature
	bind:repositoryGitStatusById
	bind:repositoryOperationById
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
	bind:tagFilter
	{repositorySyncFilter}
	{repositoryFilterStats}
	registryNodes={registry.nodes}
	{projectNodes}
	{selectedProject}
	{selectedProjectGroups}
	{selectedGroup}
	{selectedRepositories}
	{repositoryGitStatusById}
	onBoardContextMenu={contextMenuActions.openBoardContextMenu}
	onRepositorySyncFilterSelect={selectRepositorySyncFilter}
	onTagFilterInput={editorActions.handleTagFilterInput}
	onOpenDialog={dialogActions.openDialog}
	onSelectProject={selectProject}
	onSelectGroup={selectGroup}
	onProjectContextMenu={contextMenuActions.openProjectContextMenu}
	onRepositoryContextMenu={contextMenuActions.openRepositoryContextMenu}
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
	onGitAction={(node, repository, action) => runRepositoryGitAction({ node, repository }, action)}
/>

{#if standaloneError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && githubCredentialEditor === null && publishTarget === null}
	<p class="workduck-inline-error" aria-live="polite">{getProjectFormErrorMessage(standaloneError, projectMessages.errors)}</p>
{/if}
{#if queueFolderError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && githubCredentialEditor === null && publishTarget === null}
	<p class="workduck-inline-error" aria-live="polite">
		{getQueueFolderLocalizedError(messages, queueFolderError)}
	</p>
{/if}

<ProjectBoardOverlays
	{contextMenu}
	{projectMessages}
	bind:contextMenuElement
	bind:shouldDeleteLocalFolder
	bind:descriptionInput
	bind:tagInput
	bind:environmentVaultPassword
	bind:selectedGithubCredentialSecretId
	bind:githubRepositoryName
	bind:githubRepositoryCommitMessage
	bind:formName
	bind:formDescription
	bind:formTags
	bind:repositoryRemoteUrl
	{deleteCandidate}
	{descriptionEditor}
	{tagEditor}
	{githubCredentialEditor}
	{publishTarget}
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
	{isSavingTags}
	{canSaveTags}
	{environmentVaultEnvelope}
	{environmentVault}
	{environmentVaultError}
	{githubCredentialOptions}
	{isEnvironmentVaultBusy}
	{isSubmitting}
	{canSaveGithubCredential}
	{githubRepositoryVisibility}
	{isPublishingRepository}
	{canSubmitPublishRepository}
	{canSubmitDialog}
	{canOpenContextFolder}
	{canCloneContextRepository}
	{canInitializeContextRepository}
	{canPublishContextRepository}
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
	onEditDescription={contextMenuActions.openContextDescriptionEditor}
	onEditGithubCredential={contextMenuActions.openContextGithubCredentialEditor}
	onEditTags={contextMenuActions.openContextTagEditor}
	onDelete={contextMenuActions.openContextDeleteDialog}
	onCloneRepository={contextMenuActions.openContextCloneRepository}
	onInitializeRepository={contextMenuActions.openContextInitializeRepository}
	onPublishRepository={contextMenuActions.openContextPublishRepository}
	onRepositoryTask={contextMenuActions.openContextRepositoryTask}
	onDeleteBackdropClick={dialogActions.handleDeleteConfirmationBackdropClick}
	onDeleteClose={dialogActions.closeDeleteDialog}
	onDeleteConfirm={dialogActions.handleDeleteConfirm}
	onDescriptionInput={editorActions.handleDescriptionEditorInput}
	onDescriptionSubmit={editorActions.handleDescriptionEditorSubmit}
	onDescriptionBackdropClick={editorActions.handleDescriptionEditorBackdropClick}
	onDescriptionClose={editorActions.closeDescriptionEditor}
	onTagInput={editorActions.handleTagEditorInput}
	onTagSubmit={editorActions.handleTagEditorSubmit}
	onTagBackdropClick={editorActions.handleTagEditorBackdropClick}
	onTagClose={editorActions.closeTagEditor}
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
	onSelectRepositorySourceMode={dialogActions.selectRepositorySourceMode}
	onDialogSubmit={dialogActions.handleDialogSubmit}
	onDialogBackdropClick={dialogActions.handleDialogBackdropClick}
	onDialogClose={dialogActions.closeDialog}
/>

<StatusToast message={status} />
