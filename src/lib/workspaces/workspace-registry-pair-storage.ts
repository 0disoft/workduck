import {
	parseAgentRegistry,
	serializeAgentRegistry,
	type AgentRegistry
} from '$lib/agents/agent-registry';
import {
	notifyAgentRegistryChanged,
	writeAgentRegistry,
	type AgentRegistryStorageError
} from '$lib/agents/agent-registry-storage';
import {
	parsePersonaRegistry,
	serializePersonaRegistry,
	type PersonaRegistry
} from '$lib/personas/persona-registry';
import {
	notifyPersonaRegistryChanged,
	writePersonaRegistry,
	type PersonaRegistryStorageError
} from '$lib/personas/persona-registry-storage';
import {
	workspaceDataFilesAreAvailable,
	writeWorkspaceRegistryPair,
	type WorkspaceDataFileError
} from './workspace-data-file';

export type WorkspaceRegistryPairStorageResult =
	| {
			readonly ok: true;
			readonly agentRegistry: AgentRegistry;
			readonly personaRegistry: PersonaRegistry;
	  }
	| {
			readonly ok: false;
			readonly agentRegistry: AgentRegistry;
			readonly personaRegistry: PersonaRegistry;
			readonly error:
				| WorkspaceDataFileError
				| AgentRegistryStorageError
				| PersonaRegistryStorageError
				| 'workspace-registry-pair-invalid';
	  };

export async function writeWorkspaceRegistryPairStorage(
	agentRegistry: AgentRegistry,
	personaRegistry: PersonaRegistry,
	workspacePath: string
): Promise<WorkspaceRegistryPairStorageResult> {
	if (!workspaceDataFilesAreAvailable()) {
		const agentResult = await writeAgentRegistry(agentRegistry, workspacePath);
		if (!agentResult.ok) {
			return { ok: false, agentRegistry, personaRegistry, error: agentResult.error };
		}
		const personaResult = await writePersonaRegistry(personaRegistry, workspacePath);
		if (!personaResult.ok) {
			return {
				ok: false,
				agentRegistry: agentResult.registry,
				personaRegistry,
				error: personaResult.error
			};
		}
		return {
			ok: true,
			agentRegistry: agentResult.registry,
			personaRegistry: personaResult.registry
		};
	}

	const result = await writeWorkspaceRegistryPair(
		workspacePath,
		agentRegistry.revision,
		serializeAgentRegistry(agentRegistry),
		personaRegistry.revision,
		serializePersonaRegistry(personaRegistry)
	);

	if (!result.ok) {
		return { ok: false, agentRegistry, personaRegistry, error: result.error };
	}

	const persistedAgentRegistry = parseAgentRegistry(
		result.agentsContent,
		agentRegistry.workspaceId
	);
	const persistedPersonaRegistry = parsePersonaRegistry(
		result.personasContent,
		personaRegistry.workspaceId
	);
	if (persistedAgentRegistry === null || persistedPersonaRegistry === null) {
		return {
			ok: false,
			agentRegistry,
			personaRegistry,
			error: 'workspace-registry-pair-invalid'
		};
	}

	notifyAgentRegistryChanged(persistedAgentRegistry);
	notifyPersonaRegistryChanged(persistedPersonaRegistry);
	return {
		ok: true,
		agentRegistry: persistedAgentRegistry,
		personaRegistry: persistedPersonaRegistry
	};
}
