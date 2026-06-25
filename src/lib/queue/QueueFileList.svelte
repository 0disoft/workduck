<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { QueueCardEntry } from './queue-panel-types';
	import type { WorkduckQueueExecutionState } from './queue-artifacts';

	interface Props {
		readonly files: readonly QueueCardEntry[];
		readonly filteredFiles: readonly QueueCardEntry[];
		readonly messages: WorkduckMessages;
		readonly isReading: boolean;
		readonly onAddWorkIntent: () => void;
		readonly onAddWork: (event: MouseEvent) => void;
		readonly onCardIntent: (file: QueueCardEntry) => void;
		readonly onCardClick: (file: QueueCardEntry) => void;
		readonly onCardContextMenu: (event: MouseEvent, file: QueueCardEntry) => void;
		readonly getQueueCardClass: (file: QueueCardEntry) => string;
		readonly isSelectedQueueFile: (file: QueueCardEntry) => boolean;
		readonly getQueueExecutionStateLabel: (
			executionState: WorkduckQueueExecutionState | null
		) => string;
	}

	let {
		files,
		filteredFiles,
		messages,
		isReading,
		onAddWorkIntent,
		onAddWork,
		onCardIntent,
		onCardClick,
		onCardContextMenu,
		getQueueCardClass,
		isSelectedQueueFile,
		getQueueExecutionStateLabel
	}: Props = $props();
</script>

<section class="workduck-queue-list" aria-label={messages.queue.list}>
	<button
		class="workduck-list-add-card"
		type="button"
		aria-haspopup="dialog"
		onpointerenter={onAddWorkIntent}
		onfocus={onAddWorkIntent}
		onclick={onAddWork}
	>
		{messages.queue.addWork}
	</button>

	{#if files.length > 0 && filteredFiles.length === 0}
		<p class="workduck-empty-state">{messages.queue.noMatches}</p>
	{:else if files.length > 0}
		{#each filteredFiles as file (file.relativePath)}
			<button
				class={getQueueCardClass(file)}
				type="button"
				disabled={isReading || file.kind === 'unsupported'}
				aria-pressed={isSelectedQueueFile(file)}
				onpointerenter={() => onCardIntent(file)}
				onfocus={() => onCardIntent(file)}
				onclick={() => onCardClick(file)}
				oncontextmenu={(event) => onCardContextMenu(event, file)}
			>
				<div class="workduck-queue-file-details">
					<strong>{file.title}</strong>
				</div>
				<div class="workduck-queue-card-badges">
					<span
						class="workduck-queue-read-state"
						class:workduck-queue-read-state-unread={!file.isRead}
					>
						{file.isRead ? messages.queue.readStates.read : messages.queue.readStates.unread}
					</span>
					{#if file.executionState !== null}
						<span class="workduck-queue-execution-state">
							{getQueueExecutionStateLabel(file.executionState)}
						</span>
					{/if}
				</div>
			</button>
		{/each}
	{/if}
</section>
