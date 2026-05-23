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
	import {
		createEvaluationDelegationDisplay,
		createWorkOrderBodyDisplay
	} from './queue-work-order-display';

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
			{@const evaluationDelegation = createEvaluationDelegationDisplay(workOrder, task)}
			{@const bodyDisplay = createWorkOrderBodyDisplay(task.body)}
			{@const projectLabels = getQueueTaskProjectLabels(task)}
			{@const skillLabels = getQueueTaskSkillLabels(task)}
			{@const agentLabels = getQueueTaskAgentLabels(task)}
			{@const referenceLabels = getQueueTaskReferenceLabels(task)}
			<article class="workduck-queue-review-task">
				<header class="workduck-queue-review-task-header">
					<strong>{task.title}</strong>
					<dl class="workduck-queue-review-task-meta">
						<div>
							<dt>{messages.queue.workPriority}</dt>
							<dd>
								<span
									class="workduck-queue-task-pill workduck-queue-priority-pill"
									data-priority={normalizeQueueWorkPriority(task.priority)}
								>
									{getQueuePriorityLabel(normalizeQueueWorkPriority(task.priority))}
								</span>
							</dd>
						</div>
						<div>
							<dt>{messages.queue.responseLanguage}</dt>
							<dd>{getQueueResponseLanguageLabel(normalizeQueueResponseLanguage(task.responseLanguage))}</dd>
						</div>
						<div>
							<dt>{messages.queue.workType}</dt>
							<dd>{getQueueTaskKindLabel(task.kind)}</dd>
						</div>
						{#if task.kind === 'vote' && task.vote !== undefined}
							<div>
								<dt>{messages.queue.vote.options}</dt>
								<dd>
									{messages.queue.vote.optionCount.replace(
										'{count}',
										task.vote.options.length.toString()
									)}
								</dd>
							</div>
						{/if}
						{#if task.decision !== undefined}
							<div>
								<dt>{messages.queue.vote.choice}</dt>
								<dd>{task.decision}</dd>
							</div>
						{/if}
					</dl>
					<button
						class="workduck-button workduck-button-secondary workduck-queue-task-edit-button"
						type="button"
						disabled={isWriting}
						onclick={() => onEditTask(task)}
					>
						{messages.common.edit}
					</button>
				</header>
				{#if projectLabels.length > 0 ||
					skillLabels.length > 0 ||
					agentLabels.length > 0 ||
					referenceLabels.length > 0}
					<div class="workduck-queue-review-task-groups" aria-label={messages.queue.assignment}>
						{#if projectLabels.length > 0}
							<section class="workduck-queue-review-task-group">
								<span>{messages.queue.workProjects}</span>
								<div class="workduck-queue-review-task-pills">
									{#each projectLabels as projectLabel (projectLabel)}
										<span class="workduck-queue-task-pill">{projectLabel}</span>
									{/each}
								</div>
							</section>
						{/if}
						{#if skillLabels.length > 0}
							<section class="workduck-queue-review-task-group">
								<span>{messages.queue.linkedSkill}</span>
								<div class="workduck-queue-review-task-pills">
									{#each skillLabels as skillLabel (skillLabel)}
										<span class="workduck-queue-task-pill">{skillLabel}</span>
									{/each}
								</div>
							</section>
						{/if}
						{#if agentLabels.length > 0}
							<section class="workduck-queue-review-task-group">
								<span>{messages.queue.workAgents}</span>
								<div class="workduck-queue-review-task-pills">
									{#each agentLabels as agentLabel (agentLabel)}
										<span class="workduck-queue-task-pill">{agentLabel}</span>
									{/each}
								</div>
							</section>
						{/if}
						{#if referenceLabels.length > 0}
							<section class="workduck-queue-review-task-group">
								<span>{messages.queue.workReferences}</span>
								<div class="workduck-queue-review-task-pills">
									{#each referenceLabels as referenceLabel (referenceLabel)}
										<span class="workduck-queue-task-pill">{referenceLabel}</span>
									{/each}
								</div>
							</section>
						{/if}
					</div>
				{/if}
				{#if evaluationDelegation !== null}
					<div class="workduck-queue-evaluation-delegation">
						<div class="workduck-queue-evaluation-delegation-meta">
							{#if evaluationDelegation.reportLocation !== null}
								<div>
									<span>{messages.queue.evaluation.sourceReport}</span>
									<strong>{evaluationDelegation.reportLocation}</strong>
								</div>
							{/if}
							{#if evaluationDelegation.workspacePath !== null}
								<div>
									<span>{messages.queue.evaluation.workspace}</span>
									<strong>{evaluationDelegation.workspacePath}</strong>
								</div>
							{/if}
						</div>

						{#if evaluationDelegation.criteria.length > 0}
							<div class="workduck-queue-review-list">
								<span>{messages.queue.evaluation.criteria}</span>
								<ul>
									{#each evaluationDelegation.criteria as criterion}
										<li>{criterion}</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if evaluationDelegation.targets.length > 0}
							<div class="workduck-queue-review-list">
								<span>{messages.queue.evaluation.targets}</span>
								<div class="workduck-queue-evaluation-target-list">
									{#each evaluationDelegation.targets as target}
										<section class="workduck-queue-evaluation-target-card">
											<strong>{target.name}</strong>
											{#if target.details.length > 0}
												<ul>
													{#each target.details as detail}
														<li>{detail}</li>
													{/each}
												</ul>
											{/if}
										</section>
									{/each}
								</div>
							</div>
						{/if}

						{#if evaluationDelegation.command !== null}
							<div class="workduck-queue-review-list">
								<span>{messages.queue.evaluation.command}</span>
								<code class="workduck-queue-evaluation-command">{evaluationDelegation.command}</code>
							</div>
						{/if}
					</div>
				{:else}
					<div class="workduck-queue-work-order-body">
						{#if bodyDisplay.fallback !== null}
							<p class="workduck-queue-review-task-summary">{bodyDisplay.fallback}</p>
						{/if}

						{#if bodyDisplay.lead.length > 0}
							<div class="workduck-queue-work-order-lead">
								{#each bodyDisplay.lead as line}
									<p>{line}</p>
								{/each}
							</div>
						{/if}

						{#if bodyDisplay.fields.length > 0}
							<dl class="workduck-queue-work-order-fields">
								{#each bodyDisplay.fields as field}
									<div>
										<dt>{field.label}</dt>
										<dd>{field.value}</dd>
									</div>
								{/each}
							</dl>
						{/if}

						{#each bodyDisplay.sections as section}
							<section class="workduck-queue-work-order-section">
								{#if section.title.length > 0}
									<span>{section.title}</span>
								{/if}
								{#each section.paragraphs as paragraph}
									<p>{paragraph}</p>
								{/each}
								{#if section.items.length > 0}
									<ul>
										{#each section.items as item}
											<li>{item}</li>
										{/each}
									</ul>
								{/if}
							</section>
						{/each}
					</div>
				{/if}

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
