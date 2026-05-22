<script lang="ts">
	interface Props {
		readonly message: string | null;
	}

	let { message }: Props = $props();
</script>

{#if message !== null}
	<p class="workduck-status-toast" aria-live="polite">{message}</p>
{/if}
