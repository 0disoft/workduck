import type {
	WorkduckQueueTaskKind,
	WorkduckQueueVoteResult,
	WorkduckQueueVoteSpec
} from './queue-voting';

export type WorkduckQueueReviewDecision = 'pending' | 'approved' | 'needs-work' | 'rollback';
export type WorkduckQueueWorkPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkduckQueueExecutionState = 'pending' | 'running' | 'failed' | 'completed';
export type WorkduckQueueArtifactStatus = 'reserved' | 'active' | 'running' | 'failed' | 'archived';
export type WorkduckQueueResponseLanguage = 'auto' | 'ko' | 'en' | 'es' | 'fr' | 'zh' | 'hi';
export type WorkduckQueueResponseFormat =
	| 'general'
	| 'pros-cons'
	| 'feature-proposal'
	| 'execution-plan'
	| 'code-review'
	| 'risk-assessment'
	| 'comparison-table'
	| 'decision-memo'
	| 'bug-analysis'
	| 'writing-draft'
	| 'revision-draft';

export const defaultQueueWorkPriority = 'normal' satisfies WorkduckQueueWorkPriority;
export const QUEUE_WORK_ORDER_TITLE_MAX_LENGTH = 180;
export const QUEUE_WORK_ORDER_BODY_MAX_LENGTH = 32_000;
export const queueWorkPriorities = ['low', 'normal', 'high', 'urgent'] as const satisfies readonly WorkduckQueueWorkPriority[];
export const defaultQueueResponseLanguage = 'auto' satisfies WorkduckQueueResponseLanguage;
export const queueResponseLanguages = [
	'auto',
	'ko',
	'en',
	'es',
	'fr',
	'zh',
	'hi'
] as const satisfies readonly WorkduckQueueResponseLanguage[];
export const defaultQueueResponseFormat = 'general' satisfies WorkduckQueueResponseFormat;
export const queueResponseFormats = [
	'general',
	'pros-cons',
	'feature-proposal',
	'execution-plan',
	'code-review',
	'risk-assessment',
	'comparison-table',
	'decision-memo',
	'bug-analysis',
	'writing-draft',
	'revision-draft'
] as const satisfies readonly WorkduckQueueResponseFormat[];

interface QueueEntityRef {
	readonly id: string;
	readonly kind: string;
	readonly label: string;
}

export interface WorkduckQueueResultReportTask {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly structuredResponse?: WorkduckQueueStructuredResponse;
	readonly filesChanged: readonly string[];
	readonly verification: readonly string[];
	readonly risks: readonly string[];
	readonly executionAttempts?: readonly WorkduckQueueExecutionAttempt[];
	readonly evaluations?: readonly WorkduckQueueTaskEvaluation[];
	readonly responseLanguage?: WorkduckQueueResponseLanguage;
	readonly responseFormat?: WorkduckQueueResponseFormat;
	readonly vote?: WorkduckQueueVoteResult;
}

export interface WorkduckQueueTaskEvaluation {
	readonly agentId: string;
	readonly evaluationKey: string;
	readonly evaluatedAt: string;
}

export interface WorkduckQueueStructuredResponse {
	readonly summary: string;
	readonly strengths: readonly string[];
	readonly recommendations: readonly string[];
	readonly cautions: readonly string[];
}

export interface WorkduckQueueExecutionAttempt {
	readonly attempt: number;
	readonly code: string;
	readonly message: string;
	readonly retryable: boolean;
}

export interface WorkduckQueueResultReport {
	readonly schemaVersion: 'workduck.queue-result-report/v1';
	readonly ref: QueueEntityRef & { readonly kind: 'queue-result-report' };
	readonly status: WorkduckQueueArtifactStatus;
	readonly createdAt: string;
	readonly agentName?: string;
	readonly sourceWorkOrder?: QueueEntityRef & { readonly kind: 'queue-work-order' };
	readonly tasks: readonly WorkduckQueueResultReportTask[];
}

export interface WorkduckQueueWorkOrderTask {
	readonly id: string;
	readonly kind?: WorkduckQueueTaskKind;
	readonly title: string;
	readonly body: string;
	readonly priority?: WorkduckQueueWorkPriority;
	readonly responseLanguage?: WorkduckQueueResponseLanguage;
	readonly responseFormat?: WorkduckQueueResponseFormat;
	readonly projectIds?: readonly string[];
	readonly repositoryIds?: readonly string[];
	readonly skillIds?: readonly string[];
	readonly agentIds?: readonly string[];
	readonly referenceIds?: readonly string[];
	readonly vote?: WorkduckQueueVoteSpec;
	readonly sourceReportTaskId?: string;
	readonly decision?: Exclude<WorkduckQueueReviewDecision, 'pending' | 'approved'>;
}

export interface WorkduckQueueWorkOrder {
	readonly schemaVersion: 'workduck.queue-work-order/v1';
	readonly ref: QueueEntityRef & { readonly kind: 'queue-work-order' };
	readonly status: WorkduckQueueArtifactStatus;
	readonly createdAt: string;
	readonly agentName?: string;
	readonly sourceReport?: QueueEntityRef & { readonly kind: 'queue-result-report' };
	readonly tasks: readonly WorkduckQueueWorkOrderTask[];
}

export interface WorkduckQueueProposalOption {
	readonly id: string;
	readonly name: string;
	readonly summary: string;
	readonly strengths: readonly string[];
	readonly risks: readonly string[];
}

export interface WorkduckQueueProposalRecommendation {
	readonly optionId: string;
	readonly reason: string;
}

export interface WorkduckQueueProposal {
	readonly schemaVersion: 'workduck.queue-proposal/v1';
	readonly ref: QueueEntityRef & { readonly kind: 'queue-proposal' };
	readonly status: WorkduckQueueArtifactStatus;
	readonly createdAt: string;
	readonly agentName?: string;
	readonly question: string;
	readonly summary: string;
	readonly options: readonly WorkduckQueueProposalOption[];
	readonly recommendation: WorkduckQueueProposalRecommendation | null;
	readonly nextWorkOrders: readonly WorkduckQueueWorkOrderTask[];
}

export type QueueResultReportParseResult =
	| {
			readonly ok: true;
			readonly report: WorkduckQueueResultReport;
	  }
	| {
			readonly ok: false;
			readonly message: string;
	  };

export type QueueWorkOrderParseResult =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
	  }
	| {
			readonly ok: false;
			readonly message: string;
	  };

export type QueueProposalParseResult =
	| {
			readonly ok: true;
			readonly proposal: WorkduckQueueProposal;
	  }
	| {
			readonly ok: false;
			readonly message: string;
	  };

export interface QueueReportTaskReview {
	readonly taskId: string;
	readonly decision: WorkduckQueueReviewDecision;
	readonly comment: string;
}

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

export function createDefaultReportReviews(
	report: WorkduckQueueResultReport
): QueueReportTaskReview[] {
	return report.tasks.map((task) => ({
		taskId: task.id,
		decision: 'pending',
		comment: ''
	}));
}

export function createQueueWorkOrderFromReportReview(
	report: WorkduckQueueResultReport,
	reviews: readonly QueueReportTaskReview[]
): WorkduckQueueWorkOrder {
	const tasks = reviews
		.filter((review) => review.decision === 'needs-work' || review.decision === 'rollback')
		.map((review): WorkduckQueueWorkOrderTask => {
			const reportTask = report.tasks.find((task) => task.id === review.taskId);
			const title = reportTask?.title ?? review.taskId;
			const decision = review.decision === 'rollback' ? 'rollback' : 'needs-work';
			const language = getFollowUpTaskLanguage(reportTask, review);
			const decisionLabel = getFollowUpDecisionLabel(decision, language);
			const comment = review.comment.trim();

			return {
				id: createQueueId('task'),
				title: `${decisionLabel}: ${title}`,
				body:
					comment.length > 0
						? comment
						: createDefaultFollowUpTaskBody(decisionLabel, title, language),
				priority: defaultQueueWorkPriority,
				responseLanguage: getFollowUpResponseLanguage(reportTask, language),
				sourceReportTaskId: review.taskId,
				decision
			};
		});
	const labelLanguage = getFollowUpWorkOrderLanguage(report, reviews);

	return {
		schemaVersion: 'workduck.queue-work-order/v1',
		ref: {
			id: createQueueId('work-order'),
			kind: 'queue-work-order',
			label:
				labelLanguage === 'ko'
					? `${report.ref.label} 후속 작업`
					: `Review follow-up for ${report.ref.label}`
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		sourceReport: report.ref,
		tasks
	};
}

export function createQueueWorkOrderForReportEvaluation(
	report: WorkduckQueueResultReport,
	input: {
		readonly workspacePath: string;
		readonly reportPath: string | null;
		readonly evaluatorSkillId: string;
	}
): WorkduckQueueWorkOrder {
	const language = getEvaluationDelegationLanguage(report);
	const title =
		language === 'ko'
			? `${report.ref.label} 평가 위임`
			: `Evaluation delegation for ${report.ref.label}`;

	return {
		schemaVersion: 'workduck.queue-work-order/v1',
		ref: {
			id: createQueueId('work-order'),
			kind: 'queue-work-order',
			label: title
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		sourceReport: report.ref,
		tasks: [
			{
				id: createQueueId('task'),
				title,
				body: createReportEvaluationDelegationBody(report, input, language),
				priority: defaultQueueWorkPriority,
				responseLanguage: getEvaluationDelegationResponseLanguage(report, language),
				skillIds: [input.evaluatorSkillId]
			}
		]
	};
}

export function createManualQueueWorkOrder(
	title: string,
	body: string,
	priority: WorkduckQueueWorkPriority = defaultQueueWorkPriority,
	skillIds: readonly string[] = [],
	agentIds: readonly string[] = [],
	referenceIds: readonly string[] = [],
	options: {
		readonly kind?: WorkduckQueueTaskKind;
		readonly vote?: WorkduckQueueVoteSpec | null;
		readonly responseLanguage?: WorkduckQueueResponseLanguage;
		readonly responseFormat?: WorkduckQueueResponseFormat;
		readonly projectIds?: readonly string[];
		readonly repositoryIds?: readonly string[];
	} = {}
): WorkduckQueueWorkOrder {
	const normalizedTitle = normalizeQueueText(title);
	const normalizedBody = normalizeQueueText(body);
	const normalizedPriority = normalizeQueueWorkPriority(priority);
	const normalizedSkillIds = normalizeQueueRecordIds(skillIds);
	const normalizedAgentIds = normalizeQueueRecordIds(agentIds);
	const normalizedReferenceIds = normalizeQueueRecordIds(referenceIds);
	const normalizedProjectIds = normalizeQueueRecordIds(options.projectIds ?? []);
	const normalizedRepositoryIds = normalizeQueueRecordIds(options.repositoryIds ?? []);
	const normalizedKind = normalizeQueueTaskKind(options.kind);
	const normalizedResponseLanguage = normalizeQueueResponseLanguage(options.responseLanguage);
	const normalizedResponseFormat = normalizeQueueResponseFormat(options.responseFormat);
	const vote = normalizedKind === 'vote' ? options.vote : null;

	return {
		schemaVersion: 'workduck.queue-work-order/v1',
		ref: {
			id: createQueueId('work-order'),
			kind: 'queue-work-order',
			label: normalizedTitle
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		tasks: [
			{
				id: createQueueId('task'),
				...(normalizedKind !== 'instruction' ? { kind: normalizedKind } : {}),
				title: normalizedTitle,
				body: normalizedBody,
				priority: normalizedPriority,
				responseLanguage: normalizedResponseLanguage,
				...(normalizedKind === 'instruction' ? { responseFormat: normalizedResponseFormat } : {}),
				...(normalizedProjectIds.length > 0 ? { projectIds: normalizedProjectIds } : {}),
				...(normalizedRepositoryIds.length > 0 ? { repositoryIds: normalizedRepositoryIds } : {}),
				...(normalizedSkillIds.length > 0 ? { skillIds: normalizedSkillIds } : {}),
				...(normalizedAgentIds.length > 0 ? { agentIds: normalizedAgentIds } : {}),
				...(normalizedReferenceIds.length > 0 ? { referenceIds: normalizedReferenceIds } : {}),
				...(vote !== null ? { vote } : {})
			}
		]
	};
}

export function updateQueueWorkOrderTask(
	workOrder: WorkduckQueueWorkOrder,
	taskId: string,
	input: {
		readonly title: string;
		readonly body: string;
		readonly priority: WorkduckQueueWorkPriority;
		readonly projectIds?: readonly string[];
		readonly repositoryIds?: readonly string[];
		readonly skillIds?: readonly string[];
		readonly agentIds?: readonly string[];
		readonly referenceIds?: readonly string[];
		readonly kind?: WorkduckQueueTaskKind;
		readonly vote?: WorkduckQueueVoteSpec | null;
		readonly responseLanguage?: WorkduckQueueResponseLanguage;
		readonly responseFormat?: WorkduckQueueResponseFormat;
	}
): WorkduckQueueWorkOrder {
	const normalizedTitle = normalizeQueueText(input.title);
	const normalizedBody = normalizeQueueText(input.body);
	const normalizedPriority = normalizeQueueWorkPriority(input.priority);
	const normalizedProjectIds = normalizeQueueRecordIds(input.projectIds ?? []);
	const normalizedRepositoryIds = normalizeQueueRecordIds(input.repositoryIds ?? []);
	const normalizedSkillIds = normalizeQueueRecordIds(input.skillIds ?? []);
	const normalizedAgentIds = normalizeQueueRecordIds(input.agentIds ?? []);
	const normalizedReferenceIds = normalizeQueueRecordIds(input.referenceIds ?? []);
	const normalizedKind = normalizeQueueTaskKind(input.kind);
	const normalizedResponseLanguage = normalizeQueueResponseLanguage(input.responseLanguage);
	const normalizedResponseFormat = normalizeQueueResponseFormat(input.responseFormat);
	const vote = normalizedKind === 'vote' ? (input.vote ?? null) : null;
	const tasks = workOrder.tasks.map((task) => {
		if (task.id !== taskId) {
			return task;
		}

		const {
			skillIds: _skillIds,
			agentIds: _agentIds,
			referenceIds: _referenceIds,
			projectIds: _projectIds,
			repositoryIds: _repositoryIds,
			kind: _kind,
			vote: _vote,
			responseLanguage: _responseLanguage,
			responseFormat: _responseFormat,
			...taskWithoutAssignmentIds
		} = task;

		const nextTask: WorkduckQueueWorkOrderTask = {
			...taskWithoutAssignmentIds,
			...(normalizedKind !== 'instruction' ? { kind: normalizedKind } : {}),
			title: normalizedTitle,
			body: normalizedBody,
			priority: normalizedPriority,
			responseLanguage: normalizedResponseLanguage,
			...(normalizedKind === 'instruction' ? { responseFormat: normalizedResponseFormat } : {}),
			...(normalizedProjectIds.length > 0 ? { projectIds: normalizedProjectIds } : {}),
			...(normalizedRepositoryIds.length > 0 ? { repositoryIds: normalizedRepositoryIds } : {}),
			...(normalizedSkillIds.length > 0 ? { skillIds: normalizedSkillIds } : {}),
			...(normalizedAgentIds.length > 0 ? { agentIds: normalizedAgentIds } : {}),
			...(normalizedReferenceIds.length > 0 ? { referenceIds: normalizedReferenceIds } : {}),
			...(vote !== null ? { vote } : {})
		};

		return nextTask;
	});

	return {
		...workOrder,
		ref:
			workOrder.tasks.length === 1
				? {
						...workOrder.ref,
						label: normalizedTitle
					}
				: workOrder.ref,
		tasks
	};
}

export function readQueueWorkPriorityLabel(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return null;
		}

		const priority = readHighestQueueWorkPriorityFromTasks(parsed.tasks);

		return priority ?? null;
	} catch {
		return null;
	}
}

export function readQueueArtifactExecutionState(content: string): WorkduckQueueExecutionState | null {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return null;
		}

		if (parsed.status === 'archived') {
			return 'completed';
		}

		if (parsed.status === 'running') {
			return 'running';
		}

		if (parsed.status === 'failed') {
			return 'failed';
		}

		switch (parsed.schemaVersion) {
			case 'workduck.queue-result-report/v1':
				return 'completed';
			case 'workduck.queue-work-order/v1':
			case 'workduck.queue-proposal/v1':
				return 'pending';
			default:
				return null;
		}
	} catch {
		return null;
	}
}

export function normalizeQueueWorkPriority(value: unknown): WorkduckQueueWorkPriority {
	return isQueueWorkPriority(value) ? value : defaultQueueWorkPriority;
}

export function normalizeQueueResponseLanguage(value: unknown): WorkduckQueueResponseLanguage {
	return isQueueResponseLanguage(value) ? value : defaultQueueResponseLanguage;
}

export function normalizeQueueResponseFormat(value: unknown): WorkduckQueueResponseFormat {
	return isQueueResponseFormat(value) ? value : defaultQueueResponseFormat;
}

export function normalizeQueueTaskKind(value: unknown): WorkduckQueueTaskKind {
	return isQueueTaskKind(value) ? value : 'instruction';
}

export function createQueueResultReportFileNameFromLabel(label: string) {
	const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
	const slug = createQueueFileSlug(label, 48);

	return `${timestamp}-${slug || 'report'}.workduck-report.json`;
}

export function createQueueWorkOrderFileName(workOrder: WorkduckQueueWorkOrder) {
	return `${createQueueArtifactFileId(workOrder.ref.id, 'work-order')}.workduck-work-order.json`;
}

export function archiveQueueWorkOrder(workOrder: WorkduckQueueWorkOrder): WorkduckQueueWorkOrder {
	return {
		...workOrder,
		status: 'archived'
	};
}

export function startQueueWorkOrderExecution(
	workOrder: WorkduckQueueWorkOrder
): WorkduckQueueWorkOrder {
	return {
		...workOrder,
		status: 'running'
	};
}

export function failQueueWorkOrderExecution(
	workOrder: WorkduckQueueWorkOrder
): WorkduckQueueWorkOrder {
	return {
		...workOrder,
		status: 'failed'
	};
}

export function createQueueReportTaskEvaluationKey(
	report: WorkduckQueueResultReport,
	task: WorkduckQueueResultReportTask
) {
	return `queue-report:${report.ref.id}:${task.id}`;
}

export function hasQueueReportTaskEvaluation(
	task: WorkduckQueueResultReportTask,
	agentId: string
) {
	return (task.evaluations ?? []).some((evaluation) => evaluation.agentId === agentId);
}

export function recordQueueReportTaskEvaluation(
	report: WorkduckQueueResultReport,
	taskId: string,
	agentId: string,
	now = new Date()
): WorkduckQueueResultReport {
	return {
		...report,
		tasks: report.tasks.map((task) => {
			if (task.id !== taskId || hasQueueReportTaskEvaluation(task, agentId)) {
				return task;
			}

			const evaluationKey = createQueueReportTaskEvaluationKey(report, task);

			return {
				...task,
				evaluations: [
					...(task.evaluations ?? []),
					{
						agentId,
						evaluationKey,
						evaluatedAt: now.toISOString()
					}
				]
			};
		})
	};
}

export function serializeQueueArtifact(artifact: unknown) {
	return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function readQueueArtifactAgentName(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		const directAgentName = readOptionalText(parsed.agentName);

		if (directAgentName.length > 0) {
			return directAgentName;
		}

		if (isRecord(parsed.agent)) {
			return readOptionalText(parsed.agent.name);
		}

		return '';
	} catch {
		return '';
	}
}

export function readQueueArtifactCreatedAt(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		return readOptionalText(parsed.createdAt);
	} catch {
		return '';
	}
}

export function readQueueArtifactTitle(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed) || !isRecord(parsed.ref)) {
			return '';
		}

		return readOptionalText(parsed.ref.label);
	} catch {
		return '';
	}
}

export function readQueueArtifactId(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed) || !isRecord(parsed.ref)) {
			return '';
		}

		return readOptionalText(parsed.ref.id);
	} catch {
		return '';
	}
}

export function readQueueArtifactSourceReportId(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed) || !isRecord(parsed.sourceReport)) {
			return '';
		}

		return readOptionalText(parsed.sourceReport.id);
	} catch {
		return '';
	}
}

export function readQueueArtifactSkillIds(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed) || !Array.isArray(parsed.tasks)) {
			return [];
		}

		return parsed.tasks.flatMap((task) => {
			if (!isRecord(task) || !Array.isArray(task.skillIds)) {
				return [];
			}

			return task.skillIds.filter((skillId): skillId is string => typeof skillId === 'string');
		});
	} catch {
		return [];
	}
}

function createQueueId(prefix: string) {
	const normalizedPrefix = prefix === 'work-order' ? 'wo' : prefix;

	return `${normalizedPrefix}_${Date.now().toString(36)}_${createQueueRandomToken()}`;
}

function createQueueRandomToken() {
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const values = new Uint8Array(10);
		crypto.getRandomValues(values);

		return Array.from(values, (value) => value.toString(36).padStart(2, '0')).join('').slice(0, 16);
	}

	return Math.random().toString(36).slice(2, 18);
}

function createQueueArtifactFileId(id: string, fallback: string) {
	const normalizedId = createQueueFileSlug(id, 80, '_');

	return normalizedId.length > 0 ? normalizedId : createQueueId(fallback);
}

function createQueueFileSlug(value: string, maxLength: number, extraAllowed = '') {
	const allowedPattern = extraAllowed.includes('_')
		? /[^\p{Letter}\p{Number}_-]+/gu
		: /[^\p{Letter}\p{Number}-]+/gu;

	return normalizeQueueText(value)
		.toLowerCase()
		.replaceAll(allowedPattern, '-')
		.replaceAll(/-+/g, '-')
		.replaceAll(/^-|-$/g, '')
		.slice(0, maxLength)
		.replaceAll(/^-|-$/g, '');
}

function normalizeQueueText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

function normalizeQueueRecordIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const ids: string[] = [];
	const seenIds = new Set<string>();

	for (const item of value) {
		if (typeof item !== 'string') {
			continue;
		}

		const id = normalizeQueueText(item);

		if (id.length === 0 || seenIds.has(id)) {
			continue;
		}

		seenIds.add(id);
		ids.push(id);
	}

	return ids;
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

type FollowUpContentLanguage = Extract<WorkduckQueueResponseLanguage, 'ko' | 'en'>;

function getFollowUpWorkOrderLanguage(
	report: WorkduckQueueResultReport,
	reviews: readonly QueueReportTaskReview[]
): FollowUpContentLanguage {
	const firstSelectedReview = reviews.find(
		(review) => review.decision === 'needs-work' || review.decision === 'rollback'
	);
	const firstReportTask =
		firstSelectedReview === undefined
			? undefined
			: report.tasks.find((task) => task.id === firstSelectedReview.taskId);

	return getFollowUpTaskLanguage(firstReportTask, firstSelectedReview);
}

function getFollowUpTaskLanguage(
	reportTask: WorkduckQueueResultReportTask | undefined,
	review: QueueReportTaskReview | undefined
): FollowUpContentLanguage {
	const explicitLanguage = getExplicitFollowUpLanguage(reportTask?.responseLanguage);

	if (explicitLanguage !== null) {
		return explicitLanguage;
	}

	const languageSource = [
		reportTask?.title ?? '',
		reportTask?.summary ?? '',
		reportTask?.verification.join(' ') ?? '',
		reportTask?.risks.join(' ') ?? '',
		review?.comment ?? ''
	].join(' ');

	return containsKoreanText(languageSource) ? 'ko' : 'en';
}

function getFollowUpResponseLanguage(
	reportTask: WorkduckQueueResultReportTask | undefined,
	fallbackLanguage: FollowUpContentLanguage
): WorkduckQueueResponseLanguage {
	const normalizedLanguage = normalizeQueueResponseLanguage(reportTask?.responseLanguage);

	return normalizedLanguage === 'auto' ? fallbackLanguage : normalizedLanguage;
}

function getExplicitFollowUpLanguage(
	language: WorkduckQueueResponseLanguage | undefined
): FollowUpContentLanguage | null {
	return language === 'ko' || language === 'en' ? language : null;
}

function getFollowUpDecisionLabel(
	decision: Exclude<WorkduckQueueReviewDecision, 'pending' | 'approved'>,
	language: FollowUpContentLanguage
) {
	if (language === 'ko') {
		return decision === 'rollback' ? '롤백' : '보완 필요';
	}

	return decision === 'rollback' ? 'Rollback' : 'Needs work';
}

function getEvaluationDelegationLanguage(report: WorkduckQueueResultReport): FollowUpContentLanguage {
	const explicitTaskLanguage = report.tasks
		.map((task) => getExplicitFollowUpLanguage(task.responseLanguage))
		.find((language) => language !== null);

	if (explicitTaskLanguage !== undefined && explicitTaskLanguage !== null) {
		return explicitTaskLanguage;
	}

	const languageSource = [
		report.ref.label,
		...report.tasks.flatMap((task) => [
			task.title,
			task.summary,
			task.verification.join(' '),
			task.risks.join(' ')
		])
	].join(' ');

	return containsKoreanText(languageSource) ? 'ko' : 'en';
}

function getEvaluationDelegationResponseLanguage(
	report: WorkduckQueueResultReport,
	fallbackLanguage: FollowUpContentLanguage
): WorkduckQueueResponseLanguage {
	return (
		report.tasks
			.map((task) => normalizeQueueResponseLanguage(task.responseLanguage))
			.find((language) => language !== 'auto') ?? fallbackLanguage
	);
}

function createReportEvaluationDelegationBody(
	report: WorkduckQueueResultReport,
	input: {
		readonly workspacePath: string;
		readonly reportPath: string | null;
		readonly evaluatorSkillId: string;
	},
	language: FollowUpContentLanguage
) {
	const reportLocation = input.reportPath ?? report.ref.id;
	const evaluationTargets = createReportEvaluationTargets(report);
	const taskSummaries = evaluationTargets.map((target, index) =>
		createReportEvaluationTargetSummary(target.task, index, language)
	);
	const skippedTaskSummaries = createSkippedReportEvaluationTargetSummaries(report, language);
	const evaluationJsonTemplate = createReportEvaluationBatchJsonTemplate(report, evaluationTargets);
	const batchCommand = [
		'workduck',
		'agent',
		'evaluate-batch',
		'--workspace',
		quoteQueueCliArgument(input.workspacePath),
		'--input',
		'<evaluation-json-path>'
	].join(' ');

	if (language === 'ko') {
		return [
			'이 작업은 Codex가 수행합니다.',
			'아래 결과 보고서에 포함된 각 에이전트 응답을 1~9점 기준으로 평가하고, 에이전트 평가 누적값에 저장하세요.',
			'',
			`결과 보고서: ${reportLocation}`,
			`워크스페이스: ${input.workspacePath}`,
			'',
			'평가 기준:',
			'- 문제 이해력',
			'- 논리적 타당성',
			'- 현실성·실행 가능성',
			'- 창의성·통찰',
			'- 리스크 감지',
			'',
			'채점 제외 규칙:',
			'- 무응답, 응답 실패, 형식 위반, 도구 호출 토큰만 포함된 응답에는 1점을 주지 마세요.',
			'- 채점 제외 대상은 아래 JSON에도 추가하지 마세요.',
			'',
			'평가 대상:',
			...taskSummaries,
			...skippedTaskSummaries,
			'',
			'아래 JSON에서 각 점수를 확정한 뒤 파일로 저장하고 명령을 실행하세요.',
			'',
			evaluationJsonTemplate,
			'',
			batchCommand
		].join('\n');
	}

	return [
		'This task is for Codex.',
		'Evaluate every agent response in the result report with 1-9 scores, then save the scores to the agent evaluation summary.',
		'',
		`Result report: ${reportLocation}`,
		`Workspace: ${input.workspacePath}`,
		'',
		'Criteria:',
		'- Problem understanding',
		'- Logical validity',
		'- Practical feasibility',
		'- Creative insight',
		'- Risk detection',
		'',
		'Scoring exclusion rules:',
		'- Do not assign 1-point scores to nonresponses, response failures, format violations, or responses that only contain tool-call tokens.',
		'- Excluded targets must stay out of the JSON below.',
		'',
		'Targets:',
		...taskSummaries,
		...skippedTaskSummaries,
		'',
		'After choosing scores, save this JSON to a file and run the command below.',
		'',
		evaluationJsonTemplate,
		'',
		batchCommand
	].join('\n');
}

function createReportEvaluationTargets(report: WorkduckQueueResultReport) {
	return report.tasks
		.map((task) => ({
			task,
			skipReason: getReportEvaluationSkipReason(task)
		}))
		.filter((target) => target.skipReason === null);
}

function createSkippedReportEvaluationTargetSummaries(
	report: WorkduckQueueResultReport,
	language: FollowUpContentLanguage
) {
	const skippedTargets = report.tasks
		.map((task) => ({
			task,
			skipReason: getReportEvaluationSkipReason(task)
		}))
		.filter(
			(
				target
			): target is {
				readonly task: WorkduckQueueResultReportTask;
				readonly skipReason: ReportEvaluationSkipReason;
			} => target.skipReason !== null
		);

	if (skippedTargets.length === 0) {
		return [];
	}

	const heading = language === 'ko' ? '채점 제외 대상:' : 'Excluded from scoring:';
	const lines = skippedTargets.map(({ task, skipReason }) => {
		const agentName = getReportTaskAgentName(task);
		const reason = getReportEvaluationSkipReasonLabel(skipReason, language);

		return `- ${agentName}: ${reason}`;
	});

	return ['', heading, ...lines];
}

function createReportEvaluationTargetSummary(
	task: WorkduckQueueResultReportTask,
	index: number,
	language: FollowUpContentLanguage
) {
	const agentName = getReportTaskAgentName(task);
	const summary = summarizeReportTaskForEvaluation(task.summary);
	const lines =
		language === 'ko'
			? [
					`${index + 1}. ${agentName}`,
					`   응답 ID: ${task.id}`,
					`   작업: ${task.title}`,
					`   응답 요약: ${summary}`
				]
			: [
					`${index + 1}. ${agentName}`,
					`   Response ID: ${task.id}`,
					`   Task: ${task.title}`,
					`   Response summary: ${summary}`
				];

	if (task.vote !== undefined && task.vote.ballot.parseStatus === 'parsed') {
		lines.push(
			language === 'ko'
				? `   투표 선택: ${task.vote.ballot.choiceId}`
				: `   Vote choice: ${task.vote.ballot.choiceId}`
		);
	}

	return lines.join('\n');
}

function summarizeReportTaskForEvaluation(summary: string) {
	const normalized = summary
		.replaceAll(/\s+/g, ' ')
		.trim();

	if (normalized.length <= 280) {
		return normalized;
	}

	return `${normalized.slice(0, 277).trimEnd()}...`;
}

type ReportEvaluationTarget = ReturnType<typeof createReportEvaluationTargets>[number];
type ReportEvaluationSkipReason = 'response-failed' | 'format-violation' | 'tool-call-transcript';

function getReportEvaluationSkipReason(
	task: WorkduckQueueResultReportTask
): ReportEvaluationSkipReason | null {
	const summary = task.summary.trim();
	const verificationText = task.verification.join('\n');
	const riskText = task.risks.join('\n');
	const combinedText = [summary, verificationText, riskText].join('\n');

	if (
		summary.length === 0 ||
		includesAnyEvaluationMarker(combinedText, reportEvaluationResponseFailureMarkers)
	) {
		return 'response-failed';
	}

	if (includesAnyEvaluationMarker(combinedText, reportEvaluationToolCallMarkers)) {
		return 'tool-call-transcript';
	}

	if (includesAnyEvaluationMarker(combinedText, reportEvaluationFormatViolationMarkers)) {
		return 'format-violation';
	}

	return null;
}

function getReportEvaluationSkipReasonLabel(
	reason: ReportEvaluationSkipReason,
	language: FollowUpContentLanguage
) {
	if (language === 'ko') {
		switch (reason) {
			case 'response-failed':
				return '응답 없음 또는 응답 실패';
			case 'format-violation':
				return '요청한 응답 형식 위반';
			case 'tool-call-transcript':
				return '도구 호출 토큰만 포함된 응답';
		}
	}

	switch (reason) {
		case 'response-failed':
			return 'nonresponse or response failure';
		case 'format-violation':
			return 'requested response format violation';
		case 'tool-call-transcript':
			return 'tool-call token response';
	}
}

function includesAnyEvaluationMarker(value: string, markers: readonly string[]) {
	const normalized = value.toLowerCase();

	return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

const reportEvaluationResponseFailureMarkers = [
	'응답을 받지 못했습니다',
	'응답 실패',
	'response was not received',
	'response failed',
	'no response',
	'nonresponse'
] as const;

const reportEvaluationFormatViolationMarkers = [
	'구조화 응답을 해석하지 못했습니다',
	'응답 형식 위반',
	'요청한 형식을 따르지 않아',
	'structured response could not be parsed',
	'response format violation',
	'did not follow the requested format',
	'malformed response'
] as const;

const reportEvaluationToolCallMarkers = [
	'<tool_call',
	'<tool_calls_section',
	'functions.bash',
	'tool-call token',
	'tool call token',
	'도구 호출 토큰',
	'```bash',
	'```sh'
] as const;

function getReportTaskAgentName(task: WorkduckQueueResultReportTask) {
	return task.title.split(':')[0]?.trim() || task.title;
}

function createReportEvaluationBatchJsonTemplate(
	report: WorkduckQueueResultReport,
	targets: readonly ReportEvaluationTarget[]
) {
	return JSON.stringify(
		{
			evaluations: targets.map(({ task }) => {
				const agentName = getReportTaskAgentName(task);

				return {
					reportTaskId: task.id,
					agentName,
					evaluationKey: createQueueReportTaskEvaluationKey(report, task),
					scores: {
						problemUnderstanding: 5,
						logicalValidity: 5,
						practicalFeasibility: 5,
						creativeInsight: 5,
						riskDetection: 5
					}
				};
			})
		},
		null,
		2
	);
}

function quoteQueueCliArgument(value: string) {
	return `"${value.replaceAll('"', '\\"')}"`;
}

function createDefaultFollowUpTaskBody(
	decisionLabel: string,
	title: string,
	language: FollowUpContentLanguage
) {
	return language === 'ko'
		? `${title} 항목에 ${decisionLabel} 후속 작업이 요청되었습니다.`
		: `${decisionLabel} requested for ${title}.`;
}

function containsKoreanText(value: string) {
	return /[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(value);
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

function isQueueResultReportTask(value: unknown) {
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

function isQueueProposalOption(value: unknown) {
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

function isQueueProposalRecommendation(value: unknown) {
	return isRecord(value) && typeof value.optionId === 'string' && typeof value.reason === 'string';
}

function isQueueWorkOrderTask(value: unknown) {
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

function readHighestQueueWorkPriorityFromTasks(value: unknown) {
	if (!Array.isArray(value)) {
		return null;
	}

	const priorities = value
		.map((task) => (isRecord(task) ? normalizeQueueWorkPriority(task.priority) : null))
		.filter((priority) => priority !== null);

	if (priorities.includes('urgent')) {
		return 'urgent';
	}

	if (priorities.includes('high')) {
		return 'high';
	}

	if (priorities.includes('normal')) {
		return 'normal';
	}

	if (priorities.includes('low')) {
		return 'low';
	}

	return null;
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

function readOptionalText(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
