<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import AppearanceSettingsPanel from '$lib/settings/AppearanceSettingsPanel.svelte';
	import SyncSettingsPanel from '$lib/settings/SyncSettingsPanel.svelte';
	import SystemSettingsPanel from '$lib/settings/SystemSettingsPanel.svelte';
	import WorkspaceSettingsPanel from '$lib/settings/WorkspaceSettingsPanel.svelte';
	import {
		normalizeSettingsTabId,
		settingsTabs,
		type SettingsTabId
	} from '$lib/settings/settings-tabs';

	let activeSettingsTab = $derived(normalizeSettingsTabId(page.url.searchParams.get('tab')));

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
</script>

<svelte:head>
	<title>Settings - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-settings-page">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">Settings</h1>
	</header>

	<nav class="workduck-settings-tabs" aria-label="Settings sections">
		{#each settingsTabs as settingsTab}
			<a
				class={activeSettingsTab === settingsTab.id
					? 'workduck-settings-tab workduck-settings-tab-active'
					: 'workduck-settings-tab'}
				href={createSettingsTabHref(settingsTab.id)}
				aria-current={activeSettingsTab === settingsTab.id ? 'page' : undefined}
				onclick={(event) => handleSettingsTabClick(event, settingsTab.id)}
			>
				{settingsTab.label}
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
