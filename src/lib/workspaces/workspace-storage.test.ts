import { afterEach, beforeEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	initializeWorkduckAppState, resetWorkduckAppStateStorageForTest,
	setWorkduckAppStateBrowserStorageForTest, WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
	writeWorkduckAppStateValue
} from '#lib/app-state/app-state-storage.ts';
import {
	createEmptyWorkspaceRegistry, parseStoredWorkspaceRegistry, WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
	type WorkspaceRegistry
} from './workspace-registry';
import {
	readWorkspaceRegistryFromBrowser, subscribeWorkspaceRegistry, writeWorkspaceRegistryToBrowser,
	WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT
} from './workspace-storage';

const registry: WorkspaceRegistry = { activeWorkspaceId: 'a', workspaces: [{
	id: 'a', name: 'A', path: 'C:/workspaces/a', lock: null,
	createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z'
}] };
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let values: Map<string, string>;
beforeEach(() => {
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
		locks: { request: async (_name: string, callback: () => unknown) => callback() }
	} });
	values = new Map();
	const storage = {
		getItem(key: string) { return values.get(key) ?? null; },
		setItem(key: string, value: string) { values.set(key, value); },
		removeItem(key: string) { values.delete(key); }
	};
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { localStorage: storage }) });
	setWorkduckAppStateBrowserStorageForTest(storage);
});
afterEach(() => {
	setTauriInvokeForTest(undefined);
	resetWorkduckAppStateStorageForTest();
	if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
	else Reflect.deleteProperty(globalThis, 'navigator');
	if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

for (const [name, value] of [
	['invalid JSON', '{broken'], ['missing list', '{}'],
	['unsupported version', JSON.stringify({ ...registry, version: 999 })],
	['discarded workspace', JSON.stringify({ ...registry, workspaces: [null] })],
	['duplicate workspace', JSON.stringify({ ...registry, workspaces: [registry.workspaces[0], registry.workspaces[0]] })],
	['invalid lock', JSON.stringify({ ...registry, workspaces: [{ ...registry.workspaces[0], lock: { kind: 'password', passwordHash: '' } }] })],
	['unsupported lock', JSON.stringify({ ...registry, workspaces: [{ ...registry.workspaces[0], lock: { kind: 'future' } }] })],
	['truncated password hash', JSON.stringify({ ...registry, workspaces: [{ ...registry.workspaces[0], lock: { kind: 'password', passwordHash: 'x'.repeat(513) } }] })],
	['truncated path', JSON.stringify({ ...registry, workspaces: [{ ...registry.workspaces[0], path: `C:/${'x'.repeat(1025)}` }] })]
] as const) {
	test(`preserves ${name} when reading and attempting to save`, async () => {
		values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, value);
		expect(parseStoredWorkspaceRegistry(value).ok).toBe(false);
		expect(readWorkspaceRegistryFromBrowser().ok).toBe(false);
		expect((await writeWorkspaceRegistryToBrowser(createEmptyWorkspaceRegistry(), registry)).ok).toBe(false);
		expect(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)).toBe(value);
	});
}

test('a browser read error cannot authorize replacing an existing registry', async () => {
	const raw = JSON.stringify(registry);
	values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, raw);
	window.localStorage.getItem = () => { throw new Error('storage denied'); };
	expect(readWorkspaceRegistryFromBrowser().ok).toBe(false);
	expect((await writeWorkspaceRegistryToBrowser(createEmptyWorkspaceRegistry(), registry)).ok).toBe(false);
	expect(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)).toBe(raw);
});

test('invalid incoming snapshots and notifications retain the accepted registry', async () => {
	expect((await writeWorkspaceRegistryToBrowser(registry, createEmptyWorkspaceRegistry())).ok).toBe(true);
	const seen: WorkspaceRegistry[] = [];
	const unsubscribe = subscribeWorkspaceRegistry((registry) => seen.push(registry));
	try {
		const invalid = { ...registry, workspaces: [registry.workspaces[0], registry.workspaces[0]] } as WorkspaceRegistry;
		expect((await writeWorkspaceRegistryToBrowser(invalid, registry)).ok).toBe(false);
		window.dispatchEvent(new CustomEvent(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, { detail: { registry: invalid } }));
		values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, '{broken');
		window.dispatchEvent(Object.assign(new Event('storage'), { storageArea: window.localStorage, key: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, newValue: '{broken' }));
		window.dispatchEvent(new Event(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT));
		expect(seen).toEqual([]);
	} finally { unsubscribe(); }
});

test('missing and explicitly cleared browser registries remain valid empty registries', async () => {
	expect(readWorkspaceRegistryFromBrowser()).toEqual({ ok: true, registry: createEmptyWorkspaceRegistry() });
	expect((await writeWorkspaceRegistryToBrowser(registry, createEmptyWorkspaceRegistry())).ok).toBe(true);
	const seen: WorkspaceRegistry[] = [];
	const unsubscribe = subscribeWorkspaceRegistry((registry) => seen.push(registry));
	try {
		values.clear();
		window.dispatchEvent(Object.assign(new Event('storage'), { storageArea: window.localStorage, key: null, newValue: null }));
		expect(seen).toEqual([createEmptyWorkspaceRegistry()]);
	} finally { unsubscribe(); }
});

test('a malformed SQLite workspace list cannot be replaced by a guarded UI save', async () => {
	const raw = JSON.stringify({ ...registry, workspaces: [null] });
	let writes = 0;
	setTauriInvokeForTest(async <T>(command: string) => {
		if (command === 'read_app_state_records') return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: raw } } as T;
		writes += 1;
		return { ok: true } as T;
	});
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: JSON.stringify(createEmptyWorkspaceRegistry()) }]);
	expect(readWorkspaceRegistryFromBrowser().ok).toBe(false);
	expect((await writeWorkspaceRegistryToBrowser(createEmptyWorkspaceRegistry(), registry)).ok).toBe(false);
	await Promise.resolve();
	expect(writes).toBe(0);
});

function renamed(name: string): WorkspaceRegistry {
	return { ...registry, workspaces: [{ ...registry.workspaces[0]!, name }] };
}

test('browser saves compare the original snapshot after acquiring the shared lock', async () => {
	values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
	let enter!: () => void;
	const waiting = new Promise<void>((resolve) => { enter = resolve; });
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
		locks: { request: async (name: string, callback: () => unknown) => {
			expect(name).toBe('workduck:workspace-registry-write');
			await waiting;
			return callback();
		} }
	} });
	const draft = renamed('My draft');
	const saving = writeWorkspaceRegistryToBrowser(draft, registry);
	const peer = renamed('Peer update');
	values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(peer));
	enter();
	expect(await saving).toEqual({ ok: false, registry: peer, error: 'workspace-registry-conflict' });
	expect(JSON.parse(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)!)).toEqual(peer);
	expect(draft.workspaces[0]?.name).toBe('My draft');
});

test('cancellation while waiting for a browser lock prevents persistence', async () => {
	values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
	let enter!: () => void;
	const waiting = new Promise<void>((resolve) => { enter = resolve; });
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
		locks: { request: async (_name: string, callback: () => unknown) => { await waiting; return callback(); } }
	} });
	const owner = new AbortController();
	const saving = writeWorkspaceRegistryToBrowser(renamed('Cancelled'), registry, owner.signal);
	owner.abort();
	enter();
	expect((await saving).ok).toBe(false);
	expect(JSON.parse(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)!)).toEqual(registry);
});

test('browser saves fail without atomic locking instead of permitting unsafe tab writes', async () => {
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
	values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
	expect((await writeWorkspaceRegistryToBrowser(renamed('Draft'), registry)).ok).toBe(false);
	expect(JSON.parse(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)!)).toEqual(registry);
});

async function initializeNativeWorkspace() {
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: JSON.stringify(registry),
		validateValueJson: (json) => parseStoredWorkspaceRegistry(json).ok }]);
}

test('native saves do not publish drafts or stage journals before the conditional commit succeeds', async () => {
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => { release = resolve; });
	const draft = renamed('Committed');
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: JSON.stringify(registry) } } as T;
		expect(command).toBe('compare_and_write_app_state_record');
		expect(args?.expectedValueJson).toBe(JSON.stringify(registry));
		expect(args?.record).toMatchObject({ valueJson: JSON.stringify(draft) });
		await waiting;
		return { ok: true } as T;
	});
	await initializeNativeWorkspace();
	const seen: WorkspaceRegistry[] = [];
	const unsubscribe = subscribeWorkspaceRegistry((value) => seen.push(value));
	try {
		const saving = writeWorkspaceRegistryToBrowser(draft, registry);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(readWorkspaceRegistryFromBrowser().registry).toEqual(registry);
		expect(seen).toEqual([]);
		expect(values.size).toBe(0);
		release();
		expect(await saving).toEqual({ ok: true, registry: draft });
		expect(seen).toEqual([draft]);
		expect(values.size).toBe(0);
	} finally { release(); unsubscribe(); }
});

test('native conflicts return the latest list without publishing or overwriting the rejected draft', async () => {
	const peer = renamed('Peer update');
	let reads = 0;
	let writes = 0;
	setTauriInvokeForTest(async <T>(command: string) => {
		if (command === 'read_app_state_records') {
			return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: JSON.stringify(reads++ === 0 ? registry : peer) } } as T;
		}
		expect(command).toBe('compare_and_write_app_state_record');
		writes += 1;
		return { ok: false, error: 'app-state-conflict' } as T;
	});
	await initializeNativeWorkspace();
	const seen: WorkspaceRegistry[] = [];
	const unsubscribe = subscribeWorkspaceRegistry((value) => seen.push(value));
	try {
		expect(await writeWorkspaceRegistryToBrowser(renamed('Rejected draft'), registry))
			.toEqual({ ok: false, registry: peer, error: 'workspace-registry-conflict' });
		expect(writes).toBe(1);
		expect(seen).toEqual([peer]);
		expect(values.size).toBe(0);
	} finally { unsubscribe(); }
});

test('journal recovery cannot silently change the baseline of a new conditional edit', async () => {
	const recovered = renamed('Recovered older edit');
	let stored = JSON.stringify(registry);
	let conditionalWrites = 0;
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: stored } } as T;
		if (command === 'write_app_state_records') {
			stored = (args?.records as Record<string, { valueJson: string }>)[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]!.valueJson;
			return { ok: true } as T;
		}
		conditionalWrites += 1;
		return { ok: true } as T;
	});
	await initializeNativeWorkspace();
	expect(writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(recovered)).ok).toBe(true);
	expect(await writeWorkspaceRegistryToBrowser(renamed('Stale new draft'), registry))
		.toEqual({ ok: false, registry: recovered, error: 'workspace-registry-conflict' });
	expect(conditionalWrites).toBe(0);
	expect(JSON.parse(stored)).toEqual(recovered);
	expect(values.size).toBe(0);
});

test('cancellation while older journals flush cannot dispatch a new native edit', async () => {
	const recovered = renamed('Recovered');
	let stored = JSON.stringify(registry);
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => { release = resolve; });
	let conditionalWrites = 0;
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: stored } } as T;
		if (command === 'write_app_state_records') {
			await waiting;
			stored = (args?.records as Record<string, { valueJson: string }>)[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]!.valueJson;
			return { ok: true } as T;
		}
		conditionalWrites += 1;
		return { ok: true } as T;
	});
	await initializeNativeWorkspace();
	writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(recovered));
	const owner = new AbortController();
	const saving = writeWorkspaceRegistryToBrowser(renamed('Cancelled'), recovered, owner.signal);
	owner.abort();
	release();
	expect((await saving).ok).toBe(false);
	expect(conditionalWrites).toBe(0);
	expect(JSON.parse(stored)).toEqual(recovered);
});

for (const failure of ['throw', 'false', 'malformed'] as const) {
	test(`native ${failure} commit does not replace the accepted UI snapshot`, async () => {
		setTauriInvokeForTest(async <T>(command: string) => {
			if (command === 'read_app_state_records') return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: JSON.stringify(registry) } } as T;
			if (failure === 'throw') throw new Error('write failed');
			return (failure === 'false' ? { ok: false } : { ok: 'true' }) as T;
		});
		await initializeNativeWorkspace();
		expect(await writeWorkspaceRegistryToBrowser(renamed('Rejected draft'), registry))
			.toEqual({ ok: false, registry, error: 'workspace-registry-write-failed' });
		expect(values.size).toBe(0);
	});
}
