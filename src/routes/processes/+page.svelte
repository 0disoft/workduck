<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import ProcessesPanel from '$lib/processes/ProcessesPanel.svelte';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	onMount(() => {
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
		<h1 class="workduck-page-title">{messages.navigation.processes}</h1>
	</header>

	<ProcessesPanel />
</main>
