import { afterEach, beforeEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	initializeWorkduckAppState, resetWorkduckAppStateStorageForTest,
	setWorkduckAppStateBrowserStorageForTest, WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY
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
let values: Map<string, string>;
beforeEach(() => {
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
	test(`preserves ${name} when reading and attempting to save`, () => {
		values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, value);
		expect(parseStoredWorkspaceRegistry(value).ok).toBe(false);
		expect(readWorkspaceRegistryFromBrowser().ok).toBe(false);
		expect(writeWorkspaceRegistryToBrowser(createEmptyWorkspaceRegistry()).ok).toBe(false);
		expect(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)).toBe(value);
	});
}

test('a browser read error cannot authorize replacing an existing registry', () => {
	const raw = JSON.stringify(registry);
	values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, raw);
	window.localStorage.getItem = () => { throw new Error('storage denied'); };
	expect(readWorkspaceRegistryFromBrowser().ok).toBe(false);
	expect(writeWorkspaceRegistryToBrowser(createEmptyWorkspaceRegistry()).ok).toBe(false);
	expect(values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY)).toBe(raw);
});

test('invalid incoming snapshots and notifications retain the accepted registry', () => {
	expect(writeWorkspaceRegistryToBrowser(registry).ok).toBe(true);
	const seen: WorkspaceRegistry[] = [];
	const unsubscribe = subscribeWorkspaceRegistry((registry) => seen.push(registry));
	try {
		const invalid = { ...registry, workspaces: [registry.workspaces[0], registry.workspaces[0]] } as WorkspaceRegistry;
		expect(writeWorkspaceRegistryToBrowser(invalid).ok).toBe(false);
		window.dispatchEvent(new CustomEvent(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, { detail: { registry: invalid } }));
		values.set(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, '{broken');
		window.dispatchEvent(Object.assign(new Event('storage'), { storageArea: window.localStorage, key: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, newValue: '{broken' }));
		window.dispatchEvent(new Event(WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT));
		expect(seen).toEqual([]);
	} finally { unsubscribe(); }
});

test('missing and explicitly cleared browser registries remain valid empty registries', () => {
	expect(readWorkspaceRegistryFromBrowser()).toEqual({ ok: true, registry: createEmptyWorkspaceRegistry() });
	expect(writeWorkspaceRegistryToBrowser(registry).ok).toBe(true);
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
	expect(writeWorkspaceRegistryToBrowser(createEmptyWorkspaceRegistry()).ok).toBe(false);
	await Promise.resolve();
	expect(writes).toBe(0);
});
