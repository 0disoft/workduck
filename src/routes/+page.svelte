<script lang="ts">
	import WorkspaceGate from '$lib/workspaces/WorkspaceGate.svelte';
</script>

<svelte:head>
	<title>Workduck</title>
</svelte:head>

<main class="workduck-page">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">Projects</h1>
	</header>

	<WorkspaceGate>
		<p class="workduck-empty-state">No projects yet.</p>
	</WorkspaceGate>
</main>
