import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
	flushWorkduckAppStateWrites,
	initializeWorkduckAppState,
	resetWorkduckAppStateStorageForTest,
	writeWorkduckAppStateValue,
	WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX,
	WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY
} from '#lib/app-state/app-state-storage.ts';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
	type WorkspaceRegistry
} from '#lib/workspaces/workspace-registry.ts';
import {
	readWorkspaceRegistryFromBrowser,
	WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT,
	writeWorkspaceRegistryToBrowser
} from '#lib/workspaces/workspace-storage.ts';
import { addProjectNode, createEmptyProjectRegistry } from './project-registry';
import {
	readProjectRegistry,
	WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT,
	writeProjectRegistry,
	writeWorkspaceSyncRegistries
} from './project-storage';

const original: WorkspaceRegistry = {
	activeWorkspaceId: 'demo',
	workspaces: [{ id: 'demo', name: 'Original', path: 'C:/workduck/demo', lock: null,
		createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' }]
};
function workspace(name: string): WorkspaceRegistry {
	return { ...original, workspaces: [{ ...original.workspaces[0]!, name }] };
}
const imported = workspace('Imported');
const projects = { demo: createEmptyProjectRegistry('demo') };
const journalKey = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY}`;
const originalJson = JSON.stringify(original, null, 2);
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
let calls: { command: string; args: Record<string, unknown> | undefined }[];
let notifications: string[];

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

beforeEach(() => {
	calls = [];
	notifications = [];
	const values = new Map<string, string>();
	const localStorage: Storage = {
		get length() { return values.size; }, clear() { values.clear(); },
		getItem(key) { return values.get(key) ?? null; }, key(index) { return [...values.keys()][index] ?? null; },
		removeItem(key) { values.delete(key); }, setItem(key, value) { values.set(key, value); }
	};
	Object.defineProperty(globalThis, 'window', { configurable: true,
		value: Object.assign(new EventTarget(), { localStorage }) });
	for (const event of [WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT, WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT]) {
		window.addEventListener(event, () => {
			notifications.push(`${event}:${readWorkspaceRegistryFromBrowser().registry.workspaces[0]?.name}`);
		});
	}
});

test('rejects workspace imports that would silently discard records or locks', async () => {
	setTauriInvokeForTest(async <T>(command: string) => {
		calls.push({ command, args: undefined });
		return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: originalJson } } as T;
	});
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: originalJson }]);
	calls.length = 0;
	for (const workspaceRegistry of [
		{ ...original, workspaces: [original.workspaces[0]!, original.workspaces[0]!] },
		{ ...original, workspaces: [{ ...original.workspaces[0]!, lock: { kind: 'future' } }] } as unknown as WorkspaceRegistry
	]) {
		expect((await writeWorkspaceSyncRegistries(workspaceRegistry, projects)).ok).toBe(false);
	}
	expect(calls).toEqual([]);
	expect(notifications).toEqual([]);
	expect(readWorkspaceRegistryFromBrowser().registry).toEqual(original);
});
afterEach(async () => {
	await flushWorkduckAppStateWrites();
	setTauriInvokeForTest(undefined);
	resetWorkduckAppStateStorageForTest();
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

async function initialize(handler: (command: string, args?: Record<string, unknown>) => Promise<unknown>) {
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') {
			return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: originalJson } } as T;
		}
		calls.push({ command, args });
		return await handler(command, args) as T;
	});
	expect(await initializeWorkduckAppState([{
		key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
		valueJson: JSON.stringify(original)
	}])).toEqual({ ok: true });
}

test('publishes workspace and projects only after one native commit and excludes workspace edits during it', async () => {
	const pending = deferred();
	await initialize(async (command) => {
		expect(command).toBe('write_project_registries');
		await pending.promise;
		return { ok: true };
	});
	const importing = writeWorkspaceSyncRegistries(imported, projects);
	try {
		await settle();
		expect(calls).toHaveLength(1);
		expect(calls[0]?.args).toEqual({
			workspaceRegistry: {
				valueJson: JSON.stringify(imported), expectedValueJson: originalJson,
				updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
			},
			registries: { demo: { registryJson: JSON.stringify(projects.demo), updatedAt: projects.demo.updatedAt } }
		});
		expect(readWorkspaceRegistryFromBrowser().registry).toEqual(original);
		expect((await writeWorkspaceRegistryToBrowser(workspace('Racing edit'), original)).ok).toBe(false);
		expect(window.localStorage.getItem(journalKey)).toBeNull();
		expect(notifications).toEqual([]);
		pending.resolve();
		expect((await importing).ok).toBe(true);
		expect(readWorkspaceRegistryFromBrowser().registry).toEqual(imported);
		expect(notifications).toEqual([
			`${WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT}:Imported`,
			`${WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT}:Imported`
		]);
		expect(window.localStorage.getItem(journalKey)).toBeNull();
		expect(calls).toHaveLength(1);
	} finally { pending.resolve(); await importing; }
});

for (const failure of ['conflict', 'throw'] as const) {
	test(`keeps cache and notifications unchanged after native ${failure} and releases the edit exclusion`, async () => {
		await initialize(async (command) => {
			if (command === 'write_app_state_records' || command === 'compare_and_write_app_state_record') return { ok: true };
			if (failure === 'throw') throw new Error('database unavailable');
			return { ok: false, error: 'project-registry-revision-conflict' };
		});
		const result = await writeWorkspaceSyncRegistries(imported, projects);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe(failure === 'conflict'
			? 'project-registry-revision-conflict' : 'project-registry-write-failed');
		expect(readWorkspaceRegistryFromBrowser().registry).toEqual(original);
		expect(notifications).toEqual([]);
		expect(window.localStorage.getItem(journalKey)).toBeNull();
		expect((await writeWorkspaceRegistryToBrowser(workspace('After failure'), original)).ok).toBe(true);
		expect(await flushWorkduckAppStateWrites()).toBe(true);
	});
}

for (const flushSucceeds of [true, false]) {
	test(`settles an older pending workspace journal before import when flush succeeds=${flushSucceeds}`, async () => {
		const pending = deferred();
		await initialize(async (command) => {
			if (command === 'write_app_state_records') {
				await pending.promise;
				return { ok: flushSucceeds };
			}
			return { ok: true };
		});
		const edited = workspace('Pending edit');
		// Recover journals from older versions before admitting an atomic edit/import.
		expect(writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
			WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(edited)).ok).toBe(true);
		notifications.length = 0;
		const journal = window.localStorage.getItem(journalKey);
		const importing = writeWorkspaceSyncRegistries(imported, projects);
		try {
			await settle();
			expect(calls.map((call) => call.command)).toEqual(['write_app_state_records']);
			expect((await writeWorkspaceRegistryToBrowser(workspace('Racing edit'), edited)).ok).toBe(false);
			pending.resolve();
			expect((await importing).ok).toBe(flushSucceeds);
			if (flushSucceeds) {
				expect(calls[1]?.args?.workspaceRegistry).toMatchObject({ expectedValueJson: JSON.stringify(edited) });
				expect(readWorkspaceRegistryFromBrowser().registry).toEqual(imported);
				expect(window.localStorage.getItem(journalKey)).toBeNull();
			} else {
				expect(calls).toHaveLength(1);
				expect(readWorkspaceRegistryFromBrowser().registry).toEqual(edited);
				expect(window.localStorage.getItem(journalKey)).toBe(journal);
				expect(notifications).toEqual([]);
			}
		} finally { pending.resolve(); await importing; }
	});
}

test('orders import between overlapping project saves', async () => {
	const pending = deferred();
	let writes = 0;
	await initialize(async (command) => {
		if (command === 'write_project_registry' && ++writes === 1) await pending.promise;
		return { ok: true };
	});
	const first = writeProjectRegistry(projects.demo);
	const importing = writeWorkspaceSyncRegistries(imported, projects);
	const last = writeProjectRegistry(projects.demo);
	try {
		await settle();
		expect(calls.map((call) => call.command)).toEqual(['write_project_registry']);
		pending.resolve();
		expect((await first).ok).toBe(true);
		expect((await importing).ok).toBe(true);
		expect((await last).ok).toBe(true);
		expect(calls.map((call) => call.command)).toEqual([
			'write_project_registry', 'write_project_registries', 'write_project_registry'
		]);
		expect(notifications).toEqual([
			`${WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT}:Original`,
			`${WORKDUCK_WORKSPACE_REGISTRY_CHANGED_EVENT}:Imported`,
			`${WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT}:Imported`,
			`${WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT}:Imported`
		]);
	} finally { pending.resolve(); await Promise.all([first, importing, last]); }
});

test('does not report a committed import as failed when a browser migration marker cannot be saved', async () => {
	const legacy = addProjectNode(createEmptyProjectRegistry('demo'), { name: 'Legacy', path: 'projects/legacy', kind: 'project' });
	if (!legacy.ok) throw new Error(legacy.error);
	window.localStorage.setItem('workduck.projectRegistries.v1', JSON.stringify({
		version: 1, registries: { demo: legacy.registry }
	}));
	await initialize(async (command) => command === 'read_project_registry'
		? { ok: true, registryJson: JSON.stringify(projects.demo) } : { ok: true });
	const setItem = window.localStorage.setItem;
	window.localStorage.setItem = (key, value) => {
		if (key === 'workduck.projectRegistries.sqliteMigrated.v1') throw new Error('quota');
		setItem(key, value);
	};
	expect((await writeWorkspaceSyncRegistries(imported, projects)).ok).toBe(true);
	expect(readWorkspaceRegistryFromBrowser().registry).toEqual(imported);
	expect((await readProjectRegistry('demo')).registry.nodes).toEqual([]);
	expect(calls.map((call) => call.command)).toEqual(['write_project_registries', 'read_project_registry']);
});

for (const backend of ['failed', 'browser'] as const) {
	test(`rejects import without writes when native state is ${backend}`, async () => {
		if (backend === 'failed') {
			setTauriInvokeForTest(async <T>() => ({ ok: false }) as T);
			await initializeWorkduckAppState([]);
		}
		expect((await writeWorkspaceSyncRegistries(imported, projects)).ok).toBe(false);
		expect(window.localStorage.length).toBe(0);
		expect(notifications).toEqual([]);
	});
}
