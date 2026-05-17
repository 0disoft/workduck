	<script lang="ts">
	import { tick } from 'svelte';
	import {
		parseEnvironmentVault,
		type EnvironmentSecretKind,
		type EnvironmentSecretRecord,
		type EnvironmentVault
	} from '$lib/environment/environment-vault';
	import {
		readEnvironmentVaultEnvelope,
		subscribeEnvironmentVaultEnvelope
	} from '$lib/environment/environment-vault-storage';
	import {
		decryptSecretVaultPayload,
		type SecretVaultCryptoError,
		type SecretVaultEnvelope
	} from '$lib/environment/secret-vault-crypto';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
	import {
		createProjectFolder,
		createProjectGroupFolder,
		deleteProjectNodeFolder,
		deleteProjectRepositoryFolder,
		ensureProjectFolderPath,
		openProjectFolderPath,
		openProjectNodeFolder,
		type ProjectFolderError
	} from './project-folder';
	import {
		cloneProjectRepository,
		fetchProjectRepositoryGit,
		initializeProjectRepositoryGit,
		inspectProjectRepositoryGit,
		publishProjectRepositoryToGithub,
		pullProjectRepositoryGit,
		pushProjectRepositoryGit,
		type ProjectRepositoryCloneError,
		type ProjectRepositoryGitCredentialInput,
		type ProjectRepositoryGithubVisibility,
		type ProjectRepositoryGitError
	} from './project-repository';

	import {
		addProjectNode,
		addProjectRepositoryLink,
		createEmptyProjectRegistry,
		createProjectTreeRows,
		PROJECT_DESCRIPTION_MAX_LENGTH,
		PROJECT_NAME_MAX_LENGTH,
		PROJECT_REPOSITORY_NAME_MAX_LENGTH,
		PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH,
		PROJECT_TAG_MAX_LENGTH,
		PROJECT_TAGS_MAX_COUNT,
		removeProjectNode,
		removeProjectRepositoryLink,
		setProjectNodeDescription,
		setProjectNodeGithubCredential,
		setProjectNodeTags,
		setProjectRepositoryGithubCredential,
		setProjectRepositoryTags,
		setProjectRepositoryLocalPath,
		type ProjectNodeKind,
		type ProjectNodeRecord,
		type ProjectRegistry,
		type ProjectRegistryError,
		type ProjectRepositoryLinkRecord,
		type ProjectTreeRow
	} from './project-registry';
	import {
		readProjectRegistry,
		subscribeProjectRegistry,
		writeProjectRegistry,
		type ProjectRegistryStorageError
	} from './project-storage';
	import {
		readLatestProjectRepositoryOperationRecords,
		writeProjectRepositoryOperationRecord,
		type ProjectRepositoryOperationName,
		type ProjectRepositoryOperationState,
		type ProjectRepositoryOperationStorageError
	} from './project-operation-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly title: string;
	}

	type ProjectDialogMode = 'project' | 'group' | 'repository';
	type ProjectRepositorySourceMode = 'folder' | 'remote';
	type ProjectRepositoryGitAction = 'fetch' | 'pull' | 'push';
	type ProjectRepositorySyncFilter = 'all' | 'pull' | 'push';
	type ProjectCredentialError =
		| 'project-github-credential-vault-locked'
		| 'project-github-credential-missing'
		| 'project-github-credential-invalid';
	type ProjectFormError =
		| ProjectRegistryError
		| ProjectFolderError
		| ProjectRepositoryCloneError
		| ProjectRepositoryGitError
		| ProjectRegistryStorageError
		| ProjectRepositoryOperationStorageError
		| ProjectCredentialError;

	type ProjectContextMenuTarget =
		| {
				readonly type: 'node';
				readonly nodeId: string;
		  }
		| {
				readonly type: 'repository';
				readonly nodeId: string;
				readonly repositoryId: string;
		  };

	type ProjectDeleteCandidate =
		| {
				readonly type: 'node';
				readonly node: ProjectNodeRecord;
		  }
		| {
				readonly type: 'repository';
				readonly node: ProjectNodeRecord;
				readonly repository: ProjectRepositoryLinkRecord;
		  };

	type ProjectTagEditorTarget =
		| {
				readonly type: 'node';
				readonly node: ProjectNodeRecord;
		  }
		| {
				readonly type: 'repository';
				readonly node: ProjectNodeRecord;
				readonly repository: ProjectRepositoryLinkRecord;
		  };

	type ProjectGithubCredentialEditorTarget =
		| {
				readonly type: 'node';
				readonly node: ProjectNodeRecord;
		  }
		| {
				readonly type: 'repository';
				readonly node: ProjectNodeRecord;
				readonly repository: ProjectRepositoryLinkRecord;
		  };

	interface ProjectContextMenuState {
		readonly x: number;
		readonly y: number;
		readonly target: ProjectContextMenuTarget;
	}

	interface ProjectDialogState {
		readonly mode: ProjectDialogMode;
		readonly targetNodeId: string | null;
	}

	interface ProjectRepositoryGitStatus {
		readonly isGitRepository: boolean;
		readonly hasRemote: boolean;
		readonly aheadCount: number;
		readonly behindCount: number;
		readonly branch: string | null;
		readonly error: ProjectRepositoryGitError | null;
	}

	interface ProjectRepositoryOperation {
		readonly id: string;
		readonly name: ProjectRepositoryOperationName;
		readonly state: ProjectRepositoryOperationState;
		readonly error: string | null;
		readonly startedAt: string;
		readonly finishedAt: string | null;
	}

	interface GithubCredentialOption {
		readonly id: string;
		readonly name: string;
		readonly kind: EnvironmentSecretKind;
		readonly value: string;
	}

	const CONTEXT_MENU_MARGIN_PX = 12;
	const GITHUB_REPOSITORY_NAME_MAX_LENGTH = 100;
	const GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH = 200;
	const DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE = 'Initial commit';

	let { workspace, title }: Props = $props();

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
	let folderRepairError = $state<ProjectFolderError | null>(null);
	let folderRepairSignature = $state('');
	let repositoryGitInspectionSignature = $state('');
	let repositoryGitStatusById = $state<Record<string, ProjectRepositoryGitStatus>>({});
	let repositoryOperationById = $state<Record<string, ProjectRepositoryOperation>>({});
	let selectedProjectId = $state<string | null>(null);
	let selectedGroupId = $state<string | null>(null);
	let isSubmitting = $state(false);
	let isDeleting = $state(false);
	let cloneTarget = $state<ProjectContextMenuTarget | null>(null);
	let gitActionTarget = $state<ProjectContextMenuTarget | null>(null);
	let publishTarget = $state<{
		readonly node: ProjectNodeRecord;
		readonly repository: ProjectRepositoryLinkRecord;
	} | null>(null);
	let githubRepositoryName = $state('');
	let githubRepositoryCommitMessage = $state(DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE);
	let githubRepositoryVisibility = $state<ProjectRepositoryGithubVisibility>('private');
	let isPublishingRepository = $state(false);
	let isSavingTags = $state(false);
	let isSavingDescription = $state(false);
	let isOpeningFolder = $state(false);
	let contextMenuElement = $state<HTMLElement | undefined>(undefined);

	let projectRows = $derived(createProjectTreeRows(registry.nodes));
	let normalizedTagFilter = $derived(normalizeTagFilter(tagFilter));
	let repositoryFilterStats = $derived(getRepositoryFilterStats());
	let projectNodes = $derived(getProjectNodes(normalizedTagFilter, repositorySyncFilter));
	let selectedProject = $derived(resolveSelectedProject());
	let selectedProjectGroups = $derived(
		selectedProject === null
			? []
			: getProjectGroups(selectedProject.id, normalizedTagFilter, repositorySyncFilter)
	);
	let selectedGroup = $derived(resolveSelectedGroup());
	let selectedRepositories = $derived(
		selectedGroup === null
			? []
			: getGroupRepositories(selectedGroup, normalizedTagFilter, repositorySyncFilter)
	);
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
		dialog !== null &&
			canSubmitCurrentDialog() &&
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

	async function readRegistryFromStorage(workspaceId: string) {
		const result = await readProjectRegistry(workspaceId);

		registry = result.registry;
		storageError = result.ok ? null : result.error;
	}

	async function readRepositoryOperationRecordsFromStorage(workspaceId: string) {
		const result = await readLatestProjectRepositoryOperationRecords(workspaceId);

		if (!result.ok) {
			operationStorageError = result.error;
			return;
		}

		operationStorageError = null;
		repositoryOperationById = Object.fromEntries(
			Object.entries(result.recordsByRepositoryId).map(([repositoryId, record]) => [
				repositoryId,
				{
					id: record.id,
					name: record.name,
					state: record.state,
					error: record.error,
					startedAt: record.startedAt,
					finishedAt: record.finishedAt
				}
			])
		);
	}

	async function persistRegistry(nextRegistry: ProjectRegistry) {
		const result = await writeProjectRegistry(nextRegistry);

		registry = result.registry;
		storageError = result.ok ? null : result.error;
		return result.ok;
	}

	function openBoardContextMenu(event: MouseEvent) {
		event.preventDefault();
		closeContextMenu();
	}

	function openProjectContextMenu(event: MouseEvent, node: ProjectNodeRecord) {
		event.preventDefault();
		event.stopPropagation();
		openContextMenu(event.clientX, event.clientY, {
			type: 'node',
			nodeId: node.id
		});
	}

	function openRepositoryContextMenu(
		event: MouseEvent,
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		event.preventDefault();
		event.stopPropagation();
		openContextMenu(event.clientX, event.clientY, {
			type: 'repository',
			nodeId: node.id,
			repositoryId: repository.id
		});
	}

	function openContextMenu(x: number, y: number, target: ProjectContextMenuTarget) {
		contextMenu = {
			x: Math.max(CONTEXT_MENU_MARGIN_PX, x),
			y: Math.max(CONTEXT_MENU_MARGIN_PX, y),
			target
		};
		formError = null;
		status = null;
		deleteCandidate = null;
		descriptionEditor = null;
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	async function openContextFolder() {
		const target = contextMenu?.target ?? null;

		closeContextMenu();

		if (target === null || isOpeningFolder) {
			return;
		}

		isOpeningFolder = true;
		formError = null;
		status = null;

		try {
			const result =
				target.type === 'node'
					? await openNodeFolder(target.nodeId)
					: await openRepositoryFolder(target.nodeId, target.repositoryId);

			if (!result.ok) {
				formError = result.error;
				return;
			}

			status = 'Folder opened.';
		} finally {
			isOpeningFolder = false;
		}
	}

	function openContextDeleteDialog() {
		const target = contextMenu?.target ?? null;

		if (target === null) {
			closeContextMenu();
			return;
		}

		if (target.type === 'node') {
			openNodeDeleteDialog(target.nodeId);
			return;
		}

		openRepositoryDeleteDialog(target.nodeId, target.repositoryId);
	}

	function openContextTagEditor() {
		const target = contextMenu?.target ?? null;

		closeContextMenu();

		if (target === null) {
			return;
		}

		if (target.type === 'node') {
			const node = registry.nodes.find((candidateNode) => candidateNode.id === target.nodeId);

			if (node === undefined) {
				formError = 'project-node-not-found';
				return;
			}

			openTagEditor({ type: 'node', node });
			return;
		}

		const targetRepository = getRepositoryTarget(target.nodeId, target.repositoryId);

		if (targetRepository === null) {
			formError = 'project-repository-not-found';
			return;
		}

		openTagEditor({ type: 'repository', ...targetRepository });
	}

	function openContextGithubCredentialEditor() {
		const target = contextMenu?.target ?? null;

		closeContextMenu();

		if (target === null) {
			return;
		}

		if (target.type === 'node') {
			const node = registry.nodes.find((candidateNode) => candidateNode.id === target.nodeId);

			if (node === undefined) {
				formError = 'project-node-not-found';
				return;
			}

			openGithubCredentialEditor({ type: 'node', node });
			return;
		}

		const targetRepository = getRepositoryTarget(target.nodeId, target.repositoryId);

		if (targetRepository === null) {
			formError = 'project-repository-not-found';
			return;
		}

		openGithubCredentialEditor({ type: 'repository', ...targetRepository });
	}

	function openContextDescriptionEditor() {
		const target = contextMenu?.target ?? null;

		closeContextMenu();

		if (target?.type !== 'node') {
			return;
		}

		const node = registry.nodes.find((candidateNode) => candidateNode.id === target.nodeId);

		if (node === undefined) {
			formError = 'project-node-not-found';
			return;
		}

		openDescriptionEditor(node);
	}

	async function openContextCloneRepository() {
		const target = contextMenuRepository;

		closeContextMenu();

		await cloneRepositoryForTarget(target);
	}

	async function openContextCloneRepositoryForTarget(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		await cloneRepositoryForTarget({ node, repository });
	}

	async function cloneRepositoryForTarget(
		target: { readonly node: ProjectNodeRecord; readonly repository: ProjectRepositoryLinkRecord } | null
	) {

		if (target === null) {
			formError = 'project-repository-not-found';
			return;
		}

		if (target.repository.remoteUrl === null) {
			formError = 'project-repository-remote-url-invalid';
			return;
		}

		if (target.repository.path !== null) {
			status = 'Repository already has a local path.';
			return;
		}

		if (isRepositoryBusy(target.repository.id)) {
			return;
		}

		const credential = resolveRepositoryGithubCredentialOrSetError(target.node, target.repository);

		if (credential === undefined) {
			return;
		}

		startRepositoryOperation(target.repository.id, 'clone');
		cloneTarget = {
			type: 'repository',
			nodeId: target.node.id,
			repositoryId: target.repository.id
		};
		formError = null;
		status = 'Cloning repository.';

		try {
			const cloneResult = await cloneProjectRepository({
				workspacePath: workspace.path,
				groupRelativePath: target.node.path,
				repositoryName: target.repository.name,
				remoteUrl: target.repository.remoteUrl,
				credential
			});

			if (!cloneResult.ok) {
				formError = cloneResult.error;
				await failRepositoryOperation(target.node, target.repository, 'clone', cloneResult.error);
				status = null;
				return;
			}

			const updateResult = setProjectRepositoryLocalPath(registry, {
				nodeId: target.node.id,
				repositoryId: target.repository.id,
				path: cloneResult.path
			});

			if (!updateResult.ok) {
				formError = updateResult.error;
				await failRepositoryOperation(target.node, target.repository, 'clone', updateResult.error);
				status = null;
				return;
			}

			if (await persistRegistry(updateResult.registry)) {
				selectedGroupId = target.node.id;
				await succeedRepositoryOperation(target.node, target.repository, 'clone');
				status = 'Repository cloned.';
			} else {
				await failRepositoryOperation(
					target.node,
					target.repository,
					'clone',
					'project-registry-write-failed'
				);
			}
		} finally {
			cloneTarget = null;
		}
	}

	async function openContextInitializeRepository() {
		const target = contextMenuRepository;

		closeContextMenu();

		await initializeRepositoryForTarget(target);
	}

	function openContextPublishRepository() {
		const target = contextMenuRepository;

		closeContextMenu();

		if (target === null) {
			formError = 'project-repository-not-found';
			return;
		}

		openPublishRepositoryDialog(target.node, target.repository);
	}

	async function openInitializeRepositoryForTarget(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		await initializeRepositoryForTarget({ node, repository });
	}

	async function initializeRepositoryForTarget(
		target: { readonly node: ProjectNodeRecord; readonly repository: ProjectRepositoryLinkRecord } | null
	) {
		if (target === null || target.repository.path === null) {
			formError = 'project-repository-not-found';
			return;
		}

		if (!isRepositoryPathInsideWorkspace(target.repository.path)) {
			formError = 'project-repository-path-outside-workspace';
			await failRepositoryOperation(
				target.node,
				target.repository,
				'init',
				'project-repository-path-outside-workspace'
			);
			return;
		}

		if (isRepositoryBusy(target.repository.id)) {
			return;
		}

		startRepositoryOperation(target.repository.id, 'init');
		gitActionTarget = {
			type: 'repository',
			nodeId: target.node.id,
			repositoryId: target.repository.id
		};
		formError = null;
		status = 'Initializing Git repository.';

		try {
			const result = await initializeProjectRepositoryGit(target.repository.path);

			if (!result.ok) {
				formError = result.error;
				await failRepositoryOperation(target.node, target.repository, 'init', result.error);
				status = null;
				return;
			}

			await refreshRepositoryGitStatus(target.repository.id, target.repository.path);
			await succeedRepositoryOperation(target.node, target.repository, 'init');
			status = 'Git repository initialized.';
		} finally {
			gitActionTarget = null;
		}
	}

	function openPublishRepositoryDialog(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		if (repository.path === null) {
			formError = 'project-repository-not-found';
			return;
		}

		if (!isRepositoryPathInsideWorkspace(repository.path)) {
			formError = 'project-repository-path-outside-workspace';
			void failRepositoryOperation(
				node,
				repository,
				'publish',
				'project-repository-path-outside-workspace'
			);
			return;
		}

		if (isRepositoryBusy(repository.id)) {
			return;
		}

		publishTarget = { node, repository };
		githubRepositoryName = repository.name;
		githubRepositoryCommitMessage = DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE;
		githubRepositoryVisibility = 'private';
		formError = null;
		status = null;
		deleteCandidate = null;
		dialog = null;
		closeContextMenu();
	}

	function closePublishRepositoryDialog() {
		publishTarget = null;
		githubRepositoryName = '';
		githubRepositoryCommitMessage = DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE;
		githubRepositoryVisibility = 'private';
		isPublishingRepository = false;
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

	async function handlePublishRepositorySubmit(event: SubmitEvent) {
		event.preventDefault();

		if (publishTarget === null || isPublishingRepository) {
			return;
		}

		if (publishTarget.repository.path === null) {
			formError = 'project-repository-not-found';
			return;
		}

		if (!isRepositoryPathInsideWorkspace(publishTarget.repository.path)) {
			formError = 'project-repository-path-outside-workspace';
			await failRepositoryOperation(
				publishTarget.node,
				publishTarget.repository,
				'publish',
				'project-repository-path-outside-workspace'
			);
			return;
		}

		const credential = resolveRepositoryGithubCredentialOrSetError(
			publishTarget.node,
			publishTarget.repository
		);

		if (credential === undefined) {
			return;
		}

		startRepositoryOperation(publishTarget.repository.id, 'publish');
		isPublishingRepository = true;
		gitActionTarget = {
			type: 'repository',
			nodeId: publishTarget.node.id,
			repositoryId: publishTarget.repository.id
		};
		formError = null;
		status = 'Publishing repository.';

		try {
			const result = await publishProjectRepositoryToGithub({
				path: publishTarget.repository.path,
				repositoryName: githubRepositoryName,
				commitMessage: githubRepositoryCommitMessage,
				visibility: githubRepositoryVisibility,
				credential
			});

			if (!result.ok) {
				formError = result.error;
				await failRepositoryOperation(publishTarget.node, publishTarget.repository, 'publish', result.error);
				status = null;
				return;
			}

			await refreshRepositoryGitStatus(publishTarget.repository.id, publishTarget.repository.path);
			await succeedRepositoryOperation(publishTarget.node, publishTarget.repository, 'publish');
			status = 'Repository published.';
			closePublishRepositoryDialog();
		} finally {
			isPublishingRepository = false;
			gitActionTarget = null;
		}
	}

	async function runRepositoryGitAction(
		target: { readonly node: ProjectNodeRecord; readonly repository: ProjectRepositoryLinkRecord } | null,
		action: ProjectRepositoryGitAction
	) {
		if (target === null || target.repository.path === null) {
			formError = 'project-repository-not-found';
			return;
		}

		if (!isRepositoryPathInsideWorkspace(target.repository.path)) {
			formError = 'project-repository-path-outside-workspace';
			await failRepositoryOperation(
				target.node,
				target.repository,
				action,
				'project-repository-path-outside-workspace'
			);
			return;
		}

		if (isRepositoryBusy(target.repository.id)) {
			return;
		}

		const credential = resolveRepositoryGithubCredentialOrSetError(target.node, target.repository);

		if (credential === undefined) {
			return;
		}

		startRepositoryOperation(target.repository.id, action);
		gitActionTarget = {
			type: 'repository',
			nodeId: target.node.id,
			repositoryId: target.repository.id
		};
		formError = null;
		status = `${getRepositoryGitActionProgressLabel(action)} repository.`;

		try {
			const result = await runProjectRepositoryGitMutation(action, target.repository.path, credential);

			if (!result.ok) {
				formError = result.error;
				await failRepositoryOperation(target.node, target.repository, action, result.error);
				status = null;
				return;
			}

			await refreshRepositoryGitStatus(target.repository.id, target.repository.path);
			await succeedRepositoryOperation(target.node, target.repository, action);
			status = `Repository ${getRepositoryGitActionDoneLabel(action)}.`;
		} finally {
			gitActionTarget = null;
		}
	}

	function runProjectRepositoryGitMutation(
		action: ProjectRepositoryGitAction,
		path: string,
		credential: ProjectRepositoryGitCredentialInput | null
	) {
		if (action === 'fetch') {
			return fetchProjectRepositoryGit(path, credential);
		}

		if (action === 'pull') {
			return pullProjectRepositoryGit(path, credential);
		}

		return pushProjectRepositoryGit(path, credential);
	}

	function getRepositoryGitActionProgressLabel(action: ProjectRepositoryGitAction) {
		if (action === 'fetch') {
			return 'Fetching';
		}

		if (action === 'pull') {
			return 'Pulling';
		}

		return 'Pushing';
	}

	function getRepositoryGitActionDoneLabel(action: ProjectRepositoryGitAction) {
		if (action === 'fetch') {
			return 'fetched';
		}

		if (action === 'pull') {
			return 'pulled';
		}

		return 'pushed';
	}

	function startRepositoryOperation(repositoryId: string, name: ProjectRepositoryOperationName) {
		repositoryOperationById = {
			...repositoryOperationById,
			[repositoryId]: {
				id: createRepositoryOperationRecordId(),
				name,
				state: 'running',
				error: null,
				startedAt: new Date().toISOString(),
				finishedAt: null
			}
		};
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
		state: Exclude<ProjectRepositoryOperationState, 'running'>,
		error: string | null
	) {
		const runningOperation = repositoryOperationById[repository.id];
		const operation = {
			id: runningOperation?.id ?? createRepositoryOperationRecordId(),
			name,
			state,
			error,
			startedAt: runningOperation?.startedAt ?? new Date().toISOString(),
			finishedAt: new Date().toISOString()
		} satisfies ProjectRepositoryOperation;

		repositoryOperationById = {
			...repositoryOperationById,
			[repository.id]: operation
		};

		const writeResult = await writeProjectRepositoryOperationRecord({
			id: operation.id,
			workspaceId: workspace.id,
			nodeId: node.id,
			repositoryId: repository.id,
			repositoryName: repository.name,
			name,
			state,
			error,
			startedAt: operation.startedAt,
			finishedAt: operation.finishedAt
		});

		operationStorageError = writeResult.ok ? null : writeResult.error;
	}

	function createRepositoryOperationRecordId() {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}

		return `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	function getRepositoryOperation(repositoryId: string) {
		return repositoryOperationById[repositoryId] ?? null;
	}

	function isRepositoryBusy(repositoryId: string) {
		return repositoryOperationById[repositoryId]?.state === 'running';
	}

	function isRepositoryOperationRunning(
		repositoryId: string,
		name: ProjectRepositoryOperationName
	) {
		const operation = repositoryOperationById[repositoryId];

		return operation?.state === 'running' && operation.name === name;
	}

	function getRepositoryOperationMessage(operation: ProjectRepositoryOperation) {
		if (operation.state === 'running') {
			return `${getRepositoryOperationProgressLabel(operation.name)}.`;
		}

		if (operation.state === 'succeeded') {
			return `Repository ${getRepositoryOperationDoneLabel(operation.name)}.`;
		}

		return operation.error === null
			? `${getRepositoryOperationLabel(operation.name)} failed.`
			: (getFormErrorMessage(operation.error as ProjectFormError) ?? 'Repository operation failed.');
	}

	function getRepositoryOperationProgressLabel(name: ProjectRepositoryOperationName) {
		switch (name) {
			case 'clone':
				return 'Cloning repository';
			case 'init':
				return 'Initializing Git repository';
			case 'fetch':
				return 'Fetching repository';
			case 'pull':
				return 'Pulling repository';
			case 'push':
				return 'Pushing repository';
			case 'publish':
				return 'Publishing repository';
		}
	}

	function getRepositoryOperationDoneLabel(name: ProjectRepositoryOperationName) {
		switch (name) {
			case 'clone':
				return 'cloned';
			case 'init':
				return 'initialized';
			case 'fetch':
				return 'fetched';
			case 'pull':
				return 'pulled';
			case 'push':
				return 'pushed';
			case 'publish':
				return 'published';
		}
	}

	function getRepositoryOperationLabel(name: ProjectRepositoryOperationName) {
		switch (name) {
			case 'clone':
				return 'Clone';
			case 'init':
				return 'Initializing';
			case 'fetch':
				return 'Fetch';
			case 'pull':
				return 'Pull';
			case 'push':
				return 'Push';
			case 'publish':
				return 'Publish';
		}
	}

	function getRepositoryActionButtonLabel(
		repositoryId: string,
		name: ProjectRepositoryOperationName,
		idleLabel: string
	) {
		const operation = getRepositoryOperation(repositoryId);

		return operation?.state === 'running' && operation.name === name
			? getRepositoryOperationProgressButtonLabel(name)
			: idleLabel;
	}

	function getRepositoryOperationProgressButtonLabel(name: ProjectRepositoryOperationName) {
		switch (name) {
			case 'clone':
				return 'Cloning';
			case 'init':
				return 'Init';
			case 'fetch':
				return 'Fetching';
			case 'pull':
				return 'Pulling';
			case 'push':
				return 'Pushing';
			case 'publish':
				return 'Publishing';
		}
	}

	function openDialog(mode: ProjectDialogMode, targetNodeId: string | null = null) {
		dialog = { mode, targetNodeId };
		formName = '';
		formDescription = '';
		formTags = '';
		repositorySourceMode = 'folder';
		repositoryRemoteUrl = '';
		formError = null;
		status = null;
		deleteCandidate = null;
		descriptionEditor = null;
		publishTarget = null;
		closeContextMenu();
	}

	function closeDialog() {
		dialog = null;
		formName = '';
		formDescription = '';
		formTags = '';
		repositorySourceMode = 'folder';
		repositoryRemoteUrl = '';
		formError = null;
		isSubmitting = false;
	}

	function selectRepositorySourceMode(sourceMode: ProjectRepositorySourceMode) {
		if (repositorySourceMode === sourceMode) {
			return;
		}

		repositorySourceMode = sourceMode;
		formName = '';
		repositoryRemoteUrl = '';
		formError = null;
		status = null;
	}

	function openNodeDeleteDialog(nodeId: string | null) {
		if (nodeId === null) {
			formError = 'project-node-not-found';
			closeContextMenu();
			return;
		}

		const node = registry.nodes.find((candidateNode) => candidateNode.id === nodeId);

		if (node === undefined) {
			formError = 'project-node-not-found';
			closeContextMenu();
			return;
		}

		deleteCandidate = {
			type: 'node',
			node
		};
		shouldDeleteLocalFolder = false;
		formError = null;
		status = null;
		closeContextMenu();
	}

	function openRepositoryDeleteDialog(nodeId: string | null, repositoryId: string | null) {
		if (nodeId === null) {
			formError = 'project-node-not-found';
			closeContextMenu();
			return;
		}

		if (repositoryId === null) {
			formError = 'project-repository-not-found';
			closeContextMenu();
			return;
		}

		const node = registry.nodes.find((candidateNode) => candidateNode.id === nodeId);

		if (node === undefined) {
			formError = 'project-node-not-found';
			closeContextMenu();
			return;
		}

		if (node.kind !== 'group') {
			formError = 'project-repository-target-invalid';
			closeContextMenu();
			return;
		}

		const repository = node.repositories.find(
			(candidateRepository) => candidateRepository.id === repositoryId
		);

		if (repository === undefined) {
			formError = 'project-repository-not-found';
			closeContextMenu();
			return;
		}

		deleteCandidate = {
			type: 'repository',
			node,
			repository
		};
		shouldDeleteLocalFolder = false;
		formError = null;
		status = null;
		closeContextMenu();
	}

	function closeDeleteDialog() {
		deleteCandidate = null;
		shouldDeleteLocalFolder = false;
		isDeleting = false;
	}

	function openDescriptionEditor(node: ProjectNodeRecord) {
		descriptionEditor = node;
		descriptionInput = node.description;
		formError = null;
		status = null;
		deleteCandidate = null;
		publishTarget = null;
		tagEditor = null;
		dialog = null;
	}

	function closeDescriptionEditor() {
		descriptionEditor = null;
		descriptionInput = '';
		isSavingDescription = false;
	}

	function handleDescriptionEditorInput() {
		formError = null;
		status = null;
	}

	function handleDescriptionEditorBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isSavingDescription) {
			closeDescriptionEditor();
		}
	}

	async function handleDescriptionEditorSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (descriptionEditor === null || isSavingDescription) {
			return;
		}

		isSavingDescription = true;
		formError = null;
		status = null;

		const result = setProjectNodeDescription(registry, {
			nodeId: descriptionEditor.id,
			description: descriptionInput
		});

		if (!result.ok) {
			formError = result.error;
			isSavingDescription = false;
			return;
		}

		if (await persistRegistry(result.registry)) {
			status = 'Description saved.';
			closeDescriptionEditor();
			return;
		}

		isSavingDescription = false;
	}

	function openTagEditor(target: ProjectTagEditorTarget) {
		tagEditor = target;
		tagInput = formatTagsInput(
			target.type === 'repository' ? target.repository.tags : target.node.tags
		);
		formError = null;
		status = null;
		deleteCandidate = null;
		descriptionEditor = null;
		publishTarget = null;
		dialog = null;
	}

	function closeTagEditor() {
		tagEditor = null;
		tagInput = '';
		isSavingTags = false;
	}

	function openGithubCredentialEditor(target: ProjectGithubCredentialEditorTarget) {
		githubCredentialEditor = target;
		selectedGithubCredentialSecretId =
			target.type === 'repository'
				? target.repository.githubCredentialSecretId ?? ''
				: target.node.githubCredentialSecretId ?? '';
		formError = null;
		status = null;
		deleteCandidate = null;
		descriptionEditor = null;
		tagEditor = null;
		publishTarget = null;
		dialog = null;
	}

	function closeGithubCredentialEditor() {
		githubCredentialEditor = null;
		selectedGithubCredentialSecretId = '';
		isSubmitting = false;
	}

	function handleGithubCredentialEditorBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isSubmitting && !isEnvironmentVaultBusy) {
			closeGithubCredentialEditor();
		}
	}

	async function handleUnlockProjectEnvironmentVault(event: SubmitEvent) {
		event.preventDefault();

		if (environmentVaultEnvelope === null || isEnvironmentVaultBusy || environmentVaultPassword.length === 0) {
			return;
		}

		isEnvironmentVaultBusy = true;
		environmentVaultError = null;
		formError = null;

		try {
			const decryptResult = await decryptSecretVaultPayload(
				environmentVaultEnvelope,
				environmentVaultPassword
			);

			if (!decryptResult.ok) {
				environmentVaultError = createSecretVaultErrorMessage(decryptResult.error);
				return;
			}

			const parsedVault = parseEnvironmentVault(decryptResult.plaintext, workspace.id);

			if (parsedVault === null) {
				environmentVaultError = 'Environment vault could not be read.';
				return;
			}

			environmentVault = parsedVault;
			environmentVaultPassword = '';
		} finally {
			isEnvironmentVaultBusy = false;
		}
	}

	async function handleGithubCredentialSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (githubCredentialEditor === null || isSubmitting || environmentVault === null) {
			return;
		}

		isSubmitting = true;
		formError = null;
		status = null;

		const result =
			githubCredentialEditor.type === 'repository'
				? setProjectRepositoryGithubCredential(registry, {
						nodeId: githubCredentialEditor.node.id,
						repositoryId: githubCredentialEditor.repository.id,
						githubCredentialSecretId: selectedGithubCredentialSecretId || null
					})
				: setProjectNodeGithubCredential(registry, {
						nodeId: githubCredentialEditor.node.id,
						githubCredentialSecretId: selectedGithubCredentialSecretId || null
					});

		if (!result.ok) {
			formError = result.error;
			isSubmitting = false;
			return;
		}

		if (await persistRegistry(result.registry)) {
			status = 'GitHub credential saved.';
			closeGithubCredentialEditor();
			return;
		}

		isSubmitting = false;
	}

	function handleTagInput() {
		formError = null;
		status = null;
	}

	function handleTagEditorInput() {
		formError = null;
		status = null;
	}

	function handleTagFilterInput() {
		status = null;
	}

	function handleTagEditorBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isSavingTags) {
			closeTagEditor();
		}
	}

	async function handleTagEditorSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (tagEditor === null || isSavingTags) {
			return;
		}

		isSavingTags = true;
		formError = null;
		status = null;

		const tags = parseTagsInput(tagInput);
		const result =
			tagEditor.type === 'repository'
				? setProjectRepositoryTags(registry, {
						nodeId: tagEditor.node.id,
						repositoryId: tagEditor.repository.id,
						tags
					})
				: setProjectNodeTags(registry, {
						nodeId: tagEditor.node.id,
						tags
					});

		if (!result.ok) {
			formError = result.error;
			isSavingTags = false;
			return;
		}

		if (await persistRegistry(result.registry)) {
			status = 'Tags saved.';
			closeTagEditor();
			return;
		}

		isSavingTags = false;
	}

	async function openNodeFolder(nodeId: string) {
		const node = registry.nodes.find((candidateNode) => candidateNode.id === nodeId);

		if (node === undefined) {
			return { ok: false, error: 'project-node-not-found' } as const;
		}

		return openProjectNodeFolder(workspace.path, node.path);
	}

	async function openRepositoryFolder(nodeId: string, repositoryId: string) {
		const target = getRepositoryTarget(nodeId, repositoryId);

		if (target === null || target.repository.path === null) {
			return { ok: false, error: 'project-repository-not-found' } as const;
		}

		return openProjectFolderPath(target.repository.path);
	}

	function getDialogTitle() {
		if (dialog?.mode === 'group') {
			return 'New group';
		}

		if (dialog?.mode === 'repository') {
			return 'Link repository';
		}

		return 'New project';
	}

	function getDialogSubmitLabel() {
		return dialog?.mode === 'repository' ? 'Link' : 'Create';
	}

	function getDialogTargetNode() {
		const targetNodeId = dialog?.targetNodeId ?? null;

		if (targetNodeId === null) {
			return null;
		}

		return registry.nodes.find((node) => node.id === targetNodeId) ?? null;
	}

	function getContextMenuRepository() {
		const target = contextMenu?.target ?? null;

		if (target?.type !== 'repository') {
			return null;
		}

		return getRepositoryTarget(target.nodeId, target.repositoryId);
	}

	function getContextMenuNode() {
		const target = contextMenu?.target ?? null;

		if (target?.type !== 'node') {
			return null;
		}

		return registry.nodes.find((candidateNode) => candidateNode.id === target.nodeId) ?? null;
	}

	function getRepositoryTarget(nodeId: string, repositoryId: string) {
		const node = registry.nodes.find((candidateNode) => candidateNode.id === nodeId);

		if (node === undefined || node.kind !== 'group') {
			return null;
		}

		const repository = node.repositories.find(
			(candidateRepository) => candidateRepository.id === repositoryId
		);

		return repository === undefined
			? null
			: {
					node,
					repository
				};
	}

	function getContextMenuRepositoryGitStatus() {
		const target = contextMenuRepository;

		return target === null ? null : repositoryGitStatusById[target.repository.id] ?? null;
	}

	function canOpenContextMenuFolder() {
		const target = contextMenu?.target ?? null;

		if (target === null || isOpeningFolder) {
			return false;
		}

		if (target.type === 'node') {
			return contextMenuNode !== null;
		}

		return contextMenuRepository?.repository.path !== null;
	}

	function getNodeKindLabel(kind: ProjectNodeKind) {
		return kind === 'project' ? 'Project' : 'Group';
	}

	function getProjectGroupCount(projectId: string) {
		return registry.nodes.filter((node) => node.kind === 'group' && node.parentId === projectId)
			.length;
	}

	function getProjectRepositoryCount(projectId: string) {
		return registry.nodes
			.filter((node) => node.kind === 'group' && node.parentId === projectId)
			.reduce((total, node) => total + node.repositories.length, 0);
	}

	function formatCountLabel(count: number, singularLabel: string, pluralLabel: string) {
		return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
	}

	function getProjectNodes(tagQuery: string, syncFilter: ProjectRepositorySyncFilter) {
		const nodes = registry.nodes.filter((node) => node.kind === 'project' && node.parentId === null);

		if (tagQuery.length === 0 && syncFilter === 'all') {
			return nodes;
		}

		return nodes.filter(
			(node) =>
				projectMatchesTagFilter(node, tagQuery) &&
				projectMatchesRepositorySyncFilter(node, syncFilter)
		);
	}

	function getProjectGroups(
		projectId: string,
		tagQuery = '',
		syncFilter: ProjectRepositorySyncFilter
	) {
		const groups = registry.nodes.filter((node) => node.kind === 'group' && node.parentId === projectId);

		if (tagQuery.length === 0 && syncFilter === 'all') {
			return groups;
		}

		return groups.filter(
			(node) =>
				groupMatchesTagFilter(node, tagQuery) &&
				groupMatchesRepositorySyncFilter(node, syncFilter)
		);
	}

	function getGroupRepositories(
		group: ProjectNodeRecord,
		tagQuery: string,
		syncFilter: ProjectRepositorySyncFilter
	) {
		if (tagQuery.length === 0 && syncFilter === 'all') {
			return group.repositories;
		}

		return group.repositories.filter(
			(repository) =>
				repositoryMatchesTagFilter(repository, tagQuery) &&
				repositoryMatchesSyncFilter(repository, syncFilter)
		);
	}

	function resolveSelectedProject() {
		return projectNodes.find((node) => node.id === selectedProjectId) ?? projectNodes[0] ?? null;
	}

	function resolveSelectedGroup() {
		return selectedGroupId === null
			? null
			: selectedProjectGroups.find((node) => node.id === selectedGroupId) ?? null;
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

	function getRepositoryFilterStats() {
		return getRegisteredRepositories().reduce(
			(stats, repository) => ({
				pullNeeded: stats.pullNeeded + (repositoryMatchesSyncFilter(repository, 'pull') ? 1 : 0),
				pushNeeded: stats.pushNeeded + (repositoryMatchesSyncFilter(repository, 'push') ? 1 : 0)
			}),
			{ pullNeeded: 0, pushNeeded: 0 }
		);
	}

	function getRegisteredRepositories() {
		return registry.nodes.flatMap((node) => node.repositories);
	}

	function projectMatchesTagFilter(node: ProjectNodeRecord, tagQuery: string) {
		if (tagQuery.length === 0) {
			return true;
		}

		return (
			matchesTagFilter(node.tags, tagQuery) ||
			registry.nodes.some(
				(candidateNode) =>
					candidateNode.kind === 'group' &&
					candidateNode.parentId === node.id &&
					(matchesTagFilter(candidateNode.tags, tagQuery) ||
						candidateNode.repositories.some((repository) =>
							matchesTagFilter(repository.tags, tagQuery)
						))
			)
		);
	}

	function groupMatchesTagFilter(node: ProjectNodeRecord, tagQuery: string) {
		return (
			tagQuery.length === 0 ||
			matchesTagFilter(node.tags, tagQuery) ||
			node.repositories.some((repository) => repositoryMatchesTagFilter(repository, tagQuery))
		);
	}

	function repositoryMatchesTagFilter(repository: ProjectRepositoryLinkRecord, tagQuery: string) {
		return tagQuery.length === 0 || matchesTagFilter(repository.tags, tagQuery);
	}

	function projectMatchesRepositorySyncFilter(
		node: ProjectNodeRecord,
		syncFilter: ProjectRepositorySyncFilter
	) {
		return (
			syncFilter === 'all' ||
			registry.nodes.some(
				(candidateNode) =>
					candidateNode.kind === 'group' &&
					candidateNode.parentId === node.id &&
					groupMatchesRepositorySyncFilter(candidateNode, syncFilter)
			)
		);
	}

	function groupMatchesRepositorySyncFilter(
		node: ProjectNodeRecord,
		syncFilter: ProjectRepositorySyncFilter
	) {
		return (
			syncFilter === 'all' ||
			node.repositories.some((repository) => repositoryMatchesSyncFilter(repository, syncFilter))
		);
	}

	function repositoryMatchesSyncFilter(
		repository: ProjectRepositoryLinkRecord,
		syncFilter: ProjectRepositorySyncFilter
	) {
		if (syncFilter === 'all') {
			return true;
		}

		const gitStatus = repositoryGitStatusById[repository.id];

		return syncFilter === 'pull'
			? gitStatus?.behindCount !== undefined && gitStatus.behindCount > 0
			: gitStatus?.aheadCount !== undefined && gitStatus.aheadCount > 0;
	}

	function matchesTagFilter(tags: readonly string[], tagQuery: string) {
		return tags.some((tag) => tag.toLocaleLowerCase('en-US').includes(tagQuery));
	}

	function getDeleteDialogTitle() {
		if (deleteCandidate?.type === 'repository') {
			return 'Remove repository';
		}

		return deleteCandidate?.node.kind === 'group' ? 'Remove group' : 'Remove project';
	}

	function getDeleteDialogText() {
		const name =
			deleteCandidate?.type === 'repository'
				? deleteCandidate.repository.name
				: deleteCandidate?.node.name ?? 'this item';

		return `Remove ${name} from Workduck?`;
	}

	function getDeleteLocalFolderLabel() {
		if (deleteCandidate?.type === 'repository') {
			return 'Also delete this repository folder';
		}

		return deleteCandidate?.node.kind === 'project'
			? 'Also delete this project folder'
			: 'Also delete this group folder';
	}

	function getDeleteLocalFolderUnavailableText() {
		if (deleteCandidate?.type === 'repository') {
			return 'Local folder deletion is only available for repository folders under this workspace.';
		}

		return 'Local folder deletion is only available for folders under this workspace.';
	}

	function isDeleteLocalFolderAvailable() {
		if (deleteCandidate === null) {
			return false;
		}

		if (deleteCandidate.type === 'node') {
			return deleteCandidate.node.path.trim().length > 0;
		}

		return (
			deleteCandidate.repository.path !== null &&
			isRepositoryPathInsideProjectsFolder(deleteCandidate.repository.path)
		);
	}

	function handleNameInput() {
		formError = null;
		status = null;
	}

	function handleRepositoryRemoteUrlInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		repositoryRemoteUrl = target.value;
		formName = createRepositoryNameFromRemoteUrl(target.value);
		formError = null;
		status = null;
	}

	async function handleDialogSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (dialog === null || isSubmitting) {
			return;
		}

		isSubmitting = true;
		formError = null;
		status = null;

		try {
			if (dialog.mode === 'repository') {
				await submitRepositoryLink(dialog.targetNodeId);
				return;
			}

			const folderResult =
				dialog.mode === 'project'
					? await createProjectFolder(workspace.path, formName)
					: await createGroupFolder(dialog.targetNodeId, formName);

			if (!folderResult.ok) {
				formError = folderResult.error;
				return;
			}

			const result = addProjectNode(registry, {
				kind: dialog.mode,
				parentId: dialog.targetNodeId,
				name: formName,
				description: formDescription,
				path: folderResult.relativePath,
				tags: parseTagsInput(formTags)
			});

			if (!result.ok) {
				formError = result.error;
				return;
			}

			if (await persistRegistry(result.registry)) {
				const createdNode =
					result.registry.nodes.find((node) => node.path === folderResult.relativePath) ?? null;

				if (createdNode?.kind === 'project') {
					selectedProjectId = createdNode.id;
					selectedGroupId = null;
				} else if (createdNode?.kind === 'group') {
					selectedProjectId = createdNode.parentId;
					selectedGroupId = createdNode.id;
				}

				status = dialog.mode === 'project' ? 'Project created.' : 'Group created.';
				closeDialog();
			}
		} finally {
			isSubmitting = false;
		}
	}

	async function createGroupFolder(targetNodeId: string | null, name: string) {
		if (targetNodeId === null) {
			return { ok: false, error: 'project-parent-not-found' } as const;
		}

		const targetNode = registry.nodes.find((node) => node.id === targetNodeId);

		if (targetNode === undefined) {
			return { ok: false, error: 'project-parent-not-found' } as const;
		}

		if (targetNode.kind !== 'project') {
			return { ok: false, error: 'project-parent-invalid' } as const;
		}

		return createProjectGroupFolder(workspace.path, targetNode.path, name);
	}

	async function submitRepositoryLink(targetNodeId: string | null) {
		if (targetNodeId === null) {
			formError = 'project-node-not-found';
			return;
		}

		const targetNode = registry.nodes.find((node) => node.id === targetNodeId);

		if (targetNode === undefined) {
			formError = 'project-node-not-found';
			return;
		}

		if (targetNode.kind !== 'group') {
			formError = 'project-repository-target-invalid';
			return;
		}

		if (repositorySourceMode === 'remote') {
			await submitRemoteRepositoryLink(targetNodeId);
			return;
		}

		const folderResult = await createProjectGroupFolder(workspace.path, targetNode.path, formName);

		if (!folderResult.ok) {
			formError = folderResult.error;
			return;
		}

		const result = addProjectRepositoryLink(registry, {
			nodeId: targetNodeId,
			name: folderResult.folderName,
			path: createWorkspaceChildPath(workspace.path, folderResult.relativePath),
			remoteUrl: null,
			tags: parseTagsInput(formTags)
		});

		if (!result.ok) {
			formError = result.error;
			return;
		}

		if (await persistRegistry(result.registry)) {
			selectedGroupId = targetNode.id;
			status = 'Repository folder created.';
			closeDialog();
		}
	}

	async function submitRemoteRepositoryLink(targetNodeId: string) {
		const repositoryName = createRepositoryNameFromRemoteUrl(repositoryRemoteUrl);

		if (repositoryName.length === 0) {
			formError = 'project-repository-remote-url-invalid';
			return;
		}

		const result = addProjectRepositoryLink(registry, {
			nodeId: targetNodeId,
			name: repositoryName,
			path: null,
			remoteUrl: repositoryRemoteUrl,
			tags: parseTagsInput(formTags)
		});

		if (!result.ok) {
			formError = result.error;
			return;
		}

		if (await persistRegistry(result.registry)) {
			selectedGroupId = targetNodeId;
			status = 'Repository registered.';
			closeDialog();
		}
	}

	async function handleDeleteConfirm() {
		if (deleteCandidate === null || isDeleting) {
			return;
		}

		isDeleting = true;
		formError = null;
		status = null;

		if (shouldDeleteLocalFolder) {
			if (!canDeleteLocalFolder) {
				formError = 'project-folder-delete-path-outside-workspace';
				isDeleting = false;
				return;
			}

			const deleteFolderResult = await deleteSelectedLocalFolder(deleteCandidate);

			if (!deleteFolderResult.ok) {
				formError = deleteFolderResult.error;
				isDeleting = false;
				return;
			}
		}

		const result =
			deleteCandidate.type === 'repository'
				? removeProjectRepositoryLink(registry, {
						nodeId: deleteCandidate.node.id,
						repositoryId: deleteCandidate.repository.id
					})
				: removeProjectNode(registry, deleteCandidate.node.id);

		if (!result.ok) {
			formError = result.error;
			isDeleting = false;
			return;
		}

		if (await persistRegistry(result.registry)) {
			status =
				deleteCandidate.type === 'repository'
					? shouldDeleteLocalFolder
						? 'Repository and local folder removed.'
						: 'Repository removed.'
					: deleteCandidate.node.kind === 'project'
						? shouldDeleteLocalFolder
							? 'Project and local folder removed.'
							: 'Project removed.'
						: shouldDeleteLocalFolder
							? 'Group and local folder removed.'
							: 'Group removed.';
			closeDeleteDialog();
			return;
		}

		isDeleting = false;
	}

	async function deleteSelectedLocalFolder(candidate: ProjectDeleteCandidate) {
		if (candidate.type === 'repository') {
			if (candidate.repository.path === null) {
				return {
					ok: false,
					error: 'project-folder-delete-path-required'
				} as const;
			}

			return deleteProjectRepositoryFolder(workspace.path, candidate.repository.path);
		}

		return deleteProjectNodeFolder(workspace.path, candidate.node.path);
	}

	function handleDeleteConfirmationBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isDeleting) {
			closeDeleteDialog();
		}
	}

	function getFormErrorMessage(error: ProjectFormError) {
		switch (error) {
			case 'project-github-credential-vault-locked':
				return 'Unlock Environment to use the selected GitHub credential.';
			case 'project-github-credential-missing':
				return 'Selected GitHub credential was not found.';
			case 'project-github-credential-invalid':
				return 'Selected GitHub credential must be a GitHub token.';
			case 'project-name-required':
				return 'Name is required.';
			case 'project-name-duplicate':
				return 'Name already exists here.';
			case 'project-parent-not-found':
				return 'Parent project was not found.';
			case 'project-parent-invalid':
				return 'Groups can only be added under a project.';
			case 'project-node-not-found':
				return 'Project was not found.';
			case 'project-path-required':
				return 'Project path is required.';
			case 'project-path-duplicate':
				return 'Project path is already registered.';
			case 'project-repository-target-invalid':
				return 'Repositories can only be linked to groups.';
			case 'project-repository-not-found':
				return 'Repository link was not found.';
			case 'project-folder-workspace-required':
				return 'Workspace path is required.';
			case 'project-folder-workspace-not-absolute':
				return 'Workspace path must be absolute.';
			case 'project-folder-workspace-not-found':
				return 'Workspace path was not found.';
			case 'project-folder-workspace-not-directory':
				return 'Workspace path must be a folder.';
			case 'project-folder-workspace-permission-denied':
				return 'Workspace path is not writable.';
			case 'project-folder-workspace-unreadable':
				return 'Workspace path could not be checked.';
			case 'project-folder-root-invalid':
				return 'Projects folder is not usable.';
			case 'project-folder-parent-required':
			case 'project-folder-parent-invalid':
			case 'project-folder-parent-not-found':
				return 'Parent folder is not usable.';
			case 'project-folder-path-required':
				return 'Project folder path is required.';
			case 'project-folder-path-invalid':
				return 'Project folder path is not usable.';
			case 'project-folder-name-required':
				return 'Name is required.';
			case 'project-folder-name-invalid':
				return 'Name cannot be used as a folder.';
			case 'project-folder-conflict':
				return 'Folder path is not usable.';
			case 'project-folder-create-failed':
				return 'Folder could not be created.';
			case 'project-folder-open-path-required':
				return 'Folder path is required.';
			case 'project-folder-open-path-not-absolute':
				return 'Folder path must be absolute.';
			case 'project-folder-open-path-not-found':
				return 'Folder path was not found.';
			case 'project-folder-open-path-not-directory':
				return 'Folder path must be a folder.';
			case 'project-folder-open-path-permission-denied':
				return 'Folder path could not be opened.';
			case 'project-folder-open-failed':
				return 'Folder could not be opened.';
			case 'project-folder-delete-path-required':
				return 'Folder path is required.';
			case 'project-folder-delete-path-not-absolute':
				return 'Folder path must be absolute.';
			case 'project-folder-delete-path-not-found':
				return 'Folder path was not found.';
			case 'project-folder-delete-path-not-directory':
				return 'Folder path must be a folder.';
			case 'project-folder-delete-path-outside-workspace':
				return 'Only folders under this workspace projects folder can be deleted here.';
			case 'project-folder-delete-path-permission-denied':
				return 'Folder path could not be deleted.';
			case 'project-folder-delete-failed':
				return 'Folder could not be deleted.';
			case 'project-folder-unavailable':
				return 'Project folders are available in the desktop app.';
			case 'project-repository-name-required':
				return 'Repository name is required.';
			case 'project-repository-source-required':
				return 'Repository folder or URL is required.';
			case 'project-repository-path-required':
				return 'Repository path is required.';
			case 'project-repository-path-outside-workspace':
				return 'Repository path must stay inside the current workspace.';
			case 'project-repository-path-duplicate':
				return 'Repository path is already linked.';
			case 'project-repository-remote-url-invalid':
				return 'Repository URL is not usable.';
			case 'project-repository-remote-url-duplicate':
				return 'Repository URL is already registered.';
			case 'project-repository-clone-unavailable':
				return 'Repository clone is available in the desktop app.';
			case 'project-repository-workspace-required':
			case 'project-repository-workspace-not-absolute':
			case 'project-repository-workspace-not-found':
			case 'project-repository-workspace-not-directory':
			case 'project-repository-workspace-permission-denied':
			case 'project-repository-workspace-unreadable':
				return 'Workspace path is not usable.';
			case 'project-repository-group-path-required':
			case 'project-repository-group-path-invalid':
			case 'project-repository-group-path-not-found':
			case 'project-repository-group-path-not-directory':
				return 'Repository group folder is not usable.';
			case 'project-repository-name-invalid':
				return 'Repository name cannot be used as a folder.';
			case 'project-repository-remote-url-required':
				return 'Repository URL is required.';
			case 'project-repository-clone-target-exists':
				return 'Clone target folder already exists.';
			case 'project-repository-clone-command-unavailable':
				return 'Git command was not found.';
			case 'project-repository-clone-command-timed-out':
				return 'Repository clone timed out.';
			case 'project-repository-clone-access-denied':
				return 'Repository is private, missing, or not available to the current Git credentials.';
			case 'project-repository-clone-auth-required':
				return 'Repository clone needs Git authentication.';
			case 'project-repository-clone-failed':
				return 'Repository clone failed. Check the URL, network, and Git credentials.';
			case 'project-repository-git-path-required':
				return 'Repository path is required.';
			case 'project-repository-git-path-not-absolute':
				return 'Repository path must be absolute.';
			case 'project-repository-git-path-not-found':
				return 'Repository path was not found.';
			case 'project-repository-git-path-not-directory':
				return 'Repository path must be a folder.';
			case 'project-repository-git-path-permission-denied':
				return 'Repository path is not readable.';
			case 'project-repository-git-path-unreadable':
				return 'Repository path could not be checked.';
			case 'project-repository-git-command-unavailable':
				return 'Git command was not found.';
			case 'project-repository-git-command-failed':
				return 'Git command failed. Check the repository path and Git installation.';
			case 'project-repository-git-command-timed-out':
				return 'Git command timed out.';
			case 'project-repository-git-not-repository':
				return 'Repository folder is not initialized for Git.';
			case 'project-repository-git-init-failed':
				return 'Git repository could not be initialized.';
			case 'project-repository-git-remote-missing':
				return 'Git remote is not configured.';
			case 'project-repository-git-push-auth-required':
				return 'Git push needs authentication.';
			case 'project-repository-git-push-empty':
				return 'Repository has no commits to push.';
			case 'project-repository-git-push-failed':
				return 'Git push failed. Check the remote URL, branch, network, and credentials.';
			case 'project-repository-git-fetch-auth-required':
				return 'Git fetch needs authentication.';
			case 'project-repository-git-fetch-failed':
				return 'Git fetch failed. Check the remote URL, network, and credentials.';
			case 'project-repository-git-pull-auth-required':
				return 'Git pull needs authentication.';
			case 'project-repository-git-pull-conflict':
				return 'Git pull needs manual conflict resolution.';
			case 'project-repository-git-pull-failed':
				return 'Git pull failed. Check the remote URL, branch, network, and credentials.';
			case 'project-repository-github-repo-name-required':
				return 'GitHub repository name is required.';
			case 'project-repository-github-repo-name-invalid':
				return 'GitHub repository name is not usable.';
			case 'project-repository-github-commit-message-required':
				return 'Commit message is required.';
			case 'project-repository-github-commit-message-invalid':
				return 'Commit message is not usable.';
			case 'project-repository-github-visibility-invalid':
				return 'GitHub visibility is not usable.';
			case 'project-repository-github-cli-unavailable':
				return 'GitHub CLI was not found.';
			case 'project-repository-github-auth-required':
				return 'GitHub CLI needs authentication.';
			case 'project-repository-github-remote-exists':
				return 'Git remote origin already exists.';
			case 'project-repository-github-empty':
				return 'Repository has no commits to publish.';
			case 'project-repository-github-commit-identity-missing':
				return 'Git author name or email is not configured.';
			case 'project-repository-github-commit-index-locked':
				return 'Git index is locked by another process.';
			case 'project-repository-github-commit-hook-failed':
				return 'Initial commit was blocked by a Git hook.';
			case 'project-repository-github-commit-failed':
				return 'Initial commit could not be created.';
			case 'project-repository-github-create-failed':
				return 'GitHub repository could not be created. Check GitHub CLI authentication and repository name.';
			case 'project-registry-read-failed':
				return 'Projects could not be loaded.';
			case 'project-registry-write-failed':
				return 'Projects could not be saved.';
			case 'project-repository-operation-read-failed':
				return 'Repository operation records could not be loaded.';
			case 'project-repository-operation-write-failed':
				return 'Repository operation record could not be saved.';
		}
	}

	function createSecretVaultErrorMessage(nextError: SecretVaultCryptoError) {
		if (nextError === 'secret-vault-password-required') {
			return 'Environment vault password is required.';
		}

		if (nextError === 'secret-vault-unavailable') {
			return 'Environment vault is available in the desktop app.';
		}

		return 'Environment vault password did not match.';
	}

	function getVisibleFormErrorMessage() {
		const error = formError ?? storageError;

		return error === null ? '' : getFormErrorMessage(error);
	}

	function isRepositoryRemoteUrlError(error: ProjectFormError | null) {
		return (
			error === 'project-repository-source-required' ||
			error === 'project-repository-remote-url-required' ||
			error === 'project-repository-remote-url-invalid' ||
			error === 'project-repository-remote-url-duplicate'
		);
	}

	function canSubmitCurrentDialog() {
		if (dialog === null) {
			return false;
		}

		if (dialog.mode !== 'repository') {
			return formName.trim().length > 0;
		}

		return repositorySourceMode === 'folder'
			? formName.trim().length > 0
			: repositoryRemoteUrl.trim().length > 0;
	}

	function normalizeTagFilter(value: string) {
		return value.trim().replace(/^#+/u, '').toLocaleLowerCase('en-US');
	}

	function parseTagsInput(value: string) {
		return value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0)
			.slice(0, PROJECT_TAGS_MAX_COUNT);
	}

	function formatTagsInput(tags: readonly string[]) {
		return tags.join(', ');
	}

	function getTagsInputMaxLength() {
		return PROJECT_TAGS_MAX_COUNT * (PROJECT_TAG_MAX_LENGTH + 2);
	}

	function getRepositoryCardKind(nodeId: string, repository: ProjectRepositoryLinkRecord) {
		const operation = getRepositoryOperation(repository.id);

		if (operation?.state === 'running') {
			return getRepositoryOperationLabel(operation.name);
		}

		if (isRepositoryCloneTarget(nodeId, repository.id)) {
			return 'Cloning';
		}

		if (isRepositoryGitActionTarget(nodeId, repository.id)) {
			return 'Working';
		}

		if (repository.path === null) {
			return 'Remote';
		}

		const gitStatus = repositoryGitStatusById[repository.id];

		if (gitStatus?.isGitRepository) {
			return gitStatus.hasRemote ? 'Git' : 'Local Git';
		}

		return gitStatus === undefined ? 'Checking' : 'Folder';
	}

	function getGithubCredentialOptions(vault: EnvironmentVault | null): readonly GithubCredentialOption[] {
		if (vault === null) {
			return [];
		}

		return vault.secrets
			.filter(isGithubTokenSecret)
			.map((secret) => ({
				id: secret.id,
				name: secret.name,
				kind: secret.kind,
				value: secret.value
			}));
	}

	function isGithubTokenSecret(secret: EnvironmentSecretRecord) {
		return secret.kind === 'token' && secret.tags.includes('github');
	}

	function getGithubCredentialName(secretId: string | null) {
		if (secretId === null || secretId.length === 0) {
			return 'System Git';
		}

		if (environmentVault === null) {
			return 'GitHub credential';
		}

		return githubCredentialOptions.find((option) => option.id === secretId)?.name ?? 'Missing credential';
	}

	function getNodeGithubCredentialName(node: ProjectNodeRecord) {
		return getGithubCredentialName(node.githubCredentialSecretId);
	}

	function getRepositoryGithubCredentialName(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		const credentialSecretId = resolveRepositoryGithubCredentialSecretId(node, repository);

		return getGithubCredentialName(credentialSecretId);
	}

	function resolveRepositoryGithubCredentialSecretId(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		if (repository.githubCredentialSecretId !== null) {
			return repository.githubCredentialSecretId;
		}

		if (node.githubCredentialSecretId !== null) {
			return node.githubCredentialSecretId;
		}

		const project =
			node.parentId === null
				? null
				: registry.nodes.find((candidateNode) => candidateNode.id === node.parentId) ?? null;

		return project?.githubCredentialSecretId ?? null;
	}

	function resolveRepositoryGithubCredential(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	): ProjectRepositoryGitCredentialInput | ProjectCredentialError | null {
		const credentialSecretId = resolveRepositoryGithubCredentialSecretId(node, repository);

		if (credentialSecretId === null) {
			return null;
		}

		if (environmentVault === null) {
			return 'project-github-credential-vault-locked';
		}

		const credential = githubCredentialOptions.find((option) => option.id === credentialSecretId);

		if (credential === undefined) {
			return 'project-github-credential-missing';
		}

		if (credential.kind !== 'token') {
			return 'project-github-credential-invalid';
		}

		return {
			kind: 'github-token',
			value: credential.value
		};
	}

	function resolveRepositoryGithubCredentialOrSetError(
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) {
		const credential = resolveRepositoryGithubCredential(node, repository);

		if (typeof credential === 'string') {
			formError = credential;
			status = null;
			return undefined;
		}

		return credential;
	}

	function isRepositoryCloneTarget(nodeId: string, repositoryId: string) {
		return cloneTarget?.type === 'repository' &&
			cloneTarget.nodeId === nodeId &&
			cloneTarget.repositoryId === repositoryId;
	}

	function isRepositoryGitActionTarget(nodeId: string, repositoryId: string) {
		return gitActionTarget?.type === 'repository' &&
			gitActionTarget.nodeId === nodeId &&
			gitActionTarget.repositoryId === repositoryId;
	}

	function canCloneRepository(repository: ProjectRepositoryLinkRecord) {
		return repository.remoteUrl !== null && repository.path === null && !isRepositoryBusy(repository.id);
	}

	function canInitializeRepository(repository: ProjectRepositoryLinkRecord) {
		const gitStatus = repositoryGitStatusById[repository.id];

		return (
			repository.path !== null &&
			isRepositoryPathInsideWorkspace(repository.path) &&
			gitStatus !== undefined &&
			!gitStatus.isGitRepository &&
			gitStatus.error === null &&
			!isRepositoryBusy(repository.id)
		);
	}

	function canPublishRepositoryToGithub(repository: ProjectRepositoryLinkRecord) {
		const gitStatus = repositoryGitStatusById[repository.id];

		return (
			repository.path !== null &&
			isRepositoryPathInsideWorkspace(repository.path) &&
			gitStatus?.isGitRepository === true &&
			!gitStatus.hasRemote &&
			publishTarget === null &&
			!isRepositoryBusy(repository.id)
		);
	}

	function canRunRemoteRepositoryGitAction(repository: ProjectRepositoryLinkRecord) {
		const gitStatus = repositoryGitStatusById[repository.id];

		return (
			repository.path !== null &&
			isRepositoryPathInsideWorkspace(repository.path) &&
			gitStatus?.isGitRepository === true &&
			gitStatus.hasRemote &&
			!isRepositoryBusy(repository.id)
		);
	}

	function isRepositoryPathInsideWorkspace(repositoryPath: string) {
		const workspacePathKey = createLocalPathBoundaryKey(workspace.path);
		const repositoryPathKey = createLocalPathBoundaryKey(repositoryPath);

		return (
			workspacePathKey.length > 0 &&
			(repositoryPathKey === workspacePathKey ||
				repositoryPathKey.startsWith(`${workspacePathKey}/`))
		);
	}

	function isRepositoryPathInsideProjectsFolder(repositoryPath: string) {
		const workspacePathKey = createLocalPathBoundaryKey(workspace.path);
		const repositoryPathKey = createLocalPathBoundaryKey(repositoryPath);
		const projectsPathKey = `${workspacePathKey}/projects`;

		return (
			workspacePathKey.length > 0 &&
			(repositoryPathKey === projectsPathKey ||
				repositoryPathKey.startsWith(`${projectsPathKey}/`))
		);
	}

	function createLocalPathBoundaryKey(path: string) {
		return normalizeWorkspacePathForStorage(path)
			.replaceAll('\\', '/')
			.replace(/^\/\/\?\//u, '')
			.replace(/\/+$/u, '')
			.toLocaleLowerCase('en-US');
	}

	function createRepositoryNameFromRemoteUrl(remoteUrl: string) {
		const trimmedUrl = remoteUrl.trim().replace(/\.git$/iu, '');

		if (trimmedUrl.length === 0) {
			return '';
		}

		const pathSource = getRemoteUrlPathSource(trimmedUrl);
		const segments = pathSource.split(/[\\/]+/).filter(Boolean);

		return segments.at(-1)?.slice(0, PROJECT_REPOSITORY_NAME_MAX_LENGTH) ?? '';
	}

	function getRemoteUrlPathSource(trimmedUrl: string) {
		if (!trimmedUrl.includes('://')) {
			return trimmedUrl.split(':').at(-1) ?? trimmedUrl;
		}

		try {
			return new URL(trimmedUrl).pathname;
		} catch {
			return '';
		}
	}

	function createWorkspaceChildPath(workspacePath: string, relativePath: string) {
		const normalizedWorkspacePath = normalizeWorkspacePathForStorage(workspacePath).replace(/[\\/]+$/u, '');
		const separator = normalizedWorkspacePath.includes('\\') ? '\\' : '/';
		const normalizedRelativePath = relativePath
			.split('/')
			.filter(Boolean)
			.join(separator);

		return `${normalizedWorkspacePath}${separator}${normalizedRelativePath}`;
	}

	async function alignContextMenuToViewport(
		menuSnapshot: ProjectContextMenuState,
		menuElement: HTMLElement
	) {
		await tick();

		if (typeof window === 'undefined') {
			return;
		}

		if (contextMenu !== menuSnapshot || contextMenuElement !== menuElement) {
			return;
		}

		const rect = menuElement.getBoundingClientRect();
		const maxX = Math.max(
			CONTEXT_MENU_MARGIN_PX,
			window.innerWidth - rect.width - CONTEXT_MENU_MARGIN_PX
		);
		const maxY = Math.max(
			CONTEXT_MENU_MARGIN_PX,
			window.innerHeight - rect.height - CONTEXT_MENU_MARGIN_PX
		);
		const nextX = Math.min(Math.max(CONTEXT_MENU_MARGIN_PX, menuSnapshot.x), maxX);
		const nextY = Math.min(Math.max(CONTEXT_MENU_MARGIN_PX, menuSnapshot.y), maxY);

		if (nextX === menuSnapshot.x && nextY === menuSnapshot.y) {
			return;
		}

		contextMenu = {
			...menuSnapshot,
			x: nextX,
			y: nextY
		};
	}

	function createFolderRepairSignature(
		workspaceId: string,
		rows: readonly ProjectTreeRow[]
	) {
		return `${workspaceId}:${rows.map((row) => `${row.node.id}:${row.node.path}`).join('|')}`;
	}

	async function ensureProjectFoldersForRegistry(
		expectedSignature: string,
		workspacePath: string,
		registrySnapshot: ProjectRegistry,
		rows: readonly ProjectTreeRow[]
	) {
		for (const row of rows) {
			const result = await ensureProjectFolderPath(workspacePath, row.node.path);

			if (folderRepairSignature !== expectedSignature) {
				return;
			}

			if (!result.ok) {
				folderRepairError = result.error;
				return;
			}
		}

		if (folderRepairSignature !== expectedSignature) {
			return;
		}

		folderRepairError = null;
		await persistRegistry(registrySnapshot);
	}

	function createRepositoryGitInspectionSignature(
		workspaceId: string,
		repositories: readonly ProjectRepositoryLinkRecord[]
	) {
		return `${workspaceId}:${repositories.map((repository) => `${repository.id}:${repository.path}`).join('|')}`;
	}

	async function refreshRepositoryGitStatus(
		repositoryId: string,
		path: string | null,
		expectedSignature = repositoryGitInspectionSignature
	) {
		if (path === null) {
			return;
		}

		const result = await inspectProjectRepositoryGit(path);

		if (expectedSignature !== repositoryGitInspectionSignature) {
			return;
		}

		repositoryGitStatusById = {
			...repositoryGitStatusById,
			[repositoryId]: result.ok
				? {
						isGitRepository: result.isGitRepository,
						hasRemote: result.hasRemote,
						aheadCount: result.aheadCount,
						behindCount: result.behindCount,
						branch: result.branch,
						error: null
					}
				: {
						isGitRepository: false,
						hasRemote: false,
						aheadCount: 0,
						behindCount: 0,
						branch: null,
						error: result.error
					}
		};
	}

	function pruneRepositoryGitStatuses(repositoryIds: ReadonlySet<string>) {
		const nextStatuses: Record<string, ProjectRepositoryGitStatus> = {};

		for (const [repositoryId, gitStatus] of Object.entries(repositoryGitStatusById)) {
			if (repositoryIds.has(repositoryId)) {
				nextStatuses[repositoryId] = gitStatus;
			}
		}

		repositoryGitStatusById = nextStatuses;
	}

	function pruneRepositoryOperations(repositoryIds: ReadonlySet<string>) {
		const nextOperations: Record<string, ProjectRepositoryOperation> = {};

		for (const [repositoryId, operation] of Object.entries(repositoryOperationById)) {
			if (repositoryIds.has(repositoryId)) {
				nextOperations[repositoryId] = operation;
			}
		}

		repositoryOperationById = nextOperations;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') {
			return;
		}

		if (dialog !== null) {
			closeDialog();
			return;
		}

		if (deleteCandidate !== null) {
			closeDeleteDialog();
			return;
		}

		if (tagEditor !== null) {
			if (!isSavingTags) {
				closeTagEditor();
			}
			return;
		}

		if (descriptionEditor !== null) {
			if (!isSavingDescription) {
				closeDescriptionEditor();
			}
			return;
		}

		if (publishTarget !== null) {
			if (!isPublishingRepository) {
				closePublishRepositoryDialog();
			}
			return;
		}

		if (githubCredentialEditor !== null) {
			if (!isSubmitting && !isEnvironmentVaultBusy) {
				closeGithubCredentialEditor();
			}
			return;
		}

		closeContextMenu();
	}

	$effect(() => {
		const workspaceId = workspace.id;
		const readEnvironmentVaultResult = readEnvironmentVaultEnvelope(workspaceId);

		folderRepairError = null;
		operationStorageError = null;
		folderRepairSignature = '';
		selectedProjectId = null;
		selectedGroupId = null;
		environmentVaultEnvelope = readEnvironmentVaultResult.envelope;
		environmentVault = null;
		environmentVaultPassword = '';
		environmentVaultError = null;
		void readRegistryFromStorage(workspaceId);
		void readRepositoryOperationRecordsFromStorage(workspaceId);
		const unsubscribeProjectRegistry = subscribeProjectRegistry(workspaceId, (nextRegistry) => {
			registry = nextRegistry;
			storageError = null;
		});
		const unsubscribeEnvironmentVault = subscribeEnvironmentVaultEnvelope(workspaceId, (nextEnvelope) => {
			environmentVaultEnvelope = nextEnvelope;
			environmentVault = null;
			environmentVaultPassword = '';
			environmentVaultError = null;
		});

		return () => {
			unsubscribeProjectRegistry();
			unsubscribeEnvironmentVault();
		};
	});

	$effect(() => {
		const repositoriesToInspect = getRegisteredRepositories().filter(
			(repository) => repository.path !== null
		);
		const nextSignature = createRepositoryGitInspectionSignature(
			workspace.id,
			repositoriesToInspect
		);

		if (repositoryGitInspectionSignature === nextSignature) {
			return;
		}

		repositoryGitInspectionSignature = nextSignature;
		const registeredRepositoryIds = new Set(getRegisteredRepositories().map((repository) => repository.id));
		pruneRepositoryGitStatuses(new Set(repositoriesToInspect.map((repository) => repository.id)));
		pruneRepositoryOperations(registeredRepositoryIds);

		for (const repository of repositoriesToInspect) {
			void refreshRepositoryGitStatus(repository.id, repository.path, nextSignature);
		}
	});

	$effect(() => {
		const rows = projectRows;
		const nextSignature = createFolderRepairSignature(workspace.id, rows);

		if (folderRepairSignature === nextSignature) {
			return;
		}

		folderRepairSignature = nextSignature;

		if (rows.length === 0) {
			folderRepairError = null;
			return;
		}

		void ensureProjectFoldersForRegistry(nextSignature, workspace.path, registry, rows);
	});

	$effect(() => {
		if (contextMenu === null || contextMenuElement === undefined) {
			return;
		}

		void alignContextMenuToViewport(contextMenu, contextMenuElement);
	});

	$effect(() => {
		if (contextMenu === null || typeof window === 'undefined') {
			return;
		}

		function handleGlobalPointerDown(event: PointerEvent) {
			if (
				contextMenuElement !== undefined &&
				event.target instanceof Node &&
				contextMenuElement.contains(event.target)
			) {
				return;
			}

			closeContextMenu();
		}

		window.addEventListener('pointerdown', handleGlobalPointerDown);

		return () => {
			window.removeEventListener('pointerdown', handleGlobalPointerDown);
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="workduck-project-board"
	aria-label="Projects"
	oncontextmenu={openBoardContextMenu}
>
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">{title}</h1>
		<div class="workduck-page-actions workduck-project-header-actions">
			<div class="workduck-project-sync-filters" aria-label="Repository sync filters">
				<button
					class="workduck-project-sync-filter-button"
					class:workduck-project-sync-filter-button-active={repositorySyncFilter === 'pull'}
					type="button"
					aria-pressed={repositorySyncFilter === 'pull'}
					onclick={() => selectRepositorySyncFilter('pull')}
				>
					Pull needed
					<span>{repositoryFilterStats.pullNeeded}</span>
				</button>
				<button
					class="workduck-project-sync-filter-button"
					class:workduck-project-sync-filter-button-active={repositorySyncFilter === 'push'}
					type="button"
					aria-pressed={repositorySyncFilter === 'push'}
					onclick={() => selectRepositorySyncFilter('push')}
				>
					Push needed
					<span>{repositoryFilterStats.pushNeeded}</span>
				</button>
			</div>
			<label class="workduck-project-filter-field" for="project-tag-filter">
				<input
					id="project-tag-filter"
					class="workduck-input"
					type="text"
					bind:value={tagFilter}
					autocomplete="off"
					spellcheck="false"
					aria-label="Tag filter"
					placeholder="tag"
					oninput={handleTagFilterInput}
				/>
			</label>
		</div>
	</header>

	<div class="workduck-project-lanes workduck-project-workspace-layout">
		<section class="workduck-project-lane workduck-project-sidebar-lane" aria-label="Projects">
			<div class="workduck-project-lane-track">
				<button
					class="workduck-project-card workduck-project-card-button workduck-project-add-card"
					type="button"
					onclick={() => openDialog('project')}
				>
					New project
				</button>

				{#each projectNodes as node (node.id)}
					<button
						class="workduck-project-card workduck-project-card-button"
						class:workduck-project-card-selected={selectedProject?.id === node.id}
						type="button"
						aria-pressed={selectedProject?.id === node.id}
						onclick={() => selectProject(node)}
						oncontextmenu={(event) => openProjectContextMenu(event, node)}
					>
						<div class="workduck-project-card-header">
							<strong class="workduck-project-card-name">{node.name}</strong>
							<span class="workduck-project-card-kind">{getNodeKindLabel(node.kind)}</span>
						</div>
						{#if node.description.length > 0}
							<p class="workduck-project-card-description">{node.description}</p>
						{/if}
						<div class="workduck-project-card-stats" aria-label={`${node.name} totals`}>
							<span>{formatCountLabel(getProjectGroupCount(node.id), 'group', 'groups')}</span>
							<span>{formatCountLabel(getProjectRepositoryCount(node.id), 'repo', 'repos')}</span>
							{#if node.githubCredentialSecretId !== null}
								<span>GitHub: {getNodeGithubCredentialName(node)}</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</section>

		<div class="workduck-project-detail-lanes">
			{#if selectedProject !== null}
				<section class="workduck-project-lane workduck-project-group-lane" aria-label="Groups">
					<div class="workduck-project-lane-track">
						<button
							class="workduck-project-card workduck-project-card-button workduck-project-add-card"
							type="button"
							onclick={() => openDialog('group', selectedProject.id)}
						>
							New group
						</button>

						{#each selectedProjectGroups as node (node.id)}
							<button
								class="workduck-project-card workduck-project-card-button"
								class:workduck-project-card-selected={selectedGroup?.id === node.id}
								type="button"
								aria-pressed={selectedGroup?.id === node.id}
								onclick={() => selectGroup(node)}
								oncontextmenu={(event) => openProjectContextMenu(event, node)}
							>
								<div class="workduck-project-card-header">
									<strong class="workduck-project-card-name">{node.name}</strong>
									<span class="workduck-project-card-kind">{getNodeKindLabel(node.kind)}</span>
								</div>
								{#if node.description.length > 0}
									<p class="workduck-project-card-description">{node.description}</p>
								{/if}
								<div class="workduck-project-card-stats" aria-label={`${node.name} totals`}>
									<span>{formatCountLabel(node.repositories.length, 'repo', 'repos')}</span>
									{#if node.githubCredentialSecretId !== null}
										<span>GitHub: {getNodeGithubCredentialName(node)}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			{#if selectedGroup !== null}
				<section class="workduck-project-lane workduck-project-repository-lane" aria-label="Repositories">
					<div class="workduck-project-lane-track workduck-project-repository-track">
						<button
							class="workduck-project-card workduck-project-card-button workduck-project-add-card workduck-repository-card"
							type="button"
							onclick={() => openDialog('repository', selectedGroup.id)}
						>
							New repository
						</button>

						{#each selectedRepositories as repository (repository.id)}
							{@const repositoryOperation = getRepositoryOperation(repository.id)}
							{@const repositoryGitStatus = repositoryGitStatusById[repository.id]}
							{@const repositoryBusy = isRepositoryBusy(repository.id)}
							{@const repositoryPathOutsideWorkspace =
								repository.path !== null && !isRepositoryPathInsideWorkspace(repository.path)}
							{@const repositoryGithubCredentialName = getRepositoryGithubCredentialName(
								selectedGroup,
								repository
							)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<article
								class="workduck-project-card workduck-repository-card"
								class:workduck-repository-card-busy={repositoryBusy}
								oncontextmenu={(event) => openRepositoryContextMenu(event, selectedGroup, repository)}
							>
								<div class="workduck-project-card-header">
									<strong class="workduck-project-card-name">{repository.name}</strong>
									<span class="workduck-project-card-kind">
										{getRepositoryCardKind(selectedGroup.id, repository)}
									</span>
								</div>
								{#if repository.tags.length > 0}
									<div class="workduck-project-tag-list" aria-label={`${repository.name} tags`}>
										{#each repository.tags as tag (tag)}
											<span class="workduck-project-tag">{tag}</span>
										{/each}
									</div>
								{/if}
								{#if repositoryGithubCredentialName !== 'System Git'}
									<p class="workduck-project-card-description">
										GitHub: {repositoryGithubCredentialName}
									</p>
								{/if}
								{#if repositoryPathOutsideWorkspace}
									<p class="workduck-repository-operation-status workduck-repository-operation-status-failed">
										Repository path must stay inside this workspace.
									</p>
								{:else if repositoryOperation !== null}
									<p
										class="workduck-repository-operation-status"
										class:workduck-repository-operation-status-running={repositoryOperation.state === 'running'}
										class:workduck-repository-operation-status-failed={repositoryOperation.state === 'failed'}
										class:workduck-repository-operation-status-succeeded={repositoryOperation.state === 'succeeded'}
										role={repositoryOperation.state === 'failed' ? 'alert' : 'status'}
										aria-live="polite"
									>
										{getRepositoryOperationMessage(repositoryOperation)}
									</p>
								{:else if repositoryGitStatus?.error !== null && repositoryGitStatus?.error !== undefined}
									<p
										class="workduck-repository-operation-status workduck-repository-operation-status-failed"
										role="alert"
										aria-live="polite"
									>
										{getFormErrorMessage(repositoryGitStatus.error)}
									</p>
								{/if}
								<div class="workduck-repository-card-actions" aria-label={`${repository.name} actions`}>
									{#if canCloneRepository(repository) || isRepositoryOperationRunning(repository.id, 'clone')}
										<button
											class="workduck-repository-action-button"
											type="button"
											disabled={repositoryBusy}
											onclick={() => void openContextCloneRepositoryForTarget(selectedGroup, repository)}
										>
											{getRepositoryActionButtonLabel(repository.id, 'clone', 'Clone')}
										</button>
									{/if}
									{#if canInitializeRepository(repository) || isRepositoryOperationRunning(repository.id, 'init')}
										<button
											class="workduck-repository-action-button"
											type="button"
											disabled={repositoryBusy}
											onclick={() => void openInitializeRepositoryForTarget(selectedGroup, repository)}
										>
											{getRepositoryActionButtonLabel(repository.id, 'init', 'Init')}
										</button>
									{/if}
									{#if canPublishRepositoryToGithub(repository) || isRepositoryOperationRunning(repository.id, 'publish')}
										<button
											class="workduck-repository-action-button"
											type="button"
											disabled={repositoryBusy}
											onclick={() => openPublishRepositoryDialog(selectedGroup, repository)}
										>
											{getRepositoryActionButtonLabel(repository.id, 'publish', 'Publish')}
										</button>
									{/if}
									{#if canRunRemoteRepositoryGitAction(repository) ||
										isRepositoryOperationRunning(repository.id, 'fetch') ||
										isRepositoryOperationRunning(repository.id, 'pull') ||
										isRepositoryOperationRunning(repository.id, 'push')}
										<button
											class="workduck-repository-action-button"
											type="button"
											disabled={repositoryBusy}
											onclick={() => void runRepositoryGitAction({ node: selectedGroup, repository }, 'fetch')}
										>
											{getRepositoryActionButtonLabel(repository.id, 'fetch', 'Fetch')}
										</button>
										<button
											class="workduck-repository-action-button"
											type="button"
											disabled={repositoryBusy}
											onclick={() => void runRepositoryGitAction({ node: selectedGroup, repository }, 'pull')}
										>
											{getRepositoryActionButtonLabel(repository.id, 'pull', 'Pull')}
										</button>
										<button
											class="workduck-repository-action-button"
											type="button"
											disabled={repositoryBusy}
											onclick={() => void runRepositoryGitAction({ node: selectedGroup, repository }, 'push')}
										>
											{getRepositoryActionButtonLabel(repository.id, 'push', 'Push')}
										</button>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
</section>

{#if standaloneError !== null && dialog === null && deleteCandidate === null && tagEditor === null && descriptionEditor === null && githubCredentialEditor === null && publishTarget === null}
	<p class="workduck-inline-error" aria-live="polite">{getFormErrorMessage(standaloneError)}</p>
{/if}

{#if contextMenu !== null}
	<div
		class="workduck-context-menu"
		role="menu"
		aria-label="Project actions"
		style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
		bind:this={contextMenuElement}
	>
		{#if contextMenu.target.type === 'node'}
			{#if canOpenContextFolder}
				<button
					class="workduck-context-menu-item"
					type="button"
					role="menuitem"
					onclick={() => void openContextFolder()}
				>
					Open folder
				</button>
			{/if}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={openContextDescriptionEditor}
			>
				Edit description
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={openContextGithubCredentialEditor}
			>
				GitHub credential
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={openContextTagEditor}
			>
				Edit tags
			</button>
			<button
				class="workduck-context-menu-item workduck-context-menu-item-danger"
				type="button"
				role="menuitem"
				onclick={openContextDeleteDialog}
			>
				Delete
			</button>
		{:else}
			{#if canCloneContextRepository}
				<button
					class="workduck-context-menu-item"
					type="button"
					role="menuitem"
					onclick={() => void openContextCloneRepository()}
				>
					Clone
				</button>
			{/if}
			{#if canInitializeContextRepository}
				<button
					class="workduck-context-menu-item"
					type="button"
					role="menuitem"
					onclick={() => void openContextInitializeRepository()}
				>
					Initialize Git
				</button>
			{/if}
			{#if canPublishContextRepository}
				<button
					class="workduck-context-menu-item"
					type="button"
					role="menuitem"
					onclick={openContextPublishRepository}
				>
					Publish
				</button>
			{/if}
			{#if canOpenContextFolder}
				<button
					class="workduck-context-menu-item"
					type="button"
					role="menuitem"
					onclick={() => void openContextFolder()}
				>
					Open folder
				</button>
			{/if}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={openContextTagEditor}
			>
				Edit tags
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={openContextGithubCredentialEditor}
			>
				GitHub credential
			</button>
			<button
				class="workduck-context-menu-item workduck-context-menu-item-danger"
				type="button"
				role="menuitem"
				onclick={openContextDeleteDialog}
			>
				Delete
			</button>
		{/if}
	</div>
{/if}

{#if deleteCandidate !== null}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="workduck-dialog-backdrop"
		role="presentation"
		onclick={handleDeleteConfirmationBackdropClick}
	>
		<div
			class="workduck-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-remove-confirm-title"
			aria-describedby="project-remove-confirm-description"
		>
			<h2 id="project-remove-confirm-title" class="workduck-dialog-title">
				{getDeleteDialogTitle()}
			</h2>
			<p id="project-remove-confirm-description" class="workduck-dialog-text">
				{getDeleteDialogText()}
			</p>
			<label
				class="workduck-danger-option"
				class:workduck-danger-option-disabled={!canDeleteLocalFolder}
			>
				<input
					class="workduck-checkbox"
					type="checkbox"
					bind:checked={shouldDeleteLocalFolder}
					disabled={!canDeleteLocalFolder || isDeleting}
				/>
				<span>{getDeleteLocalFolderLabel()}</span>
			</label>
			{#if !canDeleteLocalFolder}
				<p class="workduck-dialog-note">{getDeleteLocalFolderUnavailableText()}</p>
			{/if}
			{#if formError !== null}
				<p class="workduck-inline-error" aria-live="polite">{getFormErrorMessage(formError)}</p>
			{/if}
			<div class="workduck-dialog-actions">
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isDeleting}
					onclick={closeDeleteDialog}
				>
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-danger"
					type="button"
					disabled={!canConfirmDelete}
					onclick={handleDeleteConfirm}
				>
					{isDeleting ? 'Removing' : 'Remove'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if descriptionEditor !== null}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="workduck-dialog-backdrop"
		role="presentation"
		onclick={handleDescriptionEditorBackdropClick}
	>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-description-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleDescriptionEditorSubmit}>
				<h2 id="project-description-dialog-title" class="workduck-dialog-title">
					Edit description
				</h2>

				<span class="workduck-dialog-kicker">{descriptionEditor.name}</span>

				<label class="workduck-form-field" for="project-description-editor-input">
					<span>Description</span>
					<textarea
						id="project-description-editor-input"
						class="workduck-input workduck-project-description-input"
						bind:value={descriptionInput}
						maxlength={PROJECT_DESCRIPTION_MAX_LENGTH}
						autocomplete="off"
						spellcheck="true"
						disabled={isSavingDescription}
						oninput={handleDescriptionEditorInput}
					></textarea>
				</label>

				{#if formError !== null || storageError !== null}
					<p class="workduck-inline-error" aria-live="polite">
						{getVisibleFormErrorMessage()}
					</p>
				{/if}

				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isSavingDescription}
						onclick={closeDescriptionEditor}
					>
						Cancel
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="submit"
						disabled={!canSaveDescription}
					>
						{isSavingDescription ? 'Saving' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if tagEditor !== null}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="workduck-dialog-backdrop"
		role="presentation"
		onclick={handleTagEditorBackdropClick}
	>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-tag-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleTagEditorSubmit}>
				<h2 id="project-tag-dialog-title" class="workduck-dialog-title">Edit tags</h2>

				<span class="workduck-dialog-kicker">
					{tagEditor.type === 'repository' ? tagEditor.repository.name : tagEditor.node.name}
				</span>

				<label class="workduck-form-field" for="project-tag-editor-input">
					<span>Tags</span>
					<input
						id="project-tag-editor-input"
						class="workduck-input"
						type="text"
						bind:value={tagInput}
						maxlength={getTagsInputMaxLength()}
						autocomplete="off"
						spellcheck="false"
						disabled={isSavingTags}
						placeholder="frontend, api"
						oninput={handleTagEditorInput}
					/>
				</label>

				{#if formError !== null || storageError !== null}
					<p class="workduck-inline-error" aria-live="polite">
						{getVisibleFormErrorMessage()}
					</p>
				{/if}

				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isSavingTags}
						onclick={closeTagEditor}
					>
						Cancel
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="submit"
						disabled={!canSaveTags}
					>
						{isSavingTags ? 'Saving' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if githubCredentialEditor !== null}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="workduck-dialog-backdrop"
		role="presentation"
		onclick={handleGithubCredentialEditorBackdropClick}
	>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-github-credential-dialog-title"
		>
			<h2 id="project-github-credential-dialog-title" class="workduck-dialog-title">
				GitHub credential
			</h2>

			<span class="workduck-dialog-kicker">
				{githubCredentialEditor.type === 'repository'
					? githubCredentialEditor.repository.name
					: githubCredentialEditor.node.name}
			</span>

			{#if environmentVaultEnvelope === null}
				<p class="workduck-dialog-text">Create an Environment vault and add a GitHub token.</p>
				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={closeGithubCredentialEditor}
					>
						Close
					</button>
				</div>
			{:else if environmentVault === null}
				<form class="workduck-project-dialog-form" onsubmit={handleUnlockProjectEnvironmentVault}>
					<label class="workduck-form-field" for="project-environment-vault-password">
						<span>Password</span>
						<input
							id="project-environment-vault-password"
							class="workduck-input"
							type="password"
							bind:value={environmentVaultPassword}
							autocomplete="current-password"
							disabled={isEnvironmentVaultBusy}
						/>
					</label>

					{#if environmentVaultError !== null}
						<p class="workduck-inline-error" aria-live="polite">{environmentVaultError}</p>
					{/if}

					<div class="workduck-dialog-actions">
						<button
							class="workduck-button workduck-button-secondary"
							type="button"
							disabled={isEnvironmentVaultBusy}
							onclick={closeGithubCredentialEditor}
						>
							Cancel
						</button>
						<button
							class="workduck-button workduck-button-primary"
							type="submit"
							disabled={environmentVaultPassword.length === 0 || isEnvironmentVaultBusy}
						>
							{isEnvironmentVaultBusy ? 'Unlocking' : 'Unlock'}
						</button>
					</div>
				</form>
			{:else}
				<form class="workduck-project-dialog-form" onsubmit={handleGithubCredentialSubmit}>
					<label class="workduck-form-field" for="project-github-credential-select">
						<span>Credential</span>
						<select
							id="project-github-credential-select"
							class="workduck-input"
							bind:value={selectedGithubCredentialSecretId}
							disabled={isSubmitting}
						>
							<option value="">System Git</option>
							{#each githubCredentialOptions as option (option.id)}
								<option value={option.id}>{option.name}</option>
							{/each}
						</select>
					</label>

					{#if githubCredentialOptions.length === 0}
						<p class="workduck-dialog-note">Add a token with the GitHub tag in Environment.</p>
					{/if}

					{#if formError !== null || storageError !== null}
						<p class="workduck-inline-error" aria-live="polite">
							{getVisibleFormErrorMessage()}
						</p>
					{/if}

					<div class="workduck-dialog-actions">
						<button
							class="workduck-button workduck-button-secondary"
							type="button"
							disabled={isSubmitting}
							onclick={closeGithubCredentialEditor}
						>
							Cancel
						</button>
						<button
							class="workduck-button workduck-button-primary"
							type="submit"
							disabled={!canSaveGithubCredential}
						>
							{isSubmitting ? 'Saving' : 'Save'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

{#if publishTarget !== null}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget && !isPublishingRepository) {
			closePublishRepositoryDialog();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-publish-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handlePublishRepositorySubmit}>
				<h2 id="project-publish-dialog-title" class="workduck-dialog-title">
					Publish repository
				</h2>

				<span class="workduck-dialog-kicker">{publishTarget.repository.name}</span>

				<label class="workduck-form-field" for="project-github-repository-name">
					<span>GitHub repository</span>
					<input
						id="project-github-repository-name"
						class="workduck-input"
						type="text"
						bind:value={githubRepositoryName}
						maxlength={GITHUB_REPOSITORY_NAME_MAX_LENGTH}
						autocomplete="off"
						spellcheck="false"
						disabled={isPublishingRepository}
						oninput={handleGithubRepositoryNameInput}
						aria-invalid={formError === 'project-repository-github-repo-name-required' ||
							formError === 'project-repository-github-repo-name-invalid'}
					/>
				</label>

				<label class="workduck-form-field" for="project-github-commit-message">
					<span>Commit message</span>
					<input
						id="project-github-commit-message"
						class="workduck-input"
						type="text"
						bind:value={githubRepositoryCommitMessage}
						maxlength={GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH}
						autocomplete="off"
						spellcheck="false"
						disabled={isPublishingRepository}
						oninput={handleGithubRepositoryCommitMessageInput}
						aria-invalid={formError === 'project-repository-github-commit-message-required' ||
							formError === 'project-repository-github-commit-message-invalid'}
					/>
				</label>

				<div class="workduck-repository-source-mode" role="group" aria-label="GitHub visibility">
					<button
						class="workduck-repository-source-mode-button"
						class:workduck-repository-source-mode-button-active={githubRepositoryVisibility === 'private'}
						type="button"
						aria-pressed={githubRepositoryVisibility === 'private'}
						disabled={isPublishingRepository}
						onclick={() => selectGithubRepositoryVisibility('private')}
					>
						Private
					</button>
					<button
						class="workduck-repository-source-mode-button"
						class:workduck-repository-source-mode-button-active={githubRepositoryVisibility === 'public'}
						type="button"
						aria-pressed={githubRepositoryVisibility === 'public'}
						disabled={isPublishingRepository}
						onclick={() => selectGithubRepositoryVisibility('public')}
					>
						Public
					</button>
				</div>

				{#if formError !== null || storageError !== null}
					<p class="workduck-inline-error" aria-live="polite">
						{getVisibleFormErrorMessage()}
					</p>
				{/if}

				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isPublishingRepository}
						onclick={closePublishRepositoryDialog}
					>
						Cancel
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="submit"
						disabled={!canSubmitPublishRepository}
					>
						{isPublishingRepository ? 'Publishing' : 'Publish'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if dialog !== null}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget) {
			closeDialog();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleDialogSubmit}>
				<h2 id="project-dialog-title" class="workduck-dialog-title">{getDialogTitle()}</h2>

				{#if dialogTargetNode !== null}
					<span class="workduck-dialog-kicker">{dialogTargetNode.name}</span>
				{/if}

				{#if dialog.mode !== 'repository'}
					<label class="workduck-form-field" for="project-dialog-name">
						<span>Name</span>
						<input
							id="project-dialog-name"
							class="workduck-input"
							type="text"
							bind:value={formName}
							maxlength={PROJECT_NAME_MAX_LENGTH}
							autocomplete="off"
							disabled={isSubmitting}
							oninput={handleNameInput}
							aria-invalid={formError === 'project-name-required' ||
								formError === 'project-name-duplicate' ||
								formError === 'project-folder-name-required' ||
								formError === 'project-folder-name-invalid' ||
								formError === 'project-folder-conflict'}
						/>
					</label>
					<label class="workduck-form-field" for="project-dialog-description">
						<span>Description</span>
						<textarea
							id="project-dialog-description"
							class="workduck-input workduck-project-description-input"
							bind:value={formDescription}
							maxlength={PROJECT_DESCRIPTION_MAX_LENGTH}
							autocomplete="off"
							spellcheck="true"
							disabled={isSubmitting}
							oninput={handleDescriptionEditorInput}
						></textarea>
					</label>
				{:else}
					<div class="workduck-repository-source-mode" role="group" aria-label="Repository source">
						<button
							class="workduck-repository-source-mode-button"
							class:workduck-repository-source-mode-button-active={repositorySourceMode === 'folder'}
							type="button"
							aria-pressed={repositorySourceMode === 'folder'}
							disabled={isSubmitting}
							onclick={() => selectRepositorySourceMode('folder')}
						>
							Folder
						</button>
						<button
							class="workduck-repository-source-mode-button"
							class:workduck-repository-source-mode-button-active={repositorySourceMode === 'remote'}
							type="button"
							aria-pressed={repositorySourceMode === 'remote'}
							disabled={isSubmitting}
							onclick={() => selectRepositorySourceMode('remote')}
						>
							URL
						</button>
					</div>

					{#if repositorySourceMode === 'folder'}
						<label class="workduck-form-field" for="project-repository-folder-name">
							<span>Folder name</span>
							<input
								id="project-repository-folder-name"
								class="workduck-input"
								type="text"
								bind:value={formName}
								maxlength={PROJECT_NAME_MAX_LENGTH}
								autocomplete="off"
								spellcheck="false"
								disabled={isSubmitting}
								oninput={handleNameInput}
								aria-invalid={formError === 'project-repository-name-required' ||
									formError === 'project-folder-name-required' ||
									formError === 'project-folder-name-invalid' ||
									formError === 'project-folder-conflict'}
							/>
						</label>
					{:else}
						<label class="workduck-form-field" for="project-repository-url">
							<span>Repository URL</span>
							<input
								id="project-repository-url"
								class="workduck-input"
								type="text"
								value={repositoryRemoteUrl}
								maxlength={PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH}
								autocomplete="off"
								spellcheck="false"
								disabled={isSubmitting}
								placeholder="https://github.com/owner/repo.git"
								oninput={handleRepositoryRemoteUrlInput}
								aria-invalid={isRepositoryRemoteUrlError(formError)}
							/>
						</label>
					{/if}
				{/if}

				<label class="workduck-form-field" for="project-dialog-tags">
					<span>Tags</span>
					<input
						id="project-dialog-tags"
						class="workduck-input"
						type="text"
						bind:value={formTags}
						maxlength={getTagsInputMaxLength()}
						autocomplete="off"
						spellcheck="false"
						disabled={isSubmitting}
						placeholder="frontend, api"
						oninput={handleTagInput}
					/>
				</label>

				{#if formError !== null || storageError !== null}
					<p class="workduck-inline-error" aria-live="polite">
						{getVisibleFormErrorMessage()}
					</p>
				{/if}

				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isSubmitting}
						onclick={closeDialog}
					>
						Cancel
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="submit"
						disabled={!canSubmitDialog}
					>
						{isSubmitting ? 'Saving' : getDialogSubmitLabel()}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if status !== null}
	<p class="workduck-inline-status" aria-live="polite">{status}</p>
{/if}
