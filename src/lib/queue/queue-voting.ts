export type WorkduckQueueTaskKind = 'instruction' | 'direct-message' | 'vote';
export type WorkduckQueueVoteResponseKind = 'single-choice';
export type WorkduckQueueVoteBallotParseStatus = 'parsed' | 'invalid-choice' | 'unparsed';

export interface WorkduckQueueVoteOption {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
}

export interface WorkduckQueueVoteSpec {
	readonly question: string;
	readonly options: readonly WorkduckQueueVoteOption[];
	readonly criteria: readonly string[];
	readonly responseKind: WorkduckQueueVoteResponseKind;
}

export interface WorkduckQueueVoteBallot {
	readonly choiceId: string;
	readonly reason: string;
	readonly risks: readonly string[];
	readonly parseStatus: WorkduckQueueVoteBallotParseStatus;
}

export interface WorkduckQueueVoteResult {
	readonly question: string;
	readonly options: readonly WorkduckQueueVoteOption[];
	readonly ballot: WorkduckQueueVoteBallot;
}

export interface WorkduckQueueVoteAggregateOption {
	readonly option: WorkduckQueueVoteOption;
	readonly count: number;
}

export interface WorkduckQueueVoteAggregate {
	readonly optionCounts: readonly WorkduckQueueVoteAggregateOption[];
	readonly invalidCount: number;
	readonly totalParsedCount: number;
	readonly winnerIds: readonly string[];
}

export function createVoteSpec(input: {
	readonly question: string;
	readonly optionsText: string;
	readonly criteriaText: string;
}): WorkduckQueueVoteSpec | null {
	const question = normalizeInlineText(input.question);
	const options = normalizeVoteOptionsFromText(input.optionsText);

	if (question.length === 0 || options.length < 2) {
		return null;
	}

	return {
		question,
		options,
		criteria: normalizeVoteCriteriaFromText(input.criteriaText),
		responseKind: 'single-choice'
	};
}

export function normalizeVoteOptionsFromText(value: string): WorkduckQueueVoteOption[] {
	const options: WorkduckQueueVoteOption[] = [];
	const usedIds = new Set<string>();

	for (const line of value.split(/\r?\n/u)) {
		const normalizedLine = normalizeInlineText(line);

		if (normalizedLine.length === 0) {
			continue;
		}

		const parsed = parseVoteOptionLine(normalizedLine);
		const baseId = createVoteOptionId(parsed.idHint.length > 0 ? parsed.idHint : parsed.label);
		const id = dedupeVoteOptionId(baseId, usedIds);

		usedIds.add(id);
		options.push({
			id,
			label: parsed.label,
			...(parsed.description.length > 0 ? { description: parsed.description } : {})
		});
	}

	return options;
}

export function normalizeVoteCriteriaFromText(value: string): string[] {
	const criteria: string[] = [];

	for (const line of value.split(/\r?\n/u)) {
		const criterion = normalizeInlineText(line);

		if (criterion.length === 0 || criteria.includes(criterion)) {
			continue;
		}

		criteria.push(criterion);
	}

	return criteria;
}

export function createVoteAggregate(
	results: readonly { readonly vote?: WorkduckQueueVoteResult }[]
): WorkduckQueueVoteAggregate | null {
	const firstVote = results.find((result) => result.vote !== undefined)?.vote;

	if (firstVote === undefined) {
		return null;
	}

	const counts = new Map<string, number>();
	let invalidCount = 0;

	for (const result of results) {
		const vote = result.vote;

		if (vote === undefined || vote.ballot.parseStatus !== 'parsed') {
			if (vote !== undefined) {
				invalidCount += 1;
			}
			continue;
		}

		counts.set(vote.ballot.choiceId, (counts.get(vote.ballot.choiceId) ?? 0) + 1);
	}

	const optionCounts = firstVote.options.map((option) => {
		const count = counts.get(option.id) ?? 0;

		return {
			option,
			count
		};
	});
	const highestCount = Math.max(0, ...optionCounts.map((option) => option.count));
	const winnerIds =
		highestCount === 0
			? []
			: optionCounts
					.filter((option) => option.count === highestCount)
					.map((option) => option.option.id);

	return {
		optionCounts,
		invalidCount,
		totalParsedCount: optionCounts.reduce((sum, option) => sum + option.count, 0),
		winnerIds
	};
}

export function formatVoteOptionsInput(spec: WorkduckQueueVoteSpec | undefined) {
	if (spec === undefined) {
		return '';
	}

	return spec.options
		.map((option) => {
			const description =
				option.description === undefined || option.description.length === 0
					? ''
					: ` - ${option.description}`;

			return `${option.id}: ${option.label}${description}`;
		})
		.join('\n');
}

export function formatVoteCriteriaInput(spec: WorkduckQueueVoteSpec | undefined) {
	return spec === undefined ? '' : spec.criteria.join('\n');
}

function parseVoteOptionLine(value: string) {
	const splitMatch = /^([^:：]+)[:：]\s*(.+)$/u.exec(value);

	if (splitMatch !== null) {
		const idHint = normalizeInlineText(splitMatch[1] ?? '');
		const rest = normalizeInlineText(splitMatch[2] ?? '');
		const descriptionSplit = splitOptionDescription(rest);

		return {
			idHint,
			label: descriptionSplit.label,
			description: descriptionSplit.description
		};
	}

	const descriptionSplit = splitOptionDescription(value);

	return {
		idHint: '',
		label: descriptionSplit.label,
		description: descriptionSplit.description
	};
}

function splitOptionDescription(value: string) {
	const splitMatch = /^(.+?)\s+-\s+(.+)$/u.exec(value);

	if (splitMatch === null) {
		return { label: value, description: '' };
	}

	return {
		label: normalizeInlineText(splitMatch[1] ?? value),
		description: normalizeInlineText(splitMatch[2] ?? '')
	};
}

function dedupeVoteOptionId(baseId: string, usedIds: ReadonlySet<string>) {
	let candidate = baseId.length > 0 ? baseId : 'option';
	let index = 2;

	while (usedIds.has(candidate)) {
		candidate = `${baseId}-${index}`;
		index += 1;
	}

	return candidate;
}

function createVoteOptionId(value: string) {
	const normalized = value
		.trim()
		.toLowerCase()
		.replaceAll(/\s+/g, '-')
		.replaceAll(/[^a-z0-9가-힣_-]+/g, '')
		.replaceAll(/^-+|-+$/g, '')
		.slice(0, 40);

	return normalized.length > 0 ? normalized : 'option';
}

function normalizeInlineText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}
