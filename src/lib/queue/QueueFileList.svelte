<script lang="ts">
	import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
	import type { QueueCardEntry } from './queue-panel-types';
	import type { WorkduckQueueExecutionState } from './queue-artifacts';
	import { getFileKindLabel } from './queue-panel-labels';

	interface Props {
		readonly files: readonly QueueCardEntry[];
		readonly filteredFiles: readonly QueueCardEntry[];
		readonly messages: WorkduckMessages;
		readonly isReading: boolean;
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
		onCardIntent,
		onCardClick,
		onCardContextMenu,
		getQueueCardClass,
		isSelectedQueueFile,
		getQueueExecutionStateLabel
	}: Props = $props();
</script>

<section class="workduck-queue-list" aria-label={messages.queue.list}>
	{#if files.length === 0}
		<p class="workduck-empty-state">{messages.queue.empty}</p>
	{:else if filteredFiles.length === 0}
		<p class="workduck-empty-state">{messages.queue.noMatches}</p>
	{:else}
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
				<span class="workduck-queue-row-main">
					<span class="workduck-queue-row-title">
						{#if !file.isRead}
							<span class="workduck-queue-row-unread" aria-hidden="true"></span>
						{/if}
						<strong>{file.title}</strong>
					</span>
					<span class="workduck-queue-row-kind">{getFileKindLabel(messages, file.kind)}</span>
					<span class="workduck-sr-only">
						{file.isRead ? messages.queue.readStates.read : messages.queue.readStates.unread}
					</span>
				</span>
				{#if file.executionState !== null}
					<span class="workduck-queue-execution-state">
						{getQueueExecutionStateLabel(file.executionState)}
					</span>
				{/if}
			</button>
		{/each}
	{/if}
</section>
