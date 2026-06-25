import {
	archiveQueueWorkOrder,
	serializeQueueArtifact,
	type WorkduckQueueWorkOrder
} from './queue-artifacts';
import { updateQueueWorkOrderFile, type QueueFolderError } from './queue-folder';

export type QueuePanelWorkOrderCompletionResult =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

export interface QueuePanelWorkOrderCompletionInput {
	readonly workspacePath: string;
	readonly workOrderPath: string;
	readonly workOrder: WorkduckQueueWorkOrder;
}

export async function completeQueuePanelWorkOrder(
	input: QueuePanelWorkOrderCompletionInput
): Promise<QueuePanelWorkOrderCompletionResult> {
	const archivedWorkOrder = archiveQueueWorkOrder(input.workOrder);
	const archiveResult = await updateQueueWorkOrderFile(
		input.workspacePath,
		input.workOrderPath,
		serializeQueueArtifact(archivedWorkOrder)
	);

	if (!archiveResult.ok) {
		return {
			ok: false,
			error: archiveResult.error
		};
	}

	return {
		ok: true,
		workOrder: archivedWorkOrder,
		relativePath: archiveResult.relativePath
	};
}
