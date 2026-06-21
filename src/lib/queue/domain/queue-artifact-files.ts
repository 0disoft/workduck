import {
	createQueueArtifactFileId,
	createQueueFileSlug
} from './queue-artifact-ids';

interface QueueArtifactFileNameInput {
	readonly ref: {
		readonly id: string;
	};
}

export function createQueueResultReportFileNameFromLabel(label: string) {
	const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
	const slug = createQueueFileSlug(label, 48);

	return `${timestamp}-${slug || 'report'}.workduck-report.json`;
}

export function createQueueWorkOrderFileName(workOrder: QueueArtifactFileNameInput) {
	return `${createQueueArtifactFileId(workOrder.ref.id, 'work-order')}.workduck-work-order.json`;
}
