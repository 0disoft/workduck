<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import type {
		WorkduckQueueExecutionEstimate,
		WorkduckQueuePromptPreview
	} from './queue-execution';

	interface Props {
		readonly messages: WorkduckMessages;
		readonly previews: readonly WorkduckQueuePromptPreview[];
		readonly estimate: WorkduckQueueExecutionEstimate;
		readonly onExecute: () => Promise<void>;
		readonly onClose: () => void;
	}

	let { messages, previews, estimate, onExecute, onClose }: Props = $props();
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

		<section class="workduck-queue-prompt-preview-estimate" aria-label={messages.queue.promptPreview.estimateTitle}>
			<h3>{messages.queue.promptPreview.estimateTitle}</h3>
			<dl>
				<div>
					<dt>{messages.queue.promptPreview.requestCount}</dt>
					<dd>{estimate.requestCount}</dd>
				</div>
				<div>
					<dt>{messages.queue.promptPreview.estimatedInputTokens}</dt>
					<dd>{estimate.estimatedInputTokens.toString()}</dd>
				</div>
				<div>
					<dt>{messages.queue.promptPreview.maximumAttempts}</dt>
					<dd>{estimate.maximumProviderAttemptCount}</dd>
				</div>
				<div>
					<dt>{messages.queue.promptPreview.maximumInputTokens}</dt>
					<dd>{estimate.maximumEstimatedInputTokens.toString()}</dd>
				</div>
			</dl>
			<p>{messages.queue.promptPreview.estimateNotice}</p>
		</section>

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

		<footer class="workduck-dialog-actions">
			<button class="workduck-button workduck-button-secondary" type="button" onclick={onClose}>
				{messages.common.cancel}
			</button>
			<button
				class="workduck-button workduck-button-primary"
				type="button"
				onclick={() => void onExecute()}
			>
				{messages.queue.promptPreview.confirmExecution}
			</button>
		</footer>
	</div>
</div>
