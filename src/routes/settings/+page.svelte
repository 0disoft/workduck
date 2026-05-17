<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import AppearanceSettingsPanel from '$lib/settings/AppearanceSettingsPanel.svelte';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import SyncSettingsPanel from '$lib/settings/SyncSettingsPanel.svelte';
	import SystemSettingsPanel from '$lib/settings/SystemSettingsPanel.svelte';
	import WorkspaceSettingsPanel from '$lib/settings/WorkspaceSettingsPanel.svelte';
	import {
		normalizeSettingsTabId,
		settingsTabs,
		type SettingsTabId
	} from '$lib/settings/settings-tabs';

	let activeSettingsTab = $derived(normalizeSettingsTabId(page.url.searchParams.get('tab')));
	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	function createSettingsTabHref(tabId: SettingsTabId) {
		const nextUrl = new URL(page.url);

		nextUrl.searchParams.set('tab', tabId);
		return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
	}

	function handleSettingsTabClick(event: MouseEvent, tabId: SettingsTabId) {
		event.preventDefault();
		void goto(createSettingsTabHref(tabId), {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});
</script>

<svelte:head>
	<title>{messages.settings.pageTitle}</title>
</svelte:head>

<main class="workduck-page workduck-settings-page">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">{messages.settings.title}</h1>
	</header>

	<nav class="workduck-settings-tabs" aria-label={messages.settings.sections}>
		{#each settingsTabs as settingsTab}
			<a
				class={activeSettingsTab === settingsTab.id
					? 'workduck-settings-tab workduck-settings-tab-active'
					: 'workduck-settings-tab'}
				href={createSettingsTabHref(settingsTab.id)}
				aria-current={activeSettingsTab === settingsTab.id ? 'page' : undefined}
				onclick={(event) => handleSettingsTabClick(event, settingsTab.id)}
			>
				{messages.settings.tabs[settingsTab.id]}
			</a>
		{/each}
	</nav>

	{#if activeSettingsTab === 'appearance'}
		<AppearanceSettingsPanel />
	{:else if activeSettingsTab === 'workspaces'}
		<WorkspaceSettingsPanel />
	{:else if activeSettingsTab === 'sync'}
		<SyncSettingsPanel />
	{:else if activeSettingsTab === 'system'}
		<SystemSettingsPanel />
	{/if}
</main>
