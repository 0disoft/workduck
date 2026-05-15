export type WorkduckQueueReviewDecision = 'pending' | 'approved' | 'needs-work' | 'rollback';

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
	readonly tasks: readonly WorkduckQueueResultReportTask[];
}

export interface WorkduckQueueWorkOrderTask {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly sourceReportTaskId?: string;
	readonly decision?: Exclude<WorkduckQueueReviewDecision, 'pending' | 'approved'>;
}

export interface WorkduckQueueWorkOrder {
	readonly schemaVersion: 'workduck.queue-work-order/v1';
	readonly ref: QueueEntityRef & { readonly kind: 'queue-work-order' };
	readonly status: 'reserved' | 'active' | 'archived';
	readonly createdAt: string;
	readonly sourceReport?: QueueEntityRef & { readonly kind: 'queue-result-report' };
	readonly tasks: readonly WorkduckQueueWorkOrderTask[];
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

export function createQueueWorkOrderFileName(report: WorkduckQueueResultReport) {
	const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
	const slug = report.ref.label
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-|-$/g, '')
		.slice(0, 48);

	return `${timestamp}-${slug || 'report'}-review.workduck-work-order.json`;
}

export function serializeQueueArtifact(artifact: unknown) {
	return `${JSON.stringify(artifact, null, 2)}\n`;
}

function createQueueId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}_${crypto.randomUUID()}`;
	}

	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
		(value.sourceReport === undefined || isEntityRef(value.sourceReport, 'queue-result-report')) &&
		Array.isArray(value.tasks) &&
		value.tasks.every(isQueueWorkOrderTask)
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

function isQueueWorkOrderTask(value: unknown) {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.id === 'string' &&
		typeof value.title === 'string' &&
		typeof value.body === 'string' &&
		(value.sourceReportTaskId === undefined || typeof value.sourceReportTaskId === 'string') &&
		(value.decision === undefined ||
			value.decision === 'needs-work' ||
			value.decision === 'rollback')
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
