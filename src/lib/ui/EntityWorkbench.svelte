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

<section class="workduck-entity-workbench" aria-label={label}>
	<section class="workduck-entity-sidebar" aria-label={sidebarLabel}>
		{@render sidebar()}
	</section>

	<section class="workduck-entity-detail" aria-label={detailLabel}>
		{#if detail !== undefined}
			{@render detail()}
		{/if}
	</section>

	{#if status !== undefined}
		<div class="workduck-entity-status">
			{@render status()}
		</div>
	{/if}
</section>
