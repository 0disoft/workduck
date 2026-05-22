import type { ManualVoteOptionInput, QueueCardEntry } from './queue-panel-types';
import type { ReferenceRecord } from '$lib/references/reference-registry';
import {
	createVoteSpec,
	formatVoteCriteriaInput,
	type WorkduckQueueVoteOption,
	type WorkduckQueueVoteSpec
} from './queue-voting';
import type {
	WorkduckQueueResponseLanguage
} from './queue-artifacts';
import type { WorkduckQueueTaskKind } from './queue-voting';

export function createQueueFilesSignature(queueFiles: readonly QueueCardEntry[]) {
	return queueFiles.map((file) => `${file.relativePath}:${file.kind}`).join('\n');
}

export function createSelectionSummary(
	selectedIds: readonly string[],
	emptyLabel: string,
	selectedCountLabel: string,
	getLabel: (id: string) => string
) {
	if (selectedIds.length === 0) {
		return emptyLabel;
	}

	if (selectedIds.length === 1) {
		const selectedId = selectedIds[0];

		return selectedId === undefined ? emptyLabel : getLabel(selectedId);
	}

	return selectedCountLabel.replace('{count}', selectedIds.length.toString());
}

export function createManualVoteOptions(
	count: number,
	sourceOptions: readonly (ManualVoteOptionInput | WorkduckQueueVoteOption)[] = []
): readonly ManualVoteOptionInput[] {
	return Array.from({ length: count }, (_, index) =>
		createManualVoteOption(index, sourceOptions[index])
	);
}

export function createManualVoteOption(
	index: number,
	sourceOption: ManualVoteOptionInput | WorkduckQueueVoteOption | undefined
): ManualVoteOptionInput {
	if (sourceOption === undefined) {
		return {
			rowId: `manual-vote-option-${index + 1}`,
			id: '',
			label: '',
			description: ''
		};
	}

	return {
		rowId: 'rowId' in sourceOption ? sourceOption.rowId : `manual-vote-option-${index + 1}`,
		id: sourceOption.id,
		label: sourceOption.label,
		description: sourceOption.description ?? ''
	};
}

export function createManualVoteOptionCountChoices(
	defaultCounts: readonly number[],
	currentCount: number
) {
	const choices = new Set<number>(defaultCounts);
	choices.add(currentCount);

	return Array.from(choices).sort((left, right) => left - right);
}

export function normalizeManualVoteOptionCount(value: string) {
	const numericValue = Number(value);

	if (!Number.isFinite(numericValue)) {
		return 2;
	}

	return Math.max(2, Math.min(50, Math.round(numericValue)));
}

export function updateSelectedRecordIds(
	selectedIds: readonly string[],
	recordId: string,
	isSelected: boolean
) {
	const normalizedRecordId = recordId.trim();

	if (normalizedRecordId.length === 0) {
		return [...selectedIds];
	}

	if (!isSelected) {
		return selectedIds.filter((selectedId) => selectedId !== normalizedRecordId);
	}

	return selectedIds.includes(normalizedRecordId)
		? [...selectedIds]
		: [...selectedIds, normalizedRecordId];
}

export function sortReferencesForProjectSelection(
	references: readonly ReferenceRecord[],
	selectedProjectIds: readonly string[]
) {
	if (selectedProjectIds.length === 0) {
		return [...references];
	}

	const selectedProjectSet = new Set(selectedProjectIds);

	return [...references].sort((left, right) => {
		const leftRank = referenceMatchesProjectSelection(left, selectedProjectSet) ? 0 : 1;
		const rightRank = referenceMatchesProjectSelection(right, selectedProjectSet) ? 0 : 1;

		return leftRank - rightRank;
	});
}

function referenceMatchesProjectSelection(
	reference: ReferenceRecord,
	selectedProjectIds: ReadonlySet<string>
) {
	return reference.projectIds.some((projectId) => selectedProjectIds.has(projectId));
}

export function createManualVoteFieldState(vote: WorkduckQueueVoteSpec | undefined) {
	if (vote === undefined || vote.options.length === 0) {
		return {
			optionCount: 2,
			options: createManualVoteOptions(2),
			criteriaInput: formatVoteCriteriaInput(vote)
		};
	}

	const optionCount = Math.max(2, vote.options.length);

	return {
		optionCount,
		options: createManualVoteOptions(optionCount, vote.options),
		criteriaInput: formatVoteCriteriaInput(vote)
	};
}

export function createManualVoteOptionsText(options: readonly ManualVoteOptionInput[]) {
	return options
		.map((option) => {
			const label = option.label.trim();

			if (label.length === 0) {
				return '';
			}

			const id = option.id.trim();
			const description = option.description.trim();
			const labelWithId = id.length > 0 ? `${id}: ${label}` : label;

			return description.length > 0 ? `${labelWithId} - ${description}` : labelWithId;
		})
		.filter((option) => option.length > 0)
		.join('\n');
}

export function createManualWorkOrderKindInput(input: {
	readonly kind: WorkduckQueueTaskKind;
	readonly responseLanguage: WorkduckQueueResponseLanguage;
	readonly body: string;
	readonly voteOptions: readonly ManualVoteOptionInput[];
	readonly voteCriteriaInput: string;
}) {
	if (input.kind !== 'vote') {
		return {
			kind: input.kind,
			vote: null,
			responseLanguage: input.responseLanguage
		};
	}

	return {
		kind: 'vote' as const,
		responseLanguage: input.responseLanguage,
		vote: createVoteSpec({
			question: input.body,
			optionsText: createManualVoteOptionsText(input.voteOptions),
			criteriaText: input.voteCriteriaInput
		})
	};
}
