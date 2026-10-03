import { plugin, Transpiler } from 'bun';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { subscribeProjectRegistry } from './project-storage';
import {
	addProjectNode, createEmptyProjectRegistry, setProjectNodeDescription, setProjectNodeTags,
	type ProjectRegistry
} from './project-registry';

await plugin({
	name: 'project-registry-writer-runes',
	setup(build) {
		build.onLoad({ filter: /project-board-registry-writer(?:-harness)?\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});
const { createProjectBoardRegistryWriterHarness } = await import('./project-board-registry-writer-harness.svelte');

function workspace(id: string): WorkspaceRecord {
	return { id, name: id, path: `C:/workspaces/${id}`, lock: null,
		createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' };
}
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settleEffects() { await new Promise((resolve) => setTimeout(resolve, 0)); }

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
	const values = new Map<string, string>();
	const localStorage: Storage = {
		get length() { return values.size; }, clear() { values.clear(); },
		getItem(key) { return values.get(key) ?? null; }, key(index) { return [...values.keys()][index] ?? null; },
		removeItem(key) { values.delete(key); }, setItem(key, value) { values.set(key, value); }
	};
	Object.defineProperty(globalThis, 'window', { configurable: true,
		value: Object.assign(new EventTarget(), { localStorage }) });
});
afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

describe('project board registry write ownership', () => {
	for (const staleRefresh of [false, true]) test(`keeps sequential field edits during a pending save${staleRefresh ? ' and stale refresh' : ''}`, async () => {
		const added = addProjectNode(createEmptyProjectRegistry('old'), {
			kind: 'project', name: 'Demo', path: 'projects/demo', description: 'Original'
		});
		if (!added.ok) throw new Error(added.error);
		const original = added.registry;
		const nodeId = original.nodes[0]!.id;
		const entered = deferred();
		const pending = deferred();
		let persisted: ProjectRegistry | null = null;
		let calls = 0;
		setTauriInvokeForTest(async <T>(_command: string, args?: Record<string, unknown>) => {
			calls += 1;
			persisted = JSON.parse(args?.registryJson as string) as ProjectRegistry;
			if (calls === 1) { entered.resolve(); await pending.promise; }
			return { ok: true } as T;
		});
		const harness = createProjectBoardRegistryWriterHarness(workspace('old'));
		const saves: Promise<boolean>[] = [];
		try {
			await settleEffects();
			harness.state.registry = original;
			expect(harness.visibleRegistry.nodes[0]?.description).toBe('Original');
			const description = setProjectNodeDescription(harness.getRegistry(), { nodeId, description: 'Edited' });
			if (!description.ok) throw new Error(description.error);
			saves.push(harness.persistRegistry(description.registry));
			expect(harness.visibleRegistry.nodes[0]?.description).toBe('Edited');
			await entered.promise;
			if (staleRefresh) harness.state.registry = original;
			const tags = setProjectNodeTags(harness.getRegistry(), { nodeId, tags: ['edited'] });
			if (!tags.ok) throw new Error(tags.error);
			saves.push(harness.persistRegistry(tags.registry));
			pending.resolve();
			expect(await Promise.all(saves)).toEqual([true, true]);
			expect((persisted as ProjectRegistry | null)?.nodes[0]?.description).toBe('Edited');
			expect((persisted as ProjectRegistry | null)?.nodes[0]?.tags).toEqual(['edited']);
			expect(harness.getRegistry().nodes[0]?.description).toBe('Edited');
			expect(harness.getRegistry().nodes[0]?.tags).toEqual(['edited']);
		} finally {
			pending.resolve();
			await Promise.all(saves);
			harness.dispose();
		}
	});

	for (const [firstOk, lastOk] of [[false, true], [true, false]] as const) test(`keeps the newest draft across older ${firstOk ? 'success' : 'failure'} feedback`, async () => {
		const firstPending = deferred();
		const lastEntered = deferred();
		const lastPending = deferred();
		let calls = 0;
		setTauriInvokeForTest(async <T>() => {
			calls += 1;
			const ok = calls === 1 ? firstOk : calls === 2 ? lastOk : true;
			if (calls === 1) await firstPending.promise;
			else { lastEntered.resolve(); await lastPending.promise; }
			return { ok, error: ok ? null : 'project-registry-write-failed' } as T;
		});
		const harness = createProjectBoardRegistryWriterHarness(workspace('old'));
		const unsubscribe = subscribeProjectRegistry('old', (next) => { harness.state.registry = next; });
		const saves: Promise<boolean>[] = [];
		try {
			await settleEffects();
			const original = { ...createEmptyProjectRegistry('old'), updatedAt: '2026-10-04T00:00:01.000Z' };
			const latest = { ...original, updatedAt: '2026-10-04T00:00:02.000Z' };
			saves.push(harness.persistRegistry(original), harness.persistRegistry(latest));
			firstPending.resolve();
			expect(await saves[0]).toBe(firstOk);
			await lastEntered.promise;
			expect(harness.visibleRegistry).toEqual(latest);
			expect(harness.state.storageError).toBeNull();
			lastPending.resolve();
			expect(await saves[1]).toBe(lastOk);
			expect(harness.getRegistry()).toEqual(latest);
			expect(harness.state.storageError).toBe(lastOk ? null : 'project-registry-write-failed');
			if (!lastOk) {
				harness.state.registry = original;
				harness.state.storageError = null;
				expect(harness.visibleRegistry).toEqual(latest);
				expect(harness.visibleError).toBe('project-registry-write-failed');
				const retry = { ...harness.getRegistry(), updatedAt: '2026-10-04T00:00:03.000Z' };
				saves.push(harness.persistRegistry(retry));
				expect(await saves[2]).toBe(true);
				expect(harness.visibleError).toBeNull();
				const refreshed = { ...retry, updatedAt: '2026-10-04T00:00:04.000Z' };
				harness.state.registry = refreshed;
				expect(harness.visibleRegistry).toEqual(refreshed);
			}
		} finally {
			firstPending.resolve(); lastPending.resolve();
			await Promise.all(saves);
			unsubscribe(); harness.dispose();
		}
	});

	for (const ok of [true, false]) test(`preserves ${ok ? 'success' : 'failure'} feedback when only workspace metadata changes`, async () => {
		const pending = deferred();
		let calls = 0;
		setTauriInvokeForTest(async <T>() => {
			calls += 1; await pending.promise;
			return { ok, error: ok ? null : 'project-registry-write-failed' } as T;
		});
		const harness = createProjectBoardRegistryWriterHarness(workspace('old'));
		let saving: Promise<boolean> | undefined;
		try {
			await settleEffects();
			const saved = { ...createEmptyProjectRegistry('old'), updatedAt: '2026-10-04T00:00:01.000Z' };
			saving = harness.persistRegistry(saved);
			harness.setWorkspace({ ...workspace('old'), name: 'Renamed' });
			await settleEffects();
			pending.resolve();
			expect(await saving).toBe(ok);
			expect(harness.state.registry).toEqual(saved);
			expect(harness.state.storageError).toBe(ok ? null : 'project-registry-write-failed');
			expect(calls).toBe(1);
		} finally {
			pending.resolve();
			await saving;
			harness.dispose();
		}
	});

	test('does not start a write for another workspace or a disposed view', async () => {
		let calls = 0;
		setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: true } as T; });
		const harness = createProjectBoardRegistryWriterHarness(workspace('old'));
		await settleEffects();
		expect(await harness.persistRegistry(createEmptyProjectRegistry('new'))).toBe(false);
		harness.dispose();
		expect(await harness.persistRegistry(createEmptyProjectRegistry('old'))).toBe(false);
		expect(calls).toBe(0);
	});

	for (const change of ['switch', 'return', 'rename', 'dispose']) {
		for (const ok of [true, false]) test(`ignores a late ${ok ? 'success' : 'failure'} across ${change}`, async () => {
			const pending = deferred();
			setTauriInvokeForTest(async <T>() => {
				await pending.promise;
				return { ok, error: ok ? null : 'project-registry-write-failed' } as T;
			});
			const harness = createProjectBoardRegistryWriterHarness(workspace('old'));
			let saving: Promise<boolean> | undefined;
			try {
				await settleEffects();
				saving = harness.persistRegistry({ ...createEmptyProjectRegistry('old'), updatedAt: '2026-10-04T00:00:01.000Z' });
				if (change === 'dispose') harness.dispose();
				else {
					harness.setWorkspace(change === 'rename' ? { ...workspace('old'), path: 'C:/workspaces/renamed' } : workspace('new'));
					await settleEffects();
					if (change === 'return') {
						harness.setWorkspace(workspace('old'));
						await settleEffects();
					}
				}
				harness.state.registry = { ...createEmptyProjectRegistry(change === 'switch' ? 'new' : 'old'), updatedAt: '2026-10-04T00:00:02.000Z' };
				const current = harness.state.registry;
				expect(harness.getRegistry()).toEqual(current);
				pending.resolve();
				expect(await saving).toBe(ok);
				expect(harness.state.registry).toEqual(current);
				expect(harness.state.storageError).toBeNull();
			} finally {
				pending.resolve();
				await saving;
				if (change !== 'dispose') harness.dispose();
			}
		});
	}
});
