<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
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

	type AgentsPanelComponent = typeof import('$lib/agents/AgentsPanel.svelte').default;

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let AgentsPanel = $state<AgentsPanelComponent | null>(null);
	let agentCount = $state(0);
	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let agentCountLabel = $derived(
		messages.agents.registeredCount.replace('{count}', agentCount.toString())
	);

	onMount(() => {
		void import('$lib/agents/AgentsPanel.svelte').then((module) => {
			AgentsPanel = module.default;
		});
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
	<title>{messages.navigation.agents} - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--entity">
	<header class="workduck-page-header">
		<PageTitleRow title={messages.navigation.agents} meta={agentCountLabel} />
	</header>

	<WorkspaceGate>
		{#if activeWorkspace !== null && AgentsPanel !== null}
			<AgentsPanel workspace={activeWorkspace} onAgentCountChange={(count) => (agentCount = count)} />
		{/if}
	</WorkspaceGate>
</main>
