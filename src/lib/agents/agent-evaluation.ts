import { isObjectRecord } from '$lib/shared/object-record';
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

export interface AgentEvaluationDelegationPromptInput {
	readonly workspacePath: string;
	readonly agentId: string;
	readonly agentName: string;
	readonly taskTitle: string;
	readonly taskBody: string;
	readonly response: string;
}

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

export type AgentEvaluationScores = Readonly<Record<AgentEvaluationCriterionId, number>>;

export const AGENT_EVALUATION_DELEGATION_INSTRUCTIONS = `Evaluate one Workduck agent response using this five-criterion rubric. Score every criterion with an integer from 1 to 9.

Criteria:
- problemUnderstanding: Did the response understand the user's real intent, constraints, priorities, and hidden context?
- logicalValidity: Are the reasons, conditions, conclusion, and counterpoints logically stable?
- practicalFeasibility: Can the answer be acted on under realistic resource, time, operational, and implementation constraints?
- creativeInsight: Does it add useful framing, a better option, or a non-obvious way to see the problem?
- riskDetection: Does it detect failure paths, hidden costs, second-order effects, and mitigations?

Score anchors:
- 1: Misunderstands the task, gives unrelated reasoning, is not actionable, repeats generic text, or misses almost all risks.
- 3: Answers only the surface request, uses weak evidence, reflects few real constraints, lists familiar ideas, or misses major failure causes.
- 5: Covers the basic intent and constraints, has no major logical error, can work after some revision, is ordinary but usable, and notices common risks.
- 7: Separates intent, constraints, and priorities well; links evidence to judgment; is ready to test; usefully recombines known approaches; and catches serious risks.
- 9: Corrects bad premises, gives a compact and hard-to-refute conclusion, turns it into an immediately executable plan, changes the decision frame, and names failure paths with blockers.

Rules:
- Use only the supplied task and response. Do not invent external facts or reward claims that were not supported.
- Do not reward length by itself. Reward useful detail, correct constraints, and actionable judgment.
- If evidence is missing, score that criterion conservatively.
- Return the five scores as JSON, then save them with the Workduck CLI command shown in the prompt. The command records the agent score and also updates the linked persona score when the agent has a persona.`;

export function createAgentEvaluationDelegationPrompt(input: AgentEvaluationDelegationPromptInput) {
	const cliCommand = [
		'workduck',
		'agent',
		'evaluate',
		quoteCliArgument(input.agentId),
		'--workspace',
		quoteCliArgument(input.workspacePath),
		'--problem-understanding <1-9>',
		'--logical-validity <1-9>',
		'--practical-feasibility <1-9>',
		'--creative-insight <1-9>',
		'--risk-detection <1-9>'
	].join(' ');

	return [
		AGENT_EVALUATION_DELEGATION_INSTRUCTIONS,
		'',
		'Output JSON shape:',
		'{',
		'  "problemUnderstanding": 5,',
		'  "logicalValidity": 5,',
		'  "practicalFeasibility": 5,',
		'  "creativeInsight": 5,',
		'  "riskDetection": 5',
		'}',
		'',
		'After choosing the scores, run this command with the chosen numbers:',
		cliCommand,
		'',
		`Workspace: ${input.workspacePath}`,
		`Agent ID: ${input.agentId}`,
		`Agent name: ${input.agentName}`,
		`Task title: ${input.taskTitle}`,
		'',
		'Task content:',
		input.taskBody,
		'',
		'Agent response:',
		input.response
	].join('\n');
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

export function getAgentEvaluationOverallAverage(summary: AgentEvaluationSummary) {
	const normalizedSummary = normalizeAgentEvaluationSummary(summary);
	let totalCount = 0;
	let totalScoreSum = 0;

	for (const definition of agentEvaluationCriteriaDefinitions) {
		const criterion = normalizedSummary.criteria[definition.id];

		totalCount += criterion.count;
		totalScoreSum += criterion.scoreSum;
	}

	if (totalCount === 0) {
		return null;
	}

	return totalScoreSum / totalCount;
}

export function createDefaultAgentEvaluationScores(): AgentEvaluationScores {
	return agentEvaluationCriteriaDefinitions.reduce(
		(scores, definition) => ({
			...scores,
			[definition.id]: 5
		}),
		{} as Record<AgentEvaluationCriterionId, number>
	);
}

export function addAgentEvaluationScores(
	summary: AgentEvaluationSummary,
	scores: AgentEvaluationScores
): AgentEvaluationSummary {
	const normalizedSummary = normalizeAgentEvaluationSummary(summary);
	const criteria = { ...normalizedSummary.criteria } as Record<
		AgentEvaluationCriterionId,
		AgentEvaluationCriterionAggregate
	>;

	for (const definition of agentEvaluationCriteriaDefinitions) {
		const criterion = normalizedSummary.criteria[definition.id];
		const score = normalizeScore(scores[definition.id]);

		criteria[definition.id] = {
			count: criterion.count + 1,
			scoreSum: criterion.scoreSum + score
		};
	}

	return {
		totalCount: normalizedSummary.totalCount + 1,
		criteria
	};
}

export function normalizeAgentEvaluationScores(value: unknown): AgentEvaluationScores {
	const input = isObjectRecord(value) ? value : {};
	const defaultScores = createDefaultAgentEvaluationScores();

	return agentEvaluationCriteriaDefinitions.reduce(
		(scores, definition) => ({
			...scores,
			[definition.id]: normalizeScore(input[definition.id] ?? defaultScores[definition.id])
		}),
		{} as Record<AgentEvaluationCriterionId, number>
	);
}

export function normalizeAgentEvaluationScore(value: unknown) {
	return normalizeScore(value);
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

function normalizeScore(value: unknown) {
	const numericValue = typeof value === 'number' ? value : Number.parseInt(readTrimmedString(value), 10);

	if (!Number.isFinite(numericValue)) {
		return Math.ceil((AGENT_EVALUATION_SCORE_MIN + AGENT_EVALUATION_SCORE_MAX) / 2);
	}

	return Math.min(
		Math.max(AGENT_EVALUATION_SCORE_MIN, Math.trunc(numericValue)),
		AGENT_EVALUATION_SCORE_MAX
	);
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function quoteCliArgument(value: string) {
	if (value.length === 0) {
		return "''";
	}

	return `'${value.replaceAll("'", `'"'"'`)}'`;
}
