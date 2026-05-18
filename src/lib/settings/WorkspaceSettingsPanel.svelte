<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		addWorkspace,
		createEmptyWorkspaceRegistry,
		removeWorkspace,
		switchWorkspace,
		WORKSPACE_NAME_MAX_LENGTH,
		WORKSPACE_PATH_MAX_LENGTH,
		type WorkspaceRegistry,
		type WorkspaceRegistryError
	} from '$lib/workspaces/workspace-registry';
	import {
		createWorkspacePasswordHash,
		WORKSPACE_PASSWORD_MIN_LENGTH,
		type WorkspacePasswordError
	} from '$lib/workspaces/workspace-password';
	import {
		selectWorkspacePath,
		validateWorkspacePath,
		type WorkspacePathError
	} from '$lib/workspaces/workspace-path';
	import { formatWorkspacePathForDisplay } from '$lib/workspaces/workspace-path-format';
	import {
		setupWorkspaceRepository,
		type WorkspaceRepositorySetupError
	} from '$lib/workspaces/workspace-repository-setup';
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
	import WorkspacePathRepairForm from '$lib/workspaces/WorkspacePathRepairForm.svelte';
	import WorkspaceUnlockForm from '$lib/workspaces/WorkspaceUnlockForm.svelte';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from './appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from './appearance-storage';

	type WorkspaceFormError = WorkspaceRegistryError | WorkspacePathError | WorkspacePasswordError;
	type WorkspaceUnlockIntent = 'switch' | 'remove' | 'repair';

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let workspaceName = $state('');
	let workspacePath = $state('');
	let workspacePathDisplay = $state('');
	let workspacePassword = $state('');
	let useWorkspaceAsRepository = $state(false);
	let initializeWorkspaceGit = $state(true);
	let installWorkspaceMustflow = $state(true);
	let installWorkspaceGitignore = $state(true);
	let workspaceUnlockId = $state<string | null>(null);
	let workspaceUnlockIntent = $state<WorkspaceUnlockIntent | null>(null);
	let workspaceRemoveConfirmationId = $state<string | null>(null);
	let workspaceRepositorySetupId = $state<string | null>(null);
	let workspacePathRepairId = $state<string | null>(null);
	let workspaceUnlockRevision = $state(0);
	let formError = $state<WorkspaceFormError | null>(null);
	let repositorySetupError = $state<WorkspaceRepositorySetupError | null>(null);
	let repositorySetupStatus = $state<string | null>(null);
	let storageError = $state<string | null>(null);
	let hasLoaded = $state(false);
	let isAddingWorkspace = $state(false);
	let isPreparingWorkspaceRepository = $state(false);
	let isSelectingWorkspacePath = $state(false);
	let prepareWorkspaceGit = $state(true);
	let prepareWorkspaceMustflow = $state(true);
	let prepareWorkspaceGitignore = $state(true);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let workspaceRemoveCandidate = $derived(
		registry.workspaces.find((workspace) => workspace.id === workspaceRemoveConfirmationId) ??
			null
	);
	let workspaceRepositorySetupCandidate = $derived(
		registry.workspaces.find((workspace) => workspace.id === workspaceRepositorySetupId) ?? null
	);
	let canAddWorkspace = $derived(
		workspaceName.trim().length > 0 &&
			workspacePath.trim().length > 0 &&
			!isAddingWorkspace &&
			!isSelectingWorkspacePath
	);
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
		switch (error) {
			case 'workspace-name-required':
				return messages.settings.workspaces.errors.nameRequired;
			case 'workspace-path-required':
			case 'workspace-path-not-absolute':
			case 'workspace-path-not-found':
			case 'workspace-path-not-directory':
			case 'workspace-path-permission-denied':
			case 'workspace-path-unreadable':
			case 'workspace-path-validation-unavailable':
			case 'workspace-path-selection-unavailable':
			case 'workspace-path-selection-failed':
				return getWorkspacePathErrorMessage(error);
			case 'workspace-path-duplicate':
				return messages.workspace.pathErrors.pathDuplicate;
			case 'workspace-password-required':
				return messages.settings.workspaces.errors.passwordRequired;
			case 'workspace-password-too-short':
				return messages.settings.workspaces.errors.passwordTooShort.replace(
					'{minLength}',
					String(WORKSPACE_PASSWORD_MIN_LENGTH)
				);
			case 'workspace-password-hash-failed':
				return messages.settings.workspaces.errors.passwordProtectFailed;
			case 'workspace-password-invalid-hash':
				return messages.settings.workspaces.errors.passwordInvalidHash;
			case 'workspace-password-unavailable':
				return messages.settings.workspaces.errors.passwordUnavailable;
			case 'workspace-password-hash-invalid':
				return messages.settings.workspaces.errors.passwordHashInvalid;
			case 'workspace-not-found':
				return messages.workspace.pathErrors.workspaceNotFound;
		}
	}

	function getWorkspacePathErrorMessage(error: WorkspacePathError) {
		switch (error) {
			case 'workspace-path-required':
				return messages.workspace.pathErrors.pathRequired;
			case 'workspace-path-not-absolute':
				return messages.workspace.pathErrors.pathNotAbsolute;
			case 'workspace-path-not-found':
				return messages.workspace.pathErrors.pathNotFound;
			case 'workspace-path-not-directory':
				return messages.workspace.pathErrors.pathNotDirectory;
			case 'workspace-path-permission-denied':
				return messages.workspace.pathErrors.pathPermissionDenied;
			case 'workspace-path-unreadable':
				return messages.workspace.pathErrors.pathUnreadable;
			case 'workspace-path-validation-unavailable':
				return messages.workspace.pathErrors.pathValidationUnavailable;
			case 'workspace-path-selection-unavailable':
				return messages.workspace.pathErrors.pathSelectionUnavailable;
			case 'workspace-path-selection-failed':
				return messages.workspace.pathErrors.pathSelectionFailed;
		}
	}

	function getWorkspaceRepositorySetupErrorMessage(error: WorkspaceRepositorySetupError) {
		switch (error) {
			case 'workspace-repository-workspace-required':
				return messages.settings.workspaces.errors.repositoryWorkspaceRequired;
			case 'workspace-repository-workspace-not-absolute':
				return messages.settings.workspaces.errors.repositoryWorkspaceNotAbsolute;
			case 'workspace-repository-workspace-not-found':
				return messages.settings.workspaces.errors.repositoryWorkspaceNotFound;
			case 'workspace-repository-workspace-not-directory':
				return messages.settings.workspaces.errors.repositoryWorkspaceNotDirectory;
			case 'workspace-repository-workspace-permission-denied':
				return messages.settings.workspaces.errors.repositoryWorkspacePermissionDenied;
			case 'workspace-repository-workspace-unreadable':
				return messages.settings.workspaces.errors.repositoryWorkspaceUnreadable;
			case 'workspace-repository-layout-invalid':
				return messages.settings.workspaces.errors.repositoryLayoutInvalid;
			case 'workspace-repository-create-failed':
				return messages.settings.workspaces.errors.repositoryCreateFailed;
			case 'workspace-repository-git-unavailable':
				return messages.settings.workspaces.errors.repositoryGitUnavailable;
			case 'workspace-repository-git-timed-out':
				return messages.settings.workspaces.errors.repositoryGitTimedOut;
			case 'workspace-repository-git-init-failed':
				return messages.settings.workspaces.errors.repositoryGitInitFailed;
			case 'workspace-repository-mustflow-unavailable':
				return messages.settings.workspaces.errors.repositoryMustflowUnavailable;
			case 'workspace-repository-mustflow-timed-out':
				return messages.settings.workspaces.errors.repositoryMustflowTimedOut;
			case 'workspace-repository-mustflow-failed':
				return messages.settings.workspaces.errors.repositoryMustflowFailed;
			case 'workspace-repository-gitignore-failed':
				return messages.settings.workspaces.errors.repositoryGitignoreFailed;
			case 'workspace-repository-unavailable':
				return messages.settings.workspaces.errors.repositoryUnavailable;
		}
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
	}

	function handleRepositoryUseChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		useWorkspaceAsRepository = target.checked;

		if (target.checked) {
			initializeWorkspaceGit = true;
			installWorkspaceMustflow = true;
			installWorkspaceGitignore = true;
		}

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

	function clearWorkspaceRepositorySetup() {
		workspaceRepositorySetupId = null;
		prepareWorkspaceGit = true;
		prepareWorkspaceMustflow = true;
		prepareWorkspaceGitignore = true;
		isPreparingWorkspaceRepository = false;
	}

	function clearWorkspacePathRepair() {
		workspacePathRepairId = null;
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
					} else {
						repositorySetupError = setupResult.error;
					}
				}

				workspaceName = '';
				workspacePath = '';
				workspacePathDisplay = '';
				workspacePassword = '';
				useWorkspaceAsRepository = false;
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
			clearWorkspaceRepositorySetup();
		} finally {
			isPreparingWorkspaceRepository = false;
		}
	}

	function handleWorkspaceRepositorySetupBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !isPreparingWorkspaceRepository) {
			clearWorkspaceRepositorySetup();
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
	}

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
</script>

<svelte:window onkeydown={handleWorkspaceRemoveConfirmationKeydown} />

<section
	id="settings-panel-workspaces"
	class="workduck-settings-section"
	aria-label={messages.settings.tabs.workspaces}
>
	<form class="workduck-workspace-form" onsubmit={handleWorkspaceSubmit}>
		<label class="workduck-form-field" for="workspace-name">
			<span>{messages.common.name}</span>
			<input
				id="workspace-name"
				class="workduck-input"
				type="text"
				bind:value={workspaceName}
				maxlength={WORKSPACE_NAME_MAX_LENGTH}
				autocomplete="off"
				oninput={clearFormError}
				aria-invalid={formError === 'workspace-name-required'}
			/>
		</label>

		<label class="workduck-form-field" for="workspace-path">
			<span>{messages.workspace.path}</span>
			<span class="workduck-path-control">
				<input
					id="workspace-path"
					class="workduck-input"
					type="text"
					value={workspacePathDisplay}
					maxlength={WORKSPACE_PATH_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					oninput={handleWorkspacePathInput}
					aria-invalid={isWorkspacePathError(formError)}
				/>
				<button
					class="workduck-icon-button"
					type="button"
					disabled={!canSelectWorkspacePath}
					aria-label={messages.workspace.chooseFolder}
					aria-busy={isSelectingWorkspacePath}
					onclick={handleWorkspacePathSelect}
				>
					<span class="workduck-folder-icon" aria-hidden="true"></span>
				</button>
			</span>
		</label>

		<label class="workduck-form-field" for="workspace-password">
			<span>{messages.common.password}</span>
			<input
				id="workspace-password"
				class="workduck-input"
				type="password"
				bind:value={workspacePassword}
				autocomplete="new-password"
				oninput={clearFormError}
				aria-invalid={formError?.startsWith('workspace-password-') ?? false}
			/>
		</label>

		<button
			class="workduck-button workduck-button-primary"
			type="submit"
			disabled={!canAddWorkspace}
			aria-busy={isAddingWorkspace}
		>
			{isAddingWorkspace ? messages.common.checking : messages.common.add}
		</button>

		<fieldset class="workduck-workspace-repository-options">
			<legend>{messages.settings.workspaces.repository.section}</legend>
			<label class="workduck-toggle-field" for="workspace-use-repository">
				<span class="workduck-toggle-label">
					{messages.settings.workspaces.repository.useAsRepository}
				</span>
				<input
					id="workspace-use-repository"
					class="workduck-checkbox"
					type="checkbox"
					checked={useWorkspaceAsRepository}
					onchange={handleRepositoryUseChange}
				/>
			</label>

			{#if useWorkspaceAsRepository}
				<div class="workduck-workspace-repository-option-grid">
					<label class="workduck-toggle-field" for="workspace-initialize-git">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.initializeGit}
						</span>
						<input
							id="workspace-initialize-git"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={initializeWorkspaceGit}
							onchange={clearFormError}
						/>
					</label>
					<label class="workduck-toggle-field" for="workspace-install-mustflow">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installMustflow}
						</span>
						<input
							id="workspace-install-mustflow"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={installWorkspaceMustflow}
							onchange={clearFormError}
						/>
					</label>
					<label class="workduck-toggle-field" for="workspace-install-gitignore">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installGitignore}
						</span>
						<input
							id="workspace-install-gitignore"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={installWorkspaceGitignore}
							onchange={clearFormError}
						/>
					</label>
				</div>
			{/if}
		</fieldset>
	</form>

	{#if formError !== null || repositorySetupError !== null || storageError !== null}
		<p class="workduck-inline-error" aria-live="polite">
			{formError !== null
				? getWorkspaceErrorMessage(formError)
				: repositorySetupError !== null
					? `${messages.settings.workspaces.repository.setupFailed} ${getWorkspaceRepositorySetupErrorMessage(repositorySetupError)}`
					: storageError}
		</p>
	{/if}

	{#if repositorySetupStatus !== null}
		<p class="workduck-inline-status" aria-live="polite">{repositorySetupStatus}</p>
	{/if}

	{#if hasLoaded && registry.workspaces.length === 0}
		<p class="workduck-empty-state">{messages.settings.workspaces.noWorkspaces}</p>
	{:else if registry.workspaces.length > 0}
		<ul class="workduck-workspace-list">
			{#each registry.workspaces as workspace (workspace.id)}
				<li class="workduck-workspace-row">
					<div class="workduck-workspace-details">
						<strong class="workduck-workspace-name">{workspace.name}</strong>
						<span class="workduck-workspace-path">
							{formatWorkspacePathForDisplay(workspace.path)}
						</span>
						{#if workspaceIsActive(workspace) || (workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace))}
							<span
								class="workduck-workspace-statuses"
								aria-label={messages.settings.workspaces.status}
							>
								{#if workspaceIsActive(workspace)}
									<span class="workduck-status-pill workduck-status-pill-success">
										{messages.settings.workspaces.active}
									</span>
								{/if}
								{#if workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)}
									<span class="workduck-status-pill workduck-status-pill-locked">
										{messages.settings.workspaces.locked}
									</span>
								{/if}
							</span>
						{/if}
						{#if workspaceUnlockId === workspace.id}
							<WorkspaceUnlockForm
								workspace={workspace}
								submitLabel={workspaceUnlockIntent === 'remove'
									? messages.common.remove
									: messages.workspace.unlock.submit}
								onUnlocked={() => handleWorkspaceUnlocked(workspace.id)}
								onCancel={clearWorkspaceUnlockRequest}
							/>
						{/if}
						{#if workspacePathRepairId === workspace.id}
							<WorkspacePathRepairForm
								workspace={workspace}
								onRepaired={clearWorkspacePathRepair}
								onCancel={clearWorkspacePathRepair}
							/>
						{/if}
					</div>

					<div class="workduck-workspace-actions">
						{#if workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)}
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.unlock}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => requestWorkspaceUnlock(workspace.id, 'switch')}
								>
									{messages.workspace.unlock.submit}
								</button>
							</span>
						{:else}
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.prepareRepository}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => requestWorkspaceRepositorySetup(workspace.id)}
								>
									{messages.settings.workspaces.repository.prepare}
								</button>
							</span>
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.reconnect}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => handleWorkspaceRepair(workspace.id)}
								>
									{messages.settings.workspaces.reconnect}
								</button>
							</span>
							{#if registry.activeWorkspaceId !== workspace.id}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.switch}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										onclick={() => handleWorkspaceSwitch(workspace.id)}
									>
										{messages.settings.workspaces.switch}
									</button>
								</span>
							{/if}
							{#if workspaceRequiresUnlock(workspace)}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.lock}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										onclick={() => handleWorkspaceLock(workspace.id)}
									>
										{messages.settings.workspaces.lock}
									</button>
								</span>
							{/if}
						{/if}
						{#if workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)}
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.reconnect}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => handleWorkspaceRepair(workspace.id)}
								>
									{messages.settings.workspaces.reconnect}
								</button>
							</span>
						{/if}
						<span
							class="workduck-tooltip-anchor"
							data-tooltip={messages.settings.workspaces.tooltips.remove}
						>
							<button
								class="workduck-button workduck-button-danger"
								type="button"
								onclick={() => handleWorkspaceRemove(workspace.id)}
							>
								{messages.common.remove}
							</button>
						</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if workspaceRepositorySetupCandidate !== null}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="workduck-dialog-backdrop"
			role="presentation"
			onclick={handleWorkspaceRepositorySetupBackdropClick}
		>
			<div
				class="workduck-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="workspace-repository-setup-title"
			>
				<h2 id="workspace-repository-setup-title" class="workduck-dialog-title">
					{messages.settings.workspaces.repository.prepareTitle}
				</h2>
				<span class="workduck-dialog-kicker">{workspaceRepositorySetupCandidate.name}</span>
				<div class="workduck-workspace-repository-option-grid">
					<label class="workduck-toggle-field" for="prepare-workspace-git">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.initializeGit}
						</span>
						<input
							id="prepare-workspace-git"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={prepareWorkspaceGit}
							disabled={isPreparingWorkspaceRepository}
						/>
					</label>
					<label class="workduck-toggle-field" for="prepare-workspace-mustflow">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installMustflow}
						</span>
						<input
							id="prepare-workspace-mustflow"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={prepareWorkspaceMustflow}
							disabled={isPreparingWorkspaceRepository}
						/>
					</label>
					<label class="workduck-toggle-field" for="prepare-workspace-gitignore">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installGitignore}
						</span>
						<input
							id="prepare-workspace-gitignore"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={prepareWorkspaceGitignore}
							disabled={isPreparingWorkspaceRepository}
						/>
					</label>
				</div>
				{#if repositorySetupError !== null}
					<p class="workduck-inline-error" aria-live="polite">
						{`${messages.settings.workspaces.repository.setupFailed} ${getWorkspaceRepositorySetupErrorMessage(repositorySetupError)}`}
					</p>
				{/if}
				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isPreparingWorkspaceRepository}
						onclick={clearWorkspaceRepositorySetup}
					>
						{messages.common.cancel}
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="button"
						disabled={isPreparingWorkspaceRepository}
						aria-busy={isPreparingWorkspaceRepository}
						onclick={confirmWorkspaceRepositorySetup}
					>
						{isPreparingWorkspaceRepository
							? messages.common.checking
							: messages.settings.workspaces.repository.prepare}
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if workspaceRemoveCandidate !== null}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="workduck-dialog-backdrop"
			role="presentation"
			onclick={handleWorkspaceRemoveConfirmationBackdropClick}
		>
			<div
				class="workduck-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="workspace-remove-confirm-title"
				aria-describedby="workspace-remove-confirm-description"
			>
				<h2 id="workspace-remove-confirm-title" class="workduck-dialog-title">
					{messages.settings.workspaces.removeTitle}
				</h2>
				<p id="workspace-remove-confirm-description" class="workduck-dialog-text">
					{messages.settings.workspaces.removeDescription.replace(
						'{name}',
						workspaceRemoveCandidate.name
					)}
				</p>
				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={clearWorkspaceRemoveConfirmation}
					>
						{messages.common.cancel}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						onclick={confirmWorkspaceRemove}
					>
						{messages.common.remove}
					</button>
				</div>
			</div>
		</div>
	{/if}
</section>
