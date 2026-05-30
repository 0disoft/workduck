<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		enqueueRepositoryCommitWorkOrder
	} from '$lib/queue/repository-commit-work-order';
	import {
		getQueueFolderLocalizedError
	} from '$lib/queue/queue-panel-errors';
	import {
		addWorkspace,
		createEmptyWorkspaceRegistry,
		removeWorkspace,
		switchWorkspace,
		type WorkspaceRecord,
		type WorkspaceRegistry,
	} from '$lib/workspaces/workspace-registry';
	import {
		createWorkspacePasswordHash,
	} from '$lib/workspaces/workspace-password';
	import { resolveDefaultGithubTokenCredential } from '$lib/environment/github-credential';
	import { openEnvironmentVaultSessionFromWorkspaceUnlock } from '$lib/environment/environment-vault-session-loader';
	import {
		selectWorkspacePath,
		validateWorkspacePath
	} from '$lib/workspaces/workspace-path';
	import { formatWorkspacePathForDisplay } from '$lib/workspaces/workspace-path-format';
	import {
		setupWorkspaceRepository,
		type WorkspaceRepositorySetupError
	} from '$lib/workspaces/workspace-repository-setup';
	import {
		fetchWorkspaceRepositoryGit,
		inspectWorkspaceRepositoryGit,
		publishWorkspaceRepositoryToGithub,
		pullWorkspaceRepositoryGit,
		pushWorkspaceRepositoryGit,
		type WorkspaceRepositoryGithubVisibility,
		type WorkspaceRepositoryGitCredentialInput,
	} from '$lib/workspaces/workspace-repository-git';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry,
		writeWorkspaceRegistryToBrowser
	} from '$lib/workspaces/workspace-storage';
	import {
		isWorkspaceUnlocked,
		markWorkspaceLocked,
		markWorkspaceUnlocked,
		subscribeWorkspaceUnlocks,
		workspaceRequiresUnlock
	} from '$lib/workspaces/workspace-unlock';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from './appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from './appearance-storage';
	import {
		getWorkspaceFormErrorMessage,
		getWorkspaceRepositorySetupErrorMessage as resolveWorkspaceRepositorySetupErrorMessage
	} from './workspace-settings-errors';
	import {
		DEFAULT_WORKSPACE_REPOSITORY_COMMIT_MESSAGE,
		type WorkspaceFormError,
		type WorkspaceRepositoryChoice,
		type WorkspaceRepositoryGitAction,
		type WorkspaceRepositoryGitStatus,
		type WorkspaceSettingsActions,
		type WorkspaceSettingsViewModel,
		type WorkspaceUnlockIntent
	} from './workspace-settings-types';
	import WorkspaceSettingsView from './WorkspaceSettingsView.svelte';

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let workspaceName = $state('');
	let workspacePath = $state('');
	let workspacePathDisplay = $state('');
	let workspacePassword = $state('');
	let workspaceRepositoryChoice = $state<WorkspaceRepositoryChoice | null>(null);
	let initializeWorkspaceGit = $state(true);
	let installWorkspaceMustflow = $state(true);
	let installWorkspaceGitignore = $state(true);
	let workspaceUnlockId = $state<string | null>(null);
	let workspaceUnlockIntent = $state<WorkspaceUnlockIntent | null>(null);
	let workspaceRemoveConfirmationId = $state<string | null>(null);
	let workspaceRepositorySetupId = $state<string | null>(null);
	let workspaceRepositoryPublishId = $state<string | null>(null);
	let workspacePathRepairId = $state<string | null>(null);
	let workspaceUnlockRevision = $state(0);
	let workspaceRepositoryGitInspectionSignature = $state('');
	let workspaceRepositoryGitStatusById = $state<Record<string, WorkspaceRepositoryGitStatus>>({});
	let workspaceRepositoryGitActionId = $state<string | null>(null);
	let workspaceRepositoryGitAction = $state<WorkspaceRepositoryGitAction | null>(null);
	let workspaceRepositoryCommitQueueId = $state<string | null>(null);
	let formError = $state<WorkspaceFormError | null>(null);
	let repositorySetupError = $state<WorkspaceRepositorySetupError | null>(null);
	let repositorySetupStatus = $state<string | null>(null);
	let workspaceRepositoryGitStatus = $state<string | null>(null);
	let storageError = $state<string | null>(null);
	let hasLoaded = $state(false);
	let isAddingWorkspace = $state(false);
	let isPreparingWorkspaceRepository = $state(false);
	let isPublishingWorkspaceRepository = $state(false);
	let isSelectingWorkspacePath = $state(false);
	let prepareWorkspaceGit = $state(true);
	let prepareWorkspaceMustflow = $state(true);
	let prepareWorkspaceGitignore = $state(true);
	let workspaceRepositoryName = $state('');
	let workspaceRepositoryCommitMessage = $state(DEFAULT_WORKSPACE_REPOSITORY_COMMIT_MESSAGE);
	let workspaceRepositoryVisibility = $state<WorkspaceRepositoryGithubVisibility>('private');
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let workspaceRemoveCandidate = $derived(
		registry.workspaces.find((workspace) => workspace.id === workspaceRemoveConfirmationId) ??
			null
	);
	let workspaceRepositorySetupCandidate = $derived(
		registry.workspaces.find((workspace) => workspace.id === workspaceRepositorySetupId) ?? null
	);
	let workspaceRepositoryPublishCandidate = $derived(
		registry.workspaces.find((workspace) => workspace.id === workspaceRepositoryPublishId) ?? null
	);
	let canSubmitWorkspaceRepositoryPublish = $derived(
		workspaceRepositoryPublishCandidate !== null &&
			workspaceRepositoryName.trim().length > 0 &&
			workspaceRepositoryCommitMessage.trim().length > 0 &&
			!isPublishingWorkspaceRepository
	);
	let canAddWorkspace = $derived(
		workspaceName.trim().length > 0 &&
			workspacePath.trim().length > 0 &&
			workspacePassword.trim().length > 0 &&
			workspaceRepositoryChoice !== null &&
			!isAddingWorkspace &&
			!isSelectingWorkspacePath
	);
	let useWorkspaceAsRepository = $derived(workspaceRepositoryChoice === 'yes');
	let canSelectWorkspacePath = $derived(!isAddingWorkspace && !isSelectingWorkspacePath);

	function readRegistryFromStorage() {
		const result = readWorkspaceRegistryFromBrowser();

		registry = result.registry;
		storageError = result.ok ? null : messages.workspace.pathErrors.registryReadFailed;
	}

	function persistRegistry(nextRegistry: WorkspaceRegistry) {
		const result = writeWorkspaceRegistryToBrowser(nextRegistry);

		registry = result.registry;
		storageError = result.ok ? null : messages.workspace.pathErrors.registryWriteFailed;
		return result.ok;
	}

	function getWorkspaceErrorMessage(error: WorkspaceFormError) {
		return getWorkspaceFormErrorMessage(messages, error);
	}

	function getWorkspaceRepositorySetupErrorMessage(error: WorkspaceRepositorySetupError) {
		return resolveWorkspaceRepositorySetupErrorMessage(messages, error);
	}

	function isWorkspacePathError(error: WorkspaceFormError | null) {
		return error?.startsWith('workspace-path-') ?? false;
	}

	function workspaceIsUnlocked(workspace: WorkspaceRegistry['workspaces'][number]) {
		return workspaceUnlockRevision >= 0 && isWorkspaceUnlocked(workspace);
	}

	function workspaceIsActive(workspace: WorkspaceRegistry['workspaces'][number]) {
		return registry.activeWorkspaceId === workspace.id && workspaceIsUnlocked(workspace);
	}

	function clearFormError() {
		formError = null;
		repositorySetupError = null;
		repositorySetupStatus = null;
		workspaceRepositoryGitStatus = null;
	}

	function handleWorkspaceNameInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		workspaceName = target.value;
		clearFormError();
	}

	function handleWorkspacePasswordInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		workspacePassword = target.value;
		clearFormError();
	}

	function selectWorkspaceRepositoryChoice(choice: WorkspaceRepositoryChoice) {
		workspaceRepositoryChoice = choice;

		if (choice === 'yes') {
			initializeWorkspaceGit = true;
			installWorkspaceMustflow = true;
			installWorkspaceGitignore = true;
		}

		clearFormError();
	}

	function setInitializeWorkspaceGit(checked: boolean) {
		initializeWorkspaceGit = checked;
		clearFormError();
	}

	function setInstallWorkspaceMustflow(checked: boolean) {
		installWorkspaceMustflow = checked;
		clearFormError();
	}

	function setInstallWorkspaceGitignore(checked: boolean) {
		installWorkspaceGitignore = checked;
		clearFormError();
	}

	function requestWorkspaceUnlock(workspaceId: string, intent: WorkspaceUnlockIntent) {
		workspaceUnlockId = workspaceId;
		workspaceUnlockIntent = intent;
	}

	function clearWorkspaceUnlockRequest() {
		workspaceUnlockId = null;
		workspaceUnlockIntent = null;
	}

	function clearWorkspaceRemoveConfirmation() {
		workspaceRemoveConfirmationId = null;
	}

	function setPrepareWorkspaceGit(checked: boolean) {
		prepareWorkspaceGit = checked;
	}

	function setPrepareWorkspaceMustflow(checked: boolean) {
		prepareWorkspaceMustflow = checked;
	}

	function setPrepareWorkspaceGitignore(checked: boolean) {
		prepareWorkspaceGitignore = checked;
	}

	function clearWorkspaceRepositorySetup() {
		workspaceRepositorySetupId = null;
		prepareWorkspaceGit = true;
		prepareWorkspaceMustflow = true;
		prepareWorkspaceGitignore = true;
		isPreparingWorkspaceRepository = false;
	}

	function clearWorkspaceRepositoryPublish() {
		workspaceRepositoryPublishId = null;
		workspaceRepositoryName = '';
		workspaceRepositoryCommitMessage = DEFAULT_WORKSPACE_REPOSITORY_COMMIT_MESSAGE;
		workspaceRepositoryVisibility = 'private';
		isPublishingWorkspaceRepository = false;
	}

	function clearWorkspacePathRepair() {
		workspacePathRepairId = null;
	}

	function getWorkspaceRepositoryGitStatus(workspaceId: string) {
		return workspaceRepositoryGitStatusById[workspaceId] ?? null;
	}

	function workspaceRepositoryGitBusy(workspaceId: string) {
		return (
			workspaceRepositoryGitActionId === workspaceId ||
			workspaceRepositoryCommitQueueId === workspaceId ||
			isPublishingWorkspaceRepository
		);
	}

	function workspaceRepositoryHasRemote(workspaceId: string) {
		const gitStatus = getWorkspaceRepositoryGitStatus(workspaceId);

		return gitStatus?.ok === true && gitStatus.hasRemote;
	}

	function workspaceRepositoryCanPublish(workspaceId: string) {
		const gitStatus = getWorkspaceRepositoryGitStatus(workspaceId);

		return (
			gitStatus?.ok === true &&
			gitStatus.isGitRepository &&
			!gitStatus.hasRemote &&
			!workspaceRepositoryGitBusy(workspaceId)
		);
	}

	function workspaceRepositoryCanPrepare(workspaceId: string) {
		const gitStatus = getWorkspaceRepositoryGitStatus(workspaceId);

		return gitStatus === null || !gitStatus.ok || !gitStatus.isGitRepository;
	}

	function workspaceRepositoryCanRunRemoteAction(
		workspaceId: string,
		action: WorkspaceRepositoryGitAction
	) {
		const gitStatus = getWorkspaceRepositoryGitStatus(workspaceId);

		if (gitStatus?.ok !== true || !gitStatus.hasRemote || workspaceRepositoryGitBusy(workspaceId)) {
			return false;
		}

		if (action === 'fetch') {
			return true;
		}

		if (action === 'pull') {
			return gitStatus.behindCount > 0;
		}

		return gitStatus.aheadCount > 0;
	}

	function workspaceRepositoryCanQueueCommitWorkOrder(workspaceId: string) {
		const gitStatus = getWorkspaceRepositoryGitStatus(workspaceId);

		return (
			gitStatus?.ok === true &&
			gitStatus.isGitRepository &&
			gitStatus.hasUncommittedChanges &&
			!workspaceRepositoryGitBusy(workspaceId)
		);
	}

	async function queueWorkspaceRepositoryCommitWorkOrder(workspaceId: string) {
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (
			workspace === undefined ||
			workspaceRepositoryGitBusy(workspaceId) ||
			!workspaceRepositoryCanQueueCommitWorkOrder(workspaceId)
		) {
			return;
		}

		formError = null;
		workspaceRepositoryGitStatus = null;
		workspaceRepositoryCommitQueueId = workspace.id;

		try {
			const result = await enqueueRepositoryCommitWorkOrder({
				workspacePath: workspace.path,
				repositoryName: workspace.name,
				repositoryPath: workspace.path,
				source: 'workspace',
				responseLanguage: appearanceSettings.languageId
			});

			if (!result.ok) {
				workspaceRepositoryGitStatus = getQueueFolderLocalizedError(messages, result.error);
				return;
			}

			workspaceRepositoryGitStatus =
				messages.settings.workspaces.repository.commitWorkOrderQueued.replace(
					'{relativePath}',
					result.relativePath
				);
		} finally {
			workspaceRepositoryCommitQueueId = null;
		}
	}

	function getWorkspaceRepositoryGitActionLabel(
		workspaceId: string,
		action: WorkspaceRepositoryGitAction,
		defaultLabel: string
	) {
		return workspaceRepositoryGitActionId === workspaceId && workspaceRepositoryGitAction === action
			? messages.common.checking
			: defaultLabel;
	}

	function createWorkspaceRepositoryGitInspectionSignature() {
		return registry.workspaces
			.map((workspace) => {
				const lockState = workspaceRequiresUnlock(workspace)
					? workspaceIsUnlocked(workspace)
						? 'unlocked'
						: 'locked'
					: 'open';

				return `${workspace.id}:${workspace.path}:${lockState}`;
			})
			.join('|');
	}

	function pruneWorkspaceRepositoryGitStatuses(workspaceIds: Set<string>) {
		workspaceRepositoryGitStatusById = Object.fromEntries(
			Object.entries(workspaceRepositoryGitStatusById).filter(([workspaceId]) =>
				workspaceIds.has(workspaceId)
			)
		);
	}

	async function refreshWorkspaceRepositoryGitStatus(
		workspaceId: string,
		path: string,
		signature = workspaceRepositoryGitInspectionSignature
	) {
		workspaceRepositoryGitStatusById = {
			...workspaceRepositoryGitStatusById,
			[workspaceId]: {
				ok: true,
				isLoading: true,
				isGitRepository: false,
				hasRemote: false,
				aheadCount: 0,
				behindCount: 0,
				hasUncommittedChanges: false,
				branch: null
			}
		};

		const result = await inspectWorkspaceRepositoryGit(path);

		if (signature !== workspaceRepositoryGitInspectionSignature) {
			return;
		}

		workspaceRepositoryGitStatusById = {
			...workspaceRepositoryGitStatusById,
			[workspaceId]: result.ok
				? {
						ok: true,
						isLoading: false,
						isGitRepository: result.isGitRepository,
						hasRemote: result.hasRemote,
						aheadCount: result.aheadCount,
						behindCount: result.behindCount,
						hasUncommittedChanges: result.hasUncommittedChanges,
						branch: result.branch
					}
				: {
						ok: false,
						isLoading: false,
						error: result.error
				}
		};
	}

	async function refreshWorkspaceRepositoryGitStatuses(
		workspaces: readonly WorkspaceRecord[],
		signature = workspaceRepositoryGitInspectionSignature
	) {
		for (const workspace of workspaces) {
			if (signature !== workspaceRepositoryGitInspectionSignature) {
				return;
			}

			await refreshWorkspaceRepositoryGitStatus(workspace.id, workspace.path, signature);
		}
	}

	function handleWorkspacePathInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		workspacePath = target.value;
		workspacePathDisplay = target.value;
		clearFormError();
	}

	async function handleWorkspacePathSelect() {
		if (isSelectingWorkspacePath) {
			return;
		}

		formError = null;
		isSelectingWorkspacePath = true;

		try {
			const result = await selectWorkspacePath(workspacePath);

			if (!result.ok) {
				formError = result.error;
				return;
			}

			if (result.path !== null) {
				workspacePath = result.path;
				workspacePathDisplay = formatWorkspacePathForDisplay(result.path);
			}
		} finally {
			isSelectingWorkspacePath = false;
		}
	}

	async function handleWorkspaceSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (isAddingWorkspace) {
			return;
		}

		formError = null;
		isAddingWorkspace = true;

		try {
			if (workspaceRepositoryChoice === null) {
				formError = 'workspace-repository-choice-required';
				return;
			}

			if (workspacePassword.trim().length === 0) {
				formError = 'workspace-password-required';
				return;
			}

			const pathValidation = await validateWorkspacePath(workspacePath);

			if (!pathValidation.ok) {
				formError = pathValidation.error;
				return;
			}

			const passwordHashResult =
				workspacePassword.length === 0
					? ({ ok: true, passwordHash: null } as const)
					: await createWorkspacePasswordHash(workspacePassword);

			if (!passwordHashResult.ok) {
				formError = passwordHashResult.error;
				return;
			}

			const result = addWorkspace(registry, {
				name: workspaceName,
				path: pathValidation.path,
				passwordHash: passwordHashResult.passwordHash
			});

			if (!result.ok) {
				formError = result.error;
				return;
			}

			if (persistRegistry(result.registry)) {
				if (workspaceRequiresUnlock(result.workspace)) {
					markWorkspaceUnlocked(result.workspace.id, workspacePassword);
				}

				if (useWorkspaceAsRepository) {
					const setupResult = await setupWorkspaceRepository(pathValidation.path, {
						initializeGit: initializeWorkspaceGit,
						installMustflow: installWorkspaceMustflow,
						installGitignore: installWorkspaceGitignore
					});

					if (setupResult.ok) {
						repositorySetupStatus = messages.settings.workspaces.repository.setupComplete;
						await refreshWorkspaceRepositoryGitStatus(result.workspace.id, pathValidation.path);
					} else {
						repositorySetupError = setupResult.error;
					}
				}

				workspaceName = '';
				workspacePath = '';
				workspacePathDisplay = '';
				workspacePassword = '';
				workspaceRepositoryChoice = null;
			}
		} finally {
			isAddingWorkspace = false;
		}
	}

	function handleWorkspaceSwitch(workspaceId: string) {
		formError = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
			requestWorkspaceUnlock(workspace.id, 'switch');
			return;
		}

		switchWorkspaceById(workspaceId);
	}

	function switchWorkspaceById(workspaceId: string) {
		const result = switchWorkspace(registry, workspaceId);

		if (!result.ok) {
			formError = result.error;
			return;
		}

		persistRegistry(result.registry);
		clearWorkspaceUnlockRequest();
	}

	function handleWorkspaceRemove(workspaceId: string) {
		formError = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
			requestWorkspaceUnlock(workspace.id, 'remove');
			return;
		}

		requestWorkspaceRemoveConfirmation(workspaceId);
	}

	function handleWorkspaceRepair(workspaceId: string) {
		formError = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
			requestWorkspaceUnlock(workspace.id, 'repair');
			return;
		}

		workspacePathRepairId = workspace.id;
	}

	function requestWorkspaceRepositorySetup(workspaceId: string) {
		formError = null;
		repositorySetupError = null;
		repositorySetupStatus = null;
		workspaceRepositoryGitStatus = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
			requestWorkspaceUnlock(workspace.id, 'switch');
			return;
		}

		prepareWorkspaceGit = true;
		prepareWorkspaceMustflow = true;
		prepareWorkspaceGitignore = true;
		workspaceRepositorySetupId = workspace.id;
	}

	function requestWorkspaceRepositoryPublish(workspaceId: string) {
		formError = null;
		workspaceRepositoryGitStatus = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
			requestWorkspaceUnlock(workspace.id, 'switch');
			return;
		}

		workspaceRepositoryPublishId = workspace.id;
		workspaceRepositoryName = workspace.name;
		workspaceRepositoryCommitMessage = DEFAULT_WORKSPACE_REPOSITORY_COMMIT_MESSAGE;
		workspaceRepositoryVisibility = 'private';
	}

	function selectWorkspaceRepositoryVisibility(visibility: WorkspaceRepositoryGithubVisibility) {
		workspaceRepositoryVisibility = visibility;
		clearFormError();
	}

	function handleWorkspaceRepositoryNameInput(event: Event) {
		const target = event.currentTarget;

		if (target instanceof HTMLInputElement) {
			workspaceRepositoryName = target.value;
		}

		if (formError === 'project-repository-github-repo-name-required') {
			formError = null;
		}
		workspaceRepositoryGitStatus = null;
	}

	function handleWorkspaceRepositoryCommitMessageInput(event: Event) {
		const target = event.currentTarget;

		if (target instanceof HTMLInputElement) {
			workspaceRepositoryCommitMessage = target.value;
		}

		if (formError === 'project-repository-github-commit-message-required') {
			formError = null;
		}
		workspaceRepositoryGitStatus = null;
	}

	async function runWorkspaceRepositoryGitAction(
		workspaceId: string,
		action: WorkspaceRepositoryGitAction
	) {
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (
			workspace === undefined ||
			workspaceRepositoryGitBusy(workspaceId) ||
			!workspaceRepositoryCanRunRemoteAction(workspaceId, action)
		) {
			return;
		}

		formError = null;
		workspaceRepositoryGitStatus = null;
		workspaceRepositoryGitActionId = workspace.id;
		workspaceRepositoryGitAction = action;

		try {
			const credential = await resolveWorkspaceRepositoryCredential(workspace);
			const result =
				action === 'fetch'
					? await fetchWorkspaceRepositoryGit(workspace.path, credential)
					: action === 'pull'
						? await pullWorkspaceRepositoryGit(workspace.path, credential)
						: await pushWorkspaceRepositoryGit(workspace.path, credential);

			if (!result.ok) {
				formError = result.error;
				return;
			}

			workspaceRepositoryGitStatus =
				action === 'fetch'
					? messages.settings.workspaces.repository.fetchComplete
					: action === 'pull'
						? messages.settings.workspaces.repository.pullComplete
						: messages.settings.workspaces.repository.pushComplete;
			await refreshWorkspaceRepositoryGitStatus(workspace.id, workspace.path);
		} finally {
			workspaceRepositoryGitActionId = null;
			workspaceRepositoryGitAction = null;
		}
	}

	async function resolveWorkspaceRepositoryCredential(
		workspace: WorkspaceRegistry['workspaces'][number]
	): Promise<WorkspaceRepositoryGitCredentialInput | null> {
		const vaultResult = await openEnvironmentVaultSessionFromWorkspaceUnlock(
			workspace.id,
			workspace.path
		);

		if (!vaultResult.ok) {
			return null;
		}

		return resolveDefaultGithubTokenCredential(vaultResult.vault);
	}

	function requestWorkspaceRemoveConfirmation(workspaceId: string) {
		formError = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		workspaceRemoveConfirmationId = workspace.id;
	}

	function handleWorkspaceLock(workspaceId: string) {
		formError = null;
		const workspace = registry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			formError = 'workspace-not-found';
			return;
		}

		if (!workspaceRequiresUnlock(workspace)) {
			return;
		}

		markWorkspaceLocked(workspaceId);

		if (workspaceUnlockId === workspaceId) {
			clearWorkspaceUnlockRequest();
		}
	}

	function removeWorkspaceById(workspaceId: string) {
		const result = removeWorkspace(registry, workspaceId);

		if (!result.ok) {
			formError = result.error;
			return;
		}

		if (persistRegistry(result.registry)) {
			markWorkspaceLocked(workspaceId);

			if (workspaceUnlockId === workspaceId) {
				clearWorkspaceUnlockRequest();
			}

			if (workspaceRemoveConfirmationId === workspaceId) {
				clearWorkspaceRemoveConfirmation();
			}
		}
	}

	function handleWorkspaceUnlocked(workspaceId: string) {
		if (workspaceUnlockIntent === 'remove') {
			clearWorkspaceUnlockRequest();
			requestWorkspaceRemoveConfirmation(workspaceId);
			return;
		}

		if (workspaceUnlockIntent === 'repair') {
			clearWorkspaceUnlockRequest();
			workspacePathRepairId = workspaceId;
			return;
		}

		switchWorkspaceById(workspaceId);
	}

	function confirmWorkspaceRemove() {
		if (workspaceRemoveConfirmationId === null) {
			return;
		}

		removeWorkspaceById(workspaceRemoveConfirmationId);
	}

	async function confirmWorkspaceRepositorySetup() {
		if (workspaceRepositorySetupCandidate === null || isPreparingWorkspaceRepository) {
			return;
		}

		repositorySetupError = null;
		repositorySetupStatus = null;
		isPreparingWorkspaceRepository = true;

		try {
			const result = await setupWorkspaceRepository(workspaceRepositorySetupCandidate.path, {
				initializeGit: prepareWorkspaceGit,
				installMustflow: prepareWorkspaceMustflow,
				installGitignore: prepareWorkspaceGitignore
			});

			if (!result.ok) {
				repositorySetupError = result.error;
				return;
			}

			repositorySetupStatus = messages.settings.workspaces.repository.setupComplete;
			await refreshWorkspaceRepositoryGitStatus(
				workspaceRepositorySetupCandidate.id,
				workspaceRepositorySetupCandidate.path
			);
			clearWorkspaceRepositorySetup();
		} finally {
			isPreparingWorkspaceRepository = false;
		}
	}

	async function handleWorkspaceRepositoryPublishSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!canSubmitWorkspaceRepositoryPublish || workspaceRepositoryPublishCandidate === null) {
			return;
		}

		formError = null;
		workspaceRepositoryGitStatus = null;
		isPublishingWorkspaceRepository = true;

		try {
			const credential = await resolveWorkspaceRepositoryCredential(
				workspaceRepositoryPublishCandidate
			);
			const result = await publishWorkspaceRepositoryToGithub({
				path: workspaceRepositoryPublishCandidate.path,
				repositoryName: workspaceRepositoryName,
				commitMessage: workspaceRepositoryCommitMessage,
				visibility: workspaceRepositoryVisibility,
				credential
			});

			if (!result.ok) {
				formError = result.error;
				return;
			}

			workspaceRepositoryGitStatus = messages.settings.workspaces.repository.publishComplete;
			await refreshWorkspaceRepositoryGitStatus(
				workspaceRepositoryPublishCandidate.id,
				workspaceRepositoryPublishCandidate.path
			);
			clearWorkspaceRepositoryPublish();
		} finally {
			isPublishingWorkspaceRepository = false;
		}
	}

	function handleWorkspaceRepositorySetupBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isPreparingWorkspaceRepository) {
			clearWorkspaceRepositorySetup();
		}
	}

	function handleWorkspaceRepositoryPublishBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isPublishingWorkspaceRepository) {
			clearWorkspaceRepositoryPublish();
		}
	}

	function handleWorkspaceRemoveConfirmationBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			clearWorkspaceRemoveConfirmation();
		}
	}

	function handleWorkspaceRemoveConfirmationKeydown(event: KeyboardEvent) {
		if (workspaceRemoveConfirmationId !== null && event.key === 'Escape') {
			clearWorkspaceRemoveConfirmation();
		}

		if (
			workspaceRepositorySetupId !== null &&
			event.key === 'Escape' &&
			!isPreparingWorkspaceRepository
		) {
			clearWorkspaceRepositorySetup();
		}

		if (
			workspaceRepositoryPublishId !== null &&
			event.key === 'Escape' &&
			!isPublishingWorkspaceRepository
		) {
			clearWorkspaceRepositoryPublish();
		}
	}

	$effect(() => {
		if (!hasLoaded) {
			return;
		}

		const nextSignature = createWorkspaceRepositoryGitInspectionSignature();

		if (workspaceRepositoryGitInspectionSignature === nextSignature) {
			return;
		}

		workspaceRepositoryGitInspectionSignature = nextSignature;
		const unlockedWorkspaces = registry.workspaces.filter(
			(workspace) => !workspaceRequiresUnlock(workspace) || workspaceIsUnlocked(workspace)
		);

		pruneWorkspaceRepositoryGitStatuses(
			new Set(unlockedWorkspaces.map((workspace) => workspace.id))
		);

		void refreshWorkspaceRepositoryGitStatuses(unlockedWorkspaces, nextSignature);
	});

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		readRegistryFromStorage();
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
			storageError = null;

			if (
				workspacePathRepairId !== null &&
				!nextRegistry.workspaces.some((workspace) => workspace.id === workspacePathRepairId)
			) {
				clearWorkspacePathRepair();
			}
		});
		const unsubscribeWorkspaceUnlocks = subscribeWorkspaceUnlocks(() => {
			workspaceUnlockRevision += 1;
		});
		hasLoaded = true;

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeWorkspaceRegistry();
			unsubscribeWorkspaceUnlocks();
		};
	});

	let model = $derived<WorkspaceSettingsViewModel>({
		messages,
		registry,
		workspaceName,
		workspacePathDisplay,
		workspacePassword,
		workspaceRepositoryChoice,
		initializeWorkspaceGit,
		installWorkspaceMustflow,
		installWorkspaceGitignore,
		useWorkspaceAsRepository,
		canSelectWorkspacePath,
		isSelectingWorkspacePath,
		formError,
		canAddWorkspace,
		isAddingWorkspace,
		repositorySetupError,
		storageError,
		repositorySetupStatus,
		workspaceRepositoryGitStatus,
		hasLoaded,
		workspaceUnlockId,
		workspaceUnlockIntent,
		workspacePathRepairId,
		workspaceRepositorySetupCandidate,
		prepareWorkspaceGit,
		prepareWorkspaceMustflow,
		prepareWorkspaceGitignore,
		isPreparingWorkspaceRepository,
		workspaceRepositoryPublishCandidate,
		workspaceRepositoryName,
		workspaceRepositoryCommitMessage,
		workspaceRepositoryVisibility,
		isPublishingWorkspaceRepository,
		canSubmitWorkspaceRepositoryPublish,
		workspaceRemoveCandidate
	});

	const actions: WorkspaceSettingsActions = {
		getWorkspaceErrorMessage, getWorkspaceRepositorySetupErrorMessage, isWorkspacePathError,
		handleWorkspaceNameInput, handleWorkspacePathInput, handleWorkspacePathSelect,
		handleWorkspacePasswordInput, handleWorkspaceSubmit, selectWorkspaceRepositoryChoice,
		setInitializeWorkspaceGit, setInstallWorkspaceMustflow, setInstallWorkspaceGitignore,
		getWorkspaceRepositoryGitStatus,
		workspaceIsActive,
		workspaceIsUnlocked,
		handleWorkspaceUnlocked,
		clearWorkspaceUnlockRequest,
		clearWorkspacePathRepair,
		requestWorkspaceUnlock,
		requestWorkspaceRepositorySetup,
		requestWorkspaceRepositoryPublish,
		workspaceRepositoryCanPrepare,
		workspaceRepositoryCanPublish,
		workspaceRepositoryHasRemote,
		workspaceRepositoryCanRunRemoteAction,
		workspaceRepositoryCanQueueCommitWorkOrder,
		getWorkspaceRepositoryGitActionLabel,
		queueWorkspaceRepositoryCommitWorkOrder,
		runWorkspaceRepositoryGitAction,
		handleWorkspaceRepair,
		handleWorkspaceSwitch,
		handleWorkspaceLock,
		handleWorkspaceRemove,
		clearWorkspaceRepositorySetup,
		setPrepareWorkspaceGit,
		setPrepareWorkspaceMustflow,
		setPrepareWorkspaceGitignore,
		confirmWorkspaceRepositorySetup,
		handleWorkspaceRepositorySetupBackdropClick,
		clearWorkspaceRepositoryPublish,
		selectWorkspaceRepositoryVisibility,
		handleWorkspaceRepositoryNameInput,
		handleWorkspaceRepositoryCommitMessageInput,
		handleWorkspaceRepositoryPublishSubmit,
		handleWorkspaceRepositoryPublishBackdropClick,
		clearWorkspaceRemoveConfirmation,
		confirmWorkspaceRemove,
		handleWorkspaceRemoveConfirmationBackdropClick,
		handleWorkspaceRemoveConfirmationKeydown
	};
</script>

<WorkspaceSettingsView {model} {actions} />
