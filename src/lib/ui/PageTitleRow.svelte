<script lang="ts">
	interface Props {
		readonly title: string;
		readonly meta?: string | null;
	}

	let { title, meta = null }: Props = $props();
</script>

<div class="workduck-page-title-row">
	<h1 class="workduck-page-title">{title}</h1>
	{#if meta !== null && meta.length > 0}
		<span class="workduck-page-title-meta">{meta}</span>
	{/if}
</div>
