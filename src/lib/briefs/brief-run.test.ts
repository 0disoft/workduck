import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { setTauriInvokeForTest, type TauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import { readProjectRepositoryTaskRunRecords } from '#lib/projects/project-repository-task.ts';
import { createEmptyBriefRegistry, saveBriefDraft, type BriefRecord } from './brief-registry';
import { addBriefRunLink, createEmptyBriefRunRegistry, parseBriefRunRegistry, removeBriefRunLink, type BriefRunLink } from './brief-run-registry';
import { findLinkedReports, findLinkedTask, listBriefRunCandidates, readBriefRunEvidence, type BriefRunEvidence } from './brief-run-evidence';
import { readBriefRunRegistry, writeBriefRunRegistry } from './brief-run-storage';
import { briefRunMessages } from './brief-run-messages';
import { deriveBriefGate } from './brief-gate';
import { briefGateMessages } from './brief-gate-messages';

const brief: BriefRecord = saveBriefDraft(createEmptyBriefRegistry('ws-1'), {
	id: 'brief-1', title: 'Same title', instructions: 'Check the repository build.',
	project: { kind: 'project', id: 'p-1', label: 'Project' },
	repository: { kind: 'repo', id: 'r-1', label: 'Repository' }, repositoryPath: 'projects/repo'
}, '2026-09-08T00:00:00.000Z')!.briefs[0]!;
const link: BriefRunLink = { id: 'link-1', brief, sourceKind: 'repository-task', sourceId: 'task-1', createdAt: brief.createdAt };
const evidence: BriefRunEvidence = {
	incomplete: false,
	taskRuns: [{ id: 'task-1', task: 'build', repositoryPath: 'C:\\workspace\\projects\\repo', command: 'build', state: 'succeeded', exitCode: 0, startedAt: brief.createdAt, finishedAt: brief.updatedAt, outputTail: null, recordPath: 'C:/workspace/.workduck/runs/task-1.json' }],
	workOrders: [{ schemaVersion: 'workduck.queue-work-order/v1', ref: { kind: 'queue-work-order', id: 'wo-1', label: 'Same title' }, status: 'archived', createdAt: brief.createdAt, tasks: [{ id: 't-1', title: 'Same title', body: 'Check build', repositoryIds: ['r-1'] }] }],
	reports: [{ schemaVersion: 'workduck.queue-result-report/v1', ref: { kind: 'queue-result-report', id: 'report-1', label: 'Same title' }, sourceWorkOrder: { kind: 'queue-work-order', id: 'wo-1', label: 'Same title' }, status: 'archived', createdAt: brief.createdAt, tasks: [{ id: 't-1', title: 'Same title', summary: 'Done', filesChanged: ['README.md'], verification: ['All tests passed'], risks: [] }] }]
};

describe('Brief run links', () => {
	afterEach(() => setTauriInvokeForTest(undefined));
	test('roundtrips immutable link-time instructions and rejects duplicate links', () => {
		const registry = addBriefRunLink(createEmptyBriefRunRegistry('ws-1'), link)!;
		assert.deepEqual(parseBriefRunRegistry(JSON.stringify(registry), 'ws-1'), registry);
		assert.equal(addBriefRunLink(registry, { ...link, id: 'another-link' }), null);
		assert.equal(parseBriefRunRegistry(JSON.stringify(registry), 'another-workspace'), null);
		assert.equal(removeBriefRunLink(registry, link.id).links.length, 0);
		assert.equal(registry.links[0]?.brief.instructions, brief.instructions);
	});
	test('matches native task paths across Windows separators without matching other repositories', () => {
		assert.equal(findLinkedTask(link, 'C:/workspace', evidence)?.id, 'task-1');
		assert.equal(findLinkedTask({ ...link, brief: { ...brief, repositoryPath: 'projects/other' } }, 'C:/workspace', evidence), null);
		assert.equal(findLinkedTask({ ...link, brief: { ...brief, repositoryPath: '../outside' } }, 'C:/workspace', { ...evidence, taskRuns: [{ ...evidence.taskRuns[0]!, repositoryPath: '../outside' }] }), null);
	});
	test('does not confuse case-sensitive Unix paths', () => {
		assert.equal(findLinkedTask(link, '/workspace', { ...evidence, taskRuns: [{ ...evidence.taskRuns[0]!, repositoryPath: '/workspace/projects/Repo' }] }), null);
	});
	test('matches Windows drive-root workspaces using case-insensitive path identity', () => {
		const task = { ...evidence.taskRuns[0]!, repositoryPath: 'c:\\PROJECTS\\REPO\\' };
		const source = { ...evidence, taskRuns: [task], workOrders: [] };
		for (const root of ['C:/', 'C:\\', '\\\\?\\C:\\']) {
			assert.equal(findLinkedTask(link, root, source), task);
			assert.equal(listBriefRunCandidates(brief, root, source)[0]?.id, task.id);
			assert.equal(deriveBriefGate(link, root, source).state, 'passed');
		}
	});
	test('keeps literal Unix backslashes distinct from nested directories in evidence and gates', () => {
		const unixBrief = { ...brief, repositoryPath: 'projects/a\\b' };
		const unixLink = { ...link, brief: unixBrief };
		const task = { ...evidence.taskRuns[0]!, repositoryPath: '/workspace/projects/a/b' };
		const source = { ...evidence, taskRuns: [task], workOrders: [] };
		assert.equal(findLinkedTask(unixLink, '/workspace', source), null);
		assert.deepEqual(listBriefRunCandidates(unixBrief, '/workspace', source), []);
		assert.equal(deriveBriefGate(unixLink, '/workspace', source).state, 'pending');
		const matchingTask = { ...task, repositoryPath: '/workspace/projects/a\\b' };
		assert.equal(findLinkedTask(unixLink, '/workspace', { ...source, taskRuns: [matchingTask] }), matchingTask);
	});
	test('resolves Unix root paths and rejects sibling workspaces or traversal', () => {
		const task = { ...evidence.taskRuns[0]!, repositoryPath: '/projects/repo' };
		assert.equal(findLinkedTask(link, '/', { ...evidence, taskRuns: [task] }), task);
		for (const path of ['/workspace-other/projects/repo', '/workspace/projects/../repo', '/workspace/./projects/repo']) {
			const foreign = { ...task, repositoryPath: path };
			assert.equal(findLinkedTask(link, '/workspace', { ...evidence, taskRuns: [foreign] }), null);
		}
	});
	test('requires exact repository and work-order IDs, not matching report titles', () => {
		const queueLink: BriefRunLink = { ...link, sourceKind: 'queue-work-order', sourceId: 'wo-1' };
		assert.equal(findLinkedReports(queueLink, evidence).length, 1);
		assert.equal(findLinkedReports({ ...queueLink, sourceId: 'wo-2' }, evidence).length, 0);
		const unrelated = { ...evidence.reports[0]!, sourceWorkOrder: { kind: 'queue-work-order' as const, id: 'wo-other', label: 'Same title' } };
		assert.equal(findLinkedReports(queueLink, { ...evidence, reports: [unrelated] }).length, 0);
		assert.equal(listBriefRunCandidates({ ...brief, repository: { ...brief.repository, id: 'r-2' }, repositoryPath: null }, 'C:/workspace', evidence).length, 0);
	});
	test('does not select duplicate IDs or offer queue links from an incomplete scan', () => {
		assert.equal(findLinkedTask(link, 'C:/workspace', { ...evidence, taskRuns: [evidence.taskRuns[0]!, evidence.taskRuns[0]!] }), null);
		assert.deepEqual(listBriefRunCandidates(brief, 'C:/workspace', { ...evidence, incomplete: true }).map((item) => item.kind), ['repository-task']);
		assert.equal(findLinkedReports({ ...link, sourceKind: 'queue-work-order', sourceId: 'wo-1' }, { ...evidence, workOrders: [evidence.workOrders[0]!, evidence.workOrders[0]!] }).length, 0);
	});
	test('saves link metadata through native revision checks and restores it on read', async () => {
		let content: string | null = null;
		setTauriInvokeForTest((async (command, args) => {
			assert.equal(args?.fileName, 'brief-runs.json');
			if (command === 'read_workspace_data_file') return { ok: true, content };
			assert.equal(command, 'write_workspace_registry_file');
			content = JSON.stringify({ ...JSON.parse(String(args?.content)), revision: 1 });
			return { ok: true, content };
		}) as TauriInvoke);
		const saved = await writeBriefRunRegistry(addBriefRunLink(createEmptyBriefRunRegistry('ws-1'), link)!, 'C:/workspace');
		assert.equal(saved.ok, true);
		assert.deepEqual(await readBriefRunRegistry('ws-1', 'C:/workspace'), saved);
	});
	test('limits concurrent queue reads and cancels the remaining scan when the panel closes', async () => {
		let reads = 0;
		const controller = new AbortController();
		setTauriInvokeForTest((async (command, args) => {
			if (command === 'read_project_repository_task_run_records') return { ok: true, records: [] };
			if (command === 'list_queue_files') return { ok: true, path: 'C:/workspace/queue', files: Array.from({ length: 12 }, (_, index) => ({ relativePath: `queue/work-orders/${index}.workduck-work-order.json`, fileName: `${index}.workduck-work-order.json`, kind: 'work-order' })) };
			assert.equal(command, 'read_queue_file');
			reads += 1; controller.abort();
			return { ok: true, relativePath: args?.relativePath, content: JSON.stringify(evidence.workOrders[0]) };
		}) as TauriInvoke);
		const result = await readBriefRunEvidence('C:/workspace', controller.signal);
		assert.equal(reads, 4);
		assert.equal(result.incomplete, true);
	});
	test('keeps run messages complete across all six languages', () => {
		for (const messages of Object.values(briefRunMessages)) assert.deepEqual(Object.keys(messages).sort(), Object.keys(briefRunMessages.en).sort());
	});
	test('reloads an older linked build by its ID after a newer repository task appears', async () => {
		const newest = { ...evidence.taskRuns[0]!, id: 'task-new', state: 'running', exitCode: null, finishedAt: null };
		setTauriInvokeForTest((async (command, args) => {
			if (command === 'list_queue_files') return { ok: true, files: [] };
			assert.equal(command, 'read_project_repository_task_run_records');
			if (args?.runIds) {
				assert.deepEqual(args.runIds, ['task-1']);
				return { ok: true, records: evidence.taskRuns };
			}
			return { ok: true, records: [newest] };
		}) as TauriInvoke);
		const loaded = await readBriefRunEvidence('C:/workspace', undefined, [link.sourceId]);
		assert.deepEqual(loaded.taskRuns.map((task) => task.id), ['task-new', 'task-1']);
		assert.equal(deriveBriefGate(link, 'C:/workspace', loaded).reason, 'buildPassed');
	});
	test('failed historical reads cannot reuse stale passing evidence from the latest response', async () => {
		setTauriInvokeForTest((async (command, args) => {
			if (command === 'list_queue_files') return { ok: true, files: [] };
			return args?.runIds ? { ok: false, records: [], error: 'project-repository-task-record-read-failed' }
				: { ok: true, records: evidence.taskRuns };
		}) as TauriInvoke);
		const loaded = await readBriefRunEvidence('C:/workspace', undefined, [link.sourceId]);
		assert.equal(loaded.incomplete, true);
		assert.equal(findLinkedTask(link, 'C:/workspace', loaded), null);
		assert.equal(deriveBriefGate(link, 'C:/workspace', loaded).reason, 'missing');
	});
	test('coalesces identical history queries without confusing latest and historical reads', async () => {
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => { release = resolve; });
		const queries: unknown[] = [];
		setTauriInvokeForTest((async (_command, args) => {
			queries.push(args?.runIds); await barrier;
			return { ok: true, records: [] };
		}) as TauriInvoke);
		const latest = readProjectRepositoryTaskRunRecords('C:/workspace');
		const historical = readProjectRepositoryTaskRunRecords('C:/workspace', ['b', 'a']);
		const repeated = readProjectRepositoryTaskRunRecords('C:/workspace', ['a', 'b', 'a']);
		assert.equal(historical, repeated);
		assert.notEqual(latest, historical);
		assert.deepEqual(queries, [undefined, ['a', 'b']]);
		release(); await Promise.all([latest, historical, repeated]);
	});
	test('keeps report tasks from another repository out of the linked result', () => {
		const mixed: BriefRunEvidence = {
			...evidence,
			workOrders: [{ ...evidence.workOrders[0]!, tasks: [...evidence.workOrders[0]!.tasks, { id: 't-other', title: 'Same title', body: 'Another repo', repositoryIds: ['r-other'] }] }],
			reports: [{ ...evidence.reports[0]!, tasks: [...evidence.reports[0]!.tasks, { ...evidence.reports[0]!.tasks[0]!, id: 't-other' }] }]
		};
		const reports = findLinkedReports({ ...link, sourceKind: 'queue-work-order', sourceId: 'wo-1' }, mixed);
		assert.deepEqual(reports[0]?.tasks.map((task) => task.id), ['t-1']);
	});

	test('passes only a completed native build and constructs the shared Brief Run Gate graph', () => {
		const gate = deriveBriefGate(link, 'C:/workspace', evidence);
		assert.equal(gate.state, 'passed');
		assert.equal(gate.reason, 'buildPassed');
		assert.equal(gate.loop.run.brief?.id, brief.id);
		assert.equal(gate.loop.run.repoRefs[0]?.id, 'r-1');
		assert.equal(gate.loop.gateEvaluations[0]?.state, 'passed');
		for (const task of [
			{ ...evidence.taskRuns[0]!, exitCode: null },
			{ ...evidence.taskRuns[0]!, finishedAt: null },
			{ ...evidence.taskRuns[0]!, finishedAt: 'invalid' },
			{ ...evidence.taskRuns[0]!, finishedAt: '2020-01-01T00:00:00Z' },
			{ ...evidence.taskRuns[0]!, task: 'install-dependencies' as const },
			{ ...evidence.taskRuns[0]!, state: 'running' as const }
		]) assert.equal(deriveBriefGate(link, 'C:/workspace', { ...evidence, taskRuns: [task] }).state, 'pending');
	});

	test('blocks failures and stops, and clears a passed gate if its source disappears', () => {
		for (const state of ['failed', 'stopped'] as const) {
			assert.equal(deriveBriefGate(link, 'C:/workspace', { ...evidence, taskRuns: [{ ...evidence.taskRuns[0]!, state }] }).state, 'blocked');
		}
		assert.equal(deriveBriefGate(link, 'C:/workspace', { ...evidence, taskRuns: [{ ...evidence.taskRuns[0]!, exitCode: 1 }] }).state, 'blocked');
		assert.equal(deriveBriefGate(link, 'C:/workspace', { ...evidence, taskRuns: [] }).state, 'pending');
	});

	test('does not turn archived work orders or report claims into a passing gate', () => {
		const queueLink: BriefRunLink = { ...link, sourceKind: 'queue-work-order', sourceId: 'wo-1' };
		const gate = deriveBriefGate(queueLink, 'C:/workspace', evidence);
		assert.equal(gate.state, 'pending');
		assert.equal(gate.reason, 'reportNeedsReview');
		assert.equal(deriveBriefGate(queueLink, 'C:/workspace', { ...evidence, workOrders: [{ ...evidence.workOrders[0]!, status: 'failed' }] }).state, 'blocked');
	});

	test('localizes all gate states and evidence reasons', () => {
		for (const messages of Object.values(briefGateMessages)) assert.deepEqual(Object.keys(messages).sort(), Object.keys(briefGateMessages.en).sort());
	});
});
