<script lang="ts">
	import { onMount } from 'svelte';

	import {
		addWorkspace,
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
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
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry,
		writeWorkspaceRegistryToBrowser
	} from '$lib/workspaces/workspace-storage';
	import {
		isWorkspaceUnlocked,
		markWorkspaceUnlocked,
		workspaceRequiresUnlock
	} from '$lib/workspaces/workspace-unlock';
	import WorkspaceUnlockForm from '$lib/workspaces/WorkspaceUnlockForm.svelte';

	type WorkspaceFormError = WorkspaceRegistryError | WorkspacePathError | WorkspacePasswordError;

	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let workspaceName = $state('');
	let workspacePath = $state('');
	let workspacePathDisplay = $state('');
	let workspacePassword = $state('');
	let workspaceUnlockId = $state<string | null>(null);
	let formError = $state<WorkspaceFormError | null>(null);
	let storageError = $state<string | null>(null);
	let hasLoaded = $state(false);
	let isAddingWorkspace = $state(false);
	let isSelectingWorkspacePath = $state(false);

	let activeWorkspace = $derived(getActiveWorkspace(registry));
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
		storageError = result.ok ? null : 'Workspace settings could not be loaded.';
	}

	function persistRegistry(nextRegistry: WorkspaceRegistry) {
		const result = writeWorkspaceRegistryToBrowser(nextRegistry);

		registry = result.registry;
		storageError = result.ok ? null : 'Workspace settings could not be saved.';
		return result.ok;
	}

	function getWorkspaceErrorMessage(error: WorkspaceFormError) {
		switch (error) {
			case 'workspace-name-required':
				return 'Workspace name is required.';
			case 'workspace-path-required':
				return 'Workspace path is required.';
			case 'workspace-path-not-absolute':
				return 'Workspace path must be an absolute folder path.';
			case 'workspace-path-not-found':
				return 'Workspace path does not exist.';
			case 'workspace-path-not-directory':
				return 'Workspace path must be a folder.';
			case 'workspace-path-permission-denied':
				return 'Workspace path is not readable.';
			case 'workspace-path-unreadable':
				return 'Workspace path could not be checked.';
			case 'workspace-path-validation-unavailable':
				return 'Workspace path can only be checked in the desktop app.';
			case 'workspace-path-selection-unavailable':
				return 'Workspace folder picker is unavailable.';
			case 'workspace-path-selection-failed':
				return 'Workspace folder could not be selected.';
			case 'workspace-path-duplicate':
				return 'Workspace path is already registered.';
			case 'workspace-password-required':
				return 'Workspace password is required.';
			case 'workspace-password-too-short':
				return `Workspace password must be at least ${WORKSPACE_PASSWORD_MIN_LENGTH} characters.`;
			case 'workspace-password-hash-failed':
				return 'Workspace password could not be protected.';
			case 'workspace-password-invalid-hash':
				return 'Workspace lock data could not be read.';
			case 'workspace-password-unavailable':
				return 'Workspace password can only be protected in the desktop app.';
			case 'workspace-password-hash-invalid':
				return 'Workspace lock data could not be saved.';
			case 'workspace-not-found':
				return 'Workspace was not found.';
		}
	}

	function isWorkspacePathError(error: WorkspaceFormError | null) {
		return error?.startsWith('workspace-path-') ?? false;
	}

	function clearFormError() {
		formError = null;
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
					markWorkspaceUnlocked(result.workspace.id);
				}

				workspaceName = '';
				workspacePath = '';
				workspacePathDisplay = '';
				workspacePassword = '';
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
			workspaceUnlockId = workspace.id;
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
		workspaceUnlockId = null;
	}

	function handleWorkspaceRemove(workspaceId: string) {
		formError = null;
		const result = removeWorkspace(registry, workspaceId);

		if (!result.ok) {
			formError = result.error;
			return;
		}

		persistRegistry(result.registry);
	}

	onMount(() => {
		readRegistryFromStorage();
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
			storageError = null;
		});
		hasLoaded = true;

		return unsubscribeWorkspaceRegistry;
	});
</script>

<section
	id="settings-panel-workspaces"
	class="workduck-settings-section"
	aria-label="Workspaces"
>
	{#if activeWorkspace !== null}
		<div class="workduck-settings-section-header">
			<span class="workduck-active-workspace">{activeWorkspace.name}</span>
		</div>
	{/if}

	<form class="workduck-workspace-form" onsubmit={handleWorkspaceSubmit}>
		<label class="workduck-form-field" for="workspace-name">
			<span>Name</span>
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
			<span>Path</span>
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
					aria-label="Choose workspace folder"
					aria-busy={isSelectingWorkspacePath}
					onclick={handleWorkspacePathSelect}
				>
					<span class="workduck-folder-icon" aria-hidden="true"></span>
				</button>
			</span>
		</label>

		<label class="workduck-form-field" for="workspace-password">
			<span>Password</span>
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
			{isAddingWorkspace ? 'Checking' : 'Add'}
		</button>
	</form>

	{#if formError !== null || storageError !== null}
		<p class="workduck-inline-error" aria-live="polite">
			{formError === null ? storageError : getWorkspaceErrorMessage(formError)}
		</p>
	{/if}

	{#if hasLoaded && registry.workspaces.length === 0}
		<p class="workduck-empty-state">No workspaces.</p>
	{:else if registry.workspaces.length > 0}
		<ul class="workduck-workspace-list">
			{#each registry.workspaces as workspace (workspace.id)}
				<li class="workduck-workspace-row">
					<div class="workduck-workspace-details">
						<strong class="workduck-workspace-name">{workspace.name}</strong>
						<span class="workduck-workspace-path">
							{formatWorkspacePathForDisplay(workspace.path)}
						</span>
						{#if workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)}
							<span class="workduck-workspace-lock-state">Locked</span>
						{/if}
						{#if workspaceUnlockId === workspace.id}
							<WorkspaceUnlockForm
								workspace={workspace}
								onUnlocked={() => switchWorkspaceById(workspace.id)}
								onCancel={() => (workspaceUnlockId = null)}
							/>
						{/if}
					</div>

					<div class="workduck-workspace-actions">
						{#if workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)}
							<button
								class="workduck-button workduck-button-secondary"
								type="button"
								onclick={() => (workspaceUnlockId = workspace.id)}
							>
								Unlock
							</button>
						{:else if registry.activeWorkspaceId === workspace.id}
							<span class="workduck-status-pill">Active</span>
						{:else}
							<button
								class="workduck-button workduck-button-secondary"
								type="button"
								onclick={() => handleWorkspaceSwitch(workspace.id)}
							>
								Switch
							</button>
						{/if}
						<button
							class="workduck-button workduck-button-danger"
							type="button"
							onclick={() => handleWorkspaceRemove(workspace.id)}
						>
							Remove
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
