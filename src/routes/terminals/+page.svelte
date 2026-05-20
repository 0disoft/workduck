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

	type TerminalPanelComponent = typeof import('$lib/terminals/TerminalPanel.svelte').default;

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let TerminalPanel = $state<TerminalPanelComponent | null>(null);
	let terminalCount = $state(0);
	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let terminalCountLabel = $derived(
		messages.terminals.registeredCount.replace('{count}', terminalCount.toString())
	);

	onMount(() => {
		void import('$lib/terminals/TerminalPanel.svelte').then((module) => {
			TerminalPanel = module.default;
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
	<title>{messages.navigation.terminals} - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--entity">
	<header class="workduck-page-header">
		<PageTitleRow title={messages.navigation.terminals} meta={terminalCountLabel} />
	</header>

	<WorkspaceGate>
		{#if activeWorkspace !== null && TerminalPanel !== null}
			<TerminalPanel
				workspace={activeWorkspace}
				onTerminalCountChange={(count) => (terminalCount = count)}
			/>
		{/if}
	</WorkspaceGate>
</main>
