<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import QueuePanel from '$lib/queue/QueuePanel.svelte';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import WorkspaceGate from '$lib/workspaces/WorkspaceGate.svelte';
	import {
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
		type WorkspaceRegistry
	} from '$lib/workspaces/workspace-registry';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry
	} from '$lib/workspaces/workspace-storage';

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let activeWorkspace = $derived(getActiveWorkspace(registry));
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

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeWorkspaceRegistry();
		};
	});
</script>

<svelte:head>
	<title>{messages.navigation.queue} - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--queue">
	<WorkspaceGate title={messages.navigation.queue}>
		{#if activeWorkspace !== null}
			<QueuePanel workspace={activeWorkspace} title={messages.navigation.queue} />
		{/if}
	</WorkspaceGate>
</main>
