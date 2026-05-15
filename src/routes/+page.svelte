<script lang="ts">
	import { onMount } from 'svelte';

	import ProjectsBoard from '$lib/projects/ProjectsBoard.svelte';
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

<svelte:head>
	<title>Projects - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--projects">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">Projects</h1>
	</header>

	<WorkspaceGate>
		{#if activeWorkspace !== null}
			<ProjectsBoard workspace={activeWorkspace} />
		{/if}
	</WorkspaceGate>
</main>
