import type { AgentRecord } from '$lib/agents/agent-registry';
import {
	createDefaultAgentEvaluationScores,
	normalizeAgentEvaluationScore,
	type AgentEvaluationCriterionId,
	type AgentEvaluationScores
} from '$lib/agents/agent-evaluation';
import type { WorkduckQueueResultReportTask } from './queue-artifacts';
import type { AgentEvaluationDialogState } from './queue-panel-types';

export type QueueEvaluationDialogViewState = {
	readonly dialog: AgentEvaluationDialogState | null;
	readonly scores: AgentEvaluationScores;
};

export function createInitialQueueEvaluationDialogState(): QueueEvaluationDialogViewState {
	return {
		dialog: null,
		scores: createDefaultAgentEvaluationScores()
	};
}

export function canOpenQueueEvaluationDialog(input: {
	readonly agent: AgentRecord | null;
	readonly isWriting: boolean;
	readonly isSavingEvaluation: boolean;
	readonly isEvaluationRecorded: boolean;
}) {
	return (
		input.agent !== null &&
		!input.isWriting &&
		!input.isSavingEvaluation &&
		!input.isEvaluationRecorded
	);
}

export function createOpenQueueEvaluationDialogState(
	task: WorkduckQueueResultReportTask,
	agent: AgentRecord
): QueueEvaluationDialogViewState {
	return {
		dialog: { task, agent },
		scores: createDefaultAgentEvaluationScores()
	};
}

export function canCloseQueueEvaluationDialog(isSavingEvaluation: boolean) {
	return !isSavingEvaluation;
}

export function createClosedQueueEvaluationDialogState(): QueueEvaluationDialogViewState {
	return createInitialQueueEvaluationDialogState();
}

export function createUpdatedQueueEvaluationScores(
	scores: AgentEvaluationScores,
	criterionId: AgentEvaluationCriterionId,
	value: string
): AgentEvaluationScores {
	return {
		...scores,
		[criterionId]: normalizeAgentEvaluationScore(value)
	};
}
