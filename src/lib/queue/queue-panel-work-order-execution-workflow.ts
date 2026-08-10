import type { EnvironmentVault } from '$lib/environment/environment-vault';
import {
	startQueueWorkOrderExecution,
	type WorkduckQueueResultReport,
	type WorkduckQueueWorkOrder
} from './queue-artifacts';
import {
	executeQueueWorkOrder,
	type QueueExecutionError
} from './queue-execution';
import type { QueueExecutionContext } from './queue-panel-types';

type QueueWorkOrderExecutionRequest = Omit<
	Parameters<typeof executeQueueWorkOrder>[0],
	'executionId' | 'workspacePath' | 'workOrderRelativePath' | 'confirmationToken'
>;

interface QueuePanelWorkOrderExecutionRequestInput {
	readonly executionWorkOrder: WorkduckQueueWorkOrder;
	readonly readExecutionContext: () => Promise<QueueExecutionContext>;
	readonly readVault: () => EnvironmentVault | null;
}

export type QueuePanelWorkOrderExecutionFailureCode = 'execution-failed';

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
	  };

export interface QueuePanelWorkOrderExecutionInput {
	readonly executionId: string;
	readonly workspacePath: string;
	readonly workOrderPath: string;
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly confirmationToken: string;
	readonly readExecutionContext: () => Promise<QueueExecutionContext>;
	readonly readVault: () => EnvironmentVault | null;
	readonly onRunningWorkOrderSaved?: (workOrder: WorkduckQueueWorkOrder) => Promise<void>;
}

export async function executeQueuePanelWorkOrder(
	input: QueuePanelWorkOrderExecutionInput
): Promise<QueuePanelWorkOrderExecutionResult> {
	const executionRequest = await readQueuePanelWorkOrderExecutionRequest({
		executionWorkOrder: input.workOrder,
		readExecutionContext: input.readExecutionContext,
		readVault: input.readVault
	});
	const executionPromise = executeQueueWorkOrder({
		...executionRequest,
		executionId: input.executionId,
		workspacePath: input.workspacePath,
		workOrderRelativePath: input.workOrderPath,
		confirmationToken: input.confirmationToken
	});

	await input.onRunningWorkOrderSaved?.(startQueueWorkOrderExecution(input.workOrder));
	const executionResult = await executionPromise;

	if (!executionResult.ok) {
		return {
			ok: false,
			code: 'execution-failed',
			error: executionResult.error,
			workOrder: executionResult.workOrder
		};
	}

	return {
		ok: true,
		workOrder: executionResult.workOrder,
		report: executionResult.report,
		reportRelativePath: executionResult.reportRelativePath
	};
}

async function readQueuePanelWorkOrderExecutionRequest(
	input: QueuePanelWorkOrderExecutionRequestInput
): Promise<QueueWorkOrderExecutionRequest> {
	const executionContext = await input.readExecutionContext();

	const request = {
		workOrder: input.executionWorkOrder,
		agents: executionContext.agents,
		vault: input.readVault(),
		skills: executionContext.skills,
		references: executionContext.references,
		personas: executionContext.personas
	};

	return request;
}
