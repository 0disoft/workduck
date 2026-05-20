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

	type PersonasPanelComponent = typeof import('$lib/personas/PersonasPanel.svelte').default;

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let PersonasPanel = $state<PersonasPanelComponent | null>(null);
	let personaCount = $state(0);
	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let personaCountLabel = $derived(
		messages.personas.registeredCount.replace('{count}', personaCount.toString())
	);

	onMount(() => {
		void import('$lib/personas/PersonasPanel.svelte').then((module) => {
			PersonasPanel = module.default;
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
	<title>{messages.navigation.personas} - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--entity">
	<header class="workduck-page-header">
		<PageTitleRow title={messages.navigation.personas} meta={personaCountLabel} />
	</header>

	<WorkspaceGate>
		{#if activeWorkspace !== null && PersonasPanel !== null}
			<PersonasPanel
				workspace={activeWorkspace}
				onPersonaCountChange={(count) => (personaCount = count)}
			/>
		{/if}
	</WorkspaceGate>
</main>
