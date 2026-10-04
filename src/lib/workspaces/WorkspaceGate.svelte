<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, type Snippet } from 'svelte';
	import { getTauriInvoke } from '#lib/tauri/tauri-invoke.ts';

	import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '#lib/settings/appearance-settings.ts';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '#lib/settings/appearance-storage.ts';

	import {
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
		type WorkspaceRegistry
	} from './workspace-registry';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry
	} from './workspace-storage';
	import {
		selectWorkspacePath,
		validateWorkspacePath,
		type WorkspacePathValidationError
	} from './workspace-path';
	import { isWorkspaceUnlocked, subscribeWorkspaceUnlocks } from './workspace-unlock';
	import WorkspacePathRepairForm from './WorkspacePathRepairForm.svelte';
	import WorkspaceUnlockForm from './WorkspaceUnlockForm.svelte';
	import { setWorkspaceRegistrationPath } from './workspace-registration-draft';

	interface Props {
		readonly children: Snippet;
		readonly title?: string;
	}

	const { children, title }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let hasLoaded = $state(false);
	let unlockRevision = $state(0);
	let workspacePathState = $state<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
	let workspacePathError = $state<WorkspacePathValidationError | null>(null);
	let workspacePathCheckRevision = 0;
	let isChoosingFolder = $state(false);
	let folderSelectionFailed = $state(false);

	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let canUseActiveWorkspace = $derived(
		activeWorkspace !== null && unlockRevision >= 0 && isWorkspaceUnlocked(activeWorkspace)
	);
	let activeWorkspacePathCheckKey = $derived(
		activeWorkspace !== null && canUseActiveWorkspace
			? `${activeWorkspace.id}:${activeWorkspace.path}`
			: ''
	);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		registry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
		});
		const unsubscribeWorkspaceUnlocks = subscribeWorkspaceUnlocks(() => {
			unlockRevision += 1;
		});

		hasLoaded = true;

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeWorkspaceRegistry();
			unsubscribeWorkspaceUnlocks();
		};
	});

	$effect(() => {
		const checkKey = activeWorkspacePathCheckKey;
		const workspace = activeWorkspace;
		const checkRevision = ++workspacePathCheckRevision;

		workspacePathError = null;

		if (checkKey.length === 0 || workspace === null || !canUseActiveWorkspace) {
			workspacePathState = 'idle';
			return;
		}

		workspacePathState = 'checking';

		void validateWorkspacePath(workspace.path).then((result) => {
			if (checkRevision !== workspacePathCheckRevision) {
				return;
			}

			if (result.ok || result.error === 'workspace-path-validation-unavailable') {
				workspacePathState = 'valid';
				workspacePathError = null;
				return;
			}

			workspacePathState = 'invalid';
			workspacePathError = result.error;
		});
	});

	function getPathErrorMessage(error: WorkspacePathValidationError) {
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
		}
	}

	async function startWorkspaceRegistration() {
		if (isChoosingFolder) return;
		folderSelectionFailed = false;
		if (getTauriInvoke() === undefined) {
			await goto('/settings?tab=workspaces#workspace-path');
			return;
		}
		isChoosingFolder = true;
		try {
			const result = await selectWorkspacePath('');
			if (!result.ok) {
				folderSelectionFailed = true;
				return;
			}
			if (result.path === null) return;
			setWorkspaceRegistrationPath(result.path);
			await goto('/settings?tab=workspaces#workspace-name');
		} finally {
			isChoosingFolder = false;
		}
	}
</script>

{#if !hasLoaded}
	<div class="workduck-gated-state">
		{#if title !== undefined}
			<header class="workduck-page-header">
				<h1 class="workduck-page-title">{title}</h1>
			</header>
		{/if}
		<p class="workduck-empty-state">{messages.workspace.checkingFolder}</p>
	</div>
{:else if activeWorkspace === null}
	<div class="workduck-gated-state">
		{#if title !== undefined}
			<header class="workduck-page-header">
				<h1 class="workduck-page-title">{title}</h1>
			</header>
		{/if}
		<section class="workduck-onboarding-panel">
			<h2 class="workduck-section-title">{messages.workspace.firstWorkspaceTitle}</h2>
			<p>{messages.workspace.firstWorkspaceDescription}</p>
			<button class="workduck-button workduck-button-primary" type="button"
				disabled={isChoosingFolder} aria-busy={isChoosingFolder}
				onclick={() => void startWorkspaceRegistration()}>
				{messages.workspace.chooseFolder}
			</button>
			{#if folderSelectionFailed}
				<p class="workduck-inline-error" role="alert">{messages.workspace.pathErrors.pathSelectionFailed}</p>
				<a href="/settings?tab=workspaces#workspace-path">{messages.workspace.addWorkspace}</a>
			{/if}
		</section>
	</div>
{:else if activeWorkspace !== null && !canUseActiveWorkspace}
	<div class="workduck-gated-state">
		{#if title !== undefined}
			<header class="workduck-page-header">
				<h1 class="workduck-page-title">{title}</h1>
			</header>
		{/if}
		<section class="workduck-lock-panel" aria-label={messages.workspace.locked}>
			<h2 class="workduck-section-title">{messages.workspace.locked}</h2>
			<WorkspaceUnlockForm workspace={activeWorkspace} />
		</section>
	</div>
{:else if activeWorkspace !== null && workspacePathError !== null}
	<div class="workduck-gated-state">
		{#if title !== undefined}
			<header class="workduck-page-header">
				<h1 class="workduck-page-title">{title}</h1>
			</header>
		{/if}
		<section class="workduck-lock-panel" aria-label={messages.workspace.folderUnavailable}>
			<h2 class="workduck-section-title">{messages.workspace.folderUnavailable}</h2>
			<p class="workduck-empty-state">{getPathErrorMessage(workspacePathError)}</p>
			<WorkspacePathRepairForm
				workspace={activeWorkspace}
				onRepaired={() => {
					workspacePathState = 'idle';
					workspacePathError = null;
				}}
			/>
		</section>
	</div>
{:else if activeWorkspace !== null && workspacePathState !== 'valid'}
	<div class="workduck-gated-state">
		{#if title !== undefined}
			<header class="workduck-page-header">
				<h1 class="workduck-page-title">{title}</h1>
			</header>
		{/if}
		<p class="workduck-empty-state">{messages.workspace.checkingFolder}</p>
	</div>
{:else}
	{@render children()}
{/if}
