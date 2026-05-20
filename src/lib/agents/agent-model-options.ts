import type { AgentExecutionProvider, AgentExecutionProviderInput } from './agent-registry';

export const CUSTOM_AGENT_MODEL_SELECTION = '__custom__';

export interface AgentProviderOption {
	readonly id: AgentExecutionProviderInput;
}

export interface AgentModelPreset {
	readonly provider: AgentExecutionProvider;
	readonly modelId: string;
	readonly label: string;
}

export const agentProviderOptions = [
	{ id: 'auto' },
	{ id: 'openrouter' },
	{ id: 'deepseek' },
	{ id: 'openai' }
] as const satisfies readonly AgentProviderOption[];

export const agentModelPresets = [
	{ provider: 'openrouter', modelId: 'openrouter/auto', label: 'OpenRouter Auto' },
	{ provider: 'openrouter', modelId: 'xiaomi/mimo-v2.5-pro', label: 'MiMo-V2.5 Pro' },
	{ provider: 'openrouter', modelId: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
	{ provider: 'openrouter', modelId: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
	{ provider: 'openrouter', modelId: 'z-ai/glm-5.1', label: 'GLM 5.1' },
	{ provider: 'openrouter', modelId: 'qwen/qwen3.6-plus', label: 'Qwen3.6 Plus' },
	{ provider: 'openrouter', modelId: 'x-ai/grok-4.3', label: 'Grok 4.3' },
	{ provider: 'deepseek', modelId: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
	{ provider: 'deepseek', modelId: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
	{ provider: 'openai', modelId: 'gpt-5.4-mini', label: 'GPT-5.4 mini' }
] as const satisfies readonly AgentModelPreset[];

export function getAgentModelPresetsForProvider(provider: AgentExecutionProviderInput) {
	if (provider === 'auto') {
		return agentModelPresets;
	}

	return agentModelPresets.filter((preset) => preset.provider === provider);
}

export function findAgentModelPreset(modelId: string | null | undefined) {
	if (modelId === null || modelId === undefined || modelId.length === 0) {
		return null;
	}

	return agentModelPresets.find((preset) => preset.modelId === modelId) ?? null;
}

export function getAgentModelLabel(modelId: string | null | undefined, fallbackLabel: string) {
	if (modelId === null || modelId === undefined || modelId.length === 0) {
		return fallbackLabel;
	}

	const preset = findAgentModelPreset(modelId);

	return preset === null ? modelId : `${preset.label} (${preset.modelId})`;
}
