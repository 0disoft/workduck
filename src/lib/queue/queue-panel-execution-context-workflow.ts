import type { AgentRegistry } from '$lib/agents/agent-registry';
import { readAgentRegistry } from '$lib/agents/agent-registry-storage';
import type { PersonaRegistry } from '$lib/personas/persona-registry';
import { readPersonaRegistry } from '$lib/personas/persona-registry-storage';
import type { ReferenceRegistry } from '$lib/references/reference-registry';
import { readReferenceRegistry } from '$lib/references/reference-registry-storage';
import { getAllSkills, type SkillRegistry } from '$lib/skills/skill-registry';
import { readSkillRegistry } from '$lib/skills/skill-registry-storage';

import type { QueueExecutionContext } from './queue-panel-types';

export interface QueuePanelExecutionContextReadResult {
	readonly skillRegistry: SkillRegistry;
	readonly agentRegistry: AgentRegistry;
	readonly referenceRegistry: ReferenceRegistry;
	readonly personaRegistry: PersonaRegistry;
	readonly executionContext: QueueExecutionContext;
}

export interface QueuePanelExecutionContextReadInput {
	readonly workspaceId: string;
	readonly workspacePath: string;
}

export interface QueuePanelExecutionContextReader {
	readonly read: (
		input: QueuePanelExecutionContextReadInput
	) => Promise<QueuePanelExecutionContextReadResult>;
}

interface PendingQueuePanelExecutionContextRead extends QueuePanelExecutionContextReadInput {
	readonly promise: Promise<QueuePanelExecutionContextReadResult>;
}

export function createQueuePanelExecutionContextReader(): QueuePanelExecutionContextReader {
	let pendingRead: PendingQueuePanelExecutionContextRead | null = null;

	return {
		read(input) {
			if (
				pendingRead !== null &&
				pendingRead.workspaceId === input.workspaceId &&
				pendingRead.workspacePath === input.workspacePath
			) {
				return pendingRead.promise;
			}

			const promise = readQueuePanelExecutionContext(input);
			pendingRead = {
				workspaceId: input.workspaceId,
				workspacePath: input.workspacePath,
				promise
			};
			const clearPendingRead = () => {
				if (pendingRead?.promise === promise) {
					pendingRead = null;
				}
			};
			promise.then(clearPendingRead, clearPendingRead);

			return promise;
		}
	};
}

export async function readQueuePanelExecutionContext(
	input: QueuePanelExecutionContextReadInput
): Promise<QueuePanelExecutionContextReadResult> {
	const [skillResult, agentResult, referenceResult, personaResult] = await Promise.all([
		readSkillRegistry(input.workspaceId, input.workspacePath),
		readAgentRegistry(input.workspaceId, input.workspacePath),
		readReferenceRegistry(input.workspaceId, input.workspacePath),
		readPersonaRegistry(input.workspaceId, input.workspacePath)
	]);

	return {
		skillRegistry: skillResult.registry,
		agentRegistry: agentResult.registry,
		referenceRegistry: referenceResult.registry,
		personaRegistry: personaResult.registry,
		executionContext: {
			agents: agentResult.registry.agents,
			skills: getAllSkills(skillResult.registry),
			references: referenceResult.registry.references,
			personas: personaResult.registry.personas
		}
	};
}
