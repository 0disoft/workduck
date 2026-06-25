import type { WorkduckSkillRecord } from '$lib/skills/skill-registry';

import {
	defaultQueueResponseFormat,
	defaultQueueResponseLanguage,
	defaultQueueWorkPriority,
	normalizeQueueResponseFormat,
	normalizeQueueResponseLanguage,
	normalizeQueueTaskKind,
	normalizeQueueWorkPriority,
	type WorkduckQueueResponseFormat,
	type WorkduckQueueResponseLanguage,
	type WorkduckQueueWorkOrderTask,
	type WorkduckQueueWorkPriority
} from './queue-artifacts';
import {
	createManualVoteFieldState,
	createManualVoteOptions,
	updateSelectedRecordIds
} from './queue-panel-helpers';
import type { ManualVoteOptionInput } from './queue-panel-types';
import type { WorkduckQueueTaskKind } from './queue-voting';

export interface QueuePanelManualWorkOrderDraft {
	readonly title: string;
	readonly body: string;
	readonly priority: WorkduckQueueWorkPriority;
	readonly responseLanguage: WorkduckQueueResponseLanguage;
	readonly responseFormat: WorkduckQueueResponseFormat;
	readonly kind: WorkduckQueueTaskKind;
	readonly voteOptions: readonly ManualVoteOptionInput[];
	readonly voteCriteriaInput: string;
	readonly selectedSkillIds: string[];
	readonly selectedSkillOptionIds: string[];
	readonly selectedAgentIds: string[];
	readonly selectedProjectIds: string[];
	readonly selectedRepositoryIds: string[];
	readonly selectedReferenceIds: string[];
}

export function createEmptyManualWorkOrderDraft(input: {
	readonly responseLanguage?: WorkduckQueueResponseLanguage;
} = {}): QueuePanelManualWorkOrderDraft {
	const voteFields = createManualVoteFieldState(undefined);

	return {
		title: '',
		body: '',
		priority: defaultQueueWorkPriority,
		responseLanguage: input.responseLanguage ?? defaultQueueResponseLanguage,
		responseFormat: defaultQueueResponseFormat,
		kind: 'instruction',
		voteOptions: voteFields.options,
		voteCriteriaInput: voteFields.criteriaInput,
		selectedSkillIds: [],
		selectedSkillOptionIds: [],
		selectedAgentIds: [],
		selectedProjectIds: [],
		selectedRepositoryIds: [],
		selectedReferenceIds: []
	};
}

export function createManualWorkOrderDraftFromTask(
	task: WorkduckQueueWorkOrderTask
): QueuePanelManualWorkOrderDraft {
	const voteFields = createManualVoteFieldState(task.vote);

	return {
		title: task.title,
		body: task.body,
		priority: normalizeQueueWorkPriority(task.priority),
		responseLanguage: normalizeQueueResponseLanguage(task.responseLanguage),
		responseFormat: normalizeQueueResponseFormat(task.responseFormat),
		kind: normalizeQueueTaskKind(task.kind),
		voteOptions: voteFields.options,
		voteCriteriaInput: voteFields.criteriaInput,
		selectedSkillIds: [...(task.skillIds ?? [])],
		selectedSkillOptionIds: [],
		selectedAgentIds: [...(task.agentIds ?? [])],
		selectedProjectIds: [...(task.projectIds ?? [])],
		selectedRepositoryIds: [...(task.repositoryIds ?? [])],
		selectedReferenceIds: [...(task.referenceIds ?? [])]
	};
}

export function updateManualWorkOrderSkillSelection(input: {
	readonly selectedSkillIds: readonly string[];
	readonly selectedSkillOptionIds: readonly string[];
	readonly skillId: string;
	readonly isSelected: boolean;
	readonly kind: WorkduckQueueTaskKind;
	readonly skills: readonly WorkduckSkillRecord[];
	readonly responseFormat: WorkduckQueueResponseFormat;
}): {
	readonly selectedSkillIds: string[];
	readonly selectedSkillOptionIds: string[];
	readonly responseFormat: WorkduckQueueResponseFormat;
} {
	const selectedSkillIds = updateSelectedRecordIds(
		input.selectedSkillIds,
		input.skillId,
		input.isSelected
	);
	const selectedSkillOptionIds = input.isSelected
		? [...input.selectedSkillOptionIds]
		: input.selectedSkillOptionIds.filter(
				(optionId) => !optionId.startsWith(`${input.skillId}:`)
			);

	return {
		selectedSkillIds,
		selectedSkillOptionIds,
		responseFormat: chooseManualWorkOrderResponseFormatForSkills({
			kind: input.kind,
			skills: input.skills,
			selectedSkillIds,
			responseFormat: input.responseFormat
		})
	};
}

export function updateManualWorkOrderRecordSelection(
	selectedIds: readonly string[],
	recordId: string,
	isSelected: boolean
) {
	return updateSelectedRecordIds(selectedIds, recordId, isSelected);
}

export function chooseManualWorkOrderResponseFormatForSkills(input: {
	readonly kind: WorkduckQueueTaskKind;
	readonly skills: readonly WorkduckSkillRecord[];
	readonly selectedSkillIds: readonly string[];
	readonly responseFormat: WorkduckQueueResponseFormat;
}): WorkduckQueueResponseFormat {
	if (input.kind !== 'instruction') {
		return input.responseFormat;
	}

	const selectedSkillIdSet = new Set(input.selectedSkillIds);
	const selectedSkills = input.skills.filter((skill) => selectedSkillIdSet.has(skill.id));

	if (selectedSkills.some((skill) => skill.outputTypes.includes('revision'))) {
		return 'revision-draft';
	}

	if (selectedSkills.some((skill) => skill.outputTypes.includes('writing'))) {
		return 'writing-draft';
	}

	return input.responseFormat;
}

export function updateManualSkillOptionSelection(input: {
	readonly selectedSkillOptionIds: readonly string[];
	readonly skillId: string;
	readonly groupId: string;
	readonly optionId: string;
	readonly selectionMode: 'single' | 'multiple';
	readonly isSelected: boolean;
}): string[] {
	const selectionId = createManualSkillOptionSelectionId(
		input.skillId,
		input.groupId,
		input.optionId
	);

	if (input.selectionMode === 'single') {
		const groupPrefix = `${input.skillId}:${input.groupId}:`;

		return input.isSelected
			? [
					...input.selectedSkillOptionIds.filter(
						(selectedOptionId) => !selectedOptionId.startsWith(groupPrefix)
					),
					selectionId
				]
			: input.selectedSkillOptionIds.filter((selectedOptionId) => selectedOptionId !== selectionId);
	}

	return updateSelectedRecordIds(input.selectedSkillOptionIds, selectionId, input.isSelected);
}

export function addManualVoteOption(
	options: readonly ManualVoteOptionInput[]
): readonly ManualVoteOptionInput[] {
	if (options.length >= 50) {
		return options;
	}

	return createManualVoteOptions(options.length + 1, options);
}

export function removeManualVoteOption(
	options: readonly ManualVoteOptionInput[],
	index: number
): readonly ManualVoteOptionInput[] {
	if (options.length <= 2) {
		return options;
	}

	const nextOptions = options
		.filter((_, optionIndex) => optionIndex !== index)
		.map(({ id, label, description }) => ({ id, label, description }));

	return createManualVoteOptions(nextOptions.length, nextOptions);
}

export function updateManualVoteOption(input: {
	readonly options: readonly ManualVoteOptionInput[];
	readonly index: number;
	readonly field: 'label' | 'description';
	readonly value: string;
}): readonly ManualVoteOptionInput[] {
	return input.options.map((option, optionIndex) =>
		optionIndex === input.index ? { ...option, [input.field]: input.value } : option
	);
}

export function createManualWorkOrderResolvedTitle(input: {
	readonly title: string;
	readonly body: string;
	readonly kind: WorkduckQueueTaskKind;
	readonly directMessageLabel: string;
}) {
	const explicitTitle = input.title.trim();

	if (input.kind !== 'direct-message') {
		return explicitTitle;
	}

	const firstLine = input.body
		.split(/\r?\n/u)
		.map((line) => line.trim().replace(/\s+/g, ' '))
		.find((line) => line.length > 0);

	if (firstLine === undefined) {
		return '';
	}

	const summary = firstLine.length <= 48 ? firstLine : `${firstLine.slice(0, 45).trimEnd()}...`;

	return `${input.directMessageLabel}: ${summary}`;
}

export function createManualWorkOrderBodyWithSkillOptions(input: {
	readonly body: string;
	readonly skillOptionsAreVisible: boolean;
	readonly selectedSkillOptionIds: readonly string[];
	readonly skills: readonly WorkduckSkillRecord[];
	readonly skillOptionsTitle: string;
	readonly getSkillDisplayName: (skill: WorkduckSkillRecord) => string;
}) {
	if (!input.skillOptionsAreVisible || input.selectedSkillOptionIds.length === 0) {
		return input.body;
	}

	const selectedOptionSet = new Set(input.selectedSkillOptionIds);
	const optionLines = input.skills.flatMap((skill) =>
		skill.optionGroups.flatMap((group) =>
			group.options
				.filter((option) =>
					selectedOptionSet.has(
						createManualSkillOptionSelectionId(skill.id, group.id, option.id)
					)
				)
				.map((option) => {
					const optionDescription =
						option.description.length > 0 ? ` - ${option.description}` : '';

					return `- ${input.getSkillDisplayName(skill)} / ${group.label}: ${option.label}${optionDescription}`;
				})
		)
	);

	if (optionLines.length === 0) {
		return input.body;
	}

	return [input.body.trimEnd(), '', `${input.skillOptionsTitle}:`, ...optionLines].join('\n');
}

export function createManualSkillOptionSelectionId(
	skillId: string,
	groupId: string,
	optionId: string
) {
	return `${skillId}:${groupId}:${optionId}`;
}
