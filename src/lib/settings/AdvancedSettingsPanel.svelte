<script lang="ts">
	import { onMount } from 'svelte';

	import SkillsPanel from '$lib/skills/SkillsPanel.svelte';
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

	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let activeWorkspace = $derived(getActiveWorkspace(registry));

	onMount(() => {
		registry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
		});

		return unsubscribeWorkspaceRegistry;
	});
</script>

<section id="settings-panel-advanced" class="workduck-settings-section">
	<WorkspaceGate>
		{#if activeWorkspace !== null}
			<SkillsPanel workspace={activeWorkspace} />
		{/if}
	</WorkspaceGate>
</section>
