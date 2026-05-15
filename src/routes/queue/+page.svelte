<script lang="ts">
	import { onMount } from 'svelte';

	import QueuePanel from '$lib/queue/QueuePanel.svelte';
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
	let refreshSignal = $state(0);
	let activeWorkspace = $derived(getActiveWorkspace(registry));

	onMount(() => {
		registry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
		});

		function handleQueueShortcut(event: KeyboardEvent) {
			if (event.key !== 'F5') {
				return;
			}

			event.preventDefault();
			refreshSignal += 1;
		}

		window.addEventListener('keydown', handleQueueShortcut);

		return () => {
			window.removeEventListener('keydown', handleQueueShortcut);
			unsubscribeWorkspaceRegistry();
		};
	});
</script>

<svelte:head>
	<title>Queue - Workduck</title>
</svelte:head>

<main class="workduck-page">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">Queue</h1>
		<div class="workduck-page-actions">
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				aria-keyshortcuts="F5"
				onclick={() => {
					refreshSignal += 1;
				}}
			>
				Refresh (F5)
			</button>
		</div>
	</header>

	<WorkspaceGate>
		{#if activeWorkspace !== null}
			<QueuePanel workspace={activeWorkspace} {refreshSignal} />
		{/if}
	</WorkspaceGate>
</main>
