<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import {
		normalizeQueueResponseLanguage,
		normalizeQueueWorkPriority,
		type WorkduckQueueResponseLanguage,
		type WorkduckQueueWorkOrder,
		type WorkduckQueueWorkOrderTask,
		type WorkduckQueueWorkPriority
	} from './queue-artifacts';
	import type { WorkduckQueueTaskKind } from './queue-voting';

	interface Props {
		readonly workOrder: WorkduckQueueWorkOrder;
		readonly messages: WorkduckMessages;
		readonly isWriting: boolean;
		readonly canExecute: boolean;
		readonly onExecute: () => Promise<void>;
		readonly onEditTask: (task: WorkduckQueueWorkOrderTask) => void;
		readonly getQueuePriorityLabel: (priority: WorkduckQueueWorkPriority) => string;
		readonly getQueueResponseLanguageLabel: (language: WorkduckQueueResponseLanguage) => string;
		readonly getQueueTaskKindLabel: (kind: WorkduckQueueTaskKind | undefined) => string;
		readonly getQueueTaskProjectLabels: (task: WorkduckQueueWorkOrderTask) => readonly string[];
		readonly getQueueTaskSkillLabels: (task: WorkduckQueueWorkOrderTask) => readonly string[];
		readonly getQueueTaskAgentLabels: (task: WorkduckQueueWorkOrderTask) => readonly string[];
		readonly getQueueTaskReferenceLabels: (task: WorkduckQueueWorkOrderTask) => readonly string[];
	}

	let {
		workOrder,
		messages,
		isWriting,
		canExecute,
		onExecute,
		onEditTask,
		getQueuePriorityLabel,
		getQueueResponseLanguageLabel,
		getQueueTaskKindLabel,
		getQueueTaskProjectLabels,
		getQueueTaskSkillLabels,
		getQueueTaskAgentLabels,
		getQueueTaskReferenceLabels
	}: Props = $props();
</script>

<section class="workduck-queue-review" aria-label={messages.queue.workOrderView}>
	<div class="workduck-queue-review-header">
		<div class="workduck-queue-file-details">
			<strong>{workOrder.ref.label}</strong>
			<span>{messages.queue.workOrderId}: {workOrder.ref.id}</span>
		</div>
		<button
			class="workduck-button workduck-button-primary"
			type="button"
			disabled={!canExecute}
			onclick={() => void onExecute()}
		>
			{isWriting ? messages.queue.executing : messages.queue.executeWorkOrder}
		</button>
	</div>

	<div class="workduck-queue-review-tasks">
		{#each workOrder.tasks as task (task.id)}
			<article class="workduck-queue-review-task">
				<header class="workduck-queue-review-task-header">
					<strong>{task.title}</strong>
					<div class="workduck-queue-review-task-pills">
						<span
							class="workduck-queue-task-pill workduck-queue-priority-pill"
							data-priority={normalizeQueueWorkPriority(task.priority)}
						>
							{getQueuePriorityLabel(normalizeQueueWorkPriority(task.priority))}
						</span>
						<span class="workduck-queue-task-pill">
							{getQueueResponseLanguageLabel(normalizeQueueResponseLanguage(task.responseLanguage))}
						</span>
						<span class="workduck-queue-task-pill">{getQueueTaskKindLabel(task.kind)}</span>
						{#if task.kind === 'vote' && task.vote !== undefined}
							<span class="workduck-queue-task-pill">
								{messages.queue.vote.optionCount.replace(
									'{count}',
									task.vote.options.length.toString()
								)}
							</span>
						{/if}
						{#if task.decision !== undefined}
							<span class="workduck-queue-task-pill">{task.decision}</span>
						{/if}
						{#each getQueueTaskProjectLabels(task) as projectLabel (projectLabel)}
							<span class="workduck-queue-task-pill">{projectLabel}</span>
						{/each}
						{#each getQueueTaskSkillLabels(task) as skillLabel (skillLabel)}
							<span class="workduck-queue-task-pill">{skillLabel}</span>
						{/each}
						{#each getQueueTaskAgentLabels(task) as agentLabel (agentLabel)}
							<span class="workduck-queue-task-pill">{agentLabel}</span>
						{/each}
						{#each getQueueTaskReferenceLabels(task) as referenceLabel (referenceLabel)}
							<span class="workduck-queue-task-pill">{referenceLabel}</span>
						{/each}
					</div>
					<button
						class="workduck-button workduck-button-secondary workduck-queue-task-edit-button"
						type="button"
						disabled={isWriting}
						onclick={() => onEditTask(task)}
					>
						{messages.common.edit}
					</button>
				</header>
				<p>{task.body}</p>

				{#if task.sourceReportTaskId !== undefined}
					<div class="workduck-queue-review-list">
						<span>{messages.common.source}</span>
						<ul>
							<li>{task.sourceReportTaskId}</li>
						</ul>
					</div>
				{/if}
			</article>
		{/each}
	</div>
</section>
