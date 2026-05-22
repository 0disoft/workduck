<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import {
		agentEvaluationCriteriaDefinitions,
		type AgentEvaluationCriterionId,
		type AgentEvaluationScores
	} from '$lib/agents/agent-evaluation';
	import type { AgentEvaluationDialogState } from './queue-panel-types';

	interface Props {
		readonly dialog: AgentEvaluationDialogState;
		readonly messages: WorkduckMessages;
		readonly isSavingEvaluation: boolean;
		readonly evaluationScores: AgentEvaluationScores;
		readonly onClose: () => void;
		readonly onScoreChange: (criterionId: AgentEvaluationCriterionId, value: string) => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
	}

	let {
		dialog,
		messages,
		isSavingEvaluation,
		evaluationScores,
		onClose,
		onScoreChange,
		onSubmit
	}: Props = $props();
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
		class="workduck-dialog workduck-project-dialog workduck-queue-evaluation-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="queue-evaluation-dialog-title"
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="queue-evaluation-dialog-title" class="workduck-dialog-title">
				{messages.queue.evaluation.title}
			</h2>

			<div class="workduck-queue-evaluation-target">
				<strong>{dialog.agent.name}</strong>
				<span>{dialog.task.title}</span>
			</div>

			<div class="workduck-queue-evaluation-grid">
				{#each agentEvaluationCriteriaDefinitions as criterion (criterion.id)}
					{@const criterionMessages = messages.agents.evaluation.criteria[criterion.id]}
					<div class="workduck-queue-evaluation-row">
						<span>
							<strong>{criterionMessages.label}</strong>
							<small>{criterionMessages.description}</small>
						</span>
						<div
							id={`queue-evaluation-${criterion.id}`}
							class="workduck-queue-evaluation-score-grid"
							role="group"
							aria-label={criterionMessages.label}
						>
							{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as score}
								<button
									class={[
										'workduck-queue-evaluation-score-button',
										evaluationScores[criterion.id] === score
											? 'workduck-queue-evaluation-score-button-selected'
											: ''
									]
										.filter(Boolean)
										.join(' ')}
									type="button"
									aria-pressed={evaluationScores[criterion.id] === score}
									disabled={isSavingEvaluation}
									onclick={() => onScoreChange(criterion.id, String(score))}
								>
									{score}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="workduck-dialog-actions">
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isSavingEvaluation}
					onclick={onClose}
				>
					{messages.common.cancel}
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={isSavingEvaluation}
				>
					{isSavingEvaluation ? messages.queue.evaluation.saving : messages.common.save}
				</button>
			</div>
		</form>
	</div>
</div>
