<script lang="ts">
	import type { ProjectNodeRecord } from './project-registry';

	interface Props {
		readonly node: ProjectNodeRecord;
		readonly selected: boolean;
		readonly kindLabel: string;
		readonly stats: readonly string[];
		readonly onSelect: () => void;
		readonly onContextMenu: (event: MouseEvent) => void;
	}

	let { node, selected, kindLabel, stats, onSelect, onContextMenu }: Props = $props();
</script>

<button
	class="workduck-project-card workduck-project-card-button"
	class:workduck-project-card-selected={selected}
	type="button"
	aria-pressed={selected}
	onclick={onSelect}
	oncontextmenu={onContextMenu}
>
	<div class="workduck-project-card-header">
		<strong class="workduck-project-card-name">{node.name}</strong>
		<span class="workduck-project-card-kind">{kindLabel}</span>
	</div>
	{#if node.description.length > 0}
		<p class="workduck-project-card-description">{node.description}</p>
	{/if}
	<div class="workduck-project-card-stats" aria-label={`${node.name} totals`}>
		{#each stats as stat (stat)}
			<span>{stat}</span>
		{/each}
	</div>
</button>
