<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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
	import {
		normalizeSettingsTabId,
		settingsTabs,
		type SettingsTabId
	} from '$lib/settings/settings-tabs';

	type SettingsPanelComponent =
		typeof import('$lib/settings/AppearanceSettingsPanel.svelte').default;
	type LoadedSettingsPanels = Partial<Record<SettingsTabId, SettingsPanelComponent>>;

	let activeSettingsTab = $derived(normalizeSettingsTabId(page.url.searchParams.get('tab')));
	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let loadedSettingsPanels = $state<LoadedSettingsPanels>({});
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	$effect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		void loadSettingsPanel(activeSettingsTab);
	});

	async function loadSettingsPanel(tabId: SettingsTabId) {
		if (loadedSettingsPanels[tabId] !== undefined) {
			return;
		}

		if (tabId === 'appearance') {
			const module = await import('$lib/settings/AppearanceSettingsPanel.svelte');
			loadedSettingsPanels = { ...loadedSettingsPanels, appearance: module.default };
			return;
		}

		if (tabId === 'workspaces') {
			const module = await import('$lib/settings/WorkspaceSettingsPanel.svelte');
			loadedSettingsPanels = { ...loadedSettingsPanels, workspaces: module.default };
			return;
		}

		if (tabId === 'sync') {
			const module = await import('$lib/settings/SyncSettingsPanel.svelte');
			loadedSettingsPanels = { ...loadedSettingsPanels, sync: module.default };
			return;
		}

		const module = await import('$lib/settings/SystemSettingsPanel.svelte');
		loadedSettingsPanels = { ...loadedSettingsPanels, system: module.default };
	}

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
		void loadSettingsPanel(tabId);
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
		{@const AppearanceSettingsPanel = loadedSettingsPanels.appearance}
		{#if AppearanceSettingsPanel !== undefined}
			<AppearanceSettingsPanel />
		{/if}
	{:else if activeSettingsTab === 'workspaces'}
		{@const WorkspaceSettingsPanel = loadedSettingsPanels.workspaces}
		{#if WorkspaceSettingsPanel !== undefined}
			<WorkspaceSettingsPanel />
		{/if}
	{:else if activeSettingsTab === 'sync'}
		{@const SyncSettingsPanel = loadedSettingsPanels.sync}
		{#if SyncSettingsPanel !== undefined}
			<SyncSettingsPanel />
		{/if}
	{:else if activeSettingsTab === 'system'}
		{@const SystemSettingsPanel = loadedSettingsPanels.system}
		{#if SystemSettingsPanel !== undefined}
			<SystemSettingsPanel />
		{/if}
	{/if}
</main>
