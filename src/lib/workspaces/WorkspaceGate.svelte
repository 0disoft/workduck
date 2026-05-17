<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';

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
		validateWorkspacePath,
		type WorkspacePathValidationError
	} from './workspace-path';
	import { isWorkspaceUnlocked, subscribeWorkspaceUnlocks } from './workspace-unlock';
	import WorkspacePathRepairForm from './WorkspacePathRepairForm.svelte';
	import WorkspaceUnlockForm from './WorkspaceUnlockForm.svelte';

	interface Props {
		readonly children: Snippet;
		readonly title?: string;
	}

	const { children, title }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let hasLoaded = $state(false);
	let unlockRevision = $state(0);
	let workspacePathError = $state<WorkspacePathValidationError | null>(null);
	let workspacePathCheckRevision = 0;

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
			return;
		}

		void validateWorkspacePath(workspace.path).then((result) => {
			if (checkRevision !== workspacePathCheckRevision) {
				return;
			}

			if (result.ok || result.error === 'workspace-path-validation-unavailable') {
				workspacePathError = null;
				return;
			}

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
</script>

{#if hasLoaded && activeWorkspace === null}
	<div class="workduck-gated-state">
		{#if title !== undefined}
			<header class="workduck-page-header">
				<h1 class="workduck-page-title">{title}</h1>
			</header>
		{/if}
		<p class="workduck-empty-state">{messages.workspace.addWorkspaceInSettings}</p>
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
				onRepaired={() => (workspacePathError = null)}
			/>
		</section>
	</div>
{:else}
	{@render children()}
{/if}
