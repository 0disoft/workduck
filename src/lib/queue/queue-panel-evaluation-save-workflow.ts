import {
	recordAgentEvaluationOnce,
	type AgentRegistry
} from '#lib/agents/agent-registry.ts';
import type { AgentEvaluationScores } from '#lib/agents/agent-evaluation.ts';
import {
	readAgentRegistry
} from '#lib/agents/agent-registry-storage.ts';
import {
	syncPersonaEvaluationSummariesFromAgents,
	serializePersonaRegistry,
	type PersonaRegistry
} from '#lib/personas/persona-registry.ts';
import {
	readPersonaRegistry
} from '#lib/personas/persona-registry-storage.ts';
import { writeWorkspaceRegistryPairStorage } from '#lib/workspaces/workspace-registry-pair-storage.ts';
import {
	createQueueReportTaskEvaluationKey,
	hasQueueReportTaskEvaluation,
	parseQueueResultReport,
	recordQueueReportTaskEvaluation,
	serializeQueueArtifact,
	type WorkduckQueueResultReport,
	type WorkduckQueueResultReportTask
} from './queue-artifacts';
import { readQueueFile, updateQueueResultReportFile } from './queue-folder';

export type QueuePanelEvaluationSaveFailureCode =
	| 'agent-read-failed'
	| 'agent-not-found'
	| 'agent-save-failed'
	| 'report-write-failed'
	| 'report-read-failed'
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
	const reportRead = await readQueueFile(input.workspacePath, input.reportPath);
	if (!reportRead.ok) return createFailedQueuePanelEvaluationSaveResult('report-read-failed');
	const parsed = parseQueueResultReport(reportRead.content);
	if (!parsed.ok || parsed.report.ref.id !== input.report.ref.id || !parsed.report.tasks.some(task => task.id === input.task.id)) {
		return createFailedQueuePanelEvaluationSaveResult('report-read-failed');
	}
	const latestReport = parsed.report;
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
	let agentRegistry = mutation.registry;
	let personaRegistry = nextPersonaRegistry;
	if (mutation.applied || serializePersonaRegistry(nextPersonaRegistry) !== serializePersonaRegistry(latestPersonaRegistryResult.registry)) {
		const registryWriteResult = await writeWorkspaceRegistryPairStorage(mutation.registry, nextPersonaRegistry, input.workspacePath);
		if (!registryWriteResult.ok) {
			return createFailedQueuePanelEvaluationSaveResult(
				registryWriteResult.error === 'workspace-data-revision-conflict' ? 'agent-save-failed' : 'persona-save-failed'
			);
		}
		agentRegistry = registryWriteResult.agentRegistry;
		personaRegistry = registryWriteResult.personaRegistry;
	}

	let savedReport = latestReport;
	let savedReportRelativePath = reportRead.relativePath;
	const latestTask = latestReport.tasks.find(task => task.id === input.task.id)!;
	if (!hasQueueReportTaskEvaluation(latestTask, input.agentId)) {
		const nextReport = recordQueueReportTaskEvaluation(
			latestReport,
			input.task.id,
			input.agentId
		);
		const reportWriteResult = await updateQueueResultReportFile(
			input.workspacePath,
			input.reportPath,
			serializeQueueArtifact(nextReport),
			reportRead.content
		);

		if (!reportWriteResult.ok) {
			return createFailedQueuePanelEvaluationSaveResult('report-write-failed', {
				agentRegistry,
				personaRegistry
			});
		}

		savedReport = nextReport;
		savedReportRelativePath = reportWriteResult.relativePath;
	}

	return {
		ok: true,
		applied: mutation.applied,
		agentRegistry,
		personaRegistry,
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
