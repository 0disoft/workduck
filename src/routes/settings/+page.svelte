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
		validateWorkspacePath,
		type WorkspacePathValidationError
	} from '$lib/workspaces/workspace-path';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry,
		writeWorkspaceRegistryToBrowser
	} from '$lib/workspaces/workspace-storage';

	type WorkspaceFormError = WorkspaceRegistryError | WorkspacePathValidationError;

	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let workspaceName = $state('');
	let workspacePath = $state('');
	let formError = $state<WorkspaceFormError | null>(null);
	let storageError = $state<string | null>(null);
	let hasLoaded = $state(false);
	let isAddingWorkspace = $state(false);

	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let canAddWorkspace = $derived(
		workspaceName.trim().length > 0 && workspacePath.trim().length > 0 && !isAddingWorkspace
	);

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
			case 'workspace-path-duplicate':
				return 'Workspace path is already registered.';
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

			const result = addWorkspace(registry, {
				name: workspaceName,
				path: pathValidation.path
			});

			if (!result.ok) {
				formError = result.error;
				return;
			}

			if (persistRegistry(result.registry)) {
				workspaceName = '';
				workspacePath = '';
			}
		} finally {
			isAddingWorkspace = false;
		}
	}

	function handleWorkspaceSwitch(workspaceId: string) {
		formError = null;
		const result = switchWorkspace(registry, workspaceId);

		if (!result.ok) {
			formError = result.error;
			return;
		}

		persistRegistry(result.registry);
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

<svelte:head>
	<title>Settings - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-settings-page">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">Settings</h1>
	</header>

	<section class="workduck-settings-section" aria-labelledby="workspaces-heading">
		<div class="workduck-settings-section-header">
			<h2 id="workspaces-heading" class="workduck-section-title">Workspaces</h2>
			{#if activeWorkspace !== null}
				<span class="workduck-active-workspace">{activeWorkspace.name}</span>
			{/if}
		</div>

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
				<input
					id="workspace-path"
					class="workduck-input"
					type="text"
					bind:value={workspacePath}
					maxlength={WORKSPACE_PATH_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					oninput={clearFormError}
					aria-invalid={isWorkspacePathError(formError)}
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
							<span class="workduck-workspace-path">{workspace.path}</span>
						</div>

						<div class="workduck-workspace-actions">
							{#if registry.activeWorkspaceId === workspace.id}
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
</main>
