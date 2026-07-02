import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { setTauriInvokeForTest, type TauriInvoke } from '$lib/tauri/tauri-invoke';
import {
	executeQueuePanelWorkOrder,
	type QueuePanelWorkOrderExecutionResult
} from './queue-panel-work-order-execution-workflow';
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

	test('removes the just-written report when archiving the completed work order fails', async () => {
		const calls: TauriCommandCall[] = [];
		let workOrderUpdateCount = 0;

		const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
			calls.push({ command, args });

			switch (command) {
				case 'update_queue_work_order_file':
					workOrderUpdateCount += 1;

					if (workOrderUpdateCount === 2) {
						return response<T>({
							ok: false,
							error: 'queue-folder-file-write-failed'
						});
					}

					return response<T>({
						ok: true,
						relativePath: 'work-orders/test.workduck-work-order.json',
						content: String(args?.content ?? '')
					});
				case 'execute_queue_work_order':
					return response<T>({
						ok: true,
						report: testReport
					});
				case 'write_queue_result_report_file':
					return response<T>({
						ok: true,
						relativePath: 'results/test.workduck-result-report.json',
						content: String(args?.content ?? '')
					});
				case 'delete_queue_file':
					return response<T>({
						ok: true,
						relativePath: args?.relativePath
					});
				default:
					throw new Error(`Unexpected Tauri command: ${command}`);
			}
		};
		setTauriInvokeForTest(invoke);

		const result = await executeQueuePanelWorkOrder(baseExecutionInput());

		assert.equal(result.ok, false);
		assert.equal(readFailureCode(result), 'archive-write-failed');
		assert.deepEqual(
			calls.map((call) => call.command),
			[
				'update_queue_work_order_file',
				'execute_queue_work_order',
				'write_queue_result_report_file',
				'update_queue_work_order_file',
				'delete_queue_file'
			]
		);
		assert.deepEqual(calls.at(-1), {
			command: 'delete_queue_file',
			args: {
				workspacePath: 'C:/workspace',
				relativePath: 'results/test.workduck-result-report.json'
			}
		});
	});

	test('keeps the report when the completed work order archives successfully', async () => {
		const calls: TauriCommandCall[] = [];

		const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
			calls.push({ command, args });

			switch (command) {
				case 'update_queue_work_order_file':
					return response<T>({
						ok: true,
						relativePath: 'work-orders/test.workduck-work-order.json',
						content: String(args?.content ?? '')
					});
				case 'execute_queue_work_order':
					return response<T>({
						ok: true,
						report: testReport
					});
				case 'write_queue_result_report_file':
					return response<T>({
						ok: true,
						relativePath: 'results/test.workduck-result-report.json',
						content: String(args?.content ?? '')
					});
				default:
					throw new Error(`Unexpected Tauri command: ${command}`);
			}
		};
		setTauriInvokeForTest(invoke);

		const result = await executeQueuePanelWorkOrder(baseExecutionInput());

		assert.equal(result.ok, true);
		assert.equal(calls.some((call) => call.command === 'delete_queue_file'), false);
	});
});

function baseExecutionInput() {
	return {
		workspacePath: 'C:/workspace',
		workOrderPath: 'work-orders/test.workduck-work-order.json',
		workOrder: testWorkOrder,
		readExecutionContext: async () => ({
			agents: [],
			skills: [],
			references: [],
			personas: []
		}),
		readVault: () => null
	};
}

function readFailureCode(result: QueuePanelWorkOrderExecutionResult): string | null {
	return result.ok ? null : result.code;
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
