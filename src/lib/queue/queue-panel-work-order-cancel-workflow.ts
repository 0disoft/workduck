import {
	cancelQueueWorkOrderExecution,
	type QueueExecutionError
} from './queue-execution';
import type { WorkduckQueueWorkOrder } from './queue-artifacts';
import { markStaleRunningWorkOrderFailed } from './workflows/stale-running-recovery';

export type QueuePanelWorkOrderCancelResult =
	| {
			readonly ok: true;
			readonly recoveredWorkOrder: WorkduckQueueWorkOrder | null;
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
	  };

export interface QueuePanelWorkOrderCancelInput {
	readonly workspacePath: string;
	readonly workOrderPath: string | null;
	readonly workOrderId: string;
}

export async function cancelQueuePanelWorkOrder(
	input: QueuePanelWorkOrderCancelInput
): Promise<QueuePanelWorkOrderCancelResult> {
	const cancelResult = await cancelQueueWorkOrderExecution({
		workOrderId: input.workOrderId
	});

	if (cancelResult.ok) {
		return { ok: true, recoveredWorkOrder: null };
	}

	if (
		cancelResult.error !== 'queue-execution-work-order-not-running' ||
		input.workOrderPath === null
	) {
		return { ok: false, error: cancelResult.error };
	}

	const recoveredWorkOrder = await markStaleRunningWorkOrderFailed({
		workspacePath: input.workspacePath,
		relativePath: input.workOrderPath,
		workOrderId: input.workOrderId
	});

	if (recoveredWorkOrder === null) {
		return { ok: false, error: cancelResult.error };
	}

	return { ok: true, recoveredWorkOrder };
}
