<script lang="ts">
	import {
		environmentSecretTagOptions,
		parseEnvironmentVault,
		type EnvironmentSecretRecord,
		type EnvironmentVault
	} from '$lib/environment/environment-vault';
	import {
		readEnvironmentVaultEnvelope,
		subscribeEnvironmentVaultEnvelope
	} from '$lib/environment/environment-vault-storage';
	import {
		decryptSecretVaultPayload,
		type SecretVaultCryptoError,
		type SecretVaultEnvelope
	} from '$lib/environment/secret-vault-crypto';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';

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

	let registry = $state<AgentRegistry>(createEmptyAgentRegistry(''));
	let vaultEnvelope = $state<SecretVaultEnvelope | null>(null);
	let environmentVault = $state<EnvironmentVault | null>(null);
	let vaultPassword = $state('');
	let agentName = $state('');
	let selectedEnvironmentSecretId = $state('');
	let selectedAgentId = $state<string | null>(null);
	let editingAgentId = $state<string | null>(null);
	let isVaultBusy = $state(false);
	let isSavingAgent = $state(false);
	let isRemovingAgent = $state(false);
	let vaultError = $state<string | null>(null);
	let agentError = $state<AgentRegistryError | AgentRegistryStorageError | null>(null);
	let status = $state<string | null>(null);

	let selectedAgent = $derived(
		selectedAgentId === null
			? null
			: registry.agents.find((agent) => agent.id === selectedAgentId) ?? null
	);
	let llmApiKeyOptions = $derived(getLlmApiKeyOptions(environmentVault));
	let selectedAgentApiKeyName = $derived(
		selectedAgent === null ? null : getApiKeyNameById(selectedAgent.environmentSecretId)
	);
	let agentFormLabel = $derived(editingAgentId === null ? 'Add' : 'Save');
	let canSaveAgent = $derived(
		agentName.trim().length > 0 &&
			selectedEnvironmentSecretId.length > 0 &&
			!isSavingAgent &&
			environmentVault !== null
	);

	$effect(() => {
		const workspaceId = workspace.id;

		registry = createEmptyAgentRegistry(workspaceId);
		selectedAgentId = null;
		editingAgentId = null;
		agentName = '';
		selectedEnvironmentSecretId = '';
		environmentVault = null;
		vaultPassword = '';
		vaultError = null;
		agentError = null;
		status = null;

		readRegistryFromStorage(workspaceId);
		readVaultEnvelopeFromStorage(workspaceId);

		const unsubscribeRegistry = subscribeAgentRegistry(workspaceId, (nextRegistry) => {
			registry = nextRegistry;
			selectedAgentId = resolveSelectedAgentId(selectedAgentId, nextRegistry.agents);
		});
		const unsubscribeVault = subscribeEnvironmentVaultEnvelope(workspaceId, (nextEnvelope) => {
			vaultEnvelope = nextEnvelope;
			environmentVault = null;
			vaultPassword = '';
			selectedEnvironmentSecretId = '';
		});

		return () => {
			unsubscribeRegistry();
			unsubscribeVault();
		};
	});

	function readRegistryFromStorage(workspaceId: string) {
		const result = readAgentRegistry(workspaceId);

		registry = result.registry;
		agentError = result.ok ? null : result.error;
		selectedAgentId = resolveSelectedAgentId(selectedAgentId, result.registry.agents);
	}

	function readVaultEnvelopeFromStorage(workspaceId: string) {
		const result = readEnvironmentVaultEnvelope(workspaceId);

		vaultEnvelope = result.envelope;
		environmentVault = null;
		vaultPassword = '';
		vaultError = result.ok ? null : 'Environment vault could not be read.';
	}

	async function handleUnlockEnvironmentVault(event: SubmitEvent) {
		event.preventDefault();

		if (vaultEnvelope === null || isVaultBusy || vaultPassword.length === 0) {
			return;
		}

		isVaultBusy = true;
		vaultError = null;
		status = null;

		try {
			const decryptResult = await decryptSecretVaultPayload(vaultEnvelope, vaultPassword);

			if (!decryptResult.ok) {
				vaultError = createSecretVaultErrorMessage(decryptResult.error);
				return;
			}

			const parsedVault = parseEnvironmentVault(decryptResult.plaintext, workspace.id);

			if (parsedVault === null) {
				vaultError = 'Environment vault could not be read.';
				return;
			}

			environmentVault = parsedVault;
			selectedEnvironmentSecretId = getLlmApiKeyOptions(parsedVault)[0]?.id ?? '';
			vaultPassword = '';
		} finally {
			isVaultBusy = false;
		}
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

		editingAgentId = selectedAgent.id;
		agentName = selectedAgent.name;
		selectedEnvironmentSecretId = selectedAgent.environmentSecretId;
		status = null;
		agentError = null;
	}

	function clearAgentForm() {
		editingAgentId = null;
		agentName = '';
		selectedEnvironmentSecretId = llmApiKeyOptions[0]?.id ?? '';
		agentError = null;
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
				environmentSecretId: selectedEnvironmentSecretId
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
			status = 'Saved.';
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
			status = 'Removed.';
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

	function getApiKeyNameById(secretId: string) {
		if (environmentVault === null) {
			return 'Unlock Environment';
		}

		return llmApiKeyOptions.find((option) => option.id === secretId)?.name ?? 'Missing API key';
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
				return 'Name is required.';
			case 'agent-name-duplicate':
				return 'Name already exists.';
			case 'agent-api-key-required':
				return 'API key is required.';
			case 'agent-not-found':
				return 'Agent was not found.';
			case 'agent-registry-invalid':
			case 'agent-registry-storage-read-failed':
				return 'Agents could not be read.';
			case 'agent-registry-storage-write-failed':
				return 'Agents could not be saved.';
		}
	}

	function createSecretVaultErrorMessage(nextError: SecretVaultCryptoError) {
		if (nextError === 'secret-vault-password-required') {
			return 'Vault password is required.';
		}

		if (nextError === 'secret-vault-unavailable') {
			return 'Vault is available in the desktop app.';
		}

		return 'Vault password did not match.';
	}
</script>

<section class="workduck-agents-board" aria-label="Agents">
	<section class="workduck-agents-sidebar" aria-label="Agent list">
		{#if vaultEnvelope === null}
			<p class="workduck-empty-state">Add an LLM API key in Environment.</p>
		{:else if environmentVault === null}
			<form class="workduck-agents-vault-form" onsubmit={handleUnlockEnvironmentVault}>
				<label class="workduck-form-field" for="agents-vault-password">
					<span>Environment vault password</span>
					<input
						id="agents-vault-password"
						class="workduck-input"
						type="password"
						bind:value={vaultPassword}
						autocomplete="current-password"
						disabled={isVaultBusy}
					/>
				</label>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={isVaultBusy || vaultPassword.length === 0}
				>
					{isVaultBusy ? 'Working' : 'Unlock'}
				</button>
			</form>
		{:else}
			<form class="workduck-agents-form" onsubmit={handleAgentSubmit}>
				<label class="workduck-form-field" for="agent-name">
					<span>Name</span>
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
					<span>API key</span>
					<select
						id="agent-api-key"
						class="workduck-select"
						bind:value={selectedEnvironmentSecretId}
						disabled={isSavingAgent || llmApiKeyOptions.length === 0}
					>
						<option value="" disabled>Select API key</option>
						{#each llmApiKeyOptions as option (option.id)}
							<option value={option.id}>{option.name}</option>
						{/each}
					</select>
				</label>

				<div class="workduck-agents-form-actions">
					<button
						class="workduck-button workduck-button-primary"
						type="submit"
						disabled={!canSaveAgent}
					>
						{agentFormLabel}
					</button>
					{#if editingAgentId !== null}
						<button
							class="workduck-button workduck-button-secondary"
							type="button"
							disabled={isSavingAgent}
							onclick={clearAgentForm}
						>
							Cancel
						</button>
					{/if}
				</div>
			</form>
			{#if llmApiKeyOptions.length === 0}
				<p class="workduck-empty-state">Tag an API key as LLM in Environment.</p>
			{/if}
		{/if}

		<div class="workduck-agents-list">
			{#if registry.agents.length === 0}
				<p class="workduck-empty-state">No agents yet.</p>
			{:else}
				{#each registry.agents as agent (agent.id)}
					<button
						class="workduck-project-card workduck-project-card-button workduck-agent-card"
						class:workduck-project-card-selected={selectedAgent?.id === agent.id}
						type="button"
						aria-pressed={selectedAgent?.id === agent.id}
						onclick={() => selectAgent(agent)}
					>
						<div class="workduck-project-card-header">
							<strong class="workduck-project-card-name">{agent.name}</strong>
							<span class="workduck-project-card-kind">Agent</span>
						</div>
						<span class="workduck-agent-card-key">{getApiKeyNameById(agent.environmentSecretId)}</span>
					</button>
				{/each}
			{/if}
		</div>
	</section>

	<section class="workduck-agents-detail" aria-label="Agent details">
		{#if selectedAgent === null}
			<p class="workduck-empty-state">Select an agent.</p>
		{:else}
			<div class="workduck-agent-detail-card">
				<div class="workduck-project-card-header">
					<strong class="workduck-project-card-name">{selectedAgent.name}</strong>
					<span class="workduck-project-card-kind">Agent</span>
				</div>

				<dl class="workduck-agent-details-list">
					<div>
						<dt>API key</dt>
						<dd>{selectedAgentApiKeyName}</dd>
					</div>
					<div>
						<dt>Tags</dt>
						<dd>
							<span class="workduck-project-tag">
								{environmentSecretTagOptions.find((option) => option.id === 'llm')?.label ?? 'LLM'}
							</span>
						</dd>
					</div>
				</dl>

				<div class="workduck-agents-detail-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={environmentVault === null}
						onclick={editSelectedAgent}
					>
						Edit
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={isRemovingAgent}
						onclick={() => void handleRemoveSelectedAgent()}
					>
						Remove
					</button>
				</div>
			</div>
		{/if}
	</section>

	{#if vaultError !== null}
		<p class="workduck-inline-error" aria-live="polite">{vaultError}</p>
	{/if}

	{#if agentError !== null}
		<p class="workduck-inline-error" aria-live="polite">{createAgentErrorMessage(agentError)}</p>
	{/if}

	{#if status !== null}
		<p class="workduck-inline-status" aria-live="polite">{status}</p>
	{/if}
</section>
