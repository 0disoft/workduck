/* llmnav/1 module
id=workduck.queue.evaluation-controller
role=Own the Queue evaluation dialog, scoring state, and selection-scoped save lifecycle.
owns=evaluation dialog state|evaluation score editing|evaluation save ownership|evaluation feedback
excludes=registry persistence|artifact selection|workspace registry state
search=Queue evaluation dialog|evaluation save selection|agent evaluation feedback
invariant=Saving captures its workspace and report selection, and late feedback never changes a newer selection.
stability=architecture
*/
import type { AgentRecord } from '#lib/agents/agent-registry.ts';
import {
	createDefaultAgentEvaluationScores,
	normalizeAgentEvaluationScore,
	type AgentEvaluationCriterionId
} from '#lib/agents/agent-evaluation.ts';
import type { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import {
	createQueueReportTaskEvaluationKey,
	hasQueueReportTaskEvaluation,
	type WorkduckQueueResultReport,
	type WorkduckQueueResultReportTask
} from './queue-artifacts';
import { getReportTaskAgent as findReportTaskAgent } from './queue-panel-labels';
import type { AgentEvaluationDialogState } from './queue-panel-types';
import {
	saveQueuePanelEvaluation,
	type QueuePanelEvaluationSaveFailureCode,
	type QueuePanelEvaluationSaveResult
} from './queue-panel-evaluation-save-workflow';

export interface QueuePanelEvaluationWorkspaceTarget {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly isCurrent: () => boolean;
}

interface QueuePanelEvaluationSelection {
	readonly report: WorkduckQueueResultReport;
	readonly reportPath: string;
	readonly generation: number;
}

interface QueuePanelEvaluationControllerInput {
	readonly selection: () => QueuePanelEvaluationSelection | null;
	readonly agents: () => readonly AgentRecord[];
	readonly isWriting: () => boolean;
	readonly messages: () => ReturnType<typeof getWorkduckMessages>;
	readonly captureWorkspaceTarget: () => QueuePanelEvaluationWorkspaceTarget;
	readonly clearFeedback: () => void;
	readonly setParseError: (message: string) => void;
	readonly setStatus: (message: string) => void;
	readonly applySavedState: (
		result: QueuePanelEvaluationSaveResult,
		target: QueuePanelEvaluationWorkspaceTarget,
		selectionIsCurrent: () => boolean
	) => Promise<void>;
}

export function createQueuePanelEvaluationController(input: QueuePanelEvaluationControllerInput) {
	let evaluationDialog = $state<AgentEvaluationDialogState | null>(null);
	let evaluationScores = $state(createDefaultAgentEvaluationScores());
	let isSavingEvaluation = $state(false);

	function getReportTaskAgent(task: WorkduckQueueResultReportTask) {
		return findReportTaskAgent(task, input.agents());
	}

	function isReportTaskEvaluationRecorded(task: WorkduckQueueResultReportTask) {
		const agent = getReportTaskAgent(task);
		const selection = input.selection();
		if (agent === null || selection === null) return false;
		return (
			hasQueueReportTaskEvaluation(task, agent.id) ||
			agent.evaluationKeys.includes(createQueueReportTaskEvaluationKey(selection.report, task))
		);
	}

	function resetSelection() {
		evaluationDialog = null;
		evaluationScores = createDefaultAgentEvaluationScores();
	}

	function resetWorkspace() {
		isSavingEvaluation = false;
		resetSelection();
	}

	function openEvaluationDialog(task: WorkduckQueueResultReportTask) {
		const agent = getReportTaskAgent(task);
		if (
			agent === null || input.isWriting() || isSavingEvaluation ||
			isReportTaskEvaluationRecorded(task)
		) return;
		evaluationDialog = { task, agent };
		evaluationScores = createDefaultAgentEvaluationScores();
		input.clearFeedback();
	}

	function closeEvaluationDialog() {
		if (!isSavingEvaluation) resetSelection();
	}

	function updateEvaluationScore(criterionId: AgentEvaluationCriterionId, value: string) {
		evaluationScores = { ...evaluationScores, [criterionId]: normalizeAgentEvaluationScore(value) };
	}

	async function handleSaveEvaluation(event: SubmitEvent) {
		event.preventDefault();
		if (evaluationDialog === null || isSavingEvaluation) return;
		const selection = input.selection();
		if (selection === null) {
			input.setParseError(input.messages().queue.errors.fileInvalid);
			return;
		}
		const target = input.captureWorkspaceTarget();
		const selectionIsCurrent = () => {
			const current = input.selection();
			return (
				target.isCurrent() && current !== null &&
				current.generation === selection.generation &&
				current.reportPath === selection.reportPath &&
				current.report.ref.id === selection.report.ref.id
			);
		};
		isSavingEvaluation = true;
		input.clearFeedback();
		try {
			const result = await saveQueuePanelEvaluation({
				workspaceId: target.workspaceId,
				workspacePath: target.workspacePath,
				report: selection.report,
				reportPath: selection.reportPath,
				task: evaluationDialog.task,
				agentId: evaluationDialog.agent.id,
				scores: evaluationScores
			});
			if (!target.isCurrent()) return;
			await input.applySavedState(result, target, selectionIsCurrent);
			if (!selectionIsCurrent()) return;
			if (!result.ok) {
				input.setParseError(getSaveFailureMessage(result.code));
				return;
			}
			input.setStatus(result.applied
				? input.messages().queue.evaluation.saved
				: input.messages().queue.evaluation.alreadySaved);
			resetSelection();
		} finally {
			if (target.isCurrent()) isSavingEvaluation = false;
		}
	}

	function getSaveFailureMessage(code: QueuePanelEvaluationSaveFailureCode) {
		const messages = input.messages();
		switch (code) {
			case 'agent-read-failed': return messages.agents.errors.readFailed;
			case 'agent-not-found': return messages.agents.errors.notFound;
			case 'agent-save-failed': return messages.agents.errors.saveFailed;
			case 'report-write-failed': return messages.queue.errors.fileWriteFailed;
			case 'report-read-failed': return messages.queue.errors.fileReadFailed;
			case 'persona-read-failed': return messages.personas.errors.readFailed;
			case 'persona-save-failed': return messages.personas.errors.saveFailed;
		}
	}

	return {
		get evaluationDialog() { return evaluationDialog; },
		get evaluationScores() { return evaluationScores; },
		get isSavingEvaluation() { return isSavingEvaluation; },
		getReportTaskAgent, isReportTaskEvaluationRecorded,
		openEvaluationDialog, closeEvaluationDialog, updateEvaluationScore, handleSaveEvaluation,
		resetSelection, resetWorkspace
	};
}
