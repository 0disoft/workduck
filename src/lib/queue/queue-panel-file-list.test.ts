import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canOpenQueueContextMenu } from './queue-panel-context-menu-lifecycle';
import { shouldBulkDeleteQueueFile } from './queue-panel-file-list';
import type { QueueCardEntry } from './queue-panel-types';

const file: QueueCardEntry = {
	relativePath: 'work-orders/test.workduck-work-order.json', fileName: 'test.workduck-work-order.json',
	kind: 'work-order', executionState: 'running', isRead: false, artifactId: 'wo_test',
	agentName: '', createdAt: '', title: 'Test', priority: 'normal', sourceReportId: '', skillIds: []
};

test('excludes running work orders from both bulk delete modes', () => {
	assert.equal(shouldBulkDeleteQueueFile(file, false), false);
	assert.equal(shouldBulkDeleteQueueFile(file, true), false);
});

test('does not offer individual deletion of a running work order', () => {
	assert.equal(canOpenQueueContextMenu(file, false), false);
});

test('preserves deletion rules for completed, pending, failed, and unsupported files', () => {
	for (const includePending of [true, false]) {
		assert.equal(shouldBulkDeleteQueueFile({ ...file, executionState: 'completed' }, includePending), true);
		for (const executionState of ['pending', 'failed'] as const) {
			const idle = { ...file, executionState };
			assert.equal(shouldBulkDeleteQueueFile(idle, includePending), includePending);
			assert.equal(canOpenQueueContextMenu(idle, false), true);
			assert.equal(canOpenQueueContextMenu(idle, true), false);
		}
		assert.equal(shouldBulkDeleteQueueFile({ ...file, executionState: null }, includePending), false);
		assert.equal(shouldBulkDeleteQueueFile({ ...file, kind: 'unsupported' }, includePending), false);
	}
	assert.equal(canOpenQueueContextMenu({ ...file, kind: 'unsupported' }, false), false);
});
