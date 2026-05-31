<script lang="ts">
	import type { AgentRecord } from '$lib/agents/agent-registry';
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type {
		QueueReportTaskReview,
		WorkduckQueueResultReport,
		WorkduckQueueResultReportTask,
		WorkduckQueueReviewDecision
	} from './queue-artifacts';
	import { getQueueStructuredResponseLabels } from './queue-panel-labels';
	import type { WorkduckQueueVoteAggregate } from './queue-voting';

	interface Props {
		readonly report: WorkduckQueueResultReport;
		readonly reportPath: string | null;
		readonly voteAggregate: WorkduckQueueVoteAggregate | null;
		readonly reviews: readonly QueueReportTaskReview[];
		readonly messages: WorkduckMessages;
		readonly reviewDecisionOptions: readonly {
			readonly value: Exclude<WorkduckQueueReviewDecision, 'pending'>;
		}[];
		readonly isWriting: boolean;
		readonly isSavingEvaluation: boolean;
		readonly canDelegateEvaluation: boolean;
		readonly isEvaluationDelegationCreated: boolean;
		readonly onDelegateEvaluation: () => Promise<void>;
		readonly onUpdateReviewDecision: (
			taskId: string,
			decision: Exclude<WorkduckQueueReviewDecision, 'pending'>
		) => void;
		readonly onUpdateReviewComment: (taskId: string, comment: string) => void;
		readonly onOpenEvaluation: (task: WorkduckQueueResultReportTask) => void;
		readonly isEvaluationRecorded: (task: WorkduckQueueResultReportTask) => boolean;
		readonly getVoteChoiceLabel: (task: WorkduckQueueResultReportTask) => string;
		readonly getReportTaskAgent: (task: WorkduckQueueResultReportTask) => AgentRecord | null;
		readonly getReviewDecisionLabel: (
			decision: Exclude<WorkduckQueueReviewDecision, 'pending'>
		) => string;
	}

	let {
		report,
		reportPath,
		voteAggregate,
		reviews,
		messages,
		reviewDecisionOptions,
		isWriting,
		isSavingEvaluation,
		canDelegateEvaluation,
		isEvaluationDelegationCreated,
		onDelegateEvaluation,
		onUpdateReviewDecision,
		onUpdateReviewComment,
		onOpenEvaluation,
		isEvaluationRecorded,
		getVoteChoiceLabel,
		getReportTaskAgent,
		getReviewDecisionLabel
	}: Props = $props();
</script>

<section class="workduck-queue-review" aria-label={messages.queue.resultReportReview}>
	<div class="workduck-queue-review-header">
		<div class="workduck-queue-file-details">
			<strong>{report.ref.label}</strong>
			{#if reportPath !== null}
				<span>{reportPath}</span>
			{/if}
		</div>
		{#if canDelegateEvaluation}
			<button
				class="workduck-button workduck-button-primary"
				type="button"
				disabled={isWriting || isEvaluationDelegationCreated}
				onclick={() => void onDelegateEvaluation()}
			>
				{isWriting ? messages.queue.creating : messages.queue.delegateEvaluation}
			</button>
		{/if}
	</div>

	{#if voteAggregate !== null}
		<section class="workduck-queue-vote-summary" aria-label={messages.queue.vote.result}>
			<strong>{messages.queue.vote.result}</strong>
			<div class="workduck-queue-vote-options">
				{#each voteAggregate.optionCounts as optionCount (optionCount.option.id)}
					<div
						class="workduck-queue-vote-option"
						class:workduck-queue-vote-option-winner={voteAggregate.winnerIds.includes(
							optionCount.option.id
						)}
					>
						<span>{optionCount.option.label}</span>
						<small>
							{messages.queue.vote.count.replace('{count}', optionCount.count.toString())}
						</small>
					</div>
				{/each}
			</div>
			{#if voteAggregate.invalidCount > 0}
				<small class="workduck-queue-vote-invalid">
					{messages.queue.vote.invalid.replace('{count}', voteAggregate.invalidCount.toString())}
				</small>
			{/if}
		</section>
	{/if}

	<div class="workduck-queue-review-tasks">
		{#each report.tasks as task (task.id)}
			{@const review = reviews.find((item) => item.taskId === task.id)}
			{@const reportTaskAgent = getReportTaskAgent(task)}
			{@const evaluationRecorded = isEvaluationRecorded(task)}
			{@const structuredResponse = task.structuredResponse}
			{@const structuredResponseLabels = getQueueStructuredResponseLabels(
				messages,
				task.responseFormat
			)}
			<article class="workduck-queue-review-task">
				<header class="workduck-queue-review-task-header">
					<strong>{task.title}</strong>
					{#if task.vote !== undefined}
						<div class="workduck-queue-review-task-pills">
							<span class="workduck-queue-task-pill">
								{messages.queue.vote.choice}: {getVoteChoiceLabel(task)}
							</span>
						</div>
					{/if}
					{#if reportTaskAgent !== null}
						<button
							class="workduck-button workduck-button-secondary workduck-queue-task-edit-button"
							type="button"
							disabled={isSavingEvaluation || evaluationRecorded}
							onclick={() => onOpenEvaluation(task)}
						>
							{evaluationRecorded
								? messages.queue.evaluation.savedAction
								: messages.queue.evaluation.action}
						</button>
					{/if}
				</header>
				{#if structuredResponse !== undefined}
					<div class="workduck-queue-structured-response">
						{#if structuredResponse.summary.trim().length > 0}
							<section>
								<span>{structuredResponseLabels.summary}</span>
								<p>{structuredResponse.summary}</p>
							</section>
						{/if}

						{#if structuredResponse.strengths.length > 0}
							<section>
								<span>{structuredResponseLabels.strengths}</span>
								<ul>
									{#each structuredResponse.strengths as item}
										<li>{item}</li>
									{/each}
								</ul>
							</section>
						{/if}

						{#if structuredResponse.recommendations.length > 0}
							<section>
								<span>{structuredResponseLabels.recommendations}</span>
								<ul>
									{#each structuredResponse.recommendations as item}
										<li>{item}</li>
									{/each}
								</ul>
							</section>
						{/if}

						{#if structuredResponse.cautions.length > 0}
							<section>
								<span>{structuredResponseLabels.cautions}</span>
								<ul>
									{#each structuredResponse.cautions as item}
										<li>{item}</li>
									{/each}
								</ul>
							</section>
						{/if}
					</div>
				{:else}
					<div class="workduck-queue-review-task-summary">{task.summary}</div>
				{/if}

				{#if task.filesChanged.length > 0}
					<div class="workduck-queue-review-list">
						<span>{messages.common.files}</span>
						<ul>
							{#each task.filesChanged as file}
								<li>{file}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if task.verification.length > 0}
					<div class="workduck-queue-review-list">
						<span>{messages.common.checks}</span>
						<ul>
							{#each task.verification as check}
								<li>{check}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if task.risks.length > 0}
					<div class="workduck-queue-review-list">
						<span>{messages.common.risks}</span>
						<ul>
							{#each task.risks as risk}
								<li>{risk}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if voteAggregate === null}
					<div class="workduck-queue-review-decisions">
						{#each reviewDecisionOptions as option}
							<label>
								<input
									type="radio"
									name={`review-${task.id}`}
									checked={review?.decision === option.value}
									onchange={() => onUpdateReviewDecision(task.id, option.value)}
								/>
								<span>{getReviewDecisionLabel(option.value)}</span>
							</label>
						{/each}
					</div>

					{#if review?.decision === 'needs-work' || review?.decision === 'rollback'}
						<label class="workduck-form-field">
							{messages.common.comment}
							<textarea
								class="workduck-input workduck-project-description-input"
								value={review.comment}
								oninput={(event) => onUpdateReviewComment(task.id, event.currentTarget.value)}
							></textarea>
						</label>
					{/if}
				{/if}
			</article>
		{/each}
	</div>
</section>
