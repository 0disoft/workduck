import {
	failQueueWorkOrderExecution,
	parseQueueWorkOrder,
	serializeQueueArtifact,
	type WorkduckQueueWorkOrder
} from '../queue-artifacts';
import type { QueueCardEntry } from '../queue-panel-types';
import { inspectQueueWorkOrderExecutions } from '../queue-execution';
import { readQueueFile, updateQueueWorkOrderFile } from '../queue-folder';

export interface StaleRunningWorkOrderRecovery {
	readonly relativePath: string;
	readonly workOrder: WorkduckQueueWorkOrder;
}

export async function recoverStaleRunningWorkOrders(input: {
	readonly workspacePath: string;
	readonly queueFiles: readonly QueueCardEntry[];
}): Promise<readonly StaleRunningWorkOrderRecovery[]> {
	const runningWorkOrderFiles = input.queueFiles.filter(
		(file) =>
			file.kind === 'work-order' &&
			file.executionState === 'running' &&
			file.artifactId.trim().length > 0
	);

	if (runningWorkOrderFiles.length === 0) {
		return [];
	}

	const inspectResult = await inspectQueueWorkOrderExecutions({
		workspacePath: input.workspacePath,
		workOrderIds: runningWorkOrderFiles.map((file) => file.artifactId)
	});

	if (!inspectResult.ok) {
		return [];
	}

	const runningWorkOrderIds = new Set(
		inspectResult.runningWorkOrderIds
			.map((workOrderId) => workOrderId.trim())
			.filter((workOrderId) => workOrderId.length > 0)
	);
	const recoveries: StaleRunningWorkOrderRecovery[] = [];

	for (const file of runningWorkOrderFiles) {
		const workOrderId = file.artifactId.trim();

		if (runningWorkOrderIds.has(workOrderId)) {
			continue;
		}

		const recoveredWorkOrder = await markStaleRunningWorkOrderFailed({
			workspacePath: input.workspacePath,
			relativePath: file.relativePath,
			workOrderId
		});

		if (recoveredWorkOrder !== null) {
			recoveries.push({
				relativePath: file.relativePath,
				workOrder: recoveredWorkOrder
			});
		}
	}

	return recoveries;
}

export async function markStaleRunningWorkOrderFailed(input: {
	readonly workspacePath: string;
	readonly relativePath: string;
	readonly workOrderId: string;
}): Promise<WorkduckQueueWorkOrder | null> {
	const normalizedWorkOrderId = input.workOrderId.trim();

	if (normalizedWorkOrderId.length === 0) {
		return null;
	}

	const readResult = await readQueueFile(input.workspacePath, input.relativePath);

	if (!readResult.ok) {
		return null;
	}

	const parsed = parseQueueWorkOrder(readResult.content);

	if (!parsed.ok) {
		return null;
	}

	if (
		parsed.workOrder.status !== 'running' ||
		parsed.workOrder.ref.id.trim() !== normalizedWorkOrderId
	) {
		return null;
	}

	const failedWorkOrder = failQueueWorkOrderExecution(parsed.workOrder);
	const updateResult = await updateQueueWorkOrderFile(
		input.workspacePath,
		input.relativePath,
		serializeQueueArtifact(failedWorkOrder)
	);

	if (!updateResult.ok) {
		return null;
	}

	return failedWorkOrder;
}
