<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import '../app.css';

	type WorkbenchShellComponent = typeof import('$lib/shell/WorkbenchShell.svelte').default;
	type CommandPaletteComponent = typeof import('$lib/search/CommandPalette.svelte').default;

	let { children } = $props();

	let WorkbenchShell = $state<WorkbenchShellComponent | null>(null);
	let CommandPalette = $state<CommandPaletteComponent | null>(null);
	let isTrayMenuWindow = $derived(
		page.url.pathname === '/tray-menu' || page.url.pathname === '/tray-menu/'
	);

	onMount(() => {
		if (isTrayMenuWindow) {
			return;
		}

		void import('$lib/shell/WorkbenchShell.svelte').then((module) => {
			WorkbenchShell = module.default;
		});
		void import('$lib/search/CommandPalette.svelte').then((module) => {
			CommandPalette = module.default;
		});
	});
</script>

{#if isTrayMenuWindow}
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
