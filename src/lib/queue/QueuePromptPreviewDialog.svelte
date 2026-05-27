<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import type { WorkduckQueuePromptPreview } from './queue-execution';

	interface Props {
		readonly messages: WorkduckMessages;
		readonly previews: readonly WorkduckQueuePromptPreview[];
		readonly onClose: () => void;
	}

	let { messages, previews, onClose }: Props = $props();
</script>

<div
	class="workduck-dialog-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}}
>
	<div
		class="workduck-dialog workduck-project-dialog workduck-queue-prompt-preview-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="queue-prompt-preview-title"
		use:modalDialog={{ onClose, initialFocusSelector: '.workduck-button-secondary' }}
	>
		<header class="workduck-queue-prompt-preview-header">
			<div>
				<h2 id="queue-prompt-preview-title" class="workduck-dialog-title">
					{messages.queue.promptPreview.title}
				</h2>
				<p class="workduck-dialog-text">{messages.queue.promptPreview.description}</p>
			</div>
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				onclick={onClose}
			>
				{messages.common.close}
			</button>
		</header>

		<div class="workduck-queue-prompt-preview-list">
			{#each previews as preview, index (preview.id)}
				<article class="workduck-queue-prompt-preview-item">
					<header class="workduck-queue-prompt-preview-item-header">
						<div>
							<strong>{preview.taskTitle}</strong>
							<span>{preview.agentName}</span>
						</div>
					</header>

					<details class="workduck-work-order-section" open={index === 0}>
						<summary class="workduck-work-order-section-summary">
							<span>
								{messages.queue.promptPreview.systemPrompt}
								<span class="workduck-queue-prompt-preview-count">
									{messages.queue.promptPreview.characterCount.replace(
										'{count}',
										preview.systemPrompt.length.toString()
									)}
								</span>
							</span>
						</summary>
						<pre class="workduck-queue-prompt-preview-block">{preview.systemPrompt}</pre>
					</details>

					<details class="workduck-work-order-section" open={index === 0}>
						<summary class="workduck-work-order-section-summary">
							<span>
								{messages.queue.promptPreview.userPrompt}
								<span class="workduck-queue-prompt-preview-count">
									{messages.queue.promptPreview.characterCount.replace(
										'{count}',
										preview.userPrompt.length.toString()
									)}
								</span>
							</span>
						</summary>
						<pre class="workduck-queue-prompt-preview-block">{preview.userPrompt}</pre>
					</details>
				</article>
			{/each}
		</div>
	</div>
</div>
