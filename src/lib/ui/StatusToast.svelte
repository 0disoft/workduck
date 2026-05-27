<script lang="ts">
	interface Props {
		readonly message: string | null;
	}

	let { message }: Props = $props();
	let visibleMessage = $state<string | null>(null);
	let dismissTimeout: number | null = null;

	function clearDismissTimeout() {
		if (dismissTimeout === null) {
			return;
		}

		window.clearTimeout(dismissTimeout);
		dismissTimeout = null;
	}

	$effect(() => {
		visibleMessage = message;
		clearDismissTimeout();

		if (message !== null) {
			dismissTimeout = window.setTimeout(() => {
				visibleMessage = null;
				dismissTimeout = null;
			}, 5000);
		}

		return clearDismissTimeout;
	});
</script>

{#if visibleMessage !== null}
	<p class="workduck-status-toast" role="status" aria-live="polite">{visibleMessage}</p>
{/if}
