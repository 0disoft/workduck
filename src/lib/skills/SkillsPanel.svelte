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
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import { DetailCard, EntityCard, EntityWorkbench } from '$lib/ui';

	import {
		createEmptySkillRegistry,
		getAllSkills,
		removeSkill,
		upsertSkill,
		workduckSkillOutputTypeOptions,
		type SkillRegistry,
		type SkillRegistryError,
		type WorkduckSkillOutputType,
		type WorkduckSkillRecord
	} from './skill-registry';
	import {
		readSkillRegistry,
		subscribeSkillRegistry,
		writeSkillRegistry,
		type SkillRegistryStorageError
	} from './skill-registry-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
	}

	let { workspace }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<SkillRegistry>(createEmptySkillRegistry(''));
	let selectedSkillId = $state<string | null>(null);
	let editingSkillId = $state<string | null>(null);
	let skillName = $state('');
	let skillDescription = $state('');
	let skillOutputTypes = $state<WorkduckSkillOutputType[]>(['proposal']);
	let skillInstructions = $state('');
	let isSkillFormOpen = $state(false);
	let isSavingSkill = $state(false);
	let isRemovingSkill = $state(false);
	let skillError = $state<SkillRegistryError | SkillRegistryStorageError | null>(null);
	let status = $state<string | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let allSkills = $derived(getAllSkills(registry));
	let selectedSkill = $derived(
		selectedSkillId === null
			? null
			: allSkills.find((skill) => skill.id === selectedSkillId) ?? null
	);
	let skillFormLabel = $derived(
		editingSkillId === null ? messages.common.add : messages.common.save
	);
	let canSaveSkill = $derived(
		skillName.trim().length > 0 &&
			skillOutputTypes.length > 0 &&
			skillInstructions.trim().length > 0 &&
		!isSavingSkill
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
			registry = createEmptySkillRegistry(workspaceId);
			selectedSkillId = null;
			editingSkillId = null;
			clearSkillForm();
			void readRegistryFromStorage(workspaceId, workspace.path);

			const unsubscribeRegistry = subscribeSkillRegistry(workspaceId, (nextRegistry) => {
				registry = nextRegistry;
				selectedSkillId = resolveSelectedSkillId(selectedSkillId, getAllSkills(nextRegistry));
			});

			return unsubscribeRegistry;
		});
	});

	async function readRegistryFromStorage(workspaceId: string, workspacePath: string) {
		const result = await readSkillRegistry(workspaceId, workspacePath);

		registry = result.registry;
		skillError = result.ok ? null : result.error;
		selectedSkillId = resolveSelectedSkillId(selectedSkillId, getAllSkills(result.registry));
	}

	function selectSkill(skill: WorkduckSkillRecord) {
		selectedSkillId = selectedSkillId === skill.id ? null : skill.id;
		status = null;
		skillError = null;
	}

	function editSelectedSkill() {
		if (selectedSkill === null || selectedSkill.builtIn) {
			return;
		}

		openSkillFormFromRecord(selectedSkill, false);
	}

	function copySelectedSkillForEditing() {
		if (selectedSkill === null || !selectedSkill.builtIn) {
			return;
		}

		openSkillFormFromRecord(selectedSkill, true);
	}

	function openSkillFormFromRecord(skill: WorkduckSkillRecord, asCopy: boolean) {
		isSkillFormOpen = true;
		editingSkillId = asCopy ? null : skill.id;
		skillName = asCopy ? createCopiedSkillName(getSkillDisplayName(skill)) : skill.name;
		skillDescription = getSkillDisplayDescription(skill);
		skillOutputTypes = [...skill.outputTypes];
		skillInstructions = getSkillDisplayInstructions(skill);
		status = null;
		skillError = null;
	}

	function clearSkillForm() {
		isSkillFormOpen = false;
		editingSkillId = null;
		skillName = '';
		skillDescription = '';
		skillOutputTypes = ['proposal'];
		skillInstructions = '';
		skillError = null;
	}

	function openNewSkillForm() {
		clearSkillForm();
		isSkillFormOpen = true;
	}

	async function handleSkillSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!canSaveSkill) {
			return;
		}

		isSavingSkill = true;
		skillError = null;
		status = null;

		try {
			const mutation = upsertSkill(registry, {
				id: editingSkillId,
				name: skillName,
				description: skillDescription,
				outputTypes: skillOutputTypes,
				instructions: skillInstructions
			});

			if (!mutation.ok) {
				skillError = mutation.error;
				return;
			}

			const writeResult = await writeSkillRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			skillError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedSkillId = null;
			clearSkillForm();
			status = messages.skills.saved;
		} finally {
			isSavingSkill = false;
		}
	}

	async function handleRemoveSelectedSkill() {
		if (selectedSkill === null || selectedSkill.builtIn || isRemovingSkill) {
			return;
		}

		isRemovingSkill = true;
		skillError = null;
		status = null;

		try {
			const mutation = removeSkill(registry, selectedSkill.id);

			if (!mutation.ok) {
				skillError = mutation.error;
				return;
			}

			const writeResult = await writeSkillRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			skillError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedSkillId = null;
			clearSkillForm();
			status = messages.skills.removed;
		} finally {
			isRemovingSkill = false;
		}
	}

	function getOutputTypeLabel(outputType: WorkduckSkillOutputType) {
		return messages.skills.outputTypes[outputType];
	}

	function getSkillDisplayName(skill: WorkduckSkillRecord) {
		return skill.id === 'workduck.skill.proposal-writer'
			? messages.skills.builtIn.proposalWriter.name
			: skill.name;
	}

	function getSkillDisplayDescription(skill: WorkduckSkillRecord) {
		return skill.id === 'workduck.skill.proposal-writer'
			? messages.skills.builtIn.proposalWriter.description
			: skill.description;
	}

	function getSkillDisplayInstructions(skill: WorkduckSkillRecord) {
		return skill.id === 'workduck.skill.proposal-writer'
			? messages.skills.builtIn.proposalWriter.instructions
			: skill.instructions;
	}

	function createCopiedSkillName(baseName: string) {
		const existingNames = new Set<string>();

		for (const skill of allSkills) {
			existingNames.add(normalizeSkillName(skill.name));
			existingNames.add(normalizeSkillName(getSkillDisplayName(skill)));
		}

		const copiedName = `${baseName} ${messages.skills.copyNameSuffix}`;

		if (!existingNames.has(normalizeSkillName(copiedName))) {
			return copiedName;
		}

		for (let copyIndex = 2; copyIndex < 100; copyIndex += 1) {
			const indexedName = `${copiedName} ${copyIndex}`;

			if (!existingNames.has(normalizeSkillName(indexedName))) {
				return indexedName;
			}
		}

		return `${copiedName} ${Date.now()}`;
	}

	function normalizeSkillName(name: string) {
		return name.trim().toLocaleLowerCase();
	}

	function resolveSelectedSkillId(
		currentSkillId: string | null,
		skills: readonly WorkduckSkillRecord[]
	) {
		if (currentSkillId !== null && skills.some((skill) => skill.id === currentSkillId)) {
			return currentSkillId;
		}

		return null;
	}

	function createSkillErrorMessage(nextError: SkillRegistryError | SkillRegistryStorageError) {
		switch (nextError) {
			case 'skill-name-required':
				return messages.skills.errors.nameRequired;
			case 'skill-name-duplicate':
				return messages.skills.errors.nameDuplicate;
			case 'skill-output-type-required':
				return messages.skills.errors.outputTypeRequired;
			case 'skill-instructions-required':
				return messages.skills.errors.instructionsRequired;
			case 'skill-not-found':
				return messages.skills.errors.notFound;
			case 'skill-built-in-readonly':
				return messages.skills.errors.builtInReadonly;
			case 'skill-registry-invalid':
			case 'skill-registry-storage-read-failed':
				return messages.skills.errors.readFailed;
			case 'skill-registry-storage-write-failed':
				return messages.skills.errors.saveFailed;
			default:
				return nextError.includes('write') || nextError.includes('too-large')
					? messages.skills.errors.saveFailed
					: messages.skills.errors.readFailed;
		}
	}
</script>

<EntityWorkbench label={messages.skills.title} sidebarLabel={messages.skills.list} detailLabel={messages.skills.details}>
	{#snippet sidebar()}
		<button class="workduck-list-add-card" type="button" onclick={openNewSkillForm}>
			{messages.skills.newSkill}
		</button>

		<div class="workduck-entity-list">
			{#each allSkills as skill (skill.id)}
				<EntityCard
					title={getSkillDisplayName(skill)}
					kind={skill.builtIn ? messages.common.builtIn : messages.common.skill}
					description={getSkillDisplayDescription(skill)}
					selected={selectedSkill?.id === skill.id}
					onSelect={() => selectSkill(skill)}
				/>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedSkill !== null}
			<DetailCard title={getSkillDisplayName(selectedSkill)} kind={selectedSkill.builtIn ? messages.common.builtIn : messages.common.skill}>
				<dl class="workduck-agent-details-list">
					<div>
						<dt>{messages.common.output}</dt>
						<dd>
							<span class="workduck-environment-tags">
								{#each selectedSkill.outputTypes as outputType (outputType)}
									<span class="workduck-project-tag">{getOutputTypeLabel(outputType)}</span>
								{/each}
							</span>
						</dd>
					</div>
					{#if getSkillDisplayDescription(selectedSkill).length > 0}
						<div>
							<dt>{messages.common.description}</dt>
							<dd>{getSkillDisplayDescription(selectedSkill)}</dd>
						</div>
					{/if}
					<div>
						<dt>{messages.common.instructions}</dt>
						<dd class="workduck-skill-instructions">{getSkillDisplayInstructions(selectedSkill)}</dd>
					</div>
				</dl>

				{#snippet actions()}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={selectedSkill.builtIn ? copySelectedSkillForEditing : editSelectedSkill}
					>
						{selectedSkill.builtIn ? messages.skills.copySkill : messages.common.edit}
					</button>
					{#if !selectedSkill.builtIn}
						<button
							class="workduck-button workduck-button-danger"
							type="button"
							disabled={isRemovingSkill}
							onclick={() => void handleRemoveSelectedSkill()}
						>
							{messages.common.remove}
						</button>
					{/if}
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if skillError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createSkillErrorMessage(skillError)}</p>
		{/if}

		{#if status !== null}
			<p class="workduck-inline-status" aria-live="polite">{status}</p>
		{/if}
	{/snippet}
</EntityWorkbench>

{#if isSkillFormOpen}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget && !isSavingSkill) {
			clearSkillForm();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="skill-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleSkillSubmit}>
				<h2 id="skill-dialog-title" class="workduck-dialog-title">
					{editingSkillId === null ? messages.skills.newSkill : messages.skills.editSkill}
				</h2>

				<label class="workduck-form-field" for="skill-name">
					<span>{messages.common.name}</span>
					<input
						id="skill-name"
						class="workduck-input"
						type="text"
						bind:value={skillName}
						autocomplete="off"
						disabled={isSavingSkill}
					/>
				</label>

				<label class="workduck-form-field" for="skill-output-types">
					<span>{messages.common.output}</span>
					<select
						id="skill-output-types"
						class="workduck-select"
						multiple
						bind:value={skillOutputTypes}
						disabled={isSavingSkill}
					>
						{#each workduckSkillOutputTypeOptions as option}
							<option value={option.id}>{getOutputTypeLabel(option.id)}</option>
						{/each}
					</select>
				</label>

				<label class="workduck-form-field" for="skill-description">
					<span>{messages.common.description}</span>
					<input
						id="skill-description"
						class="workduck-input"
						type="text"
						bind:value={skillDescription}
						autocomplete="off"
						disabled={isSavingSkill}
					/>
				</label>

				<label class="workduck-form-field" for="skill-instructions">
					<span>{messages.common.instructions}</span>
					<textarea
						id="skill-instructions"
						class="workduck-input workduck-project-description-input"
						bind:value={skillInstructions}
						disabled={isSavingSkill}
					></textarea>
				</label>

				<div class="workduck-dialog-actions">
					<button class="workduck-button workduck-button-secondary" type="button" onclick={clearSkillForm}>
						{messages.common.cancel}
					</button>
					<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSaveSkill}>
						{skillFormLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
