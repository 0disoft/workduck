<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		readonly title: string;
		readonly kind?: string;
		readonly description?: string;
		readonly meta?: string;
		readonly selected?: boolean;
		readonly disabled?: boolean;
		readonly onSelect: () => void;
		readonly children?: Snippet;
	}

	const {
		title,
		kind,
		description = '',
		meta = '',
		selected = false,
		disabled = false,
		onSelect,
		children
	}: Props = $props();
</script>

<button
	class="workduck-entity-card"
	class:workduck-entity-card-selected={selected}
	type="button"
	aria-pressed={selected}
	{disabled}
	onclick={onSelect}
>
	<span class="workduck-entity-card-header">
		<strong class="workduck-entity-card-title">{title}</strong>
		{#if kind !== undefined}
			<span class="workduck-entity-card-kind">{kind}</span>
		{/if}
	</span>

	{#if description.length > 0}
		<span class="workduck-entity-card-description">{description}</span>
	{/if}

	{#if meta.length > 0}
		<span class="workduck-entity-card-meta">{meta}</span>
	{/if}

	{#if children !== undefined}
		{@render children()}
	{/if}
</button>
