export type WorkduckQueueReviewDecision = 'pending' | 'approved' | 'needs-work' | 'rollback';
export type WorkduckQueueWorkPriority = 'low' | 'normal' | 'high' | 'urgent';

export const defaultQueueWorkPriority = 'normal' satisfies WorkduckQueueWorkPriority;
export const queueWorkPriorities = ['low', 'normal', 'high', 'urgent'] as const satisfies readonly WorkduckQueueWorkPriority[];

interface QueueEntityRef {
	readonly id: string;
	readonly kind: string;
	readonly label: string;
}

export interface WorkduckQueueResultReportTask {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly filesChanged: readonly string[];
	readonly verification: readonly string[];
	readonly risks: readonly string[];
}

export interface WorkduckQueueResultReport {
	readonly schemaVersion: 'workduck.queue-result-report/v1';
	readonly ref: QueueEntityRef & { readonly kind: 'queue-result-report' };
	readonly status: 'reserved' | 'active' | 'archived';
	readonly createdAt: string;
	readonly agentName?: string;
	readonly tasks: readonly WorkduckQueueResultReportTask[];
}

export interface WorkduckQueueWorkOrderTask {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly priority?: WorkduckQueueWorkPriority;
	readonly sourceReportTaskId?: string;
	readonly decision?: Exclude<WorkduckQueueReviewDecision, 'pending' | 'approved'>;
}

export interface WorkduckQueueWorkOrder {
	readonly schemaVersion: 'workduck.queue-work-order/v1';
	readonly ref: QueueEntityRef & { readonly kind: 'queue-work-order' };
	readonly status: 'reserved' | 'active' | 'archived';
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
	readonly status: 'reserved' | 'active' | 'archived';
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

	if (!isQueueWorkOrder(parsed)) {
		return { ok: false, message: 'Work-order JSON does not match workduck.queue-work-order/v1.' };
	}

	return { ok: true, workOrder: parsed };
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
			const decisionLabel = decision === 'rollback' ? 'Rollback' : 'Needs work';
			const comment = review.comment.trim();

			return {
				id: createQueueId('task'),
				title: `${decisionLabel}: ${title}`,
				body: comment.length > 0 ? comment : `${decisionLabel} requested for ${title}.`,
				priority: defaultQueueWorkPriority,
				sourceReportTaskId: review.taskId,
				decision
			};
		});

	return {
		schemaVersion: 'workduck.queue-work-order/v1',
		ref: {
			id: createQueueId('work-order'),
			kind: 'queue-work-order',
			label: `Review follow-up for ${report.ref.label}`
		},
		status: 'active',
		createdAt: new Date().toISOString(),
		sourceReport: report.ref,
		tasks
	};
}

export function createManualQueueWorkOrder(
	title: string,
	body: string,
	priority: WorkduckQueueWorkPriority = defaultQueueWorkPriority
): WorkduckQueueWorkOrder {
	const normalizedTitle = normalizeQueueText(title);
	const normalizedBody = normalizeQueueText(body);
	const normalizedPriority = normalizeQueueWorkPriority(priority);

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
				title: normalizedTitle,
				body: normalizedBody,
				priority: normalizedPriority
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
	}
): WorkduckQueueWorkOrder {
	const normalizedTitle = normalizeQueueText(input.title);
	const normalizedBody = normalizeQueueText(input.body);
	const normalizedPriority = normalizeQueueWorkPriority(input.priority);
	const tasks = workOrder.tasks.map((task) =>
		task.id === taskId
			? {
					...task,
					title: normalizedTitle,
					body: normalizedBody,
					priority: normalizedPriority
				}
			: task
	);

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

export function normalizeQueueWorkPriority(value: unknown): WorkduckQueueWorkPriority {
	return isQueueWorkPriority(value) ? value : defaultQueueWorkPriority;
}

export function createQueueWorkOrderFileName(report: WorkduckQueueResultReport) {
	return createQueueWorkOrderFileNameFromLabel(`${report.ref.label}-review`);
}

export function createQueueWorkOrderFileNameFromLabel(label: string) {
	const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
	const slug = normalizeQueueText(label)
		.toLowerCase()
		.replaceAll(/[^a-z0-9가-힣]+/g, '-')
		.replaceAll(/^-|-$/g, '')
		.slice(0, 48);

	return `${timestamp}-${slug || 'work-order'}.workduck-work-order.json`;
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

function createQueueId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}_${crypto.randomUUID()}`;
	}

	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeQueueText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

function isQueueResultReport(value: unknown): value is WorkduckQueueResultReport {
	if (!isRecord(value)) {
		return false;
	}

	return (
		value.schemaVersion === 'workduck.queue-result-report/v1' &&
		isEntityRef(value.ref, 'queue-result-report') &&
		(value.status === 'reserved' || value.status === 'active' || value.status === 'archived') &&
		typeof value.createdAt === 'string' &&
		isOptionalText(value.agentName) &&
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
		(value.status === 'reserved' || value.status === 'active' || value.status === 'archived') &&
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
		(value.status === 'reserved' || value.status === 'active' || value.status === 'archived') &&
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
		isStringArray(value.filesChanged) &&
		isStringArray(value.verification) &&
		isStringArray(value.risks)
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
		typeof value.title === 'string' &&
		typeof value.body === 'string' &&
		(value.priority === undefined || isQueueWorkPriority(value.priority)) &&
		(value.sourceReportTaskId === undefined || typeof value.sourceReportTaskId === 'string') &&
		(value.decision === undefined ||
			value.decision === 'needs-work' ||
			value.decision === 'rollback')
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

function isEntityRef(value: unknown, kind: string) {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		value.kind === kind &&
		typeof value.label === 'string'
	);
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
