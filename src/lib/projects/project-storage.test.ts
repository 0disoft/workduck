import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { addProjectNode, createEmptyProjectRegistry, type ProjectRegistry } from './project-registry';
import { readProjectRegistries, readProjectRegistry, subscribeProjectRegistry, writeProjectRegistries, writeProjectRegistry } from './project-storage';

function registry(workspaceId: string, revision: number) {
	return { ...createEmptyProjectRegistry(workspaceId), updatedAt: `2026-10-04T00:00:0${revision}.000Z` };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}

function seedLegacyRegistry() {
	const added = addProjectNode(createEmptyProjectRegistry('demo'), {
		kind: 'project', name: 'Legacy', path: 'projects/legacy'
	});
	if (!added.ok) throw new Error(added.error);
	window.localStorage.setItem('workduck.projectRegistries.v1', JSON.stringify({
		version: added.registry.version, registries: { demo: added.registry }
	}));
	return added.registry;
}

async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

function dispatchLegacyStorageChange() {
	window.dispatchEvent(Object.assign(new Event('storage'), {
		storageArea: window.localStorage,
		key: 'workduck.projectRegistries.v1'
	}));
}

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
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

describe('project registry storage write ordering', () => {
	test('rejects incomplete SQLite snapshots and protects them when an editor attempts a guarded save', async () => {
		let stored = JSON.stringify({ ...registry('demo', 1), nodes: [null] });
		const original = stored;
		let writes = 0;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_project_registry') return { ok: true, registryJson: stored } as T;
			if (command === 'read_project_registries') return { ok: true, registries: { demo: stored } } as T;
			writes += 1;
			stored = args?.registryJson as string;
			return { ok: true } as T;
		});
		const read = await readProjectRegistry('demo');
		const bulk = await readProjectRegistries(['demo']);
		const saved = await writeProjectRegistry(registry('demo', 2), async () => read.registry);
		for (const result of [read, bulk, saved]) {
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toBe('project-registry-read-failed');
		}
		expect(writes).toBe(0);
		expect(stored).toBe(original);
	});

	const validLegacy = { ...createEmptyProjectRegistry('demo'), updatedAt: '2026-10-04T00:00:00.000Z' };
	const root = addProjectNode(validLegacy, { kind: 'project', name: 'Legacy', path: 'projects/legacy' });
	if (!root.ok) throw new Error(root.error);
	for (const [label, stored, error] of [
		['broken JSON', '{', 'project-registry-read-failed'],
		['missing collection', JSON.stringify({ version: 1 }), 'project-registry-read-failed'],
		['future envelope', JSON.stringify({ version: 99, registries: {} }), 'project-registry-version-unsupported'],
		['future registry', JSON.stringify({ version: 1, registries: { demo: { ...validLegacy, version: 99 } } }), 'project-registry-version-unsupported'],
		['discarded node', JSON.stringify({ version: 1, registries: { demo: { ...validLegacy, nodes: [null] } } }), 'project-registry-read-failed'],
		['discarded repository', JSON.stringify({ version: 1, registries: { demo: {
			...root.registry, nodes: root.registry.nodes.map((node) => ({ ...node, repositories: [null] }))
		} } }), 'project-registry-read-failed']
	] as const) {
		test(`rejects ${label} without overwriting the legacy browser record`, async () => {
			window.localStorage.setItem('workduck.projectRegistries.v1', stored);
			let notifications = 0;
			window.addEventListener('workduck:project-registry-changed', () => { notifications += 1; });
			const reads = [await readProjectRegistry('demo'), await readProjectRegistries(['demo'])];
			for (const result of reads) {
				expect(result.ok).toBe(false);
				if (!result.ok) expect(result.error).toBe(error);
			}
			expect((await writeProjectRegistry(registry('demo', 1))).ok).toBe(false);
			expect((await writeProjectRegistries({ demo: registry('demo', 1) })).ok).toBe(false);
			expect(window.localStorage.getItem('workduck.projectRegistries.v1')).toBe(stored);
			expect(notifications).toBe(0);
		});
	}

	test('does not migrate a damaged browser registry into a missing SQLite row', async () => {
		window.localStorage.setItem('workduck.projectRegistries.v1', '{');
		let writes = 0;
		setTauriInvokeForTest(async <T>(command: string) => {
			if (command === 'read_project_registry') return { ok: true, registryJson: null } as T;
			if (command === 'read_project_registries') return { ok: true, registries: {} } as T;
			writes += 1;
			return { ok: true } as T;
		});
		expect((await readProjectRegistry('demo')).ok).toBe(false);
		expect((await readProjectRegistries(['demo'])).ok).toBe(false);
		expect(writes).toBe(0);
		expect(window.localStorage.getItem('workduck.projectRegistries.v1')).toBe('{');
	});

	for (const native of [false, true]) {
		test(`reads one legacy snapshot per bulk request and batches migration markers, native=${native}`, async () => {
			const ids = Array.from({ length: 10 }, (_, index) => `workspace-${index}`);
			const legacy = Object.fromEntries(ids.map((id) => [id, registry(id, 1)]));
			window.localStorage.setItem('workduck.projectRegistries.v1', JSON.stringify({ version: 1, registries: legacy }));
			const storage = window.localStorage;
			const getItem = storage.getItem.bind(storage);
			const setItem = storage.setItem.bind(storage);
			let legacyReads = 0;
			let markerWrites = 0;
			storage.getItem = (key) => {
				if (key === 'workduck.projectRegistries.v1') legacyReads += 1;
				return getItem(key);
			};
			storage.setItem = (key, value) => {
				if (key === 'workduck.projectRegistries.sqliteMigrated.v1') markerWrites += 1;
				setItem(key, value);
			};
			const current = Object.fromEntries(ids.map((id) => [id, registry(id, 2)]));
			if (native) setTauriInvokeForTest(async <T>() => ({ ok: true,
				registries: Object.fromEntries(Object.entries(current).map(([id, value]) => [id, JSON.stringify(value)]))
			}) as T);
			const result = await readProjectRegistries(ids);
			expect(result.ok).toBe(true);
			expect(result.registries).toEqual(native ? current : legacy);
			expect(legacyReads).toBe(native ? 0 : 1);
			expect(markerWrites).toBe(native ? 1 : 0);
			// A second request must see newly stored data without repeating unchanged markers.
			const newer = Object.fromEntries(ids.map((id) => [id, registry(id, 3)]));
			storage.setItem('workduck.projectRegistries.v1', JSON.stringify({ version: 1, registries: newer }));
			expect((await readProjectRegistries(ids)).registries).toEqual(native ? current : newer);
			expect(legacyReads).toBe(native ? 0 : 2);
			expect(markerWrites).toBe(native ? 1 : 0);
		});
	}

	for (const bulk of [false, true]) {
		test(`reads authoritative SQLite data when the legacy cache is inaccessible, bulk=${bulk}`, async () => {
			const stored = registry('demo', 9);
			const getItem = window.localStorage.getItem.bind(window.localStorage);
			window.localStorage.getItem = (key) => {
				if (key === 'workduck.projectRegistries.v1') throw new Error('legacy cache unavailable');
				return getItem(key);
			};
			setTauriInvokeForTest(async <T>() => (bulk
				? { ok: true, registries: { demo: JSON.stringify(stored) } }
				: { ok: true, registryJson: JSON.stringify(stored) }) as T);
			const result = bulk ? await readProjectRegistries(['demo']) : await readProjectRegistry('demo');
			expect(result.ok).toBe(true);
			expect('registries' in result ? result.registries.demo : result.registry).toEqual(stored);
		});
	}

	test('writes one merged migration marker after a successful bulk save', async () => {
		window.localStorage.setItem('workduck.projectRegistries.sqliteMigrated.v1', JSON.stringify(['existing']));
		const storage = window.localStorage;
		const setItem = storage.setItem.bind(storage);
		let markerWrites = 0;
		storage.setItem = (key, value) => {
			if (key === 'workduck.projectRegistries.sqliteMigrated.v1') markerWrites += 1;
			setItem(key, value);
		};
		setTauriInvokeForTest(async <T>() => ({ ok: true }) as T);
		const values = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, registry(id, 1)]));
		expect((await writeProjectRegistries(values)).ok).toBe(true);
		expect(markerWrites).toBe(1);
		expect(JSON.parse(storage.getItem('workduck.projectRegistries.sqliteMigrated.v1') ?? '[]')).toEqual(['existing', 'a', 'b', 'c']);
		storage.setItem('workduck.projectRegistries.sqliteMigrated.v1', JSON.stringify(['existing', 'a', 'b', 'c', 'foreign']));
		markerWrites = 0;
		expect((await writeProjectRegistries({ d: registry('d', 1) })).ok).toBe(true);
		expect(markerWrites).toBe(1);
		expect(JSON.parse(storage.getItem('workduck.projectRegistries.sqliteMigrated.v1') ?? '[]')).toEqual(['existing', 'a', 'b', 'c', 'foreign', 'd']);
	});

	for (const bulk of [false, true]) {
		test(`preserves an empty SQLite registry without a browser migration marker, bulk=${bulk}`, async () => {
			seedLegacyRegistry();
			const empty = registry('demo', 9);
			let writes = 0;
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'read_project_registry') return { ok: true, registryJson: JSON.stringify(empty) } as T;
				if (command === 'read_project_registries') return { ok: true, registries: { demo: JSON.stringify(empty) } } as T;
				writes += 1;
				return { ok: true } as T;
			});
			const result = bulk ? await readProjectRegistries(['demo']) : await readProjectRegistry('demo');
			expect(result.ok).toBe(true);
			expect('registries' in result ? result.registries.demo : result.registry).toEqual(empty);
			expect(writes).toBe(0);
		});

		for (const competingWrite of [false, true]) {
			test(`guards legacy promotion against a row created after reading, bulk=${bulk}, competing=${competingWrite}`, async () => {
				const legacy = seedLegacyRegistry();
				const competing = registry('demo', 9);
				let persisted: ProjectRegistry | null = null;
				let writeGuard: unknown;
				setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
					if (command === 'read_project_registry') return { ok: true, registryJson: null } as T;
					if (command === 'read_project_registries') return { ok: true, registries: {} } as T;
					const expected = command === 'write_project_registry' ? args?.expectedRegistryJson
						: (args?.registries as Record<string, { expectedRegistryJson?: string }>).demo?.expectedRegistryJson;
					writeGuard = expected;
					if (competingWrite) persisted = competing;
					if (expected === 'null' && persisted !== null) {
						return { ok: false, error: 'project-registry-revision-conflict' } as T;
					}
					persisted = writtenRegistries(command, args).demo ?? null;
					return { ok: true } as T;
				});
				const result = bulk ? await readProjectRegistries(['demo']) : await readProjectRegistry('demo');
				expect(writeGuard).toBe('null');
				expect(result.ok).toBe(!competingWrite);
				if (!result.ok) expect(result.error).toBe('project-registry-revision-conflict');
				expect(persisted as ProjectRegistry | null).toEqual(competingWrite ? competing : legacy);
			});
		}
	}

	test('bulk promotion creates only missing rows and retains existing empty registries', async () => {
		const legacy = seedLegacyRegistry();
		const missing = { ...legacy, workspaceId: 'missing' };
		window.localStorage.setItem('workduck.projectRegistries.v1', JSON.stringify({
			version: legacy.version, registries: { demo: legacy, missing }
		}));
		const empty = registry('demo', 9);
		let written: Record<string, unknown> | undefined;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_project_registries') return { ok: true, registries: { demo: JSON.stringify(empty) } } as T;
			written = args?.registries as Record<string, unknown>;
			return { ok: true } as T;
		});
		const result = await readProjectRegistries(['demo', 'missing']);
		expect(result.ok).toBe(true);
		expect(result.registries).toEqual({ demo: empty, missing });
		expect(written).toEqual({ missing: {
			registryJson: JSON.stringify(missing), updatedAt: missing.updatedAt, expectedRegistryJson: 'null'
		} });
	});

	for (const supersededBy of ['write', 'storage', 'unsubscribe'] as const) {
		test(`ignores a pending subscription read superseded by ${supersededBy}`, async () => {
			const pending = deferred();
			let reads = 0;
			const notifications: ProjectRegistry[] = [];
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command !== 'read_project_registry') return { ok: true } as T;
				const index = ++reads;
				if (index === 1) await pending.promise;
				return { ok: true, registryJson: JSON.stringify(registry('demo', index)) } as T;
			});
			const unsubscribe = subscribeProjectRegistry('demo', (value) => notifications.push(value));
			try {
				dispatchLegacyStorageChange();
				expect(reads).toBe(1);
				if (supersededBy === 'write') expect((await writeProjectRegistry(registry('demo', 2))).ok).toBe(true);
				else if (supersededBy === 'storage') { dispatchLegacyStorageChange(); await settle(); }
				else unsubscribe();
				pending.resolve();
				await settle();
				expect(notifications.map((value) => value.updatedAt)).toEqual(
					supersededBy === 'unsubscribe' ? [] : [registry('demo', 2).updatedAt]
				);
			} finally { pending.resolve(); await settle(); unsubscribe(); }
		});
	}

	test('does not publish a failed subscription read as an empty registry', async () => {
		const notifications: ProjectRegistry[] = [];
		setTauriInvokeForTest(async <T>() => ({ ok: true, registryJson: '{invalid' }) as T);
		const unsubscribe = subscribeProjectRegistry('demo', (value) => notifications.push(value));
		try {
			dispatchLegacyStorageChange();
			await settle();
			expect(notifications).toEqual([]);
		} finally { unsubscribe(); }
	});

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
