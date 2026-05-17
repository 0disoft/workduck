export const AGENT_EVALUATION_SCORE_MIN = 1;
export const AGENT_EVALUATION_SCORE_MAX = 9;

export const agentEvaluationCriteriaDefinitions = [
	{ id: 'problemUnderstanding' },
	{ id: 'logicalValidity' },
	{ id: 'practicalFeasibility' },
	{ id: 'creativeInsight' },
	{ id: 'riskDetection' }
] as const;

export type AgentEvaluationCriterionId = (typeof agentEvaluationCriteriaDefinitions)[number]['id'];

export interface AgentEvaluationCriterionAggregate {
	readonly count: number;
	readonly scoreSum: number;
}

export type AgentEvaluationCriteriaAggregate = Readonly<
	Record<AgentEvaluationCriterionId, AgentEvaluationCriterionAggregate>
>;

export interface AgentEvaluationSummary {
	readonly totalCount: number;
	readonly criteria: AgentEvaluationCriteriaAggregate;
}

export function createEmptyAgentEvaluationSummary(): AgentEvaluationSummary {
	return {
		totalCount: 0,
		criteria: agentEvaluationCriteriaDefinitions.reduce(
			(criteria, definition) => ({
				...criteria,
				[definition.id]: {
					count: 0,
					scoreSum: 0
				}
			}),
			{} as Record<AgentEvaluationCriterionId, AgentEvaluationCriterionAggregate>
		)
	};
}

export function normalizeAgentEvaluationSummary(value: unknown): AgentEvaluationSummary {
	const input = isObjectRecord(value) ? value : {};
	const rawCriteria = isObjectRecord(input.criteria) ? input.criteria : {};
	const criteria = { ...createEmptyAgentEvaluationSummary().criteria } as Record<
		AgentEvaluationCriterionId,
		AgentEvaluationCriterionAggregate
	>;

	for (const definition of agentEvaluationCriteriaDefinitions) {
		const rawCriterionValue = rawCriteria[definition.id];
		const rawCriterion = isObjectRecord(rawCriterionValue) ? rawCriterionValue : {};
		const count = normalizeCount(rawCriterion.count);
		const scoreSum = normalizeScoreSum(rawCriterion.scoreSum, count);

		criteria[definition.id] = {
			count,
			scoreSum
		};
	}

	return {
		totalCount: normalizeTotalCount(input.totalCount, criteria),
		criteria
	};
}

export function hasAgentEvaluations(summary: AgentEvaluationSummary) {
	return agentEvaluationCriteriaDefinitions.some(
		(definition) => summary.criteria[definition.id].count > 0
	);
}

export function getAgentEvaluationAverage(
	summary: AgentEvaluationSummary,
	criterionId: AgentEvaluationCriterionId
) {
	const criterion = summary.criteria[criterionId];

	if (criterion.count === 0) {
		return null;
	}

	return criterion.scoreSum / criterion.count;
}

function normalizeTotalCount(
	value: unknown,
	criteria: Record<AgentEvaluationCriterionId, AgentEvaluationCriterionAggregate>
) {
	const explicitCount = normalizeCount(value);
	const largestCriterionCount = Math.max(
		0,
		...agentEvaluationCriteriaDefinitions.map((definition) => criteria[definition.id].count)
	);

	return Math.max(explicitCount, largestCriterionCount);
}

function normalizeCount(value: unknown) {
	const numericValue = typeof value === 'number' ? value : Number.parseInt(readTrimmedString(value), 10);

	if (!Number.isFinite(numericValue)) {
		return 0;
	}

	return Math.max(0, Math.trunc(numericValue));
}

function normalizeScoreSum(value: unknown, count: number) {
	const numericValue = typeof value === 'number' ? value : Number.parseFloat(readTrimmedString(value));

	if (!Number.isFinite(numericValue) || count === 0) {
		return 0;
	}

	return Math.min(
		Math.max(0, numericValue),
		count * AGENT_EVALUATION_SCORE_MAX
	);
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
