import { plugin, Transpiler } from 'bun';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest, type TauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { QueueCardEntry } from './queue-panel-types';
import { createEmptyEnvironmentVault } from '#lib/environment/environment-vault.ts';
import { closeEnvironmentVaultSession, setEnvironmentVaultSession } from '#lib/environment/environment-vault-session.ts';
import { createEmptyAgentRegistry, type AgentRegistry } from '#lib/agents/agent-registry.ts';
import { createEmptyAgentEvaluationSummary } from '#lib/agents/agent-evaluation.ts';
import { createEmptyPersonaRegistry } from '#lib/personas/persona-registry.ts';
import type { WorkduckQueueResultReport } from './queue-artifacts';

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
	afterEach(async () => {
		await closeEnvironmentVaultSession('old');
		await closeEnvironmentVaultSession('new');
		setTauriInvokeForTest(undefined);
		if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
		else Reflect.deleteProperty(globalThis, 'window');
	});

	test('keeps the new workspace draft and write busy state when an old save finishes', async () => {
		const oldSave = deferred<void>();
		const newSave = deferred<void>();
		const savePaths: unknown[] = [];
		const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'write_queue_work_order_file') {
				savePaths.push(args?.workspacePath);
				await (args?.workspacePath === workspace('old').path ? oldSave : newSave).promise;
				return response<T>({ ok: true, relativePath: 'work-orders/saved.workduck-work-order.json', content: args?.content });
			}
			return response<T>(command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false });
		};
		setTauriInvokeForTest(invoke);
		const harness = createQueuePanelControllerHarness(workspace('old'));
		let oldSaving: Promise<void> | undefined;
		let newSaving: Promise<void> | undefined;
		try {
			await settleEffects();
			const controller = harness.controller;
			controller.openNewWorkOrderDialog();
			controller.workOrderEditor.manualWorkOrderTitle = 'Old draft';
			controller.workOrderEditor.manualWorkOrderBody = 'Old body';
			oldSaving = controller.handleCreateManualWorkOrder({ preventDefault() {} } as SubmitEvent);
			assert.equal(savePaths.length, 1);
			harness.setWorkspace(workspace('new'));
			await settleEffects();
			assert.equal(controller.isWriting, false);
			assert.equal(controller.workOrderEditor.isNewWorkOrderDialogOpen, false);
			controller.openNewWorkOrderDialog();
			controller.workOrderEditor.manualWorkOrderTitle = 'New draft';
			controller.workOrderEditor.manualWorkOrderBody = 'New body';
			newSaving = controller.handleCreateManualWorkOrder({ preventDefault() {} } as SubmitEvent);
			assert.deepEqual(savePaths, [workspace('old').path, workspace('new').path]);
			oldSave.resolve();
			await oldSaving;
			assert.equal(controller.isWriting, true);
			assert.equal(controller.workOrderEditor.isNewWorkOrderDialogOpen, true);
			assert.equal(controller.workOrderEditor.manualWorkOrderBody, 'New body');
			newSave.resolve();
			await newSaving;
			assert.equal(controller.isWriting, false);
			assert.equal(controller.workOrderEditor.isNewWorkOrderDialogOpen, false);
		} finally {
			oldSave.resolve(); newSave.resolve();
			await Promise.all([oldSaving, newSaving]);
			harness.dispose();
		}
	});

	test('keeps execution context and vault on the initiating workspace and ignores its late result', async () => {
		const contextRead = deferred<void>();
		const executionResponse = deferred<void>();
		let executing = false;
		let contextReads = 0;
		const requests: Record<string, unknown>[] = [];
		const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_queue_file') return response<T>({ ok: true, relativePath: oldCard.relativePath, content: oldContent });
			if (command === 'preview_queue_work_order_prompt') return response<T>({ ok: true, previews: [], estimate: { confirmationToken: 'reviewed' } });
			if (command === 'read_workspace_data_file' && executing && args?.workspacePath === workspace('old').path) {
				contextReads += 1;
				await contextRead.promise;
			}
			if (command === 'execute_queue_work_order') {
				requests.push(args?.request as Record<string, unknown>);
				await executionResponse.promise;
				return response<T>({ ok: false, error: 'agent-provider-unavailable', workOrder: null });
			}
			return response<T>(command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false });
		};
		setTauriInvokeForTest(invoke);
		setEnvironmentVaultSession({ ...createEmptyEnvironmentVault('old'), nativeManaged: true });
		setEnvironmentVaultSession({ ...createEmptyEnvironmentVault('new'), nativeManaged: true });
		const harness = createQueuePanelControllerHarness(workspace('old'));
		let execution: Promise<void> | undefined;
		try {
			await settleEffects();
			harness.controller.handleQueueCardClick(oldCard);
			await settleEffects();
			await harness.controller.handlePreviewWorkOrderPrompt();
			executing = true;
			execution = harness.controller.handleConfirmExecuteWorkOrder();
			await settleEffects();
			assert.ok(contextReads > 0);
			harness.setWorkspace(workspace('new'));
			await settleEffects();
			contextRead.resolve();
			await settleEffects();
			assert.equal(requests.length, 1);
			assert.equal(requests[0]?.workspacePath, workspace('old').path);
			assert.equal((requests[0]?.vault as { workspaceId: string }).workspaceId, 'old');
			executionResponse.resolve();
			await execution;
			assert.equal(harness.controller.selectedWorkOrder, null);
			assert.equal(harness.controller.parseError, null);
		} finally {
			contextRead.resolve(); executionResponse.resolve();
			await execution;
			harness.dispose();
		}
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

	for (const selection of ['another-report', 'clear'] as const) {
		test(`keeps ${selection} selection when a pending evaluation save finishes`, async () => {
			const reportWrite = deferred<void>();
			let writeStarted = false;
			let agents: AgentRegistry = {
				...createEmptyAgentRegistry('old'),
				agents: [{
					id: 'agent_1', name: 'Agent 1', environmentSecretId: null, personaId: null,
					executionProvider: 'openai', modelId: '', evaluationKeys: [], evaluationResetAt: null,
					evaluationSummary: createEmptyAgentEvaluationSummary(),
					createdAt: oldCard.createdAt, updatedAt: oldCard.createdAt
				}]
			};
			let personas = createEmptyPersonaRegistry('old');
			const reports = new Map<string, string>();
			function reportCard(id: string): QueueCardEntry {
				const card = { ...oldCard, kind: 'result-report' as const, artifactId: id,
					relativePath: `reports/${id}.workduck-report.json`, fileName: `${id}.workduck-report.json` };
				const report: WorkduckQueueResultReport = {
					schemaVersion: 'workduck.queue-result-report/v1', ref: { id, kind: 'queue-result-report', label: id },
					status: 'active', createdAt: oldCard.createdAt,
					tasks: [{ id: 'task_agent_1_result', title: 'Agent 1: result', summary: 'Done', filesChanged: [], verification: [], risks: [] }]
				};
				reports.set(card.relativePath, JSON.stringify(report));
				return card;
			}
			const first = reportCard('report-first');
			const second = reportCard('report-second');
			setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
				if (command === 'read_workspace_data_file') {
					if (args?.fileName === 'agents.json') return response<T>({ ok: true, content: JSON.stringify(agents) });
					if (args?.fileName === 'personas.json') return response<T>({ ok: true, content: JSON.stringify(personas) });
				}
				if (command === 'read_queue_file') return response<T>({ ok: true, relativePath: args?.relativePath, content: reports.get(args?.relativePath as string) });
				if (command === 'write_workspace_registry_pair') {
					agents = { ...JSON.parse(args?.agentsContent as string), revision: agents.revision + 1 };
					personas = { ...JSON.parse(args?.personasContent as string), revision: personas.revision + 1 };
					return response<T>({ ok: true, agentsContent: JSON.stringify(agents), personasContent: JSON.stringify(personas) });
				}
				if (command === 'update_queue_result_report_file') {
					writeStarted = true;
					await reportWrite.promise;
					reports.set(args?.relativePath as string, args?.content as string);
					return response<T>({ ok: true, relativePath: args?.relativePath, content: args?.content });
				}
				if (command === 'list_queue_files') return response<T>({ ok: true, rootPath: 'C:/workspaces/old/queue', files: [] });
				return response<T>(command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false });
			});
			const harness = createQueuePanelControllerHarness(workspace('old'));
			let saving: Promise<void> | undefined;
			try {
				await settleEffects();
				const controller = harness.controller;
				controller.handleQueueCardClick(first);
				await settleEffects();
				controller.openEvaluationDialog(controller.selectedReport!.tasks[0]!);
				assert.ok(controller.evaluationDialog);
				saving = controller.handleSaveEvaluation({ preventDefault() {} } as SubmitEvent);
				await settleEffects();
				assert.equal(writeStarted, true);
				if (selection === 'clear') controller.handleQueueCardClick(first);
				else controller.handleQueueCardClick(second);
				await settleEffects();
				assert.equal(controller.selectedReport?.ref.id ?? null, selection === 'clear' ? null : second.artifactId);
				reportWrite.resolve();
				await saving;
				assert.equal(controller.selectedReport?.ref.id ?? null, selection === 'clear' ? null : second.artifactId);
				assert.equal(controller.selectedReportPath, selection === 'clear' ? null : second.relativePath);
				assert.equal(controller.status, null);
				assert.equal(controller.evaluationDialog, null);
				assert.equal(controller.isSavingEvaluation, false);
				assert.equal(controller.allAgents[0]?.evaluationSummary.totalCount, 1);
			} finally { reportWrite.resolve(); await saving; harness.dispose(); }
		});
	}
});
