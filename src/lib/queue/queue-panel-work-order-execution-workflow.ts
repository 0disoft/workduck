import type { EnvironmentVault } from '$lib/environment/environment-vault';
import {
	archiveQueueWorkOrder,
	createQueueResultReportFileNameFromLabel,
	failQueueWorkOrderExecution,
	serializeQueueArtifact,
	startQueueWorkOrderExecution,
	type WorkduckQueueResultReport,
	type WorkduckQueueWorkOrder
} from './queue-artifacts';
import {
	executeQueueWorkOrder,
	type QueueExecutionError
} from './queue-execution';
import {
	deleteQueueFile,
	updateQueueWorkOrderFile,
	writeQueueResultReportFile,
	type QueueFolderError
} from './queue-folder';
import type { QueueExecutionContext } from './queue-panel-types';

type QueueWorkOrderExecutionRequest = Parameters<typeof executeQueueWorkOrder>[0];

interface QueuePanelWorkOrderExecutionRequestInput {
	readonly executionWorkOrder: WorkduckQueueWorkOrder;
	readonly readExecutionContext: () => Promise<QueueExecutionContext>;
	readonly readVault: () => EnvironmentVault | null;
}

type QueuePanelWorkOrderExecutionSuccessWriteResult =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly reportRelativePath: string;
	  }
	| {
			readonly ok: false;
			readonly code: 'report-write-failed';
			readonly error: QueueFolderError;
			readonly workOrder: WorkduckQueueWorkOrder | null;
	  }
	| {
			readonly ok: false;
			readonly code: 'archive-write-failed';
			readonly error: QueueFolderError;
			readonly workOrder: null;
	  };

export type QueuePanelWorkOrderExecutionFailureCode =
	| 'running-write-failed'
	| 'execution-failed'
	| 'report-write-failed'
	| 'archive-write-failed';

export type QueuePanelWorkOrderExecutionResult =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly report: WorkduckQueueResultReport;
			readonly reportRelativePath: string;
	  }
	| {
			readonly ok: false;
			readonly code: 'execution-failed';
			readonly error: QueueExecutionError;
			readonly workOrder: WorkduckQueueWorkOrder | null;
	  }
	| {
			readonly ok: false;
			readonly code: Exclude<QueuePanelWorkOrderExecutionFailureCode, 'execution-failed'>;
			readonly error: QueueFolderError;
			readonly workOrder: WorkduckQueueWorkOrder | null;
	  };

export interface QueuePanelWorkOrderExecutionInput {
	readonly workspacePath: string;
	readonly workOrderPath: string;
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly readExecutionContext: () => Promise<QueueExecutionContext>;
	readonly readVault: () => EnvironmentVault | null;
	readonly onRunningWorkOrderSaved?: (workOrder: WorkduckQueueWorkOrder) => Promise<void>;
}

export async function executeQueuePanelWorkOrder(
	input: QueuePanelWorkOrderExecutionInput
): Promise<QueuePanelWorkOrderExecutionResult> {
	const runningWorkOrder = startQueueWorkOrderExecution(input.workOrder);
	const runningResult = await updateQueueWorkOrderFile(
		input.workspacePath,
		input.workOrderPath,
		serializeQueueArtifact(runningWorkOrder)
	);

	if (!runningResult.ok) {
		return {
			ok: false,
			code: 'running-write-failed',
			error: runningResult.error,
			workOrder: null
		};
	}

	await input.onRunningWorkOrderSaved?.(runningWorkOrder);

	const executionRequest = await readQueuePanelWorkOrderExecutionRequest({
		executionWorkOrder: input.workOrder,
		readExecutionContext: input.readExecutionContext,
		readVault: input.readVault
	});
	const executionResult = await executeQueueWorkOrder(executionRequest);

	if (!executionResult.ok) {
		const failedWorkOrder = await writeFailedQueuePanelWorkOrder({
			workspacePath: input.workspacePath,
			workOrderPath: input.workOrderPath,
			runningWorkOrder
		});

		return {
			ok: false,
			code: 'execution-failed',
			error: executionResult.error,
			workOrder: failedWorkOrder
		};
	}

	const successWriteResult = await writeQueuePanelWorkOrderExecutionSuccess({
		workspacePath: input.workspacePath,
		workOrderPath: input.workOrderPath,
		runningWorkOrder,
		report: executionResult.report
	});

	if (!successWriteResult.ok) {
		return successWriteResult;
	}

	return {
		ok: true,
		workOrder: successWriteResult.workOrder,
		report: executionResult.report,
		reportRelativePath: successWriteResult.reportRelativePath
	};
}

async function readQueuePanelWorkOrderExecutionRequest(
	input: QueuePanelWorkOrderExecutionRequestInput
): Promise<QueueWorkOrderExecutionRequest> {
	const executionContext = await input.readExecutionContext();

	return {
		workOrder: input.executionWorkOrder,
		agents: executionContext.agents,
		vault: input.readVault(),
		skills: executionContext.skills,
		references: executionContext.references,
		personas: executionContext.personas
	};
}

async function writeQueuePanelWorkOrderExecutionSuccess(input: {
	readonly workspacePath: string;
	readonly workOrderPath: string;
	readonly runningWorkOrder: WorkduckQueueWorkOrder;
	readonly report: WorkduckQueueResultReport;
}): Promise<QueuePanelWorkOrderExecutionSuccessWriteResult> {
	const reportWriteResult = await writeQueueResultReportFile(
		input.workspacePath,
		createQueueResultReportFileNameFromLabel(input.report.ref.label),
		serializeQueueArtifact(input.report)
	);

	if (!reportWriteResult.ok) {
		const failedWorkOrder = await writeFailedQueuePanelWorkOrder({
			workspacePath: input.workspacePath,
			workOrderPath: input.workOrderPath,
			runningWorkOrder: input.runningWorkOrder
		});

		return {
			ok: false,
			code: 'report-write-failed',
			error: reportWriteResult.error,
			workOrder: failedWorkOrder
		};
	}

	const archivedWorkOrder = archiveQueueWorkOrder(input.runningWorkOrder);
	const archiveResult = await updateQueueWorkOrderFile(
		input.workspacePath,
		input.workOrderPath,
		serializeQueueArtifact(archivedWorkOrder)
	);

	if (!archiveResult.ok) {
		await deleteQueueFile(input.workspacePath, reportWriteResult.relativePath);

		return {
			ok: false,
			code: 'archive-write-failed',
			error: archiveResult.error,
			workOrder: null
		};
	}

	return {
		ok: true,
		workOrder: archivedWorkOrder,
		reportRelativePath: reportWriteResult.relativePath
	};
}

async function writeFailedQueuePanelWorkOrder(input: {
	readonly workspacePath: string;
	readonly workOrderPath: string;
	readonly runningWorkOrder: WorkduckQueueWorkOrder;
}) {
	const failedWorkOrder = failQueueWorkOrderExecution(input.runningWorkOrder);
	const failedResult = await updateQueueWorkOrderFile(
		input.workspacePath,
		input.workOrderPath,
		serializeQueueArtifact(failedWorkOrder)
	);

	return failedResult.ok ? failedWorkOrder : null;
}
