<script lang="ts">
	import { page } from '$app/state';

	import WorkbenchShell from '$lib/shell/WorkbenchShell.svelte';

	import '../app.css';

	let { children } = $props();

	let isTrayMenuWindow = $derived(
		page.url.pathname === '/tray-menu' || page.url.pathname === '/tray-menu/'
	);
</script>

{#if isTrayMenuWindow}
	{@render children()}
{:else}
	<WorkbenchShell>
		{@render children()}
	</WorkbenchShell>
{/if}
