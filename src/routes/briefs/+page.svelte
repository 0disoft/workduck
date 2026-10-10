<script lang="ts">
	import { onMount } from 'svelte';
	import { createDefaultAppearanceSettings } from '#lib/settings/appearance-settings.ts';
	import { readAppearanceSettingsFromBrowser, subscribeAppearanceSettings } from '#lib/settings/appearance-storage.ts';
	import { createEmptyWorkspaceRegistry, getActiveWorkspace } from '#lib/workspaces/workspace-registry.ts';
	import { readWorkspaceRegistryFromBrowser, subscribeWorkspaceRegistry } from '#lib/workspaces/workspace-storage.ts';
	import WorkspaceGate from '#lib/workspaces/WorkspaceGate.svelte';
	import PageTitleRow from '#lib/ui/PageTitleRow.svelte';
	import BriefsPanel from '#lib/briefs/BriefsPanel.svelte';
	import { briefMessages } from '#lib/briefs/brief-messages.ts';
	import { createBriefEditorDraftStore } from '#lib/briefs/brief-editor-drafts.ts';

	const editorDrafts = createBriefEditorDraftStore();
	let appearance = $state(createDefaultAppearanceSettings());
	let registry = $state(createEmptyWorkspaceRegistry());
	let workspace = $derived(getActiveWorkspace(registry));
	let title = $derived(briefMessages[appearance.languageId].title);
	onMount(() => {
		appearance = readAppearanceSettingsFromBrowser().settings;
		registry = readWorkspaceRegistryFromBrowser().registry;
		const stopAppearance = subscribeAppearanceSettings((next) => { appearance = next; });
		const stopWorkspace = subscribeWorkspaceRegistry((next) => { registry = next; });
		return () => { stopAppearance(); stopWorkspace(); };
	});
</script>

<svelte:head><title>{title} - Workduck</title></svelte:head>
<main class="workduck-page workduck-page--entity">
	<header class="workduck-page-header"><PageTitleRow {title} /></header>
	<WorkspaceGate>
		{#if workspace}{#key `${workspace.id}:${workspace.path}`}<BriefsPanel {workspace} {editorDrafts} languageId={appearance.languageId} />{/key}{/if}
	</WorkspaceGate>
</main>
