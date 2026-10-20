import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { parseQueueWorkOrder } from './queue-artifacts';
import { updateQueueWorkOrderSnapshot } from './queue-folder';

afterEach(() => setTauriInvokeForTest(undefined));

const original = JSON.stringify({
	schemaVersion: 'workduck.queue-work-order/v1',
	ref: { id: 'work-order_test', kind: 'queue-work-order', label: 'Test' },
	status: 'active', createdAt: '2026-10-20T00:00:00Z',
	tasks: [{ id: 'task_test', title: 'Test', body: 'Original' }]
});

for (const changed of [false, true]) {
	test(`work-order save ${changed ? 'rejects an external change' : 'passes the exact raw snapshot'}`, async () => {
		const snapshot = parseQueueWorkOrder(original);
		if (!snapshot.ok) throw new Error(snapshot.message);
		const current = changed ? original.replace('Original', 'External edit') : original;
		let writes = 0;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_queue_file') return { ok: true, relativePath: 'work-orders/test.workduck-work-order.json', content: current } as T;
			if (command === 'update_queue_work_order_file') {
				writes++;
				expect(args?.expectedContent).toBe(original);
				return { ok: true, relativePath: args?.relativePath, content: args?.content } as T;
			}
			throw new Error(command);
		});
		const result = await updateQueueWorkOrderSnapshot('C:/workspace', 'work-orders/test.workduck-work-order.json', original, snapshot.workOrder);
		expect(result.ok).toBe(!changed);
		if (!result.ok) expect(result.error).toBe('queue-folder-file-changed');
		expect(writes).toBe(changed ? 0 : 1);
	});
}
