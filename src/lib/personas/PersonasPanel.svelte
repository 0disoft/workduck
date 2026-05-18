<script lang="ts">
	import { onMount, untrack } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import { DetailCard, EntityCard, EntityWorkbench } from '$lib/ui';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import {
		assignPersonaToAgents,
		createEmptyAgentRegistry,
		type AgentRecord,
		type AgentRegistry
	} from '$lib/agents/agent-registry';
	import {
		readAgentRegistry,
		subscribeAgentRegistry,
		writeAgentRegistry,
		type AgentRegistryStorageError
	} from '$lib/agents/agent-registry-storage';

	import {
		createDefaultPersonaStyleValues,
		createDefaultPersonaSpectrumValues,
		createEmptyPersonaRegistry,
		createRandomPersonaStyleValues,
		createRandomPersonaSpectrumValues,
		personaStyleDefinitions,
		personaSpectrumDefinitions,
		personaSpectrumLevels,
		removePersona,
		upsertPersona,
		type PersonaRecord,
		type PersonaRegistry,
		type PersonaRegistryError,
		type PersonaStyleId,
		type PersonaStyleValues,
		type PersonaSpectrumId,
		type PersonaSpectrumLevel,
		type PersonaSpectrumValues
	} from './persona-registry';
	import {
		readPersonaRegistry,
		subscribePersonaRegistry,
		writePersonaRegistry,
		type PersonaRegistryStorageError
	} from './persona-registry-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
	}

	let { workspace }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<PersonaRegistry>(createEmptyPersonaRegistry(''));
	let agentRegistry = $state<AgentRegistry>(createEmptyAgentRegistry(''));
	let selectedPersonaId = $state<string | null>(null);
	let editingPersonaId = $state<string | null>(null);
	let personaName = $state('');
	let personaDescription = $state('');
	let personaStyles = $state<PersonaStyleValues>(createDefaultPersonaStyleValues());
	let personaSpectrums = $state<PersonaSpectrumValues>(createDefaultPersonaSpectrumValues());
	let selectedUnassignedAgentIds = $state<string[]>([]);
	let isPersonaFormOpen = $state(false);
	let isSavingPersona = $state(false);
	let isRemovingPersona = $state(false);
	let personaError = $state<
		PersonaRegistryError | PersonaRegistryStorageError | AgentRegistryStorageError | null
	>(null);
	let status = $state<string | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let selectedPersona = $derived(
		selectedPersonaId === null
			? null
			: registry.personas.find((persona) => persona.id === selectedPersonaId) ?? null
	);
	let personaFormLabel = $derived(
		editingPersonaId === null ? messages.common.add : messages.common.save
	);
	let unassignedAgents = $derived(
		agentRegistry.agents.filter((agent) => agent.personaId === null)
	);
	let agentAssignmentSummary = $derived(createAgentAssignmentSummary());
	let canSavePersona = $derived(personaName.trim().length > 0 && !isSavingPersona);

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
			registry = createEmptyPersonaRegistry(workspaceId);
			agentRegistry = createEmptyAgentRegistry(workspaceId);
			selectedPersonaId = null;
			editingPersonaId = null;
			clearPersonaForm();
			void readRegistryFromStorage(workspaceId, workspace.path);
			void readAgentRegistryFromStorage(workspaceId, workspace.path);

			const unsubscribeRegistry = subscribePersonaRegistry(workspaceId, (nextRegistry) => {
				registry = nextRegistry;
				selectedPersonaId = resolveSelectedPersonaId(selectedPersonaId, nextRegistry.personas);
			});
			const unsubscribeAgents = subscribeAgentRegistry(workspaceId, (nextRegistry) => {
				agentRegistry = nextRegistry;
				reconcileSelectedUnassignedAgentIds(nextRegistry.agents);
			});

			return () => {
				unsubscribeRegistry();
				unsubscribeAgents();
			};
		});
	});

	async function readRegistryFromStorage(workspaceId: string, workspacePath: string) {
		const result = await readPersonaRegistry(workspaceId, workspacePath);

		registry = result.registry;
		personaError = result.ok ? null : result.error;
		selectedPersonaId = resolveSelectedPersonaId(selectedPersonaId, result.registry.personas);
	}

	async function readAgentRegistryFromStorage(workspaceId: string, workspacePath: string) {
		const result = await readAgentRegistry(workspaceId, workspacePath);

		agentRegistry = result.registry;
		if (!result.ok) {
			personaError = result.error;
		}
		reconcileSelectedUnassignedAgentIds(result.registry.agents);
	}

	function selectPersona(persona: PersonaRecord) {
		selectedPersonaId = selectedPersonaId === persona.id ? null : persona.id;
		status = null;
		personaError = null;
	}

	function editSelectedPersona() {
		if (selectedPersona === null) {
			return;
		}

		isPersonaFormOpen = true;
		editingPersonaId = selectedPersona.id;
		personaName = selectedPersona.name;
		personaDescription = selectedPersona.description;
		personaStyles = selectedPersona.styles;
		personaSpectrums = selectedPersona.spectrums;
		selectedUnassignedAgentIds = [];
		status = null;
		personaError = null;
	}

	function clearPersonaForm() {
		isPersonaFormOpen = false;
		editingPersonaId = null;
		personaName = '';
		personaDescription = '';
		personaStyles = createDefaultPersonaStyleValues();
		personaSpectrums = createDefaultPersonaSpectrumValues();
		selectedUnassignedAgentIds = [];
		personaError = null;
	}

	function openNewPersonaForm() {
		clearPersonaForm();
		personaStyles = createRandomPersonaStyleValues();
		personaSpectrums = createRandomPersonaSpectrumValues();
		isPersonaFormOpen = true;
	}

	async function handlePersonaSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!canSavePersona) {
			return;
		}

		isSavingPersona = true;
		personaError = null;
		status = null;

		try {
			const mutation = upsertPersona(registry, {
				id: editingPersonaId,
				name: personaName,
				description: personaDescription,
				styles: personaStyles,
				spectrums: personaSpectrums
			});

			if (!mutation.ok) {
				personaError = mutation.error;
				return;
			}

			const savedPersonaId =
				mutation.registry.personas.find((persona) => persona.id === editingPersonaId)?.id ??
				mutation.registry.personas.find((persona) => persona.name === personaName.trim())?.id ??
				null;

			const writeResult = await writePersonaRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			personaError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			if (savedPersonaId !== null && selectedUnassignedAgentIds.length > 0) {
				const nextAgentRegistry = assignPersonaToAgents(
					agentRegistry,
					selectedUnassignedAgentIds,
					savedPersonaId
				);
				const agentWriteResult = await writeAgentRegistry(nextAgentRegistry, workspace.path);

				agentRegistry = agentWriteResult.registry;
				personaError = agentWriteResult.ok ? null : agentWriteResult.error;

				if (!agentWriteResult.ok) {
					return;
				}
			}

			selectedPersonaId = savedPersonaId;
			clearPersonaForm();
			status = messages.personas.saved;
		} finally {
			isSavingPersona = false;
		}
	}

	async function handleRemoveSelectedPersona() {
		if (selectedPersona === null || isRemovingPersona) {
			return;
		}

		isRemovingPersona = true;
		personaError = null;
		status = null;

		try {
			const mutation = removePersona(registry, selectedPersona.id);

			if (!mutation.ok) {
				personaError = mutation.error;
				return;
			}

			const writeResult = await writePersonaRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			personaError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedPersonaId = null;
			clearPersonaForm();
			status = messages.personas.removed;
		} finally {
			isRemovingPersona = false;
		}
	}

	function resolveSelectedPersonaId(
		currentPersonaId: string | null,
		personas: readonly PersonaRecord[]
	) {
		if (currentPersonaId !== null && personas.some((persona) => persona.id === currentPersonaId)) {
			return currentPersonaId;
		}

		return null;
	}

	function setPersonaSpectrumLevel(spectrumId: PersonaSpectrumId, level: PersonaSpectrumLevel) {
		personaSpectrums = {
			...personaSpectrums,
			[spectrumId]: level
		};
	}

	function setPersonaStyleOption(styleId: PersonaStyleId, option: string) {
		personaStyles = {
			...personaStyles,
			[styleId]: option
		} as PersonaStyleValues;
	}

	function randomizePersonaSpectrums() {
		personaStyles = createRandomPersonaStyleValues();
		personaSpectrums = createRandomPersonaSpectrumValues();
	}

	function toggleUnassignedAgentSelection(agentId: string, checked: boolean) {
		if (checked) {
			selectedUnassignedAgentIds = selectedUnassignedAgentIds.includes(agentId)
				? selectedUnassignedAgentIds
				: [...selectedUnassignedAgentIds, agentId];
			return;
		}

		selectedUnassignedAgentIds = selectedUnassignedAgentIds.filter((id) => id !== agentId);
	}

	function reconcileSelectedUnassignedAgentIds(agents: readonly AgentRecord[]) {
		const unassignedAgentIds = new Set(
			agents.filter((agent) => agent.personaId === null).map((agent) => agent.id)
		);

		selectedUnassignedAgentIds = selectedUnassignedAgentIds.filter((id) =>
			unassignedAgentIds.has(id)
		);
	}

	function createAgentAssignmentSummary() {
		if (unassignedAgents.length === 0) {
			return messages.personas.agentAssignment.none;
		}

		if (selectedUnassignedAgentIds.length === 0) {
			return messages.personas.agentAssignment.placeholder;
		}

		return messages.personas.agentAssignment.selectedCount.replace(
			'{count}',
			selectedUnassignedAgentIds.length.toString()
		);
	}

	function getSpectrumMessages(spectrumId: PersonaSpectrumId) {
		return messages.personas.spectrums.items[spectrumId];
	}

	function getSpectrumLevelMessages(spectrumId: PersonaSpectrumId, level: PersonaSpectrumLevel) {
		return getSpectrumMessages(spectrumId).levels[level];
	}

	function getStyleMessages(styleId: PersonaStyleId) {
		return messages.personas.styles.items[styleId];
	}

	function getStyleOptionLabel(styleId: PersonaStyleId, option: string) {
		const options = getStyleMessages(styleId).options as Record<string, string>;

		return options[option] ?? option;
	}

	function createPersonaErrorMessage(
		nextError: PersonaRegistryError | PersonaRegistryStorageError | AgentRegistryStorageError
	) {
		switch (nextError) {
			case 'persona-name-required':
				return messages.personas.errors.nameRequired;
			case 'persona-name-duplicate':
				return messages.personas.errors.nameDuplicate;
			case 'persona-not-found':
				return messages.personas.errors.notFound;
			case 'persona-registry-invalid':
			case 'persona-registry-storage-read-failed':
				return messages.personas.errors.readFailed;
			case 'persona-registry-storage-write-failed':
				return messages.personas.errors.saveFailed;
			case 'agent-registry-storage-read-failed':
				return messages.agents.errors.readFailed;
			case 'agent-registry-storage-write-failed':
				return messages.agents.errors.saveFailed;
			default:
				if (nextError.startsWith('agent-')) {
					return nextError.includes('write') || nextError.includes('too-large')
						? messages.agents.errors.saveFailed
						: messages.agents.errors.readFailed;
				}

				return nextError.includes('write') || nextError.includes('too-large')
					? messages.personas.errors.saveFailed
					: messages.personas.errors.readFailed;
		}
	}
</script>

<EntityWorkbench label={messages.personas.title} sidebarLabel={messages.personas.list} detailLabel={messages.personas.details}>
	{#snippet sidebar()}
		<button class="workduck-list-add-card" type="button" onclick={openNewPersonaForm}>
			{messages.personas.newPersona}
		</button>

		<div class="workduck-entity-list">
			{#each registry.personas as persona (persona.id)}
				<EntityCard
					title={persona.name}
					kind={messages.common.persona}
					description={persona.description}
					selected={selectedPersona?.id === persona.id}
					onSelect={() => selectPersona(persona)}
				/>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedPersona !== null}
			<DetailCard title={selectedPersona.name} kind={messages.common.persona}>
				<dl class="workduck-agent-details-list">
					{#if selectedPersona.description.length > 0}
						<div>
							<dt>{messages.common.description}</dt>
							<dd>{selectedPersona.description}</dd>
						</div>
					{/if}
				</dl>

				<div class="workduck-persona-style-summary" aria-label={messages.personas.styles.title}>
					{#each personaStyleDefinitions as style (style.id)}
						{@const styleMessages = getStyleMessages(style.id)}
						<div class="workduck-persona-style-summary-row">
							<span>{styleMessages.label}</span>
							<strong>{getStyleOptionLabel(style.id, selectedPersona.styles[style.id])}</strong>
						</div>
					{/each}
				</div>

				<div class="workduck-persona-spectrum-summary" aria-label={messages.personas.spectrums.title}>
					{#each personaSpectrumDefinitions as spectrum (spectrum.id)}
						{@const level = selectedPersona.spectrums[spectrum.id]}
						{@const spectrumMessages = getSpectrumMessages(spectrum.id)}
						{@const levelMessages = getSpectrumLevelMessages(spectrum.id, level)}
						<div class="workduck-persona-spectrum-summary-row">
							<span class="workduck-persona-spectrum-summary-label">
								{spectrumMessages.label}
							</span>
							<span class="workduck-persona-spectrum-summary-value" data-level={level}>
								{levelMessages.name}
							</span>
							<div
								class="workduck-persona-spectrum-levels workduck-persona-spectrum-levels-readonly"
								role="list"
								aria-label={spectrumMessages.label}
							>
								{#each personaSpectrumLevels as spectrumLevel (spectrumLevel)}
									<span
										class="workduck-persona-spectrum-level workduck-persona-spectrum-level-readonly"
										class:workduck-persona-spectrum-level-selected={level === spectrumLevel}
										data-level={spectrumLevel}
										role="listitem"
										aria-current={level === spectrumLevel ? 'true' : undefined}
									>
										{spectrumLevel}
									</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				{#snippet actions()}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={editSelectedPersona}
					>
						{messages.common.edit}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={isRemovingPersona}
						onclick={() => void handleRemoveSelectedPersona()}
					>
						{messages.common.remove}
					</button>
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if personaError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createPersonaErrorMessage(personaError)}</p>
		{/if}

		{#if status !== null}
			<p class="workduck-inline-status" aria-live="polite">{status}</p>
		{/if}
	{/snippet}
</EntityWorkbench>

{#if isPersonaFormOpen}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget && !isSavingPersona) {
			clearPersonaForm();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog workduck-persona-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="persona-dialog-title"
		>
			<form class="workduck-project-dialog-form workduck-persona-dialog-form" onsubmit={handlePersonaSubmit}>
				<h2 id="persona-dialog-title" class="workduck-dialog-title">
					{editingPersonaId === null ? messages.personas.newPersona : messages.personas.editPersona}
				</h2>

				<div class="workduck-persona-dialog-body">
					<section class="workduck-persona-dialog-main">
						<label class="workduck-form-field" for="persona-name">
							<span>{messages.common.name}</span>
							<input
								id="persona-name"
								class="workduck-input"
								type="text"
								bind:value={personaName}
								autocomplete="off"
								disabled={isSavingPersona}
							/>
						</label>

						<label class="workduck-form-field" for="persona-description">
							<span>{messages.common.description}</span>
							<input
								id="persona-description"
								class="workduck-input"
								type="text"
								bind:value={personaDescription}
								autocomplete="off"
								disabled={isSavingPersona}
							/>
						</label>

						<div class="workduck-persona-style-form" aria-label={messages.personas.styles.title}>
							{#each personaStyleDefinitions as style (style.id)}
								{@const styleMessages = getStyleMessages(style.id)}
								<div class="workduck-persona-style-row">
									<span class="workduck-persona-style-label">{styleMessages.label}</span>
									<div class="workduck-persona-style-options" role="group" aria-label={styleMessages.label}>
										{#each style.options as option (option)}
											<button
												class="workduck-persona-style-option"
												class:workduck-persona-style-option-selected={personaStyles[style.id] === option}
												type="button"
												aria-pressed={personaStyles[style.id] === option}
												disabled={isSavingPersona}
												onclick={() => setPersonaStyleOption(style.id, option)}
											>
												{getStyleOptionLabel(style.id, option)}
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</section>

					<section class="workduck-persona-spectrum-form" aria-label={messages.personas.spectrums.title}>
						<div class="workduck-persona-spectrum-form-header">
							<strong>{messages.personas.spectrums.title}</strong>
							<button
								class="workduck-button workduck-button-secondary workduck-persona-random-button"
								type="button"
								disabled={isSavingPersona}
								onclick={randomizePersonaSpectrums}
							>
								{messages.personas.randomSpectrums}
							</button>
						</div>

						{#each personaSpectrumDefinitions as spectrum (spectrum.id)}
							{@const selectedLevel = personaSpectrums[spectrum.id]}
							{@const spectrumMessages = getSpectrumMessages(spectrum.id)}
							{@const selectedLevelMessages = getSpectrumLevelMessages(spectrum.id, selectedLevel)}
							<div class="workduck-persona-spectrum-row">
								<div class="workduck-persona-spectrum-copy">
									<span class="workduck-persona-spectrum-label">{spectrumMessages.label}</span>
									<span class="workduck-persona-spectrum-selected" data-level={selectedLevel}>
										{selectedLevel}. {selectedLevelMessages.name}
									</span>
								</div>

								<div class="workduck-persona-spectrum-levels" role="group" aria-label={spectrumMessages.label}>
									{#each personaSpectrumLevels as level (level)}
										{@const levelMessages = getSpectrumLevelMessages(spectrum.id, level)}
										<button
											class="workduck-persona-spectrum-level"
											class:workduck-persona-spectrum-level-selected={selectedLevel === level}
											type="button"
											data-level={level}
											aria-pressed={selectedLevel === level}
											aria-label={`${spectrumMessages.label}: ${level}. ${levelMessages.name}`}
											disabled={isSavingPersona}
											onclick={() => setPersonaSpectrumLevel(spectrum.id, level)}
										>
											{level}
										</button>
									{/each}
								</div>

								<span class="workduck-persona-spectrum-description">
									{selectedLevelMessages.description}
								</span>
							</div>
						{/each}

						<div class="workduck-persona-agent-assignment">
							<span class="workduck-persona-agent-assignment-label">
								{messages.personas.agentAssignment.label}
							</span>
							{#if unassignedAgents.length > 0}
								<details class="workduck-persona-agent-select">
									<summary class="workduck-persona-agent-select-summary">
										<span>{agentAssignmentSummary}</span>
									</summary>
									<div class="workduck-persona-agent-select-options">
										{#each unassignedAgents as agent (agent.id)}
											<label class="workduck-persona-agent-option">
												<input
													type="checkbox"
													checked={selectedUnassignedAgentIds.includes(agent.id)}
													disabled={isSavingPersona}
													onchange={(event) => {
														const input = event.currentTarget;

														if (input instanceof HTMLInputElement) {
															toggleUnassignedAgentSelection(agent.id, input.checked);
														}
													}}
												/>
												<span>{agent.name}</span>
											</label>
										{/each}
									</div>
								</details>
							{:else}
								<div class="workduck-persona-agent-select-summary workduck-persona-agent-select-summary-disabled">
									<span>{messages.personas.agentAssignment.none}</span>
								</div>
							{/if}
						</div>
					</section>
				</div>

				<div class="workduck-dialog-actions">
					<button class="workduck-button workduck-button-secondary" type="button" onclick={clearPersonaForm}>
						{messages.common.cancel}
					</button>
					<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSavePersona}>
						{personaFormLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
