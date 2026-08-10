import {
	recordAgentEvaluationOnce,
	type AgentRegistry
} from '$lib/agents/agent-registry';
import type { AgentEvaluationScores } from '$lib/agents/agent-evaluation';
import {
	readAgentRegistry
} from '$lib/agents/agent-registry-storage';
import {
	syncPersonaEvaluationSummariesFromAgents,
	type PersonaRegistry
} from '$lib/personas/persona-registry';
import {
	readPersonaRegistry
} from '$lib/personas/persona-registry-storage';
import { writeWorkspaceRegistryPairStorage } from '$lib/workspaces/workspace-registry-pair-storage';
import {
	createQueueReportTaskEvaluationKey,
	recordQueueReportTaskEvaluation,
	serializeQueueArtifact,
	type WorkduckQueueResultReport,
	type WorkduckQueueResultReportTask
} from './queue-artifacts';
import { updateQueueResultReportFile } from './queue-folder';

export type QueuePanelEvaluationSaveFailureCode =
	| 'agent-read-failed'
	| 'agent-not-found'
	| 'agent-save-failed'
	| 'report-write-failed'
	| 'persona-read-failed'
	| 'persona-save-failed';

type QueuePanelEvaluationSaveState = {
	readonly agentRegistry: AgentRegistry | null;
	readonly personaRegistry: PersonaRegistry | null;
	readonly report: WorkduckQueueResultReport | null;
	readonly reportRelativePath: string | null;
};

export type QueuePanelEvaluationSaveResult =
	| ({
			readonly ok: true;
			readonly applied: boolean;
	  } & QueuePanelEvaluationSaveState)
	| ({
			readonly ok: false;
			readonly code: QueuePanelEvaluationSaveFailureCode;
	  } & QueuePanelEvaluationSaveState);

export interface QueuePanelEvaluationSaveInput {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly report: WorkduckQueueResultReport;
	readonly reportPath: string;
	readonly task: WorkduckQueueResultReportTask;
	readonly agentId: string;
	readonly scores: AgentEvaluationScores;
}

export async function saveQueuePanelEvaluation(
	input: QueuePanelEvaluationSaveInput
): Promise<QueuePanelEvaluationSaveResult> {
	const latestAgentRegistryResult = await readAgentRegistry(
		input.workspaceId,
		input.workspacePath
	);

	if (!latestAgentRegistryResult.ok) {
		return createFailedQueuePanelEvaluationSaveResult('agent-read-failed');
	}

	const evaluationKey = createQueueReportTaskEvaluationKey(input.report, input.task);
	const mutation = recordAgentEvaluationOnce(
		latestAgentRegistryResult.registry,
		input.agentId,
		evaluationKey,
		input.scores
	);

	if (!mutation.ok) {
		return createFailedQueuePanelEvaluationSaveResult('agent-not-found');
	}

	const latestPersonaRegistryResult = await readPersonaRegistry(
		input.workspaceId,
		input.workspacePath
	);

	if (!latestPersonaRegistryResult.ok) {
		return createFailedQueuePanelEvaluationSaveResult('persona-read-failed');
	}

	const nextPersonaRegistry = syncPersonaEvaluationSummariesFromAgents(
		latestPersonaRegistryResult.registry,
		mutation.registry.agents
	);
	const registryWriteResult = await writeWorkspaceRegistryPairStorage(
		mutation.registry,
		nextPersonaRegistry,
		input.workspacePath
	);

	if (!registryWriteResult.ok) {
		return createFailedQueuePanelEvaluationSaveResult(
			registryWriteResult.error === 'workspace-data-revision-conflict'
				? 'agent-save-failed'
				: 'persona-save-failed'
		);
	}

	let savedReport: WorkduckQueueResultReport | null = null;
	let savedReportRelativePath: string | null = null;
	if (mutation.applied) {
		const nextReport = recordQueueReportTaskEvaluation(
			input.report,
			input.task.id,
			input.agentId
		);
		const reportWriteResult = await updateQueueResultReportFile(
			input.workspacePath,
			input.reportPath,
			serializeQueueArtifact(nextReport)
		);

		if (!reportWriteResult.ok) {
			return createFailedQueuePanelEvaluationSaveResult('report-write-failed', {
				agentRegistry: registryWriteResult.agentRegistry,
				personaRegistry: registryWriteResult.personaRegistry
			});
		}

		savedReport = nextReport;
		savedReportRelativePath = reportWriteResult.relativePath;
	}

	return {
		ok: true,
		applied: mutation.applied,
		agentRegistry: registryWriteResult.agentRegistry,
		personaRegistry: registryWriteResult.personaRegistry,
		report: savedReport,
		reportRelativePath: savedReportRelativePath
	};
}

function createFailedQueuePanelEvaluationSaveResult(
	code: QueuePanelEvaluationSaveFailureCode,
	state: Partial<QueuePanelEvaluationSaveState> = {}
): QueuePanelEvaluationSaveResult {
	return {
		ok: false,
		code,
		agentRegistry: state.agentRegistry ?? null,
		personaRegistry: state.personaRegistry ?? null,
		report: state.report ?? null,
		reportRelativePath: state.reportRelativePath ?? null
	};
}
