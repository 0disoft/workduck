<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		readonly title: string;
		readonly kind?: string;
		readonly children: Snippet;
		readonly actions?: Snippet;
	}

	const { title, kind, children, actions }: Props = $props();
</script>

<div class="workduck-detail-card">
	<div class="workduck-detail-card-header">
		<strong class="workduck-detail-card-title">{title}</strong>
		{#if kind !== undefined}
			<span class="workduck-detail-card-kind">{kind}</span>
		{/if}
	</div>

	{@render children()}

	{#if actions !== undefined}
		<div class="workduck-detail-card-actions">
			{@render actions()}
		</div>
	{/if}
</div>
