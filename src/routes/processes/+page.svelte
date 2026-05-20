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

	type ProcessesPanelComponent = typeof import('$lib/processes/ProcessesPanel.svelte').default;

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let ProcessesPanel = $state<ProcessesPanelComponent | null>(null);
	let processCount = $state(0);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let processCountLabel = $derived(
		messages.processes.registeredCount.replace('{count}', processCount.toString())
	);

	onMount(() => {
		void import('$lib/processes/ProcessesPanel.svelte').then((module) => {
			ProcessesPanel = module.default;
		});
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return () => {
			unsubscribeAppearanceSettings();
		};
	});
</script>

<svelte:head>
	<title>{messages.navigation.processes} - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--processes">
	<header class="workduck-page-header">
		<PageTitleRow title={messages.navigation.processes} meta={processCountLabel} />
	</header>

	{#if ProcessesPanel !== null}
		<ProcessesPanel onProcessCountChange={(count) => (processCount = count)} />
	{/if}
</main>
