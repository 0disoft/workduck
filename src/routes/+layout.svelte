<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import { initializePersistentAppState } from '$lib/app-state/persistent-app-state';
	import '../app.css';

	type WorkbenchShellComponent = typeof import('$lib/shell/WorkbenchShell.svelte').default;

	let { children } = $props();

	let WorkbenchShell = $state<WorkbenchShellComponent | null>(null);
	let isAppStateReady = $state(false);
	let isTrayMenuWindow = $derived(
		page.url.pathname === '/tray-menu' || page.url.pathname === '/tray-menu/'
	);

	onMount(() => {
		void initializePersistentAppState().then(async () => {
			isAppStateReady = true;

			if (isTrayMenuWindow) {
				return;
			}

			const module = await import('$lib/shell/WorkbenchShell.svelte');
			WorkbenchShell = module.default;
		});
	});
</script>

{#if !isAppStateReady}
	<div class="workduck-boot-screen" aria-hidden="true"></div>
{:else if isTrayMenuWindow}
	{@render children()}
{:else if WorkbenchShell === null}
	<div class="workduck-boot-screen" aria-hidden="true"></div>
{:else}
	<WorkbenchShell>
		{@render children()}
	</WorkbenchShell>
{/if}
