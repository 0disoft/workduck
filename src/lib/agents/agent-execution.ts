import type { AgentExecutionProvider, AgentRecord } from './agent-registry';
import type { EnvironmentSecretRecord, EnvironmentVault } from '$lib/environment/environment-vault';

export type AgentExecutionError =
	| 'agent-execution-agent-not-found'
	| 'agent-execution-secret-not-found'
	| 'agent-execution-provider-unsupported'
	| 'agent-execution-api-key-required'
	| 'agent-execution-prompt-required'
	| 'agent-execution-model-required'
	| 'agent-execution-request-invalid'
	| 'agent-execution-authentication-failed'
	| 'agent-execution-rate-limited'
	| 'agent-execution-provider-rejected'
	| 'agent-execution-provider-unavailable'
	| 'agent-execution-response-invalid'
	| 'agent-execution-unavailable';

export interface AgentExecutionTarget {
	readonly agent: AgentRecord;
	readonly secret: EnvironmentSecretRecord;
	readonly provider: AgentExecutionProvider;
	readonly model: string;
}

export type AgentExecutionTargetResult =
	| {
			readonly ok: true;
			readonly target: AgentExecutionTarget;
	  }
	| {
			readonly ok: false;
			readonly agentId: string;
			readonly error: AgentExecutionError;
	  };

export type AgentPromptRunResult =
	| {
			readonly ok: true;
			readonly agent: AgentRecord;
			readonly content: string;
	  }
	| {
			readonly ok: false;
			readonly agent: AgentRecord;
			readonly error: AgentExecutionError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface LlmChatCompletionResponse {
	readonly ok: boolean;
	readonly content?: string | null;
	readonly error?: LlmChatCompletionError | null;
}

type LlmChatCompletionError =
	| 'provider-unsupported'
	| 'api-key-required'
	| 'prompt-required'
	| 'model-required'
	| 'request-invalid'
	| 'authentication-failed'
	| 'rate-limited'
	| 'provider-rejected'
	| 'provider-unavailable'
	| 'response-invalid';

export function resolveAgentExecutionTarget(
	agentId: string,
	agents: readonly AgentRecord[],
	vault: EnvironmentVault | null
): AgentExecutionTargetResult {
	const agent = agents.find((candidate) => candidate.id === agentId);

	if (agent === undefined) {
		return { ok: false, agentId, error: 'agent-execution-agent-not-found' };
	}

	const secret = vault?.secrets.find((candidate) => candidate.id === agent.environmentSecretId);

	if (secret === undefined) {
		return { ok: false, agentId, error: 'agent-execution-secret-not-found' };
	}

	const provider = resolveAgentExecutionProvider(agent, secret);

	if (provider === null) {
		return { ok: false, agentId, error: 'agent-execution-provider-unsupported' };
	}

	return {
		ok: true,
		target: {
			agent,
			secret,
			provider,
			model: resolveAgentExecutionModel(provider, agent, secret)
		}
	};
}

export async function runAgentPrompt(input: {
	readonly target: AgentExecutionTarget;
	readonly systemPrompt: string;
	readonly userPrompt: string;
}): Promise<AgentPromptRunResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return {
			ok: false,
			agent: input.target.agent,
			error: 'agent-execution-unavailable'
		};
	}

	try {
		const response = await invoke<LlmChatCompletionResponse>('run_llm_chat_completion', {
			request: {
				provider: input.target.provider,
				model: input.target.model,
				apiKey: input.target.secret.value,
				systemPrompt: input.systemPrompt,
				userPrompt: input.userPrompt
			}
		});

		if (response.ok && typeof response.content === 'string' && response.content.trim().length > 0) {
			return {
				ok: true,
				agent: input.target.agent,
				content: response.content.trim()
			};
		}

		return {
			ok: false,
			agent: input.target.agent,
			error: mapLlmChatCompletionError(response.error)
		};
	} catch {
		return {
			ok: false,
			agent: input.target.agent,
			error: 'agent-execution-provider-unavailable'
		};
	}
}

function resolveAgentExecutionProvider(
	agent: AgentRecord,
	secret: EnvironmentSecretRecord
): AgentExecutionProvider | null {
	if (agent.executionProvider !== null) {
		return agent.executionProvider;
	}

	const secretProfileText = normalizeProviderProfileText([secret.name, secret.kind, ...secret.tags]);

	if (profileIncludesProvider(secretProfileText, 'openrouter')) {
		return 'openrouter';
	}

	if (profileIncludesProvider(secretProfileText, 'deepseek')) {
		return 'deepseek';
	}

	if (profileIncludesProvider(secretProfileText, 'openai')) {
		return 'openai';
	}

	const agentProfileText = normalizeProviderProfileText([agent.name]);

	if (profileIncludesProvider(agentProfileText, 'deepseek')) {
		return 'deepseek';
	}

	if (profileIncludesProvider(agentProfileText, 'openrouter')) {
		return 'openrouter';
	}

	if (profileIncludesProvider(agentProfileText, 'openai')) {
		return 'openai';
	}

	return null;
}

function resolveAgentExecutionModel(
	provider: AgentExecutionProvider,
	agent: AgentRecord,
	secret: EnvironmentSecretRecord
) {
	if (agent.modelId !== null) {
		return agent.modelId;
	}

	const profileText = normalizeProviderProfileText([agent.name, secret.name, ...secret.tags]);

	switch (provider) {
		case 'deepseek':
			return 'deepseek-v4-pro';
		case 'openai':
			return 'gpt-5.4-mini';
		case 'openrouter':
			if (profileIncludesProvider(profileText, 'deepseek')) {
				return 'deepseek/deepseek-v4-pro';
			}

			return 'openrouter/auto';
	}
}

function normalizeProviderProfileText(parts: readonly string[]) {
	return parts
		.join(' ')
		.toLocaleLowerCase('en-US')
		.replaceAll(/[^a-z0-9]+/g, '');
}

function profileIncludesProvider(profileText: string, provider: AgentExecutionProvider) {
	return profileText.includes(provider);
}

function mapLlmChatCompletionError(
	error: LlmChatCompletionError | null | undefined
): AgentExecutionError {
	switch (error) {
		case 'provider-unsupported':
			return 'agent-execution-provider-unsupported';
		case 'api-key-required':
			return 'agent-execution-api-key-required';
		case 'prompt-required':
			return 'agent-execution-prompt-required';
		case 'model-required':
			return 'agent-execution-model-required';
		case 'request-invalid':
			return 'agent-execution-request-invalid';
		case 'authentication-failed':
			return 'agent-execution-authentication-failed';
		case 'rate-limited':
			return 'agent-execution-rate-limited';
		case 'provider-rejected':
			return 'agent-execution-provider-rejected';
		case 'provider-unavailable':
			return 'agent-execution-provider-unavailable';
		case 'response-invalid':
			return 'agent-execution-response-invalid';
		default:
			return 'agent-execution-provider-unavailable';
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}
