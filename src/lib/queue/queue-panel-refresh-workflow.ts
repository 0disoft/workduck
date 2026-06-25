import type { WorkduckQueueWorkOrder } from './queue-artifacts';
import type { QueueFolderError } from './queue-folder';
import type { QueueCardEntry } from './queue-panel-types';
import type { QueueCompletedReportNotifications } from './queue-completed-report-notifications';
import { dispatchQueueFilesChanged } from './queue-read-state';
import { saveQueuePanelReadFilePaths } from './queue-panel-read-state-workflow';
import { loadQueueFilesForWorkspace } from './workflows/queue-refresh';

export type QueuePanelRefreshResult =
	| {
			readonly ok: true;
			readonly files: readonly QueueCardEntry[];
			readonly readFilePaths: readonly string[];
			readonly selectedWorkOrder: WorkduckQueueWorkOrder | null;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

export interface QueuePanelRefreshInput {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly currentFiles: readonly QueueCardEntry[];
	readonly currentReadFilePaths: readonly string[];
	readonly selectedWorkOrder: WorkduckQueueWorkOrder | null;
	readonly recoverStaleRunning: boolean;
	readonly completedReportNotifications: QueueCompletedReportNotifications;
	readonly showCompletedReportNotification: (title: string, relativePath: string) => void;
}

export async function refreshQueuePanelFiles(
	input: QueuePanelRefreshInput
): Promise<QueuePanelRefreshResult> {
	const result = await loadQueueFilesForWorkspace({
		workspacePath: input.workspacePath,
		currentFiles: input.currentFiles,
		currentReadFilePaths: input.currentReadFilePaths,
		recoverStaleRunning: input.recoverStaleRunning
	});

	if (!result.ok) {
		return result;
	}

	const readFilePaths = result.readFilePathsChanged
		? saveQueuePanelReadFilePaths({
				workspaceId: input.workspaceId,
				readFilePaths: result.readFilePaths
			})
		: input.currentReadFilePaths;
	const selectedWorkOrder = applyRecoveredSelectedWorkOrder(
		input.selectedWorkOrder,
		result.recoveredStaleRunningWorkOrders
	);

	input.completedReportNotifications.notifyNewReports(
		result.files,
		input.showCompletedReportNotification
	);

	if (result.queueFilesChanged) {
		dispatchQueueFilesChanged(input.workspaceId);
	}

	return {
		ok: true,
		files: result.files,
		readFilePaths,
		selectedWorkOrder
	};
}

function applyRecoveredSelectedWorkOrder(
	selectedWorkOrder: WorkduckQueueWorkOrder | null,
	recoveries: readonly { readonly workOrder: WorkduckQueueWorkOrder }[]
) {
	if (selectedWorkOrder === null) {
		return null;
	}

	return (
		recoveries.find((recovery) => recovery.workOrder.ref.id === selectedWorkOrder.ref.id)
			?.workOrder ?? selectedWorkOrder
	);
}
