import { plugin, Transpiler } from 'bun';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest, type TauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { QueueCardEntry } from './queue-panel-types';

await plugin({
	name: 'queue-controller-runes',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
			let source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			if (path.endsWith('queue-panel-controller.svelte.ts')) {
				// Browser mount scheduling is excluded; effects use the same client runtime as compiled runes.
				source = source.replace(/import\s*\{\s*onMount,\s*tick,\s*untrack\s*\}\s*from\s*['"]svelte['"];?/,
					'import { tick, untrack } from ' + JSON.stringify(import.meta.resolve('svelte/internal/client')) + '; const onMount = () => {};');
			}
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});
const { createQueuePanelControllerHarness } = await import('./queue-panel-controller-harness.svelte');

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settleEffects() { await new Promise((resolve) => setTimeout(resolve, 0)); }
function workspace(id: string): WorkspaceRecord {
	return { id, name: id, path: `C:/workspaces/${id}`, lock: null, createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' };
}
function response<T>(value: unknown): T { return value as T; }
const oldCard: QueueCardEntry = {
	relativePath: 'work-orders/old.workduck-work-order.json', fileName: 'old.workduck-work-order.json',
	kind: 'work-order', executionState: 'pending', isRead: false, artifactId: 'work-order_old',
	agentName: '', createdAt: '2026-10-04T00:00:00.000Z', title: 'Old task', priority: 'normal',
	sourceReportId: '', skillIds: []
};
const oldContent = JSON.stringify({
	schemaVersion: 'workduck.queue-work-order/v1',
	ref: { id: 'work-order_old', kind: 'queue-work-order', label: 'Old work order' },
	status: 'active', createdAt: '2026-10-04T00:00:00.000Z',
	tasks: [{ id: 'task_old', title: 'Old task', body: 'Old body', agentIds: ['agent_1'] }]
});

describe('Queue controller workspace ownership', () => {
	const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
	beforeEach(() => {
		const values = new Map<string, string>();
		const localStorage: Storage = {
			get length() { return values.size; },
			clear() { values.clear(); },
			getItem(key) { return values.get(key) ?? null; },
			key(index) { return [...values.keys()][index] ?? null; },
			removeItem(key) { values.delete(key); },
			setItem(key, value) { values.set(key, value); }
		};
		Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { localStorage }) });
	});
	afterEach(() => {
		setTauriInvokeForTest(undefined);
		if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
		else Reflect.deleteProperty(globalThis, 'window');
	});
	for (const change of ['switch', 'return', 'rename']) test(`preserves artifact read ownership across ${change}`, async () => {
		const oldRead = deferred<void>();
		let readCalls = 0;
		const invoke: TauriInvoke = async <T>(command: string) => {
			if (command === 'read_queue_file') {
				readCalls += 1;
				await oldRead.promise;
				return response<T>({ ok: true, relativePath: oldCard.relativePath, content: oldContent });
			}
			return response<T>(command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false });
		};
		setTauriInvokeForTest(invoke);
		const harness = createQueuePanelControllerHarness(workspace('old'));
		try {
			await settleEffects();
			const controller = harness.controller;
			controller.handleQueueCardClick(oldCard);
			assert.equal(readCalls, 1);
			harness.setWorkspace(change === 'rename' ? { ...workspace('old'), name: 'Renamed' } : workspace('new'));
			await settleEffects();
			if (change === 'return') { harness.setWorkspace(workspace('old')); await settleEffects(); }
			oldRead.resolve();
			await settleEffects();
			if (change === 'rename') assert.equal(controller.selectedWorkOrder?.ref.id, 'work-order_old');
			else assert.equal(controller.selectedWorkOrder, null);
		} finally { oldRead.resolve(); harness.dispose(); }
	});

	test('lets the new refresh proceed and keeps its busy state when the old refresh finishes', async () => {
		const oldList = deferred<void>();
		const newList = deferred<void>();
		const listCalls: unknown[] = [];
		const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'list_queue_files') {
				const isOld = args?.workspacePath === workspace('old').path;
				listCalls.push(args?.workspacePath);
				await (isOld ? oldList : newList).promise;
				const name = isOld ? 'old.txt' : 'new.txt';
				return response<T>({ ok: true, path: `${args?.workspacePath}/queue`, files: [{ relativePath: name, fileName: name, kind: 'unsupported' }] });
			}
			return response<T>(command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false });
		};
		setTauriInvokeForTest(invoke);
		const harness = createQueuePanelControllerHarness(workspace('old'));
		try {
			await settleEffects();
			harness.setWorkspace(workspace('new'));
			await settleEffects();
			assert.deepEqual(listCalls, [workspace('old').path, workspace('new').path]);
			oldList.resolve();
			await settleEffects();
			assert.equal(harness.controller.isRefreshing, true);
			assert.equal(harness.controller.files.length, 0);
			newList.resolve();
			await settleEffects();
			assert.equal(harness.controller.isRefreshing, false);
			assert.deepEqual(harness.controller.files.map((file) => file.fileName), ['new.txt']);
		} finally { oldList.resolve(); newList.resolve(); harness.dispose(); }
	});

	test('does not reopen a closed prompt preview after its response arrives', async () => {
		const previewResponse = deferred<void>();
		let previewCalls = 0;
		const invoke: TauriInvoke = async <T>(command: string) => {
			if (command === 'read_queue_file') return response<T>({ ok: true, relativePath: oldCard.relativePath, content: oldContent });
			if (command === 'preview_queue_work_order_prompt') {
				previewCalls += 1;
				await previewResponse.promise;
				return response<T>({ ok: true, previews: [], estimate: { confirmationToken: 'closed-preview' } });
			}
			return response<T>(command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false });
		};
		setTauriInvokeForTest(invoke);
		const harness = createQueuePanelControllerHarness(workspace('old'));
		try {
			await settleEffects();
			harness.controller.handleQueueCardClick(oldCard);
			await settleEffects();
			assert.equal(harness.controller.selectedWorkOrder?.ref.id, 'work-order_old');
			const previewing = harness.controller.handlePreviewWorkOrderPrompt();
			await settleEffects();
			assert.equal(previewCalls, 1);
			harness.controller.closePromptPreviewDialog();
			previewResponse.resolve();
			await previewing;
			assert.equal(harness.controller.promptPreviews, null);
			assert.equal(harness.controller.promptEstimate, null);
			assert.equal(harness.controller.isPreviewingPrompt, false);
		} finally { previewResponse.resolve(); harness.dispose(); }
	});
});
