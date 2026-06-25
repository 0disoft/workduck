import { createEmptyAgentRegistry, type AgentRegistry } from '$lib/agents/agent-registry';
import { readAgentRegistry, subscribeAgentRegistry } from '$lib/agents/agent-registry-storage';
import {
	createEmptyPersonaRegistry,
	type PersonaRegistry
} from '$lib/personas/persona-registry';
import {
	readPersonaRegistry,
	subscribePersonaRegistry
} from '$lib/personas/persona-registry-storage';
import {
	createEmptyProjectRegistry,
	type ProjectRegistry
} from '$lib/projects/project-registry';
import { readProjectRegistry, subscribeProjectRegistry } from '$lib/projects/project-storage';
import {
	createEmptyReferenceRegistry,
	type ReferenceRegistry
} from '$lib/references/reference-registry';
import {
	readReferenceRegistry,
	subscribeReferenceRegistry
} from '$lib/references/reference-registry-storage';
import { createEmptySkillRegistry, type SkillRegistry } from '$lib/skills/skill-registry';
import { readSkillRegistry, subscribeSkillRegistry } from '$lib/skills/skill-registry-storage';
import { ensureQueueFolder, type QueueFolderError } from './queue-folder';

export interface QueuePanelWorkspaceRegistryState {
	readonly skillRegistry: SkillRegistry;
	readonly agentRegistry: AgentRegistry;
	readonly personaRegistry: PersonaRegistry;
	readonly projectRegistry: ProjectRegistry;
	readonly referenceRegistry: ReferenceRegistry;
}

interface QueuePanelWorkspaceRegistrySetters {
	readonly setSkillRegistry: (registry: SkillRegistry) => void;
	readonly setAgentRegistry: (registry: AgentRegistry) => void;
	readonly setPersonaRegistry: (registry: PersonaRegistry) => void;
	readonly setProjectRegistry: (registry: ProjectRegistry) => void;
	readonly setReferenceRegistry: (registry: ReferenceRegistry) => void;
}

interface StartQueuePanelWorkspaceRegistryReadsInput extends QueuePanelWorkspaceRegistrySetters {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly isCurrent: () => boolean;
}

interface StartQueuePanelWorkspaceQueueFolderEnsureInput {
	readonly workspacePath: string;
	readonly isCurrent: () => boolean;
	readonly onReady: () => void | Promise<void>;
	readonly onFailure: (error: QueueFolderError) => void;
}

export function createEmptyQueuePanelWorkspaceRegistryState(
	workspaceId: string
): QueuePanelWorkspaceRegistryState {
	return {
		skillRegistry: createEmptySkillRegistry(workspaceId),
		agentRegistry: createEmptyAgentRegistry(workspaceId),
		personaRegistry: createEmptyPersonaRegistry(workspaceId),
		projectRegistry: createEmptyProjectRegistry(workspaceId),
		referenceRegistry: createEmptyReferenceRegistry(workspaceId)
	};
}

export function startQueuePanelWorkspaceRegistryReads(
	input: StartQueuePanelWorkspaceRegistryReadsInput
) {
	void readSkillRegistry(input.workspaceId, input.workspacePath).then((result) => {
		if (input.isCurrent()) {
			input.setSkillRegistry(result.registry);
		}
	});
	void readAgentRegistry(input.workspaceId, input.workspacePath).then((result) => {
		if (input.isCurrent()) {
			input.setAgentRegistry(result.registry);
		}
	});
	void readPersonaRegistry(input.workspaceId, input.workspacePath).then((result) => {
		if (input.isCurrent()) {
			input.setPersonaRegistry(result.registry);
		}
	});
	void readProjectRegistry(input.workspaceId).then((result) => {
		if (input.isCurrent()) {
			input.setProjectRegistry(result.registry);
		}
	});
	void readReferenceRegistry(input.workspaceId, input.workspacePath).then((result) => {
		if (input.isCurrent()) {
			input.setReferenceRegistry(result.registry);
		}
	});
}

export function startQueuePanelWorkspaceQueueFolderEnsure(
	input: StartQueuePanelWorkspaceQueueFolderEnsureInput
) {
	void ensureQueueFolder(input.workspacePath).then(async (result) => {
		if (!input.isCurrent()) {
			return;
		}

		if (!result.ok) {
			input.onFailure(result.error);
			return;
		}

		await input.onReady();
	});
}

export function subscribeQueuePanelWorkspaceRegistries(
	workspaceId: string,
	setters: QueuePanelWorkspaceRegistrySetters
) {
	let isSubscribed = true;
	const onlyWhileSubscribed =
		<Registry>(setRegistry: (registry: Registry) => void) =>
		(registry: Registry) => {
			if (isSubscribed) {
				setRegistry(registry);
			}
		};
	const unsubscribers = [
		subscribeSkillRegistry(workspaceId, onlyWhileSubscribed(setters.setSkillRegistry)),
		subscribeAgentRegistry(workspaceId, onlyWhileSubscribed(setters.setAgentRegistry)),
		subscribePersonaRegistry(workspaceId, onlyWhileSubscribed(setters.setPersonaRegistry)),
		subscribeProjectRegistry(workspaceId, onlyWhileSubscribed(setters.setProjectRegistry)),
		subscribeReferenceRegistry(workspaceId, onlyWhileSubscribed(setters.setReferenceRegistry))
	];

	return () => {
		isSubscribed = false;

		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
	};
}
