import {
	createEmptyAgentEvaluationSummary,
	normalizeAgentEvaluationSummary,
	type AgentEvaluationSummary
} from './agent-evaluation';

export const AGENT_REGISTRY_VERSION = 4;
export const AGENT_NAME_MAX_LENGTH = 120;
export const AGENT_MODEL_ID_MAX_LENGTH = 160;

export type AgentExecutionProvider = 'deepseek' | 'openai' | 'openrouter';
export type AgentExecutionProviderInput = AgentExecutionProvider | 'auto';

export type AgentRegistryError =
	| 'agent-name-required'
	| 'agent-auth-required'
	| 'agent-name-duplicate'
	| 'agent-not-found'
	| 'agent-registry-invalid';

export interface AgentRecord {
	readonly id: string;
	readonly name: string;
	readonly environmentSecretId: string | null;
	readonly personaId: string | null;
	readonly executionProvider: AgentExecutionProvider | null;
	readonly modelId: string | null;
	readonly evaluationSummary: AgentEvaluationSummary;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AgentRegistry {
	readonly version: typeof AGENT_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly agents: readonly AgentRecord[];
	readonly updatedAt: string;
}

export interface AgentInput {
	readonly id?: string | null;
	readonly name: string;
	readonly environmentSecretId?: string | null;
	readonly personaId?: string | null;
	readonly executionProvider?: AgentExecutionProviderInput | null;
	readonly modelId?: string | null;
}

export type AgentRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: AgentRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: AgentRegistry;
			readonly error: AgentRegistryError;
	  };

export function createEmptyAgentRegistry(workspaceId: string, now = new Date()): AgentRegistry {
	return {
		version: AGENT_REGISTRY_VERSION,
		workspaceId,
		agents: [],
		updatedAt: now.toISOString()
	};
}

export function parseAgentRegistry(serializedRegistry: string, workspaceId: string) {
	try {
		return normalizeAgentRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return null;
	}
}

export function serializeAgentRegistry(registry: AgentRegistry) {
	return JSON.stringify(normalizeAgentRegistry(registry, registry.workspaceId) ?? registry);
}

export function upsertAgent(
	registry: AgentRegistry,
	input: AgentInput,
	now = new Date()
): AgentRegistryMutationResult {
	const normalizedRegistry = normalizeAgentRegistry(registry, registry.workspaceId) ?? registry;
	const name = normalizeAgentName(input.name);
	const environmentSecretId = normalizeRecordId(input.environmentSecretId);
	const personaId = normalizeRecordId(input.personaId);
	const executionProvider = normalizeAgentExecutionProvider(input.executionProvider);
	const modelId = normalizeAgentModelId(input.modelId);
	const agentId = normalizeRecordId(input.id ?? null);

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'agent-name-required' };
	}

	if (environmentSecretId === null) {
		return { ok: false, registry: normalizedRegistry, error: 'agent-auth-required' };
	}

	const matchingAgent = normalizedRegistry.agents.find((agent) => agent.id === agentId);
	const nameKey = createAgentNameKey(name);
	const nameAlreadyExists = normalizedRegistry.agents.some(
		(agent) => agent.id !== agentId && createAgentNameKey(agent.name) === nameKey
	);

	if (nameAlreadyExists) {
		return { ok: false, registry: normalizedRegistry, error: 'agent-name-duplicate' };
	}

	if (agentId !== null && matchingAgent === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'agent-not-found' };
	}

	const timestamp = now.toISOString();
	const nextAgent = {
		id: agentId ?? createAgentId(),
		name,
		environmentSecretId,
		personaId,
		executionProvider,
		modelId,
		evaluationSummary: matchingAgent?.evaluationSummary ?? createEmptyAgentEvaluationSummary(),
		createdAt: matchingAgent?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies AgentRecord;
	const agents =
		matchingAgent === undefined
			? [...normalizedRegistry.agents, nextAgent]
			: normalizedRegistry.agents.map((agent) =>
					agent.id === nextAgent.id ? nextAgent : agent
				);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			agents: sortAgents(agents),
			updatedAt: timestamp
		}
	};
}

export function removeAgent(
	registry: AgentRegistry,
	agentId: string,
	now = new Date()
): AgentRegistryMutationResult {
	const normalizedRegistry = normalizeAgentRegistry(registry, registry.workspaceId) ?? registry;

	if (!normalizedRegistry.agents.some((agent) => agent.id === agentId)) {
		return { ok: false, registry: normalizedRegistry, error: 'agent-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			agents: normalizedRegistry.agents.filter((agent) => agent.id !== agentId),
			updatedAt: now.toISOString()
		}
	};
}

export function assignPersonaToAgents(
	registry: AgentRegistry,
	agentIds: readonly string[],
	personaId: string,
	now = new Date()
): AgentRegistry {
	const normalizedRegistry = normalizeAgentRegistry(registry, registry.workspaceId) ?? registry;
	const targetAgentIds = new Set(agentIds.map(normalizeRecordId).filter((id) => id !== null));
	const normalizedPersonaId = normalizeRecordId(personaId);

	if (targetAgentIds.size === 0 || normalizedPersonaId === null) {
		return normalizedRegistry;
	}

	const timestamp = now.toISOString();
	let changed = false;
	const agents = normalizedRegistry.agents.map((agent) => {
		if (!targetAgentIds.has(agent.id) || agent.personaId !== null) {
			return agent;
		}

		changed = true;
		return {
			...agent,
			personaId: normalizedPersonaId,
			updatedAt: timestamp
		};
	});

	if (!changed) {
		return normalizedRegistry;
	}

	return {
		...normalizedRegistry,
		agents: sortAgents(agents),
		updatedAt: timestamp
	};
}

function normalizeAgentRegistry(value: unknown, workspaceId: string): AgentRegistry | null {
	if (
		!isObjectRecord(value) ||
		(value.version !== AGENT_REGISTRY_VERSION &&
			value.version !== 3 &&
			value.version !== 2 &&
			value.version !== 1)
	) {
		return null;
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return null;
	}

	const rawAgents = Array.isArray(value.agents) ? value.agents : [];
	const seenAgentIds = new Set<string>();
	const seenAgentNames = new Set<string>();
	const agents: AgentRecord[] = [];

	for (const rawAgent of rawAgents) {
		const agent = parseAgentRecord(rawAgent);

		if (agent === null) {
			continue;
		}

		const agentNameKey = createAgentNameKey(agent.name);

		if (seenAgentIds.has(agent.id) || seenAgentNames.has(agentNameKey)) {
			continue;
		}

		seenAgentIds.add(agent.id);
		seenAgentNames.add(agentNameKey);
		agents.push(agent);
	}

	return {
		version: AGENT_REGISTRY_VERSION,
		workspaceId,
		agents: sortAgents(agents),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function parseAgentRecord(value: unknown): AgentRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeAgentName(readTrimmedString(value.name));
	const environmentSecretId = normalizeRecordId(value.environmentSecretId);
	const personaId = normalizeRecordId(value.personaId);
	const executionProvider = normalizeAgentExecutionProvider(value.executionProvider);
	const modelId = normalizeAgentModelId(value.modelId);
	const evaluationSummary = normalizeAgentEvaluationSummary(value.evaluationSummary);
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0) {
		return null;
	}

	return {
		id,
		name,
		environmentSecretId,
		personaId,
		executionProvider,
		modelId,
		evaluationSummary,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function sortAgents(agents: readonly AgentRecord[]) {
	return [...agents].sort((left, right) =>
		left.name.localeCompare(right.name, 'en-US', { sensitivity: 'base' })
	);
}

function normalizeAgentName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, AGENT_NAME_MAX_LENGTH);
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function normalizeAgentExecutionProvider(value: unknown): AgentExecutionProvider | null {
	const provider = readTrimmedString(value).toLocaleLowerCase('en-US');

	switch (provider) {
		case 'deepseek':
		case 'openai':
		case 'openrouter':
			return provider;
		default:
			return null;
	}
}

function normalizeAgentModelId(value: unknown) {
	const modelId = readTrimmedString(value).replace(/\s+/g, ' ').slice(0, AGENT_MODEL_ID_MAX_LENGTH);

	return modelId.length === 0 ? null : modelId;
}

function createAgentId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAgentNameKey(name: string) {
	return normalizeAgentName(name).toLocaleLowerCase('en-US');
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
