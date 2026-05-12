<script lang="ts">
	import WorkbenchShell from '$lib/shell/WorkbenchShell.svelte';

	import '../app.css';

	let { children } = $props();
</script>

<WorkbenchShell>
	{@render children()}
</WorkbenchShell>
