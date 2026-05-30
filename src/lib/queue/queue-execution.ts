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
	| 'queue-execution-unknown'
	| AgentExecutionError;

export type QueueExecutionResult =
	| {
			readonly ok: true;
			readonly report: WorkduckQueueResultReport;
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
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

interface QueueExecutionCommandResponse {
	readonly ok: boolean;
	readonly report?: WorkduckQueueResultReport | null;
	readonly error?: string | null;
}

interface QueuePromptPreviewCommandResponse {
	readonly ok: boolean;
	readonly previews?: readonly WorkduckQueuePromptPreview[] | null;
	readonly error?: string | null;
}

export async function executeQueueWorkOrder(input: {
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly agents: readonly AgentRecord[];
	readonly vault: EnvironmentVault | null;
	readonly skills: readonly WorkduckSkillRecord[];
	readonly references: readonly ReferenceRecord[];
	readonly personas: readonly PersonaRecord[];
}): Promise<QueueExecutionResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'agent-execution-unavailable' };
	}

	try {
		const response = await invoke<QueueExecutionCommandResponse>('execute_queue_work_order', {
			request: {
				workOrder: input.workOrder,
				agents: input.agents,
				vault: input.vault,
				skills: input.skills,
				references: input.references,
				personas: input.personas
			}
		});

		if (response.ok && response.report !== null && response.report !== undefined) {
			return {
				ok: true,
				report: response.report
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

function normalizeQueueExecutionError(error: string | null | undefined): QueueExecutionError {
	switch (error) {
		case 'queue-execution-no-task':
			return 'queue-execution-no-task';
		case 'queue-execution-vault-locked':
			return 'queue-execution-vault-locked';
		case 'work-order-agent-required':
		case 'work-order-empty':
			return 'queue-execution-no-agent';
		case 'agent-not-found':
			return 'agent-execution-agent-not-found';
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
