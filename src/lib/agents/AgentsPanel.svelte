<script lang="ts">
	import { onMount, untrack } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		type EnvironmentSecretRecord,
		type EnvironmentVault
	} from '$lib/environment/environment-vault';
	import {
		readEnvironmentVaultSession,
		subscribeEnvironmentVaultSession
	} from '$lib/environment/environment-vault-session';
	import { openEnvironmentVaultSessionFromWorkspaceUnlock } from '$lib/environment/environment-vault-session-loader';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import {
		createEmptyPersonaRegistry,
		type PersonaRegistry
	} from '$lib/personas/persona-registry';
	import {
		readPersonaRegistry,
		subscribePersonaRegistry
	} from '$lib/personas/persona-registry-storage';
	import { DetailCard, EntityCard, EntityWorkbench } from '$lib/ui';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';

	import {
		agentEvaluationCriteriaDefinitions,
		getAgentEvaluationAverage,
		hasAgentEvaluations,
		type AgentEvaluationCriterionId
	} from './agent-evaluation';
	import {
		createEmptyAgentRegistry,
		removeAgent,
		resetAgentEvaluation,
		upsertAgent,
		type AgentExecutionProviderInput,
		type AgentRecord,
		type AgentRegistry,
		type AgentRegistryError
	} from './agent-registry';
	import {
		CUSTOM_AGENT_MODEL_SELECTION,
		agentProviderOptions,
		findAgentModelPreset,
		getAgentModelLabel,
		getAgentModelPresetsForProvider
	} from './agent-model-options';
	import {
		readAgentRegistry,
		subscribeAgentRegistry,
		writeAgentRegistry,
		type AgentRegistryStorageError
	} from './agent-registry-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly onAgentCountChange?: (count: number) => void;
	}

	interface LlmApiKeyOption {
		readonly id: string;
		readonly name: string;
	}

	let { workspace, onAgentCountChange }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<AgentRegistry>(createEmptyAgentRegistry(''));
	let personaRegistry = $state<PersonaRegistry>(createEmptyPersonaRegistry(''));
	let environmentVault = $state<EnvironmentVault | null>(null);
	let agentName = $state('');
	let selectedEnvironmentSecretId = $state('');
	let selectedPersonaId = $state('');
	let selectedExecutionProvider = $state<AgentExecutionProviderInput>('auto');
	let selectedModelSelection = $state('');
	let selectedModelId = $state('');
	let selectedAgentId = $state<string | null>(null);
	let editingAgentId = $state<string | null>(null);
	let isAgentFormOpen = $state(false);
	let isSavingAgent = $state(false);
	let isRemovingAgent = $state(false);
	let isResettingAgentEvaluation = $state(false);
	let agentError = $state<AgentRegistryError | AgentRegistryStorageError | null>(null);
	let status = $state<string | null>(null);
	let environmentVaultOpenSequence = 0;
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let selectedAgent = $derived(
		selectedAgentId === null
			? null
			: registry.agents.find((agent) => agent.id === selectedAgentId) ?? null
	);
	let llmApiKeyOptions = $derived(getLlmApiKeyOptions(environmentVault));
	let selectedAgentApiKeyName = $derived(
		selectedAgent === null ? null : getApiKeyNameById(selectedAgent.environmentSecretId)
	);
	let selectedAgentPersonaName = $derived(
		selectedAgent === null ? null : getPersonaNameById(selectedAgent.personaId)
	);
	let selectedAgentProviderName = $derived(
		selectedAgent === null
			? null
			: getProviderLabel(selectedAgent.executionProvider ?? 'auto')
	);
	let selectedAgentModelName = $derived(
		selectedAgent === null
			? null
			: getAgentModelLabel(selectedAgent.modelId, messages.agents.defaultModel)
	);
	let agentModelPresetOptions = $derived(getAgentModelPresetsForProvider(selectedExecutionProvider));
	let selectedEnvironmentSecretIsMissing = $derived(
		selectedEnvironmentSecretId.length > 0 &&
			!llmApiKeyOptions.some((option) => option.id === selectedEnvironmentSecretId)
	);
	let selectedPersonaIsMissing = $derived(
		selectedPersonaId.length > 0 &&
			!personaRegistry.personas.some((persona) => persona.id === selectedPersonaId)
	);
	let agentFormLabel = $derived(
		editingAgentId === null ? messages.common.add : messages.common.save
	);
	let canSaveAgent = $derived(
		agentName.trim().length > 0 &&
			selectedEnvironmentSecretId.length > 0 &&
			!selectedEnvironmentSecretIsMissing &&
			!isSavingAgent
	);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});

	$effect(() => {
		const workspaceId = workspace.id;

		return untrack(() => {
			registry = createEmptyAgentRegistry(workspaceId);
			personaRegistry = createEmptyPersonaRegistry(workspaceId);
			selectedAgentId = null;
			editingAgentId = null;
			agentName = '';
			selectedEnvironmentSecretId = '';
			selectedPersonaId = '';
			selectedExecutionProvider = 'auto';
			selectedModelSelection = '';
			selectedModelId = '';
			environmentVault = readEnvironmentVaultSession(workspaceId);
			agentError = null;
			status = null;

			void readRegistryFromStorage(workspaceId, workspace.path);
			void readPersonaRegistryFromStorage(workspaceId, workspace.path);

			const unsubscribeRegistry = subscribeAgentRegistry(workspaceId, (nextRegistry) => {
				registry = nextRegistry;
				selectedAgentId = resolveSelectedAgentId(selectedAgentId, nextRegistry.agents);
			});
			const unsubscribePersonas = subscribePersonaRegistry(workspaceId, (nextRegistry) => {
				personaRegistry = nextRegistry;
				if (
					selectedPersonaId.length > 0 &&
					!nextRegistry.personas.some((persona) => persona.id === selectedPersonaId)
				) {
					selectedPersonaId = '';
				}
			});
			const unsubscribeEnvironmentVault = subscribeEnvironmentVaultSession(
				workspaceId,
				(nextVault) => {
					environmentVault = nextVault;
				}
			);
			void openEnvironmentVaultFromWorkspaceSession(workspaceId, workspace.path);

			return () => {
				unsubscribeRegistry();
				unsubscribePersonas();
				unsubscribeEnvironmentVault();
			};
		});
	});

	$effect(() => {
		onAgentCountChange?.(registry.agents.length);
	});

	async function readRegistryFromStorage(workspaceId: string, workspacePath: string) {
		const result = await readAgentRegistry(workspaceId, workspacePath);

		registry = result.registry;
		agentError = result.ok ? null : result.error;
		selectedAgentId = resolveSelectedAgentId(selectedAgentId, result.registry.agents);
	}

	async function readPersonaRegistryFromStorage(workspaceId: string, workspacePath: string) {
		personaRegistry = (await readPersonaRegistry(workspaceId, workspacePath)).registry;
	}

	async function openEnvironmentVaultFromWorkspaceSession(workspaceId: string, workspacePath: string) {
		const sequence = ++environmentVaultOpenSequence;
		const result = await openEnvironmentVaultSessionFromWorkspaceUnlock(workspaceId, workspacePath);

		if (sequence !== environmentVaultOpenSequence || !result.ok) {
			return;
		}

		environmentVault = result.vault;
	}

	function selectAgent(agent: AgentRecord) {
		selectedAgentId = agent.id;
		status = null;
		agentError = null;
	}

	function editSelectedAgent() {
		if (selectedAgent === null) {
			return;
		}

		isAgentFormOpen = true;
		editingAgentId = selectedAgent.id;
		agentName = selectedAgent.name;
		selectedEnvironmentSecretId = selectedAgent.environmentSecretId ?? '';
		selectedPersonaId = selectedAgent.personaId ?? '';
		selectedExecutionProvider = selectedAgent.executionProvider ?? 'auto';
		selectedModelId = selectedAgent.modelId ?? '';
		selectedModelSelection = resolveModelSelection(selectedModelId);
		status = null;
		agentError = null;
	}

	function clearAgentForm() {
		isAgentFormOpen = false;
		editingAgentId = null;
		agentName = '';
		selectedEnvironmentSecretId = '';
		selectedPersonaId = '';
		selectedExecutionProvider = 'auto';
		selectedModelSelection = '';
		selectedModelId = '';
		agentError = null;
	}

	function openNewAgentForm() {
		clearAgentForm();
		isAgentFormOpen = true;
	}

	async function handleAgentSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!canSaveAgent) {
			return;
		}

		isSavingAgent = true;
		agentError = null;
		status = null;

		try {
			const mutation = upsertAgent(registry, {
				id: editingAgentId,
				name: agentName,
				environmentSecretId: selectedEnvironmentSecretId,
				personaId: selectedPersonaId,
				executionProvider: selectedExecutionProvider,
				modelId: selectedModelId
			});

			if (!mutation.ok) {
				agentError = mutation.error;
				return;
			}

			const writeResult = await writeAgentRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			agentError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedAgentId = mutation.registry.agents.find((agent) => agent.name === agentName.trim())?.id ?? null;
			clearAgentForm();
			status = messages.agents.saved;
		} finally {
			isSavingAgent = false;
		}
	}

	async function handleRemoveSelectedAgent() {
		if (selectedAgent === null || isRemovingAgent) {
			return;
		}

		isRemovingAgent = true;
		agentError = null;
		status = null;

		try {
			const mutation = removeAgent(registry, selectedAgent.id);

			if (!mutation.ok) {
				agentError = mutation.error;
				return;
			}

			const writeResult = await writeAgentRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			agentError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedAgentId = resolveSelectedAgentId(null, mutation.registry.agents);
			clearAgentForm();
			status = messages.agents.removed;
		} finally {
			isRemovingAgent = false;
		}
	}

	async function handleResetSelectedAgentEvaluation() {
		if (
			selectedAgent === null ||
			!hasAgentEvaluations(selectedAgent.evaluationSummary) ||
			isResettingAgentEvaluation
		) {
			return;
		}

		const targetAgent = selectedAgent;

		if (
			typeof window !== 'undefined' &&
			!window.confirm(messages.agents.evaluation.resetConfirm)
		) {
			return;
		}

		isResettingAgentEvaluation = true;
		agentError = null;
		status = null;

		try {
			const mutation = resetAgentEvaluation(registry, targetAgent.id);

			if (!mutation.ok) {
				agentError = mutation.error;
				return;
			}

			const writeResult = await writeAgentRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			agentError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			status = messages.agents.evaluation.resetSaved;
		} finally {
			isResettingAgentEvaluation = false;
		}
	}

	function getLlmApiKeyOptions(vault: EnvironmentVault | null): readonly LlmApiKeyOption[] {
		if (vault === null) {
			return [];
		}

		return vault.secrets
			.filter(isLlmApiKeySecret)
			.map((secret) => ({
				id: secret.id,
				name: secret.name
			}));
	}

	function isLlmApiKeySecret(secret: EnvironmentSecretRecord) {
		return secret.kind === 'api-key' && secret.tags.includes('llm');
	}

	function getApiKeyNameById(secretId: string | null) {
		if (secretId === null) {
			return messages.common.noApiKey;
		}

		if (environmentVault === null) {
			return messages.common.linkedApiKey;
		}

		return llmApiKeyOptions.find((option) => option.id === secretId)?.name ?? messages.common.missingApiKey;
	}

	function getPersonaNameById(personaId: string | null) {
		if (personaId === null) {
			return messages.common.noPersona;
		}

		return personaRegistry.personas.find((persona) => persona.id === personaId)?.name ?? messages.common.missingPersona;
	}

	function getProviderLabel(provider: AgentExecutionProviderInput) {
		return messages.agents.providers[provider];
	}

	function handleProviderChange(event: Event) {
		const provider = (event.currentTarget as HTMLSelectElement).value;

		selectedExecutionProvider = normalizeSelectedExecutionProvider(provider);
		selectedModelSelection = '';
		selectedModelId = '';
	}

	function handleModelSelectionChange(event: Event) {
		const modelSelection = (event.currentTarget as HTMLSelectElement).value;

		selectedModelSelection = modelSelection;

		if (modelSelection !== CUSTOM_AGENT_MODEL_SELECTION) {
			selectedModelId = modelSelection;
		} else if (selectedModelId.length > 0 && findAgentModelPreset(selectedModelId) !== null) {
			selectedModelId = '';
		}
	}

	function normalizeSelectedExecutionProvider(provider: string): AgentExecutionProviderInput {
		switch (provider) {
			case 'deepseek':
			case 'openai':
			case 'openrouter':
				return provider;
			default:
				return 'auto';
		}
	}

	function resolveModelSelection(modelId: string) {
		if (modelId.length === 0) {
			return '';
		}

		return agentModelPresetOptions.some((option) => option.modelId === modelId)
			? modelId
			: CUSTOM_AGENT_MODEL_SELECTION;
	}

	function getEvaluationCriterionMessages(criterionId: AgentEvaluationCriterionId) {
		return messages.agents.evaluation.criteria[criterionId];
	}

	function getEvaluationAverageLabel(agent: AgentRecord, criterionId: AgentEvaluationCriterionId) {
		const average = getAgentEvaluationAverage(agent.evaluationSummary, criterionId);

		return average === null ? messages.agents.evaluation.noScore : average.toFixed(2);
	}

	function getEvaluationResetAtLabel(agent: AgentRecord) {
		if (agent.evaluationResetAt === null) {
			return null;
		}

		const resetAt = new Date(agent.evaluationResetAt);
		const formattedResetAt = Number.isNaN(resetAt.getTime())
			? agent.evaluationResetAt
			: resetAt.toLocaleString(appearanceSettings.languageId === 'ko' ? 'ko-KR' : 'en-US');

		return messages.agents.evaluation.resetAt.replace('{date}', formattedResetAt);
	}

	function resolveSelectedAgentId(
		currentAgentId: string | null,
		agents: readonly AgentRecord[]
	) {
		if (currentAgentId !== null && agents.some((agent) => agent.id === currentAgentId)) {
			return currentAgentId;
		}

		return agents[0]?.id ?? null;
	}

	function createAgentErrorMessage(nextError: AgentRegistryError | AgentRegistryStorageError) {
		switch (nextError) {
			case 'agent-name-required':
				return messages.agents.errors.nameRequired;
			case 'agent-auth-required':
				return messages.agents.errors.authRequired;
			case 'agent-name-duplicate':
				return messages.agents.errors.nameDuplicate;
			case 'agent-not-found':
				return messages.agents.errors.notFound;
			case 'agent-registry-invalid':
			case 'agent-registry-storage-read-failed':
				return messages.agents.errors.readFailed;
			case 'agent-registry-storage-write-failed':
				return messages.agents.errors.saveFailed;
			default:
				return nextError.includes('write') || nextError.includes('too-large')
					? messages.agents.errors.saveFailed
					: messages.agents.errors.readFailed;
		}
	}

</script>

<EntityWorkbench label={messages.agents.title} sidebarLabel={messages.agents.list} detailLabel={messages.agents.details}>
	{#snippet sidebar()}
		<button class="workduck-list-add-card" type="button" onclick={openNewAgentForm}>
			{messages.agents.newAgent}
		</button>

		<div class="workduck-entity-list">
			{#each registry.agents as agent (agent.id)}
				<EntityCard
					title={agent.name}
					kind={messages.common.agent}
					meta={getApiKeyNameById(agent.environmentSecretId)}
					selected={selectedAgent?.id === agent.id}
					onSelect={() => selectAgent(agent)}
				/>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedAgent !== null}
			<DetailCard title={selectedAgent.name} kind={messages.common.agent}>
				<dl class="workduck-agent-details-list">
					<div>
						<dt>{messages.common.apiKey}</dt>
						<dd>{selectedAgentApiKeyName}</dd>
					</div>
					<div>
						<dt>{messages.common.persona}</dt>
						<dd>{selectedAgentPersonaName}</dd>
					</div>
					<div>
						<dt>{messages.agents.provider}</dt>
						<dd>{selectedAgentProviderName}</dd>
					</div>
					<div>
						<dt>{messages.agents.model}</dt>
						<dd>{selectedAgentModelName}</dd>
					</div>
				</dl>

				<section class="workduck-agent-evaluation" aria-label={messages.agents.evaluation.title}>
					<header class="workduck-agent-evaluation-header">
						<strong>{messages.agents.evaluation.title}</strong>
						<div class="workduck-agent-evaluation-header-actions">
							{#if hasAgentEvaluations(selectedAgent.evaluationSummary)}
								<span>
									{messages.agents.evaluation.count.replace(
										'{count}',
										selectedAgent.evaluationSummary.totalCount.toString()
									)}
								</span>
								<button
									class="workduck-button workduck-button-secondary workduck-agent-evaluation-reset-button"
									type="button"
									disabled={isResettingAgentEvaluation}
									onclick={() => void handleResetSelectedAgentEvaluation()}
								>
									{messages.agents.evaluation.reset}
								</button>
							{/if}
						</div>
					</header>

					{#if hasAgentEvaluations(selectedAgent.evaluationSummary)}
						<div class="workduck-agent-evaluation-list">
							{#each agentEvaluationCriteriaDefinitions as criterion (criterion.id)}
								{@const criterionMessages = getEvaluationCriterionMessages(criterion.id)}
								<div class="workduck-agent-evaluation-row">
									<div>
										<strong>{criterionMessages.label}</strong>
										<span>{criterionMessages.description}</span>
									</div>
									<output>{getEvaluationAverageLabel(selectedAgent, criterion.id)}</output>
								</div>
							{/each}
						</div>
					{:else}
						<p class="workduck-agent-evaluation-empty">{messages.agents.evaluation.empty}</p>
					{/if}

					{#if selectedAgent.evaluationResetAt !== null}
						<p class="workduck-agent-evaluation-empty">{getEvaluationResetAtLabel(selectedAgent)}</p>
					{/if}
				</section>

				{#snippet actions()}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={editSelectedAgent}
					>
						{messages.common.edit}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={isRemovingAgent}
						onclick={() => void handleRemoveSelectedAgent()}
					>
						{messages.common.remove}
					</button>
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if agentError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createAgentErrorMessage(agentError)}</p>
		{/if}

		{#if status !== null}
			<p class="workduck-inline-status" aria-live="polite">{status}</p>
		{/if}
	{/snippet}
</EntityWorkbench>

{#if isAgentFormOpen}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget && !isSavingAgent) {
			clearAgentForm();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="agent-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleAgentSubmit}>
				<h2 id="agent-dialog-title" class="workduck-dialog-title">
					{editingAgentId === null ? messages.agents.newAgent : messages.agents.editAgent}
				</h2>

				<label class="workduck-form-field" for="agent-name">
					<span>{messages.common.name}</span>
					<input
						id="agent-name"
						class="workduck-input"
						type="text"
						bind:value={agentName}
						autocomplete="off"
						disabled={isSavingAgent}
					/>
				</label>

				<label class="workduck-form-field" for="agent-api-key">
					<span>{messages.common.apiKey}</span>
					<select
						id="agent-api-key"
						class="workduck-select"
						bind:value={selectedEnvironmentSecretId}
						disabled={isSavingAgent}
					>
						<option value="">{messages.common.noApiKey}</option>
						{#if selectedEnvironmentSecretIsMissing}
							<option value={selectedEnvironmentSecretId}>{messages.common.linkedApiKey}</option>
						{/if}
						{#each llmApiKeyOptions as option (option.id)}
							<option value={option.id}>{option.name}</option>
						{/each}
					</select>
				</label>

				<label class="workduck-form-field" for="agent-persona">
					<span>{messages.common.persona}</span>
					<select
						id="agent-persona"
						class="workduck-select"
						bind:value={selectedPersonaId}
						disabled={isSavingAgent}
					>
						<option value="">{messages.common.noPersona}</option>
						{#if selectedPersonaIsMissing}
							<option value={selectedPersonaId}>{messages.common.linkedPersona}</option>
						{/if}
						{#each personaRegistry.personas as persona (persona.id)}
							<option value={persona.id}>{persona.name}</option>
						{/each}
					</select>
				</label>

				<label class="workduck-form-field" for="agent-provider">
					<span>{messages.agents.provider}</span>
					<select
						id="agent-provider"
						class="workduck-select"
						value={selectedExecutionProvider}
						disabled={isSavingAgent}
						onchange={handleProviderChange}
					>
						{#each agentProviderOptions as option (option.id)}
							<option value={option.id}>{getProviderLabel(option.id)}</option>
						{/each}
					</select>
				</label>

				<label class="workduck-form-field" for="agent-model-preset">
					<span>{messages.agents.model}</span>
					<select
						id="agent-model-preset"
						class="workduck-select"
						value={selectedModelSelection}
						disabled={isSavingAgent}
						onchange={handleModelSelectionChange}
					>
						<option value="">{messages.agents.defaultModel}</option>
						{#each agentModelPresetOptions as option (`${option.provider}:${option.modelId}`)}
							<option value={option.modelId}>{option.label} ({option.modelId})</option>
						{/each}
						<option value={CUSTOM_AGENT_MODEL_SELECTION}>{messages.agents.customModel}</option>
					</select>
				</label>

				{#if selectedModelSelection === CUSTOM_AGENT_MODEL_SELECTION}
					<label class="workduck-form-field" for="agent-model-id">
						<span>{messages.agents.modelId}</span>
						<input
							id="agent-model-id"
							class="workduck-input"
							type="text"
							bind:value={selectedModelId}
							autocomplete="off"
							disabled={isSavingAgent}
						/>
					</label>
				{/if}

				<div class="workduck-dialog-actions">
					<button class="workduck-button workduck-button-secondary" type="button" onclick={clearAgentForm}>
						{messages.common.cancel}
					</button>
					<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSaveAgent}>
						{agentFormLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
