<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '#lib/settings/appearance-settings.ts';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '#lib/settings/appearance-storage.ts';
	import WorkspaceGate from '#lib/workspaces/WorkspaceGate.svelte';
	import {
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
		type WorkspaceRegistry
	} from '#lib/workspaces/workspace-registry.ts';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry
	} from '#lib/workspaces/workspace-storage.ts';
	import { subscribeQueueFilesChanged } from '#lib/queue/queue-read-state.ts';

	type QueuePanelComponent = typeof import('#lib/queue/QueuePanel.svelte').default;

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let QueuePanel = $state<QueuePanelComponent | null>(null);
	let queueRefreshSignal = $state(0);
	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	onMount(() => {
		void import('#lib/queue/QueuePanel.svelte').then((module) => {
			QueuePanel = module.default;
		});
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		registry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
		});
		const unsubscribeQueueFiles = subscribeQueueFilesChanged((workspaceId) => {
			if (activeWorkspace?.id === workspaceId) {
				queueRefreshSignal += 1;
			}
		});

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeWorkspaceRegistry();
			unsubscribeQueueFiles();
		};
	});
</script>

<svelte:head>
	<title>{messages.navigation.queue} - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--queue">
	<WorkspaceGate title={messages.navigation.queue}>
		{#if activeWorkspace !== null && QueuePanel !== null}
			<QueuePanel
				workspace={activeWorkspace}
				title={messages.navigation.queue}
				refreshSignal={queueRefreshSignal}
			/>
		{/if}
	</WorkspaceGate>
</main>
