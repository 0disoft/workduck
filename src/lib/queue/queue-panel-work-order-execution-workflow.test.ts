import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { setTauriInvokeForTest, type TauriInvoke } from '$lib/tauri/tauri-invoke';
import { executeQueuePanelWorkOrder } from './queue-panel-work-order-execution-workflow';
import type {
	WorkduckQueueResultReport,
	WorkduckQueueWorkOrder
} from './queue-artifacts';

interface TauriCommandCall {
	readonly command: string;
	readonly args: Record<string, unknown> | undefined;
}

describe('queue panel work order execution workflow', () => {
	afterEach(() => {
		setTauriInvokeForTest(undefined);
	});

	test('delegates the complete durable execution workflow to one Rust command', async () => {
		const calls: TauriCommandCall[] = [];
		const runningStates: WorkduckQueueWorkOrder[] = [];
		const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
			calls.push({ command, args });
			return response<T>({
				ok: true,
				report: testReport,
				workOrder: archivedWorkOrder,
				reportRelativePath: 'reports/test.workduck-report.json'
			});
		};
		setTauriInvokeForTest(invoke);

		const result = await executeQueuePanelWorkOrder({
			...baseExecutionInput(),
			onRunningWorkOrderSaved: async (workOrder) => {
				runningStates.push(workOrder);
			}
		});

		assert.equal(result.ok, true);
		assert.equal(runningStates.length, 1);
		assert.equal(runningStates[0]?.status, 'running');
		assert.deepEqual(
			calls.map((call) => call.command),
			['execute_queue_work_order']
		);
		assert.deepEqual(calls[0]?.args, {
			request: {
				executionId: '00000000-0000-4000-8000-000000000001',
				workspacePath: 'C:/workspace',
				workOrderRelativePath: 'work-orders/test.workduck-work-order.json',
				workOrder: testWorkOrder,
				agents: [],
				vault: null,
				skills: [],
				references: [],
				personas: [],
				confirmationToken: 'confirmed-estimate'
			}
		});
	});

	test('returns the failed state persisted by Rust', async () => {
		const failedWorkOrder = { ...testWorkOrder, status: 'failed' as const };
		const invoke: TauriInvoke = async <T>() =>
			response<T>({
				ok: false,
				error: 'agent-provider-unavailable',
				workOrder: failedWorkOrder
			});
		setTauriInvokeForTest(invoke);

		const result = await executeQueuePanelWorkOrder(baseExecutionInput());

		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.code, 'execution-failed');
			assert.equal(result.workOrder?.status, 'failed');
		}
	});
});

function baseExecutionInput() {
	return {
		executionId: '00000000-0000-4000-8000-000000000001',
		workspacePath: 'C:/workspace',
		workOrderPath: 'work-orders/test.workduck-work-order.json',
		workOrder: testWorkOrder,
		confirmationToken: 'confirmed-estimate',
		readExecutionContext: async () => ({
			agents: [],
			skills: [],
			references: [],
			personas: []
		}),
		readVault: () => null
	};
}

function response<T>(value: unknown): T {
	return value as T;
}

const testWorkOrder: WorkduckQueueWorkOrder = {
	schemaVersion: 'workduck.queue-work-order/v1',
	ref: {
		id: 'work-order_test',
		kind: 'queue-work-order',
		label: 'Test work order'
	},
	status: 'active',
	createdAt: '2026-07-02T00:00:00.000Z',
	tasks: [
		{
			id: 'task_test',
			title: 'Test task',
			body: 'Run the test task.'
		}
	]
};

const archivedWorkOrder: WorkduckQueueWorkOrder = {
	...testWorkOrder,
	status: 'archived'
};

const testReport: WorkduckQueueResultReport = {
	schemaVersion: 'workduck.queue-result-report/v1',
	ref: {
		id: 'result-report_test',
		kind: 'queue-result-report',
		label: 'Test result'
	},
	status: 'active',
	createdAt: '2026-07-02T00:00:00.000Z',
	sourceWorkOrder: testWorkOrder.ref,
	tasks: [
		{
			id: 'report-task_test',
			title: 'Test task',
			summary: 'Task completed.',
			filesChanged: [],
			verification: [],
			risks: []
		}
	]
};
