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
		upsertAgent,
		type AgentRecord,
		type AgentRegistry,
		type AgentRegistryError
	} from './agent-registry';
	import {
		readAgentRegistry,
		subscribeAgentRegistry,
		writeAgentRegistry,
		type AgentRegistryStorageError
	} from './agent-registry-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
	}

	interface LlmApiKeyOption {
		readonly id: string;
		readonly name: string;
	}

	let { workspace }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<AgentRegistry>(createEmptyAgentRegistry(''));
	let personaRegistry = $state<PersonaRegistry>(createEmptyPersonaRegistry(''));
	let environmentVault = $state<EnvironmentVault | null>(null);
	let agentName = $state('');
	let selectedEnvironmentSecretId = $state('');
	let selectedPersonaId = $state('');
	let selectedAgentId = $state<string | null>(null);
	let editingAgentId = $state<string | null>(null);
	let isAgentFormOpen = $state(false);
	let isSavingAgent = $state(false);
	let isRemovingAgent = $state(false);
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
			environmentVault = readEnvironmentVaultSession(workspaceId);
			agentError = null;
			status = null;

			readRegistryFromStorage(workspaceId);
			readPersonaRegistryFromStorage(workspaceId);

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
			void openEnvironmentVaultFromWorkspaceSession(workspaceId);

			return () => {
				unsubscribeRegistry();
				unsubscribePersonas();
				unsubscribeEnvironmentVault();
			};
		});
	});

	function readRegistryFromStorage(workspaceId: string) {
		const result = readAgentRegistry(workspaceId);

		registry = result.registry;
		agentError = result.ok ? null : result.error;
		selectedAgentId = resolveSelectedAgentId(selectedAgentId, result.registry.agents);
	}

	function readPersonaRegistryFromStorage(workspaceId: string) {
		personaRegistry = readPersonaRegistry(workspaceId).registry;
	}

	async function openEnvironmentVaultFromWorkspaceSession(workspaceId: string) {
		const sequence = ++environmentVaultOpenSequence;
		const result = await openEnvironmentVaultSessionFromWorkspaceUnlock(workspaceId);

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
		status = null;
		agentError = null;
	}

	function clearAgentForm() {
		isAgentFormOpen = false;
		editingAgentId = null;
		agentName = '';
		selectedEnvironmentSecretId = '';
		selectedPersonaId = '';
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
				personaId: selectedPersonaId
			});

			if (!mutation.ok) {
				agentError = mutation.error;
				return;
			}

			const writeResult = writeAgentRegistry(mutation.registry);

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

			const writeResult = writeAgentRegistry(mutation.registry);

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

	function getEvaluationCriterionMessages(criterionId: AgentEvaluationCriterionId) {
		return messages.agents.evaluation.criteria[criterionId];
	}

	function getEvaluationAverageLabel(agent: AgentRecord, criterionId: AgentEvaluationCriterionId) {
		const average = getAgentEvaluationAverage(agent.evaluationSummary, criterionId);

		return average === null ? messages.agents.evaluation.noScore : average.toFixed(2);
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
				</dl>

				<section class="workduck-agent-evaluation" aria-label={messages.agents.evaluation.title}>
					<header class="workduck-agent-evaluation-header">
						<strong>{messages.agents.evaluation.title}</strong>
						{#if hasAgentEvaluations(selectedAgent.evaluationSummary)}
							<span>
								{messages.agents.evaluation.count.replace(
									'{count}',
									selectedAgent.evaluationSummary.totalCount.toString()
								)}
							</span>
						{/if}
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
						<option value="" disabled>{messages.common.noApiKey}</option>
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
