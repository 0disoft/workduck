import { expect, test } from 'bun:test';
import { readQueueArtifactSummary } from './domain/queue-artifact-readers';

test('result summaries retain their source work-order identity without a second file read', () => {
	const summary = readQueueArtifactSummary(JSON.stringify({
		schemaVersion: 'workduck.queue-result-report/v1',
		ref: { kind: 'queue-result-report', id: 'report_1', label: 'Result' },
		sourceWorkOrder: { kind: 'queue-work-order', id: 'order_1', label: 'Work' }
	}));
	expect(summary?.sourceWorkOrderId).toBe('order_1');
});

test('other schemas and malformed reference kinds cannot fabricate result links', () => {
	for (const [schemaVersion, kind] of [
		['workduck.queue-work-order/v1', 'queue-work-order'],
		['workduck.queue-result-report/v1', 'queue-result-report']
	]) {
		expect(readQueueArtifactSummary(JSON.stringify({
			schemaVersion, sourceWorkOrder: { kind, id: 'order_1' }
		}))?.sourceWorkOrderId).toBe('');
	}
});
