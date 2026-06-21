import type {
	QueueProposalParseResult,
	QueueResultReportParseResult,
	QueueWorkOrderParseResult,
	WorkduckQueueArtifactStatus,
	WorkduckQueueExecutionAttempt,
	WorkduckQueueProposal,
	WorkduckQueueProposalOption,
	WorkduckQueueProposalRecommendation,
	WorkduckQueueResponseFormat,
	WorkduckQueueResponseLanguage,
	WorkduckQueueResultReport,
	WorkduckQueueResultReportTask,
	WorkduckQueueStructuredResponse,
	WorkduckQueueTaskEvaluation,
	WorkduckQueueWorkOrder,
	WorkduckQueueWorkOrderTask,
	WorkduckQueueWorkPriority
} from '../queue-artifacts';
import type {
	WorkduckQueueTaskKind,
	WorkduckQueueVoteResult,
	WorkduckQueueVoteSpec
} from '../queue-voting';

export function parseQueueResultReport(content: string): QueueResultReportParseResult {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch {
		return { ok: false, message: 'Report JSON could not be parsed.' };
	}

	if (!isQueueResultReport(parsed)) {
		return { ok: false, message: 'Report JSON does not match workduck.queue-result-report/v1.' };
	}

	return { ok: true, report: parsed };
}

export function parseQueueWorkOrder(content: string): QueueWorkOrderParseResult {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch {
		return { ok: false, message: 'Work-order JSON could not be parsed.' };
	}

	const normalized = normalizeQueueWorkOrderForParsing(parsed);

	if (!isQueueWorkOrder(normalized)) {
		return { ok: false, message: 'Work-order JSON does not match workduck.queue-work-order/v1.' };
	}

	return { ok: true, workOrder: normalized };
}

export function parseQueueProposal(content: string): QueueProposalParseResult {
	let parsed: unknown;

	try {
		parsed = JSON.parse(content);
	} catch {
		return { ok: false, message: 'Proposal JSON could not be parsed.' };
	}

	if (!isQueueProposal(parsed)) {
		return { ok: false, message: 'Proposal JSON does not match workduck.queue-proposal/v1.' };
	}

	return { ok: true, proposal: parsed };
}

function isQueueResultReport(value: unknown): value is WorkduckQueueResultReport {
	if (!isRecord(value)) {
		return false;
	}

	return (
		value.schemaVersion === 'workduck.queue-result-report/v1' &&
		isEntityRef(value.ref, 'queue-result-report') &&
		isQueueArtifactStatus(value.status) &&
		typeof value.createdAt === 'string' &&
		isOptionalText(value.agentName) &&
		isOptionalEntityRef(value.sourceWorkOrder, 'queue-work-order') &&
		Array.isArray(value.tasks) &&
		value.tasks.every(isQueueResultReportTask)
	);
}

function isQueueWorkOrder(value: unknown): value is WorkduckQueueWorkOrder {
	if (!isRecord(value)) {
		return false;
	}

	return (
		value.schemaVersion === 'workduck.queue-work-order/v1' &&
		isEntityRef(value.ref, 'queue-work-order') &&
		isQueueArtifactStatus(value.status) &&
		typeof value.createdAt === 'string' &&
		isOptionalText(value.agentName) &&
		(value.sourceReport === undefined || isEntityRef(value.sourceReport, 'queue-result-report')) &&
		Array.isArray(value.tasks) &&
		value.tasks.every(isQueueWorkOrderTask)
	);
}

function isQueueProposal(value: unknown): value is WorkduckQueueProposal {
	if (!isRecord(value)) {
		return false;
	}

	return (
		value.schemaVersion === 'workduck.queue-proposal/v1' &&
		isEntityRef(value.ref, 'queue-proposal') &&
		isQueueArtifactStatus(value.status) &&
		typeof value.createdAt === 'string' &&
		isOptionalText(value.agentName) &&
		typeof value.question === 'string' &&
		typeof value.summary === 'string' &&
		Array.isArray(value.options) &&
		value.options.every(isQueueProposalOption) &&
		(value.recommendation === null || isQueueProposalRecommendation(value.recommendation)) &&
		Array.isArray(value.nextWorkOrders) &&
		value.nextWorkOrders.every(isQueueWorkOrderTask)
	);
}

function isQueueResultReportTask(value: unknown): value is WorkduckQueueResultReportTask {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === 'string' &&
		typeof value.title === 'string' &&
		typeof value.summary === 'string' &&
		(value.structuredResponse === undefined ||
			isQueueStructuredResponse(value.structuredResponse)) &&
		isStringArray(value.filesChanged) &&
		isStringArray(value.verification) &&
		isStringArray(value.risks) &&
		(value.executionAttempts === undefined ||
			(Array.isArray(value.executionAttempts) &&
				value.executionAttempts.every(isQueueExecutionAttempt))) &&
		(value.evaluations === undefined ||
			(Array.isArray(value.evaluations) && value.evaluations.every(isQueueTaskEvaluation))) &&
		(value.responseLanguage === undefined || isQueueResponseLanguage(value.responseLanguage)) &&
		(value.responseFormat === undefined || isQueueResponseFormat(value.responseFormat)) &&
		(value.vote === undefined || isQueueVoteResult(value.vote))
	);
}

function isQueueTaskEvaluation(value: unknown): value is WorkduckQueueTaskEvaluation {
	return (
		isRecord(value) &&
		typeof value.agentId === 'string' &&
		typeof value.evaluationKey === 'string' &&
		typeof value.evaluatedAt === 'string'
	);
}

function isQueueArtifactStatus(value: unknown): value is WorkduckQueueArtifactStatus {
	return (
		value === 'reserved' ||
		value === 'active' ||
		value === 'running' ||
		value === 'failed' ||
		value === 'archived'
	);
}

function isQueueStructuredResponse(value: unknown): value is WorkduckQueueStructuredResponse {
	return (
		isRecord(value) &&
		typeof value.summary === 'string' &&
		isStringArray(value.strengths) &&
		isStringArray(value.recommendations) &&
		isStringArray(value.cautions)
	);
}

function isQueueExecutionAttempt(value: unknown): value is WorkduckQueueExecutionAttempt {
	return (
		isRecord(value) &&
		typeof value.attempt === 'number' &&
		typeof value.code === 'string' &&
		typeof value.message === 'string' &&
		typeof value.retryable === 'boolean'
	);
}

function isQueueProposalOption(value: unknown): value is WorkduckQueueProposalOption {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.summary === 'string' &&
		isStringArray(value.strengths) &&
		isStringArray(value.risks)
	);
}

function isQueueProposalRecommendation(
	value: unknown
): value is WorkduckQueueProposalRecommendation {
	return isRecord(value) && typeof value.optionId === 'string' && typeof value.reason === 'string';
}

function isQueueWorkOrderTask(value: unknown): value is WorkduckQueueWorkOrderTask {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === 'string' &&
		(value.kind === undefined || isQueueTaskKind(value.kind)) &&
		typeof value.title === 'string' &&
		typeof value.body === 'string' &&
		(value.priority === undefined || isQueueWorkPriority(value.priority)) &&
		(value.responseLanguage === undefined || isQueueResponseLanguage(value.responseLanguage)) &&
		(value.responseFormat === undefined || isQueueResponseFormat(value.responseFormat)) &&
		(value.projectIds === undefined || isStringArray(value.projectIds)) &&
		(value.repositoryIds === undefined || isStringArray(value.repositoryIds)) &&
		(value.skillIds === undefined || isStringArray(value.skillIds)) &&
		(value.agentIds === undefined || isStringArray(value.agentIds)) &&
		(value.referenceIds === undefined || isStringArray(value.referenceIds)) &&
		(value.vote === undefined || isQueueVoteSpec(value.vote)) &&
		(value.kind !== 'vote' || value.vote !== undefined) &&
		(value.sourceReportTaskId === undefined || typeof value.sourceReportTaskId === 'string') &&
		(value.decision === undefined ||
			value.decision === 'needs-work' ||
			value.decision === 'rollback')
	);
}

const nullableLegacyWorkOrderTaskKeys = [
	'kind',
	'priority',
	'responseLanguage',
	'responseFormat',
	'projectIds',
	'repositoryIds',
	'skillIds',
	'agentIds',
	'referenceIds',
	'vote',
	'sourceReportTaskId',
	'decision'
] as const;

function normalizeQueueWorkOrderForParsing(value: unknown): unknown {
	if (!isRecord(value) || !Array.isArray(value.tasks)) {
		return value;
	}

	return {
		...value,
		tasks: value.tasks.map(normalizeQueueWorkOrderTaskForParsing)
	};
}

function normalizeQueueWorkOrderTaskForParsing(value: unknown): unknown {
	if (!isRecord(value)) {
		return value;
	}

	const normalized = { ...value };

	for (const key of nullableLegacyWorkOrderTaskKeys) {
		if (normalized[key] === null) {
			delete normalized[key];
		}
	}

	return normalized;
}

function isQueueVoteSpec(value: unknown): value is WorkduckQueueVoteSpec {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.question === 'string' &&
		Array.isArray(value.options) &&
		value.options.every(isQueueVoteOption) &&
		isStringArray(value.criteria) &&
		value.responseKind === 'single-choice'
	);
}

function isQueueVoteResult(value: unknown): value is WorkduckQueueVoteResult {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.question === 'string' &&
		Array.isArray(value.options) &&
		value.options.every(isQueueVoteOption) &&
		isQueueVoteBallot(value.ballot)
	);
}

function isQueueVoteOption(value: unknown) {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.label === 'string' &&
		(value.description === undefined || value.description === null || typeof value.description === 'string')
	);
}

function isQueueVoteBallot(value: unknown) {
	return (
		isRecord(value) &&
		typeof value.choiceId === 'string' &&
		typeof value.reason === 'string' &&
		isStringArray(value.risks) &&
		(value.parseStatus === 'parsed' ||
			value.parseStatus === 'invalid-choice' ||
			value.parseStatus === 'unparsed')
	);
}

function isQueueWorkPriority(value: unknown): value is WorkduckQueueWorkPriority {
	return (
		value === 'low' ||
		value === 'normal' ||
		value === 'high' ||
		value === 'urgent'
	);
}

function isQueueResponseLanguage(value: unknown): value is WorkduckQueueResponseLanguage {
	return (
		value === 'auto' ||
		value === 'ko' ||
		value === 'en' ||
		value === 'es' ||
		value === 'fr' ||
		value === 'zh' ||
		value === 'hi'
	);
}

function isQueueResponseFormat(value: unknown): value is WorkduckQueueResponseFormat {
	return (
		value === 'general' ||
		value === 'pros-cons' ||
		value === 'feature-proposal' ||
		value === 'execution-plan' ||
		value === 'code-review' ||
		value === 'risk-assessment' ||
		value === 'comparison-table' ||
		value === 'decision-memo' ||
		value === 'bug-analysis' ||
		value === 'writing-draft' ||
		value === 'revision-draft'
	);
}

function isQueueTaskKind(value: unknown): value is WorkduckQueueTaskKind {
	return value === 'instruction' || value === 'direct-message' || value === 'vote';
}

function isEntityRef(value: unknown, kind: string) {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		value.kind === kind &&
		typeof value.label === 'string'
	);
}

function isOptionalEntityRef(value: unknown, kind: string) {
	return value === undefined || isEntityRef(value, kind);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalText(value: unknown) {
	return value === undefined || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
