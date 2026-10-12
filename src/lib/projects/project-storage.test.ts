import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { addProjectNode, createEmptyProjectRegistry, type ProjectRegistry } from './project-registry';
import { readProjectRegistry, readProjectRegistries, restoreWorkspaceSyncData, subscribeProjectRegistry, writeProjectRegistries, writeProjectRegistry } from './project-storage';
import { initializeWorkduckAppState, resetWorkduckAppStateStorageForTest, WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY } from '#lib/app-state/app-state-storage.ts';
import { createEmptyWorkspaceRegistry, addWorkspace, serializeWorkspaceRegistry, WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY } from '#lib/workspaces/workspace-registry.ts';
import { readWorkspaceRegistryFromBrowser, subscribeWorkspaceRegistry, writeWorkspaceRegistryToBrowser } from '#lib/workspaces/workspace-storage.ts';

function registry(workspaceId: string, revision: number) {
	return { ...createEmptyProjectRegistry(workspaceId), updatedAt: `2026-10-04T00:00:0${revision}.000Z` };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}

async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

function writtenRegistries(command: string, args?: Record<string, unknown>) {
	expect(['write_project_registry', 'write_project_registries']).toContain(command);
	const values = command === 'write_project_registry'
		? { [args?.workspaceId as string]: args?.registryJson as string }
		: Object.fromEntries(Object.entries(args?.registries as Record<string, { registryJson: string }>).map(
			([id, value]) => [id, value.registryJson]
		));
	return Object.fromEntries(Object.entries(values).map(([id, json]) => [id, JSON.parse(json) as ProjectRegistry]));
}

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
	resetWorkduckAppStateStorageForTest();
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

test('sync restore failures do not publish either registry or journal a speculative workspace list', async () => {
	const before = createEmptyWorkspaceRegistry();
	const added = addWorkspace(before, { name: 'Imported', path: 'C:\\imported' });
	if (!added.ok) throw Error('fixture workspace');
	const original = registry(added.workspace.id, 1), imported = registry(added.workspace.id, 2);
	const raw = JSON.stringify(original, null, 2);
	const seen: string[] = [];
	let finish!: (value: unknown) => void;
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		seen.push(command);
		if (command === 'read_app_state_records') return { ok: true, records: { 'workspace-registry': serializeWorkspaceRegistry(before) } } as T;
		if (command === 'read_project_registries') return { ok: true, registries: { [original.workspaceId]: raw } } as T;
		expect(command).toBe('restore_workspace_sync');
		expect(args?.expectedWorkspaceRegistryJson).toBe(serializeWorkspaceRegistry(before));
		expect((args?.registries as any)[original.workspaceId].expectedRegistryJson).toBe(raw);
		return new Promise<T>(resolve => { finish = value => resolve(value as T); });
	});
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: serializeWorkspaceRegistry(before) }]);
	let events = 0;
	const offWorkspace = subscribeWorkspaceRegistry(() => events++), offProject = subscribeProjectRegistry(original.workspaceId, () => events++);
	const restoring = restoreWorkspaceSyncData(added.registry, { [original.workspaceId]: imported });
	await settle();
	expect(readWorkspaceRegistryFromBrowser().registry).toEqual(before);
	expect(writeWorkspaceRegistryToBrowser(added.registry).ok).toBe(false);
	expect(window.localStorage.length).toBe(0);
	finish({ ok: false, error: 'project-registry-revision-conflict' });
	expect(await restoring).toEqual({ ok: false, error: 'project-registry-revision-conflict' });
	expect(readWorkspaceRegistryFromBrowser().registry).toEqual(before);
	expect(events).toBe(0);
	expect(seen).toEqual(['read_app_state_records', 'read_project_registries', 'restore_workspace_sync']);
	offWorkspace(); offProject();
});

test('a committed sync restore publishes both registries despite optional migration-marker failure', async () => {
	const before = createEmptyWorkspaceRegistry();
	const added = addWorkspace(before, { name: 'Imported', path: 'C:\\imported' });
	if (!added.ok) throw Error('fixture workspace');
	const imported = registry(added.workspace.id, 2);
	setTauriInvokeForTest(async <T>(command: string) => {
		if (command === 'read_app_state_records') return { ok: true, records: { 'workspace-registry': serializeWorkspaceRegistry(before) } } as T;
		if (command === 'read_project_registries') return { ok: true, registries: {} } as T;
		expect(command).toBe('restore_workspace_sync'); return { ok: true } as T;
	});
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: serializeWorkspaceRegistry(before) }]);
	window.localStorage.setItem = () => { throw Error('synthetic optional storage failure'); };
	const projects: ProjectRegistry[] = [], workspaces: unknown[] = [];
	const offProject = subscribeProjectRegistry(imported.workspaceId, value => {
		expect(readWorkspaceRegistryFromBrowser().registry).toEqual(added.registry); projects.push(value);
	});
	const offWorkspace = subscribeWorkspaceRegistry(value => workspaces.push(value));
	expect(await restoreWorkspaceSyncData(added.registry, { [imported.workspaceId]: imported })).toEqual({ ok: true });
	expect(projects).toEqual([imported]); expect(workspaces).toEqual([added.registry]);
	offProject(); offWorkspace();
});

test('an existing empty SQLite registry stays authoritative over legacy data when its migration marker cannot be written', async () => {
	const old = addProjectNode(registry('demo', 1), { kind: 'project', parentId: null, name: 'Old', path: 'projects/old' });
	if (!old.ok) throw Error('fixture project');
	window.localStorage.setItem('workduck.projectRegistries.v1', JSON.stringify({ version: old.registry.version, registries: { demo: old.registry } }));
	window.localStorage.setItem = () => { throw Error('synthetic marker failure'); };
	const empty = createEmptyProjectRegistry('demo');
	setTauriInvokeForTest(async <T>(command: string) => {
		if (command === 'read_project_registry') return { ok: true, registryJson: JSON.stringify(empty) } as T;
		expect(command).toBe('read_project_registries'); return { ok: true, registries: { demo: JSON.stringify(empty) } } as T;
	});
	expect((await readProjectRegistry('demo')).registry.nodes).toHaveLength(0);
	expect((await readProjectRegistries(['demo'])).registries.demo?.nodes).toHaveLength(0);
});

test('sync restore recovers a lost native reply by reading both authorities without a second write', async () => {
	const before = createEmptyWorkspaceRegistry();
	const added = addWorkspace(before, { name: 'Imported', path: 'C:\\imported' });
	if (!added.ok) throw Error('fixture workspace');
	const imported = registry(added.workspace.id, 2);
	let workspaceJson = serializeWorkspaceRegistry(before), projectJson: string | undefined, writes = 0;
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') return { ok: true, records: { 'workspace-registry': workspaceJson } } as T;
		if (command === 'read_project_registries') return { ok: true, registries: projectJson ? { [imported.workspaceId]: projectJson } : {} } as T;
		expect(command).toBe('restore_workspace_sync'); writes++;
		workspaceJson = args?.workspaceRegistryJson as string;
		projectJson = (args?.registries as any)[imported.workspaceId].registryJson;
		throw Error('synthetic lost reply after commit');
	});
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: workspaceJson }]);
	expect(await restoreWorkspaceSyncData(added.registry, { [imported.workspaceId]: imported })).toEqual({ ok: true });
	expect(writes).toBe(1);
	expect(readWorkspaceRegistryFromBrowser().registry).toEqual(added.registry);
});

describe('project registry storage write ordering', () => {
	test('compares SQLite snapshots and passes the raw revision into the atomic native write', async () => {
		const original = registry('demo', 1);
		const raw = JSON.stringify(original, null, 2);
		let writes = 0;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_project_registry') return { ok: true, registryJson: raw } as T;
			writes += 1;
			expect(args?.expectedRegistryJson).toBe(raw);
			return { ok: false, error: 'project-registry-revision-conflict' } as T;
		});
		const conflict = await writeProjectRegistry(registry('demo', 2), async () => original);
		expect(conflict.ok).toBe(false);
		if (!conflict.ok) expect(conflict.error).toBe('project-registry-revision-conflict');
		expect(writes).toBe(1);
		const stale = await writeProjectRegistry(registry('demo', 3), async () => registry('demo', 2));
		expect(stale.ok).toBe(false);
		expect(writes).toBe(1);
	});

	test('guards first creation against a row appearing after the read', async () => {
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_project_registry') return { ok: true, registryJson: null } as T;
			expect(args?.expectedRegistryJson).toBe('null');
			return { ok: false, error: 'project-registry-revision-conflict' } as T;
		});
		const result = await writeProjectRegistry(registry('demo', 2), async () => registry('demo', 1));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('project-registry-revision-conflict');
	});

	test('protects browser fallback snapshots and rejects a different workspace baseline', async () => {
		const original = registry('demo', 1);
		expect((await writeProjectRegistry(original)).ok).toBe(true);
		expect((await writeProjectRegistry(registry('demo', 2), async () => original)).ok).toBe(true);
		const stale = await writeProjectRegistry(registry('demo', 3), async () => original);
		expect(stale.ok).toBe(false);
		if (!stale.ok) expect(stale.error).toBe('project-registry-revision-conflict');
		expect((await readProjectRegistry('demo')).registry.updatedAt).toBe(registry('demo', 2).updatedAt);
		const wrongScope = await writeProjectRegistry(registry('other', 3), async () => original);
		expect(wrongScope.ok).toBe(false);
	});
	test('keeps the last requested snapshot when an earlier native write is delayed', async () => {
		const entered = deferred();
		const pending = deferred();
		const persisted: Record<string, ProjectRegistry> = {};
		const notifications: string[] = [];
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			const values = writtenRegistries(command, args);
			if (values.demo?.updatedAt === registry('demo', 1).updatedAt) {
				entered.resolve();
				await pending.promise;
			}
			Object.assign(persisted, values);
			return { ok: true } as T;
		});
		const unsubscribe = subscribeProjectRegistry('demo', (value) => notifications.push(value.updatedAt));
		const first = writeProjectRegistry(registry('demo', 1));
		await entered.promise;
		const second = writeProjectRegistry(registry('demo', 2));
		try {
			await settle();
			pending.resolve();
			expect((await first).ok).toBe(true);
			expect((await second).ok).toBe(true);
			expect(persisted.demo?.updatedAt).toBe(registry('demo', 2).updatedAt);
			expect(notifications).toEqual([registry('demo', 1).updatedAt, registry('demo', 2).updatedAt]);
		} finally {
			pending.resolve();
			await Promise.all([first, second]);
			unsubscribe();
		}
	});

	test('orders overlapping single and bulk writes while an unrelated workspace proceeds', async () => {
		const entered = deferred();
		const pending = deferred();
		const calls: string[] = [];
		const persisted: Record<string, ProjectRegistry> = {};
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			const values = writtenRegistries(command, args);
			const label = Object.keys(values).sort().join(',') + ':' + Object.values(values)[0]?.updatedAt;
			calls.push(label);
			if (values.demo?.updatedAt === registry('demo', 1).updatedAt) {
				entered.resolve();
				await pending.promise;
			}
			Object.assign(persisted, values);
			return { ok: true } as T;
		});
		const first = writeProjectRegistry(registry('demo', 1));
		await entered.promise;
		const bulk = writeProjectRegistries({ demo: registry('demo', 2), other: registry('other', 2) });
		const last = writeProjectRegistry(registry('other', 3));
		const independent = writeProjectRegistry(registry('independent', 4));
		try {
			expect((await independent).ok).toBe(true);
			expect(calls).toEqual([
				'demo:' + registry('demo', 1).updatedAt,
				'independent:' + registry('independent', 4).updatedAt
			]);
			pending.resolve();
			const results = await Promise.all([first, bulk, last]);
			expect(results.every((result) => result.ok)).toBe(true);
			expect(persisted.demo?.updatedAt).toBe(registry('demo', 2).updatedAt);
			expect(persisted.other?.updatedAt).toBe(registry('other', 3).updatedAt);
		} finally {
			pending.resolve();
			await Promise.all([first, bulk, last, independent]);
		}
	});

	for (const throws of [false, true]) test(`continues after a ${throws ? 'thrown native error' : 'rejected write'}`, async () => {
		let calls = 0;
		setTauriInvokeForTest(async <T>() => {
			calls += 1;
			if (calls === 1) {
				if (throws) throw new Error('native write failed');
				return { ok: false, error: 'project-registry-write-failed' } as T;
			}
			return { ok: true } as T;
		});
		const results = await Promise.all([
			writeProjectRegistry(registry('demo', 1)), writeProjectRegistry(registry('demo', 2))
		]);
		expect(results.map((result) => result.ok)).toEqual([false, true]);
		expect(calls).toBe(2);
	});

	test('rechecks SQLite before promoting a stale legacy read behind a pending save', async () => {
		const added = addProjectNode(createEmptyProjectRegistry('demo'), {
			kind: 'project', name: 'Legacy', path: 'projects/legacy'
		});
		if (!added.ok) throw new Error(added.error);
		const legacy = added.registry;
		window.localStorage.setItem('workduck.projectRegistries.v1', JSON.stringify({
			version: legacy.version, registries: { demo: legacy }
		}));
		const entered = deferred();
		const pending = deferred();
		let persisted: ProjectRegistry | null = null;
		let writes = 0;
		let reads = 0;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_project_registry') {
				reads += 1;
				return { ok: true, registryJson: reads === 1 ? null : JSON.stringify(persisted) } as T;
			}
			writes += 1;
			if (writes === 1) { entered.resolve(); await pending.promise; }
			persisted = writtenRegistries(command, args).demo ?? null;
			return { ok: true } as T;
		});
		const latest = { ...legacy, updatedAt: registry('demo', 4).updatedAt };
		const saving = writeProjectRegistry(latest);
		await entered.promise;
		const reading = readProjectRegistry('demo');
		try {
			await settle();
			expect(writes).toBe(1);
			pending.resolve();
			expect((await reading).registry).toEqual(latest);
			expect((await saving).ok).toBe(true);
			expect(persisted as ProjectRegistry | null).toEqual(latest);
			expect(writes).toBe(1);
			expect(reads).toBe(2);
		} finally {
			pending.resolve();
			await Promise.all([reading, saving]);
		}
	});
});
