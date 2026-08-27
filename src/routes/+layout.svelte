<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import { initializePersistentAppState } from '$lib/app-state/persistent-app-state';
	import '../app.css';

	type WorkbenchShellComponent = typeof import('$lib/shell/WorkbenchShell.svelte').default;
	type CommandPaletteComponent = typeof import('$lib/search/CommandPalette.svelte').default;

	let { children } = $props();

	let WorkbenchShell = $state<WorkbenchShellComponent | null>(null);
	let CommandPalette = $state<CommandPaletteComponent | null>(null);
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

			const [shellModule, paletteModule] = await Promise.all([
				import('$lib/shell/WorkbenchShell.svelte'),
				import('$lib/search/CommandPalette.svelte')
			]);
			WorkbenchShell = shellModule.default;
			CommandPalette = paletteModule.default;
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
	{#if CommandPalette !== null}
		<CommandPalette />
	{/if}
{/if}
