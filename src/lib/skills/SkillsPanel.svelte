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
	import { DetailCard, EntityCard, EntityWorkbench, StatusToast } from '$lib/ui';

	import {
		createEmptySkillRegistry,
		getAllSkills,
		isDefaultSkillRecord,
		removeSkill,
		SKILL_DESCRIPTION_MAX_LENGTH,
		SKILL_INSTRUCTIONS_MAX_LENGTH,
		SKILL_NAME_MAX_LENGTH,
		SKILL_OPTION_DESCRIPTION_MAX_LENGTH,
		SKILL_OPTION_GROUPS_MAX_COUNT,
		SKILL_OPTION_LABEL_MAX_LENGTH,
		SKILL_OPTIONS_PER_GROUP_MAX_COUNT,
		upsertSkill,
		workduckSkillOutputTypeOptions,
		WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
		WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID,
		WORKDUCK_CODE_REVIEWER_SKILL_ID,
		WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID,
		WORKDUCK_PROPOSAL_WRITER_SKILL_ID,
		WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID,
		WORKDUCK_REVISION_ASSISTANT_SKILL_ID,
		WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID,
		WORKDUCK_WRITING_ASSISTANT_SKILL_ID,
		type SkillRegistry,
		type SkillRegistryError,
		type WorkduckSkillOptionGroup,
		type WorkduckSkillOptionSelectionMode,
		type WorkduckSkillOutputType,
		type WorkduckSkillRecord
	} from './skill-registry';
	import {
		readSkillRegistry,
		subscribeSkillRegistry,
		writeSkillRegistry,
		type SkillRegistryStorageError
	} from './skill-registry-storage';
	import { readQueueArtifactSkillIds } from '$lib/queue/domain/queue-artifact-readers';
	import { listQueueFiles, readQueueFile } from '$lib/queue/queue-folder';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly onSkillCountChange?: (count: number) => void;
	}

	type SkillOptionFormRow = {
		readonly rowId: string;
		readonly id: string;
		readonly label: string;
		readonly description: string;
	};

	type SkillOptionGroupFormRow = {
		readonly rowId: string;
		readonly id: string;
		readonly label: string;
		readonly description: string;
		readonly selectionMode: WorkduckSkillOptionSelectionMode;
		readonly options: readonly SkillOptionFormRow[];
	};

	let { workspace, onSkillCountChange }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<SkillRegistry>(createEmptySkillRegistry(''));
	let selectedSkillId = $state<string | null>(null);
	let editingSkillId = $state<string | null>(null);
	let skillName = $state('');
	let skillDescription = $state('');
	let skillOutputTypes = $state<WorkduckSkillOutputType[]>(['proposal']);
	let skillInstructions = $state('');
	let skillOptionGroups = $state<readonly SkillOptionGroupFormRow[]>([]);
	let isSkillFormOpen = $state(false);
	let isSavingSkill = $state(false);
	let isRemovingSkill = $state(false);
	let pendingRemoveSkillId = $state<string | null>(null);
	let skillError = $state<SkillRegistryError | SkillRegistryStorageError | null>(null);
	let statusMessage = $state<string | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let allSkills = $derived(getAllSkills(registry));
	let displaySkills = $derived(sortSkillsForDisplay(allSkills));
	let selectedSkill = $derived(
		selectedSkillId === null
			? null
			: allSkills.find((skill) => skill.id === selectedSkillId) ?? null
	);
	let skillFormLabel = $derived(
		editingSkillId === null ? messages.common.add : messages.common.save
	);
	let skillFormValidationErrors = $derived(createSkillFormValidationErrors());
	let canSaveSkill = $derived(
		skillName.trim().length > 0 &&
			skillOutputTypes.length > 0 &&
			skillInstructions.trim().length > 0 &&
			skillFormValidationErrors.length === 0 &&
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

	$effect(() => {
		onSkillCountChange?.(allSkills.length);
	});

	async function readRegistryFromStorage(workspaceId: string, workspacePath: string) {
		const result = await readSkillRegistry(workspaceId, workspacePath);

		registry = result.registry;
		skillError = result.ok ? null : result.error;
		selectedSkillId = resolveSelectedSkillId(selectedSkillId, getAllSkills(result.registry));
	}

	function selectSkill(skill: WorkduckSkillRecord) {
		selectedSkillId = selectedSkillId === skill.id ? null : skill.id;
		pendingRemoveSkillId = null;
		statusMessage = null;
		skillError = null;
	}

	function editSelectedSkill() {
		if (selectedSkill === null) {
			return;
		}

		openSkillFormFromRecord(selectedSkill, false);
	}

	function copySelectedSkillForEditing() {
		if (selectedSkill === null) {
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
		skillOptionGroups = skill.optionGroups.map(createSkillOptionGroupFormRow);
		pendingRemoveSkillId = null;
		statusMessage = null;
		skillError = null;
	}

	function clearSkillForm() {
		isSkillFormOpen = false;
		editingSkillId = null;
		skillName = '';
		skillDescription = '';
		skillOutputTypes = ['proposal'];
		skillInstructions = '';
		skillOptionGroups = [];
		pendingRemoveSkillId = null;
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
		statusMessage = null;

		try {
			const mutation = upsertSkill(registry, {
				id: editingSkillId,
				name: skillName,
				description: skillDescription,
				outputTypes: skillOutputTypes,
				instructions: skillInstructions,
				optionGroups: createSkillOptionGroupsFromForm(skillOptionGroups)
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
			statusMessage = messages.skills.saved;
		} finally {
			isSavingSkill = false;
		}
	}

	async function handleRemoveSelectedSkill() {
		if (selectedSkill === null || isRemovingSkill) {
			return;
		}

		isRemovingSkill = true;
		skillError = null;
		statusMessage = null;

		try {
			if (pendingRemoveSkillId !== selectedSkill.id) {
				const referenceCount = await countQueueFilesReferencingSkill(selectedSkill.id);

				if (referenceCount > 0) {
					pendingRemoveSkillId = selectedSkill.id;
					statusMessage = messages.skills.removeReferencedWarning
						.replace('{count}', referenceCount.toString())
						.replace('{name}', getSkillDisplayName(selectedSkill));
					return;
				}
			}

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
			pendingRemoveSkillId = null;
			clearSkillForm();
			statusMessage = messages.skills.removed;
		} finally {
			isRemovingSkill = false;
		}
	}

	function getOutputTypeLabel(outputType: WorkduckSkillOutputType) {
		return messages.skills.outputTypes[outputType];
	}

	function getSkillDisplayName(skill: WorkduckSkillRecord) {
		return getSeedSkillMessages(skill)?.name ?? skill.name;
	}

	function getSkillDisplayDescription(skill: WorkduckSkillRecord) {
		return getSeedSkillMessages(skill)?.description ?? skill.description;
	}

	function getSkillDisplayInstructions(skill: WorkduckSkillRecord) {
		return getSeedSkillMessages(skill)?.instructions ?? skill.instructions;
	}

	function getSeedSkillMessages(skill: WorkduckSkillRecord) {
		if (!isDefaultSkillRecord(skill)) {
			return null;
		}

		switch (skill.id) {
			case WORKDUCK_PROPOSAL_WRITER_SKILL_ID:
				return messages.skills.seedSkills.proposalWriter;
			case WORKDUCK_WRITING_ASSISTANT_SKILL_ID:
				return messages.skills.seedSkills.writingAssistant;
			case WORKDUCK_REVISION_ASSISTANT_SKILL_ID:
				return messages.skills.seedSkills.revisionAssistant;
			case WORKDUCK_CODE_REVIEWER_SKILL_ID:
				return messages.skills.seedSkills.codeReviewer;
			case WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID:
				return messages.skills.seedSkills.commitHandoffWriter;
			case WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID:
				return messages.skills.seedSkills.techDebtJanitor;
			case WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID:
				return messages.skills.seedSkills.releaseNoteWriter;
			case WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID:
				return messages.skills.seedSkills.apiSchemaArchitect;
			case WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID:
				return messages.skills.seedSkills.agentResponseEvaluator;
			default:
				return null;
		}
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

	function sortSkillsForDisplay(skills: readonly WorkduckSkillRecord[]) {
		return [...skills].sort((left, right) =>
			getSkillDisplayName(left).localeCompare(getSkillDisplayName(right), undefined, {
				numeric: true,
				sensitivity: 'base'
			})
		);
	}

	function addSkillOptionGroup() {
		if (skillOptionGroups.length >= SKILL_OPTION_GROUPS_MAX_COUNT) {
			return;
		}

		skillOptionGroups = [
			...skillOptionGroups,
			{
				rowId: createFormRowId('skill-option-group'),
				id: createStableFormRecordId('skill-option-group'),
				label: '',
				description: '',
				selectionMode: 'single',
				options: [
					{
						rowId: createFormRowId('skill-option'),
						id: createStableFormRecordId('skill-option'),
						label: '',
						description: ''
					}
				]
			}
		];
	}

	function removeSkillOptionGroup(index: number) {
		skillOptionGroups = skillOptionGroups.filter((_, groupIndex) => groupIndex !== index);
	}

	function updateSkillOptionGroup(
		index: number,
		field: keyof Omit<SkillOptionGroupFormRow, 'rowId' | 'id' | 'options'>,
		value: string
	) {
		skillOptionGroups = skillOptionGroups.map((group, groupIndex) =>
			groupIndex === index
				? {
						...group,
						[field]:
							field === 'selectionMode'
								? value === 'multiple'
									? 'multiple'
									: 'single'
								: value
					}
				: group
		);
	}

	function addSkillOption(groupIndex: number) {
		skillOptionGroups = skillOptionGroups.map((group, nextGroupIndex) =>
			nextGroupIndex === groupIndex && group.options.length < SKILL_OPTIONS_PER_GROUP_MAX_COUNT
				? {
						...group,
						options: [
							...group.options,
							{
								rowId: createFormRowId('skill-option'),
								id: createStableFormRecordId('skill-option'),
								label: '',
								description: ''
							}
						]
					}
				: group
		);
	}

	function removeSkillOption(groupIndex: number, optionIndex: number) {
		skillOptionGroups = skillOptionGroups.map((group, nextGroupIndex) =>
			nextGroupIndex === groupIndex
				? {
						...group,
						options: group.options.filter((_, nextOptionIndex) => nextOptionIndex !== optionIndex)
					}
				: group
		);
	}

	function updateSkillOption(
		groupIndex: number,
		optionIndex: number,
		field: keyof Omit<SkillOptionFormRow, 'rowId' | 'id'>,
		value: string
	) {
		skillOptionGroups = skillOptionGroups.map((group, nextGroupIndex) =>
			nextGroupIndex === groupIndex
				? {
						...group,
						options: group.options.map((option, nextOptionIndex) =>
							nextOptionIndex === optionIndex ? { ...option, [field]: value } : option
						)
					}
				: group
		);
	}

	function createSkillOptionGroupFormRow(group: WorkduckSkillOptionGroup) {
		return {
			rowId: createFormRowId('skill-option-group'),
			id: group.id,
			label: group.label,
			description: group.description,
			selectionMode: group.selectionMode,
			options: group.options.map((option) => ({
				rowId: createFormRowId('skill-option'),
				id: option.id,
				label: option.label,
				description: option.description
			}))
		} satisfies SkillOptionGroupFormRow;
	}

	function createSkillOptionGroupsFromForm(
		groups: readonly SkillOptionGroupFormRow[]
	): readonly WorkduckSkillOptionGroup[] {
		return groups
			.map((group) => {
				const label = group.label.trim();
				const options = group.options
					.map((option) => ({
						id: option.id,
						label: option.label.trim(),
						description: option.description.trim()
					}))
					.filter((option) => option.id.length > 0 && option.label.length > 0);

				return {
					id: group.id,
					label,
					description: group.description.trim(),
					selectionMode: group.selectionMode,
					options
				};
			})
			.filter((group) => group.id.length > 0 && group.label.length > 0 && group.options.length > 0);
	}

	function createSkillFormValidationErrors() {
		const errors: string[] = [];

		if (skillOptionGroups.length > SKILL_OPTION_GROUPS_MAX_COUNT) {
			errors.push(
				messages.skills.optionGroups.groupLimit.replace(
					'{max}',
					SKILL_OPTION_GROUPS_MAX_COUNT.toString()
				)
			);
		}

		for (const [groupIndex, group] of skillOptionGroups.entries()) {
			const groupNumber = (groupIndex + 1).toString();

			if (group.label.trim().length === 0) {
				errors.push(messages.skills.optionGroups.groupNameRequired.replace('{index}', groupNumber));
			}

			if (group.options.length === 0) {
				errors.push(messages.skills.optionGroups.optionRequired.replace('{index}', groupNumber));
			}

			if (group.options.length > SKILL_OPTIONS_PER_GROUP_MAX_COUNT) {
				errors.push(
					messages.skills.optionGroups.optionLimit
						.replace('{index}', groupNumber)
						.replace('{max}', SKILL_OPTIONS_PER_GROUP_MAX_COUNT.toString())
				);
			}

			for (const [optionIndex, option] of group.options.entries()) {
				if (option.label.trim().length === 0) {
					errors.push(
						messages.skills.optionGroups.optionNameRequired
							.replace('{groupIndex}', groupNumber)
							.replace('{optionIndex}', (optionIndex + 1).toString())
					);
				}
			}
		}

		return errors;
	}

	function createStableFormRecordId(prefix: string) {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return `${prefix}-${crypto.randomUUID()}`;
		}

		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}

	function createFormRowId(prefix: string) {
		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function formatCountLabel(current: number, max: number) {
		return messages.skills.optionGroups.countLabel
			.replace('{current}', current.toString())
			.replace('{max}', max.toString());
	}

	async function countQueueFilesReferencingSkill(skillId: string) {
		if (workspace.path.length === 0) {
			return 0;
		}

		const listResult = await listQueueFiles(workspace.path);

		if (!listResult.ok) {
			return 0;
		}

		const readResults = await Promise.all(
			listResult.files.map((file) => readQueueFile(workspace.path, file.relativePath))
		);

		return readResults.filter(
			(result) => result.ok && readQueueArtifactSkillIds(result.content).includes(skillId)
		).length;
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
			{#each displaySkills as skill (skill.id)}
				<EntityCard
					title={getSkillDisplayName(skill)}
					kind={messages.common.skill}
					description={getSkillDisplayDescription(skill)}
					selected={selectedSkill?.id === skill.id}
					onSelect={() => selectSkill(skill)}
				/>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedSkill !== null}
			<DetailCard title={getSkillDisplayName(selectedSkill)} kind={messages.common.skill}>
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
					{#if selectedSkill.optionGroups.length > 0}
						<div>
							<dt>{messages.skills.optionGroups.title}</dt>
							<dd>
								<div class="workduck-skill-option-preview-list">
									{#each selectedSkill.optionGroups as group (group.id)}
										<div class="workduck-skill-option-preview-group">
											<strong>{group.label}</strong>
											<span>
												{group.options.map((option) => option.label).join(', ')}
											</span>
										</div>
									{/each}
								</div>
							</dd>
						</div>
					{/if}
				</dl>

				{#snippet actions()}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={copySelectedSkillForEditing}
					>
						{messages.skills.copySkill}
					</button>
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={editSelectedSkill}
					>
						{messages.common.edit}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={isRemovingSkill}
						onclick={() => void handleRemoveSelectedSkill()}
					>
						{messages.common.remove}
					</button>
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if skillError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createSkillErrorMessage(skillError)}</p>
		{/if}

		<StatusToast message={statusMessage} />
	{/snippet}
</EntityWorkbench>

{#if isSkillFormOpen}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget && !isSavingSkill) {
			clearSkillForm();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog workduck-skill-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="skill-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleSkillSubmit}>
				<h2 id="skill-dialog-title" class="workduck-dialog-title">
					{editingSkillId === null ? messages.skills.newSkill : messages.skills.editSkill}
				</h2>

				<div class="workduck-skill-dialog-layout">
					<div class="workduck-skill-dialog-main">
						<label class="workduck-form-field" for="skill-name">
							<span>{messages.common.name}</span>
							<input
								id="skill-name"
								class="workduck-input"
								type="text"
								bind:value={skillName}
								maxlength={SKILL_NAME_MAX_LENGTH}
								autocomplete="off"
								disabled={isSavingSkill}
							/>
							<span class="workduck-form-field-meta">
								{formatCountLabel(skillName.length, SKILL_NAME_MAX_LENGTH)}
							</span>
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
								maxlength={SKILL_DESCRIPTION_MAX_LENGTH}
								autocomplete="off"
								disabled={isSavingSkill}
							/>
							<span class="workduck-form-field-meta">
								{formatCountLabel(skillDescription.length, SKILL_DESCRIPTION_MAX_LENGTH)}
							</span>
						</label>

						<label class="workduck-form-field" for="skill-instructions">
							<span>{messages.common.instructions}</span>
							<textarea
								id="skill-instructions"
								class="workduck-input workduck-project-description-input"
								bind:value={skillInstructions}
								maxlength={SKILL_INSTRUCTIONS_MAX_LENGTH}
								disabled={isSavingSkill}
							></textarea>
							<span class="workduck-form-field-meta">
								{formatCountLabel(skillInstructions.length, SKILL_INSTRUCTIONS_MAX_LENGTH)}
							</span>
						</label>
					</div>

					<aside class="workduck-skill-dialog-side" aria-labelledby="skill-option-groups-title">
						<div class="workduck-skill-side-header">
							<div class="workduck-skill-side-heading">
								<strong id="skill-option-groups-title">{messages.skills.optionGroups.title}</strong>
								<span>{messages.skills.optionGroups.description}</span>
							</div>
							<button
								class="workduck-button workduck-button-secondary workduck-vote-option-add-button"
								type="button"
								disabled={isSavingSkill || skillOptionGroups.length >= SKILL_OPTION_GROUPS_MAX_COUNT}
								onclick={addSkillOptionGroup}
							>
								{messages.skills.optionGroups.addGroup}
							</button>
						</div>
						<span class="workduck-form-field-meta">
							{formatCountLabel(skillOptionGroups.length, SKILL_OPTION_GROUPS_MAX_COUNT)}
						</span>

						{#if skillOptionGroups.length === 0}
							<span class="workduck-multi-select-empty">
								{messages.skills.optionGroups.empty}
							</span>
						{:else}
							<div class="workduck-skill-option-group-list">
								{#each skillOptionGroups as group, index (group.rowId)}
									<div class="workduck-skill-option-group-row">
										<div class="workduck-work-order-dialog-compact-grid">
											<label class="workduck-form-field" for={`skill-option-group-label-${group.rowId}`}>
												<span>{messages.skills.optionGroups.groupName}</span>
												<input
													id={`skill-option-group-label-${group.rowId}`}
													class="workduck-input"
													type="text"
													value={group.label}
													maxlength={SKILL_OPTION_LABEL_MAX_LENGTH}
													disabled={isSavingSkill}
													oninput={(event) =>
														updateSkillOptionGroup(index, 'label', event.currentTarget.value)}
												/>
												<span class="workduck-form-field-meta">
													{formatCountLabel(group.label.length, SKILL_OPTION_LABEL_MAX_LENGTH)}
												</span>
											</label>

											<label class="workduck-form-field" for={`skill-option-group-mode-${group.rowId}`}>
												<span>{messages.skills.optionGroups.selectionMode}</span>
												<select
													id={`skill-option-group-mode-${group.rowId}`}
													class="workduck-select"
													value={group.selectionMode}
													disabled={isSavingSkill}
													onchange={(event) =>
														updateSkillOptionGroup(
															index,
															'selectionMode',
															event.currentTarget.value
														)}
												>
													<option value="single">{messages.skills.optionGroups.single}</option>
													<option value="multiple">{messages.skills.optionGroups.multiple}</option>
												</select>
											</label>
										</div>

										<label class="workduck-form-field" for={`skill-option-group-description-${group.rowId}`}>
											<span>{messages.common.description}</span>
											<input
												id={`skill-option-group-description-${group.rowId}`}
												class="workduck-input"
												type="text"
												value={group.description}
												maxlength={SKILL_OPTION_DESCRIPTION_MAX_LENGTH}
												disabled={isSavingSkill}
												oninput={(event) =>
													updateSkillOptionGroup(index, 'description', event.currentTarget.value)}
											/>
											<span class="workduck-form-field-meta">
												{formatCountLabel(
													group.description.length,
													SKILL_OPTION_DESCRIPTION_MAX_LENGTH
												)}
											</span>
										</label>

										<div class="workduck-skill-option-editor">
											<div class="workduck-vote-option-header">
												<span>{messages.skills.optionGroups.options}</span>
												<div class="workduck-skill-option-editor-actions">
													<span class="workduck-form-field-meta">
														{formatCountLabel(group.options.length, SKILL_OPTIONS_PER_GROUP_MAX_COUNT)}
													</span>
													<button
														class="workduck-button workduck-button-secondary workduck-vote-option-add-button"
														type="button"
														disabled={isSavingSkill || group.options.length >= SKILL_OPTIONS_PER_GROUP_MAX_COUNT}
														onclick={() => addSkillOption(index)}
													>
														{messages.skills.optionGroups.addOption}
													</button>
												</div>
											</div>

											{#if group.options.length === 0}
												<span class="workduck-multi-select-empty">
													{messages.skills.optionGroups.noOptions}
												</span>
											{:else}
												<div class="workduck-skill-option-row-list">
													{#each group.options as option, optionIndex (option.rowId)}
														<div class="workduck-skill-option-row">
															<label
																class="workduck-form-field"
																for={`skill-option-label-${option.rowId}`}
															>
																<span>{messages.skills.optionGroups.optionName}</span>
																<input
																	id={`skill-option-label-${option.rowId}`}
																	class="workduck-input"
																	type="text"
																	value={option.label}
																	maxlength={SKILL_OPTION_LABEL_MAX_LENGTH}
																	disabled={isSavingSkill}
																	oninput={(event) =>
																		updateSkillOption(
																			index,
																			optionIndex,
																			'label',
																			event.currentTarget.value
																		)}
																/>
															</label>
															<label
																class="workduck-form-field"
																for={`skill-option-description-${option.rowId}`}
															>
																<span>{messages.skills.optionGroups.optionDescription}</span>
																<input
																	id={`skill-option-description-${option.rowId}`}
																	class="workduck-input"
																	type="text"
																	value={option.description}
																	maxlength={SKILL_OPTION_DESCRIPTION_MAX_LENGTH}
																	disabled={isSavingSkill}
																	oninput={(event) =>
																		updateSkillOption(
																			index,
																			optionIndex,
																			'description',
																			event.currentTarget.value
																		)}
																/>
															</label>
															<button
																class="workduck-button workduck-button-danger workduck-skill-option-remove-button"
																type="button"
																disabled={isSavingSkill}
																aria-label={messages.skills.optionGroups.removeOption}
																title={messages.skills.optionGroups.removeOption}
																onclick={() => removeSkillOption(index, optionIndex)}
															>
																{messages.common.remove}
															</button>
														</div>
													{/each}
												</div>
											{/if}
										</div>

										<button
											class="workduck-button workduck-button-danger"
											type="button"
											disabled={isSavingSkill}
											onclick={() => removeSkillOptionGroup(index)}
										>
											{messages.skills.optionGroups.removeGroup}
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</aside>
				</div>

				{#if skillFormValidationErrors.length > 0}
					<div class="workduck-skill-form-errors" aria-live="polite">
						{#each skillFormValidationErrors as validationError}
							<p class="workduck-inline-error">{validationError}</p>
						{/each}
					</div>
				{/if}

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
