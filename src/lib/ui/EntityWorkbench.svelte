<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		readonly label: string;
		readonly sidebarLabel: string;
		readonly detailLabel: string;
		readonly sidebar: Snippet;
		readonly detail?: Snippet;
		readonly status?: Snippet;
	}

	const { label, sidebarLabel, detailLabel, sidebar, detail, status }: Props = $props();
</script>

<div class="workduck-entity-workbench" role="group" aria-label={label}>
	<div class="workduck-entity-sidebar" role="group" aria-label={sidebarLabel}>
		{@render sidebar()}
	</div>

	<div class="workduck-entity-detail" role="group" aria-label={detailLabel}>
		{#if detail !== undefined}
			{@render detail()}
		{/if}
	</div>

	{#if status !== undefined}
		<div class="workduck-entity-status">
			{@render status()}
		</div>
	{/if}
</div>
