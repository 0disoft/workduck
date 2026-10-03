import { plugin, Transpiler } from 'bun';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { compile, compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { ProjectRepositoryLinkRecord } from './project-registry';
import type { ProjectRepositoryTaskRunRecord } from './project-repository-task';

await plugin({
	name: 'project-task-run-lifecycle-component',
	setup(build) {
		build.onLoad({ filter: /ProjectBoardRepositoryTaskRunLifecycle\.svelte$/ }, async ({ path }) => {
			let source = await Bun.file(path).text();
			source = source.replace(/from ['"]svelte['"]/g, 'from ' + JSON.stringify(import.meta.resolve('svelte/internal/client')));
			return { contents: compile(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
		build.onLoad({ filter: /project-board-task-run-lifecycle-harness\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});
const { createProjectBoardTaskRunLifecycleHarness } = await import('./project-board-task-run-lifecycle-harness.svelte');

const workspace: WorkspaceRecord = {
	id: 'workspace', name: 'Workspace', path: 'C:/workspaces/task-lifecycle', lock: null,
	createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z'
};
const repository: ProjectRepositoryLinkRecord = {
	id: 'repository', name: 'Demo', path: `${workspace.path}/projects/demo`, remoteUrl: null,
	upstreamRemoteUrl: null, githubCredentialSecretId: null, favorite: false, tags: [],
	createdAt: workspace.createdAt, updatedAt: workspace.updatedAt
};
function run(id: string, state: 'running' | 'succeeded' = 'running'): ProjectRepositoryTaskRunRecord {
	return { id, task: 'build', repositoryPath: repository.path!, command: 'bun run build', state,
		exitCode: state === 'running' ? null : 0, startedAt: workspace.createdAt,
		finishedAt: state === 'running' ? null : '2026-10-04T00:00:01.000Z',
		outputTail: null, recordPath: `${workspace.path}/.workduck/runs/${id}.json` };
}
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settleEffects() { await new Promise((resolve) => setTimeout(resolve, 0)); }

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const timers = new Map<number, { callback: () => void; delay: number }>();
let timerSequence = 0;
let testDocument: EventTarget & { visibilityState: string };
beforeEach(() => {
	timers.clear();
	testDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	Object.defineProperty(globalThis, 'document', { configurable: true, value: testDocument });
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), {
		setTimeout(callback: () => void, delay: number) {
			const id = ++timerSequence;
			timers.set(id, { callback, delay });
			return id;
		},
		clearTimeout(id: number) { timers.delete(id); }
	}) });
});
afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
	if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
	else Reflect.deleteProperty(globalThis, 'document');
});

describe('repository task run polling', () => {
	test('coalesces repeated focus refreshes into one follow-up and removes polling on teardown', async () => {
		const oldRead = deferred();
		const freshRead = deferred();
		let calls = 0;
		setTauriInvokeForTest(async <T>() => {
			const call = calls++;
			await (call === 0 ? oldRead : freshRead).promise;
			return { ok: true, records: [] } as T;
		});
		const harness = createProjectBoardTaskRunLifecycleHarness(workspace, [repository]);
		try {
			await settleEffects();
			for (let i = 0; i < 20; i += 1) window.dispatchEvent(new Event('focus'));
			expect(calls).toBe(1);
			oldRead.resolve();
			await settleEffects();
			expect(calls).toBe(2);
			freshRead.resolve();
			await settleEffects();
			expect(timers.size).toBe(1);
		} finally {
			oldRead.resolve(); freshRead.resolve();
			await settleEffects();
			harness.dispose();
		}
		expect(timers.size).toBe(0);
		window.dispatchEvent(new Event('focus'));
		testDocument.dispatchEvent(new Event('visibilitychange'));
		await settleEffects();
		expect(calls).toBe(2);
	});

	test('retains active, hidden, and idle polling intervals', async () => {
		let state: 'running' | 'succeeded' = 'running';
		setTauriInvokeForTest(async <T>() => ({ ok: true, records: [run('latest', state)] }) as T);
		const harness = createProjectBoardTaskRunLifecycleHarness(workspace, [repository]);
		try {
			await settleEffects();
			expect([...timers.values()].map((timer) => timer.delay)).toEqual([2_000]);
			testDocument.visibilityState = 'hidden';
			testDocument.dispatchEvent(new Event('visibilitychange'));
			expect([...timers.values()].map((timer) => timer.delay)).toEqual([60_000]);
			state = 'succeeded';
			testDocument.visibilityState = 'visible';
			testDocument.dispatchEvent(new Event('visibilitychange'));
			await settleEffects();
			expect(harness.records.repository?.state).toBe('succeeded');
			expect([...timers.values()].map((timer) => timer.delay)).toEqual([30_000]);
		} finally { harness.dispose(); }
	});

	test('keeps a newly started run while an older read and its queued refresh finish', async () => {
		const oldRead = deferred();
		const freshRead = deferred();
		let calls = 0;
		setTauriInvokeForTest(async <T>() => {
			const call = calls++;
			await (call === 0 ? oldRead : freshRead).promise;
			return { ok: true, records: [run(call === 0 ? 'old' : 'new', call === 0 ? 'succeeded' : 'running')] } as T;
		});
		const harness = createProjectBoardTaskRunLifecycleHarness(workspace, [repository]);
		try {
			await settleEffects();
			harness.records = { repository: run('new') };
			await settleEffects();
			expect(calls).toBe(1);
			oldRead.resolve();
			await settleEffects();
			expect(calls).toBe(2);
			expect(harness.records.repository?.id).toBe('new');
			expect(harness.records.repository?.state).toBe('running');
			freshRead.resolve();
			await settleEffects();
			expect(harness.records.repository?.id).toBe('new');
			expect([...timers.values()].map((timer) => timer.delay)).toEqual([2_000]);
		} finally {
			oldRead.resolve(); freshRead.resolve();
			await settleEffects();
			harness.dispose();
		}
	});

	for (const change of ['workspace-name', 'repository-tags', 'repository-order']) {
		test(`reuses polling across ${change} changes without another history read`, async () => {
			let calls = 0;
			setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: true, records: [] } as T; });
			const secondRepository = { ...repository, id: 'second', path: `${workspace.path}/projects/second` };
			const harness = createProjectBoardTaskRunLifecycleHarness(workspace, [repository, secondRepository]);
			try {
				await settleEffects();
				expect(calls).toBe(1);
				const timerId = [...timers.keys()][0];
				if (change === 'workspace-name') harness.setWorkspace({ ...workspace, name: 'Renamed' });
				else if (change === 'repository-tags') harness.setRepositories([{ ...repository, tags: ['new-tag'] }, secondRepository]);
				else harness.setRepositories([secondRepository, repository]);
				await settleEffects();
				expect(calls).toBe(1);
				expect([...timers.keys()]).toEqual([timerId!]);
			} finally { harness.dispose(); }
		});
	}

	for (const path of [repository.path!, repository.path!.replaceAll('/', '\\')]) {
		test(`refreshes when the last repository mapping for a shared path changes (${path})`, async () => {
			let calls = 0;
			setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: true, records: [run('latest')] } as T; });
			const secondRepository = { ...repository, id: 'second', path };
			const harness = createProjectBoardTaskRunLifecycleHarness(workspace, [repository, secondRepository]);
			try {
				await settleEffects();
				expect(harness.records.second?.id).toBe('latest');
				harness.setRepositories([secondRepository, repository]);
				await settleEffects();
				expect(calls).toBe(2);
				expect(harness.records.repository?.id).toBe('latest');
			} finally { harness.dispose(); }
		});
	}
});
