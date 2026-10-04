import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createEmptyAgentRegistry, type AgentRegistry } from '#lib/agents/agent-registry.ts';
import { createEmptyPersonaRegistry } from '#lib/personas/persona-registry.ts';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { createDefaultAgentEvaluationScores, createEmptyAgentEvaluationSummary } from '#lib/agents/agent-evaluation.ts';
import { hasQueueReportTaskEvaluation, recordQueueReportTaskEvaluation, type WorkduckQueueResultReport } from './queue-artifacts';
import { saveQueuePanelEvaluation } from './queue-panel-evaluation-save-workflow';

const report: WorkduckQueueResultReport = {
	schemaVersion: 'workduck.queue-result-report/v1',
	ref: { id: 'report-1', kind: 'queue-result-report', label: 'Report' },
	status: 'active', createdAt: '2026-10-04T00:00:00.000Z',
	tasks: [{ id: 'task-1', title: 'Agent 1: result', summary: 'Done', filesChanged: [], verification: [], risks: [] }]
};
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), {
		localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key) }
	}) });
});
afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

function storage() {
	let agents: AgentRegistry = { ...createEmptyAgentRegistry('workspace-1'), agents: [{
		id: 'agent-1', name: 'Agent 1', environmentSecretId: null, personaId: null, executionProvider: 'openai', modelId: '',
		evaluationSummary: createEmptyAgentEvaluationSummary(),
		evaluationKeys: [], evaluationResetAt: null, createdAt: report.createdAt, updatedAt: report.createdAt
	}] };
	let personas = createEmptyPersonaRegistry('workspace-1');
	let content = JSON.stringify(report);
	let pairWrites = 0;
	let reportWrites = 0;
	let failReportWrite = false;
	let changeBeforeReportWrite: ((current: string) => string) | undefined;
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_workspace_data_file') return { ok: true, content: JSON.stringify(args?.fileName === 'agents.json' ? agents : personas) } as T;
		if (command === 'write_workspace_registry_pair') {
			pairWrites += 1;
			agents = { ...JSON.parse(args?.agentsContent as string), revision: agents.revision + 1 };
			personas = { ...JSON.parse(args?.personasContent as string), revision: personas.revision + 1 };
			return { ok: true, agentsContent: JSON.stringify(agents), personasContent: JSON.stringify(personas) } as T;
		}
		if (command === 'read_queue_file') return { ok: true, relativePath: 'reports/report-1.workduck-report.json', content } as T;
		if (command === 'update_queue_result_report_file') {
			reportWrites += 1;
			if (changeBeforeReportWrite) { content = changeBeforeReportWrite(content); changeBeforeReportWrite = undefined; }
			if (args?.expectedContent !== content) return { ok: false, error: 'queue-folder-file-write-failed' } as T;
			if (failReportWrite) return { ok: false, error: 'queue-folder-file-write-failed' } as T;
			content = args?.content as string;
			return { ok: true, relativePath: args?.relativePath, content } as T;
		}
		throw new Error(command);
	});
	return {
		get agents() { return agents; }, get content() { return content; }, set content(next: string) { content = next; },
		get pairWrites() { return pairWrites; }, get reportWrites() { return reportWrites; },
		set failReportWrite(next: boolean) { failReportWrite = next; },
		set changeBeforeReportWrite(next: ((current: string) => string) | undefined) { changeBeforeReportWrite = next; }
	};
}
function save() {
	return saveQueuePanelEvaluation({ workspaceId: 'workspace-1', workspacePath: 'C:/workspace', report,
		reportPath: 'reports/report-1.workduck-report.json', task: report.tasks[0]!, agentId: 'agent-1', scores: createDefaultAgentEvaluationScores() });
}

describe('Queue evaluation persistence', () => {
	test('a changed report snapshot is preserved and a retry repairs only its marker', async () => {
		const state = storage();
		state.changeBeforeReportWrite = current => JSON.stringify({ ...JSON.parse(current), ref: { ...report.ref, label: 'Newer label' } });
		const first = await save();
		expect(first.ok).toBe(false);
		if (!first.ok) expect(first.code).toBe('report-write-failed');
		expect((JSON.parse(state.content) as WorkduckQueueResultReport).ref.label).toBe('Newer label');
		expect((await save()).ok).toBe(true);
		expect(state.pairWrites).toBe(1);
		expect(state.agents.agents[0]?.evaluationSummary.totalCount).toBe(1);
		expect((JSON.parse(state.content) as WorkduckQueueResultReport).ref.label).toBe('Newer label');
	});

	test('a replaced report identity is rejected before scores are recorded', async () => {
		const state = storage();
		state.content = JSON.stringify({ ...report, ref: { ...report.ref, id: 'different-report' } });
		const result = await save();
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('report-read-failed');
		expect(state.pairWrites).toBe(0);
		expect(state.reportWrites).toBe(0);
	});
	test('repairs a failed report marker on retry without recording scores again', async () => {
		const state = storage();
		state.failReportWrite = true;
		expect((await save()).ok).toBe(false);
		expect(state.agents.agents[0]?.evaluationSummary.totalCount).toBe(1);
		const otherTask = { ...report.tasks[0]!, id: 'task-other', title: 'Newer task' };
		const latest = recordQueueReportTaskEvaluation({ ...report, status: 'archived', tasks: [...report.tasks, otherTask] }, 'task-other', 'agent-other');
		state.content = JSON.stringify(latest);
		state.failReportWrite = false;
		const retried = await save();
		expect(retried.ok).toBe(true);
		expect(state.agents.agents[0]?.evaluationSummary.totalCount).toBe(1);
		const persisted = JSON.parse(state.content) as WorkduckQueueResultReport;
		expect(hasQueueReportTaskEvaluation(persisted.tasks[0]!, 'agent-1')).toBe(true);
		expect(persisted.status).toBe('archived');
		expect(hasQueueReportTaskEvaluation(persisted.tasks[1]!, 'agent-other')).toBe(true);
		expect(state.pairWrites).toBe(1);
	});

	test('skips writes when scores and report marker are already consistent', async () => {
		const state = storage();
		expect((await save()).ok).toBe(true);
		const writes = [state.pairWrites, state.reportWrites];
		expect((await save()).ok).toBe(true);
		expect([state.pairWrites, state.reportWrites]).toEqual(writes);
	});
});
