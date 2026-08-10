import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import type { AgentExecutionError } from '$lib/agents/agent-execution';
import type { AgentRecord } from '$lib/agents/agent-registry';
import type { EnvironmentVault } from '$lib/environment/environment-vault';
import type { PersonaRecord } from '$lib/personas/persona-registry';
import type { ReferenceRecord } from '$lib/references/reference-registry';
import type { WorkduckSkillRecord } from '$lib/skills/skill-registry';
import type { WorkduckQueueResultReport, WorkduckQueueWorkOrder } from './queue-artifacts';

export type QueueExecutionError =
	| 'queue-execution-no-task'
	| 'queue-execution-no-agent'
	| 'queue-execution-vault-locked'
	| 'queue-execution-work-order-running'
	| 'queue-execution-work-order-not-running'
	| 'queue-execution-work-order-archived'
	| 'queue-execution-cancelled'
	| 'queue-execution-unknown'
	| AgentExecutionError;

export type QueueExecutionResult =
	| {
			readonly ok: true;
			readonly report: WorkduckQueueResultReport;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly reportRelativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
			readonly workOrder: WorkduckQueueWorkOrder | null;
	  };

export interface WorkduckQueuePromptPreview {
	readonly id: string;
	readonly taskId: string;
	readonly taskTitle: string;
	readonly agentId: string;
	readonly agentName: string;
	readonly systemPrompt: string;
	readonly userPrompt: string;
}

export type QueuePromptPreviewResult =
	| {
			readonly ok: true;
			readonly previews: readonly WorkduckQueuePromptPreview[];
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
	  };

export type QueueExecutionCancelResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
	  };

export type QueueExecutionInspectResult =
	| {
			readonly ok: true;
			readonly runningWorkOrderIds: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
	  };

interface QueueExecutionCommandResponse {
	readonly ok: boolean;
	readonly report?: WorkduckQueueResultReport | null;
	readonly workOrder?: WorkduckQueueWorkOrder | null;
	readonly reportRelativePath?: string | null;
	readonly error?: string | null;
}

interface QueueExecutionCancelCommandResponse {
	readonly ok: boolean;
	readonly error?: string | null;
}

interface QueueExecutionInspectCommandResponse {
	readonly ok: boolean;
	readonly runningWorkOrderIds?: readonly string[] | null;
	readonly error?: string | null;
}

interface QueuePromptPreviewCommandResponse {
	readonly ok: boolean;
	readonly previews?: readonly WorkduckQueuePromptPreview[] | null;
	readonly error?: string | null;
}

export async function executeQueueWorkOrder(input: {
	readonly executionId: string;
	readonly workspacePath: string;
	readonly workOrderRelativePath: string;
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly agents: readonly AgentRecord[];
	readonly vault: EnvironmentVault | null;
	readonly skills: readonly WorkduckSkillRecord[];
	readonly references: readonly ReferenceRecord[];
	readonly personas: readonly PersonaRecord[];
}): Promise<QueueExecutionResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'agent-execution-unavailable', workOrder: input.workOrder };
	}

	try {
		const response = await invoke<QueueExecutionCommandResponse>('execute_queue_work_order', {
			request: {
				executionId: input.executionId,
				workspacePath: input.workspacePath,
				workOrderRelativePath: input.workOrderRelativePath,
				workOrder: input.workOrder,
				agents: input.agents,
				vault: input.vault,
				skills: input.skills,
				references: input.references,
				personas: input.personas
			}
		});

		if (
			response.ok &&
			response.report !== null &&
			response.report !== undefined &&
			response.workOrder !== null &&
			response.workOrder !== undefined &&
			typeof response.reportRelativePath === 'string'
		) {
			return {
				ok: true,
				report: response.report,
				workOrder: response.workOrder,
				reportRelativePath: response.reportRelativePath
			};
		}

		return {
			ok: false,
			error: normalizeQueueExecutionError(response.error),
			workOrder: response.workOrder ?? input.workOrder
		};
	} catch {
		return {
			ok: false,
			error: 'agent-execution-provider-unavailable',
			workOrder: input.workOrder
		};
	}
}

export async function previewQueueWorkOrderPrompt(input: {
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly agents: readonly AgentRecord[];
	readonly skills: readonly WorkduckSkillRecord[];
	readonly references: readonly ReferenceRecord[];
	readonly personas: readonly PersonaRecord[];
}): Promise<QueuePromptPreviewResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'agent-execution-unavailable' };
	}

	try {
		const response = await invoke<QueuePromptPreviewCommandResponse>(
			'preview_queue_work_order_prompt',
			{
				request: {
					workOrder: input.workOrder,
					agents: input.agents,
					skills: input.skills,
					references: input.references,
					personas: input.personas
				}
			}
		);

		if (response.ok && response.previews !== null && response.previews !== undefined) {
			return {
				ok: true,
				previews: response.previews
			};
		}

		return {
			ok: false,
			error: normalizeQueueExecutionError(response.error)
		};
	} catch {
		return { ok: false, error: 'agent-execution-provider-unavailable' };
	}
}

export async function cancelQueueWorkOrderExecution(input: {
	readonly executionId: string;
}): Promise<QueueExecutionCancelResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'agent-execution-unavailable' };
	}

	try {
		const response = await invoke<QueueExecutionCancelCommandResponse>(
			'cancel_queue_work_order_execution',
			{
				request: {
					executionId: input.executionId
				}
			}
		);

		if (response.ok) {
			return { ok: true };
		}

		return {
			ok: false,
			error: normalizeQueueExecutionError(response.error)
		};
	} catch {
		return { ok: false, error: 'agent-execution-provider-unavailable' };
	}
}

export async function inspectQueueWorkOrderExecutions(input: {
	readonly workspacePath: string;
	readonly workOrderIds: readonly string[];
}): Promise<QueueExecutionInspectResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'agent-execution-unavailable' };
	}

	try {
		const response = await invoke<QueueExecutionInspectCommandResponse>(
			'inspect_queue_work_order_executions',
			{
				request: {
					workspacePath: input.workspacePath,
					workOrderIds: input.workOrderIds
				}
			}
		);

		if (response.ok) {
			return {
				ok: true,
				runningWorkOrderIds: response.runningWorkOrderIds ?? []
			};
		}

		return {
			ok: false,
			error: normalizeQueueExecutionError(response.error)
		};
	} catch {
		return { ok: false, error: 'agent-execution-provider-unavailable' };
	}
}

function normalizeQueueExecutionError(error: string | null | undefined): QueueExecutionError {
	switch (error) {
		case 'queue-execution-no-task':
			return 'queue-execution-no-task';
		case 'queue-execution-vault-locked':
			return 'queue-execution-vault-locked';
		case 'queue-execution-cancelled':
			return 'queue-execution-cancelled';
		case 'work-order-running':
		case 'execution-id-running':
			return 'queue-execution-work-order-running';
		case 'work-order-not-running':
			return 'queue-execution-work-order-not-running';
		case 'work-order-archived':
			return 'queue-execution-work-order-archived';
		case 'work-order-agent-required':
		case 'work-order-empty':
			return 'queue-execution-no-agent';
		case 'work-order-task-limit':
		case 'work-order-agent-limit':
		case 'work-order-execution-limit':
		case 'work-order-file-too-large':
		case 'execution-id-invalid':
			return 'agent-execution-request-invalid';
		case 'agent-not-found':
			return 'agent-execution-agent-not-found';
		case 'agent-secret-not-found':
		case 'agent-api-key-env-missing':
			return 'agent-execution-secret-not-found';
		case 'agent-provider-unsupported':
			return 'agent-execution-provider-unsupported';
		case 'agent-api-key-required':
			return 'agent-execution-api-key-required';
		case 'agent-prompt-too-large':
		case 'agent-prompt-required':
			return 'agent-execution-prompt-required';
		case 'agent-model-required':
			return 'agent-execution-model-required';
		case 'agent-request-invalid':
			return 'agent-execution-request-invalid';
		case 'agent-authentication-failed':
			return 'agent-execution-authentication-failed';
		case 'agent-rate-limited':
			return 'agent-execution-rate-limited';
		case 'agent-provider-rejected':
			return 'agent-execution-provider-rejected';
		case 'agent-provider-timeout':
			return 'agent-execution-provider-timeout';
		case 'agent-provider-unavailable':
		case 'agent-execution-failed':
			return 'agent-execution-provider-unavailable';
		case 'agent-response-empty':
			return 'agent-execution-response-empty';
		case 'agent-response-invalid':
			return 'agent-execution-response-invalid';
		default:
			return 'queue-execution-unknown';
	}
}
