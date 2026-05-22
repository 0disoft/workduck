<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { QueueFileEntry } from './queue-folder';
	import type { QueueCardEntry } from './queue-panel-types';
	import type {
		WorkduckQueueExecutionState,
		WorkduckQueueWorkPriority
	} from './queue-artifacts';

	interface Props {
		readonly files: readonly QueueCardEntry[];
		readonly filteredFiles: readonly QueueCardEntry[];
		readonly messages: WorkduckMessages;
		readonly isReading: boolean;
		readonly onAddWork: (event: MouseEvent) => void;
		readonly onCardClick: (file: QueueCardEntry) => void;
		readonly onCardContextMenu: (event: MouseEvent, file: QueueCardEntry) => void;
		readonly getQueueCardClass: (file: QueueCardEntry) => string;
		readonly isSelectedQueueFile: (file: QueueCardEntry) => boolean;
		readonly getFileKindLabel: (kind: QueueFileEntry['kind']) => string;
		readonly getQueuePriorityLabel: (priority: WorkduckQueueWorkPriority) => string;
		readonly getQueueExecutionStateLabel: (
			executionState: WorkduckQueueExecutionState | null
		) => string;
	}

	let {
		files,
		filteredFiles,
		messages,
		isReading,
		onAddWork,
		onCardClick,
		onCardContextMenu,
		getQueueCardClass,
		isSelectedQueueFile,
		getFileKindLabel,
		getQueuePriorityLabel,
		getQueueExecutionStateLabel
	}: Props = $props();
</script>

<section class="workduck-queue-list" aria-label={messages.queue.list}>
	<button
		class="workduck-list-add-card"
		type="button"
		aria-haspopup="dialog"
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
				onclick={() => onCardClick(file)}
				oncontextmenu={(event) => onCardContextMenu(event, file)}
			>
				<div class="workduck-queue-file-details">
					<strong>{file.title}</strong>
					<span>{getFileKindLabel(file.kind)}</span>
					{#if file.kind === 'work-order' && file.artifactId.length > 0}
						<span>{messages.queue.workOrderId}: {file.artifactId}</span>
					{/if}
					{#if file.agentName.length > 0}
						<span>{file.agentName}</span>
					{/if}
					{#if file.priority !== null}
						<span>{getQueuePriorityLabel(file.priority)}</span>
					{/if}
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
