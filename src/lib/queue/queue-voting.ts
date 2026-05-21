export type WorkduckQueueTaskKind = 'instruction' | 'vote';
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
	readonly confidence: number | null;
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
	readonly averageConfidence: number | null;
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

export function createVoteTaskPrompt(spec: WorkduckQueueVoteSpec) {
	const criteria =
		spec.criteria.length > 0
			? spec.criteria.map((criterion) => `- ${criterion}`).join('\n')
			: '- Overall fit for the question';
	const options = spec.options
		.map((option) => {
			const description =
				option.description === undefined || option.description.length === 0
					? ''
					: ` - ${option.description}`;

			return `- ${option.id}: ${option.label}${description}`;
		})
		.join('\n');

	return [
		'This is a selection vote. Choose exactly one option.',
		'Return only one JSON object. Do not wrap it in Markdown.',
		'Use exactly one of the provided choiceId values.',
		'JSON shape:',
		'{"choiceId":"option-id","reason":"short reason","risks":["risk if any"]}',
		'',
		`Question: ${spec.question}`,
		'',
		'Options:',
		options,
		'',
		'Criteria:',
		criteria
	].join('\n');
}

export function parseVoteBallot(
	content: string,
	spec: WorkduckQueueVoteSpec
): WorkduckQueueVoteBallot {
	const parsed = parseFirstJsonRecord(content);

	if (parsed === null) {
		return {
			choiceId: '',
			confidence: null,
			reason: '',
			risks: [],
			parseStatus: 'unparsed'
		};
	}

	const choiceId = readOptionalText(parsed.choiceId);
	const confidence = normalizeConfidenceScore(parsed.confidence);
	const reason = readOptionalText(parsed.reason);
	const risks = readTextArray(parsed.risks);
	const hasValidChoice = spec.options.some((option) => option.id === choiceId);

	return {
		choiceId,
		confidence,
		reason,
		risks,
		parseStatus: hasValidChoice ? 'parsed' : 'invalid-choice'
	};
}

export function createVoteAggregate(
	results: readonly { readonly vote?: WorkduckQueueVoteResult }[]
): WorkduckQueueVoteAggregate | null {
	const firstVote = results.find((result) => result.vote !== undefined)?.vote;

	if (firstVote === undefined) {
		return null;
	}

	const confidenceSums = new Map<string, number>();
	const confidenceCounts = new Map<string, number>();
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

		if (vote.ballot.confidence !== null) {
			confidenceSums.set(
				vote.ballot.choiceId,
				(confidenceSums.get(vote.ballot.choiceId) ?? 0) + vote.ballot.confidence
			);
			confidenceCounts.set(
				vote.ballot.choiceId,
				(confidenceCounts.get(vote.ballot.choiceId) ?? 0) + 1
			);
		}
	}

	const optionCounts = firstVote.options.map((option) => {
		const count = counts.get(option.id) ?? 0;
		const confidenceCount = confidenceCounts.get(option.id) ?? 0;
		const averageConfidence =
			confidenceCount === 0
				? null
				: Math.round(((confidenceSums.get(option.id) ?? 0) / confidenceCount) * 10) / 10;

		return {
			option,
			count,
			averageConfidence
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

function parseFirstJsonRecord(content: string): Record<string, unknown> | null {
	const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/iu.exec(content);
	const rawJson = fencedMatch?.[1]?.trim() ?? extractJsonObjectText(content);

	if (rawJson.length === 0) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(rawJson);

		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function extractJsonObjectText(content: string) {
	const start = content.indexOf('{');
	const end = content.lastIndexOf('}');

	if (start === -1 || end === -1 || end <= start) {
		return '';
	}

	return content.slice(start, end + 1).trim();
}

function normalizeConfidenceScore(value: unknown) {
	const numericValue = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(numericValue)) {
		return null;
	}

	return Math.min(9, Math.max(1, Math.round(numericValue)));
}

function readTextArray(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map(readOptionalText).filter((item) => item.length > 0);
}

function readOptionalText(value: unknown) {
	return typeof value === 'string' ? normalizeInlineText(value) : '';
}

function normalizeInlineText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
