import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { setTauriInvokeForTest, type TauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import {
	initializePersistentAppState, resetPersistentAppStateInitializationForTest
} from './persistent-app-state';
import {
	readWorkduckAppStateValue, writeWorkduckAppStateValue,
	setWorkduckAppStateBrowserStorageForTest, resetWorkduckAppStateStorageForTest,
	WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX, WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
	WORKDUCK_APP_STATE_KEYS
} from './app-state-storage';
import { WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY } from '#lib/settings/appearance-settings.ts';
import { WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, parseStoredWorkspaceRegistry } from '#lib/workspaces/workspace-registry.ts';

const savedRegistry = JSON.stringify({ activeWorkspaceId: 'original', workspaces: [{ id: 'original', name: 'Original workspace',
	path: 'C:/workspaces/original', lock: null, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' }] });
const records = Object.fromEntries(WORKDUCK_APP_STATE_KEYS.map((key) =>
	[key, key === WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY ? savedRegistry : '{}']));

class MemoryStorage {
	readonly values = new Map<string, string>();
	getItem(key: string) { return this.values.get(key) ?? null; }
	setItem(key: string, value: string) { this.values.set(key, value); }
	removeItem(key: string) { this.values.delete(key); }
}

function setupWorkspaceBoot(storage: MemoryStorage, workspaceJson: string | undefined) {
	setWorkduckAppStateBrowserStorageForTest(storage);
	const nativeRecords: Record<string, string> = { ...records };
	if (workspaceJson === undefined) delete nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY];
	else nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY] = workspaceJson;
	const commands: string[] = [];
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		commands.push(command);
		if (command === 'read_app_state_records') return { ok: true, records: { ...nativeRecords } } as T;
		assert.equal(command, 'write_app_state_records');
		for (const [key, record] of Object.entries(args?.records as Record<string, { valueJson: string }>)) nativeRecords[key] = record.valueJson;
		return { ok: true } as T;
	});
	return { nativeRecords, commands };
}

describe('persistent app state retry', () => {
	afterEach(() => {
		setTauriInvokeForTest(undefined);
		resetPersistentAppStateInitializationForTest();
		resetWorkduckAppStateStorageForTest();
	});

	for (const raw of ['{broken', '{}', JSON.stringify({ activeWorkspaceId: null, workspaces: [null] }), JSON.stringify({ workspaces: [], version: 999 })]) {
		test(`does not promote or remove a malformed legacy workspace snapshot: ${raw}`, async () => {
			const storage = new MemoryStorage();
			storage.setItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, raw);
			const { nativeRecords, commands } = setupWorkspaceBoot(storage, undefined);
			assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
			assert.deepEqual(commands, ['read_app_state_records']);
			assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], undefined);
			assert.equal(storage.getItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY), raw);
		});
	}

	test('promotes validated legacy workspaces when the SQLite row is actually missing', async () => {
		const storage = new MemoryStorage();
		storage.setItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, savedRegistry);
		const { nativeRecords, commands } = setupWorkspaceBoot(storage, undefined);
		assert.deepEqual(await initializePersistentAppState(), { ok: true });
		assert.deepEqual(commands, ['read_app_state_records', 'write_app_state_records']);
		assert.deepEqual(parseStoredWorkspaceRegistry(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]!), parseStoredWorkspaceRegistry(savedRegistry));
		assert.equal(storage.getItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY), null);
	});

	test('an unreadable legacy workspace is not treated as a missing one and can retry after access recovers', async () => {
		const storage = new MemoryStorage();
		storage.setItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, savedRegistry);
		const getItem = storage.getItem.bind(storage);
		let denied = true;
		storage.getItem = (key) => {
			if (denied && key === WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY) throw new Error('storage denied');
			return getItem(key);
		};
		const { commands } = setupWorkspaceBoot(storage, undefined);
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
		assert.deepEqual(commands, ['read_app_state_records']);
		assert.equal(storage.values.get(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY), savedRegistry);
		denied = false;
		assert.deepEqual(await initializePersistentAppState(), { ok: true });
	});

	test('an authoritative valid SQLite workspace is independent of an inaccessible legacy mirror', async () => {
		const storage = new MemoryStorage();
		storage.setItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, '{broken');
		const getItem = storage.getItem.bind(storage);
		let legacyReads = 0;
		storage.getItem = (key) => {
			if (key === WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY) { legacyReads += 1; throw new Error('storage denied'); }
			return getItem(key);
		};
		const { nativeRecords, commands } = setupWorkspaceBoot(storage, savedRegistry);
		assert.deepEqual(await initializePersistentAppState(), { ok: true });
		assert.equal(legacyReads, 0);
		assert.deepEqual(commands, ['read_app_state_records']);
		assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], savedRegistry);
	});

	test('rejects a damaged SQLite workspace without replacing it from the legacy mirror', async () => {
		const storage = new MemoryStorage();
		storage.setItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, savedRegistry);
		const raw = JSON.stringify({ workspaces: [null], activeWorkspaceId: null });
		const { nativeRecords, commands } = setupWorkspaceBoot(storage, raw);
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
		assert.deepEqual(commands, ['read_app_state_records']);
		assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], raw);
		assert.equal(storage.getItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY), savedRegistry);
	});

	for (const journal of ['{broken', '{}', JSON.stringify({ valueJson: '{}', updatedAt: '2026-10-10T00:00:00.000Z' })]) {
		test(`preserves a malformed workspace journal without replaying it: ${journal}`, async () => {
			const storage = new MemoryStorage();
			const key = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY}`;
			storage.setItem(key, journal);
			const { nativeRecords, commands } = setupWorkspaceBoot(storage, savedRegistry);
			assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
			assert.equal(commands.includes('write_app_state_records'), false);
			assert.equal(storage.getItem(key), journal);
			assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], savedRegistry);
		});
	}

	test('does not acknowledge a valid journal when the native authoritative reply contains invalid workspaces', async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		const key = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY}`;
		const journal = JSON.stringify({ valueJson: savedRegistry, updatedAt: '2026-10-10T00:00:00.000Z' });
		storage.setItem(key, journal);
		setTauriInvokeForTest(async <T>(command: string) => (command === 'read_app_state_records'
			? { ok: true, records }
			: { ok: true, supersededRecords: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: '{}' } }) as T);
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-write-failed' });
		assert.equal(storage.getItem(key), journal);
	});

	test('a valid pending edit cannot overwrite an unreadable native workspace snapshot', async () => {
		const storage = new MemoryStorage();
		const key = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY}`;
		const journal = JSON.stringify({ valueJson: savedRegistry, updatedAt: '2026-10-10T00:00:00.000Z' });
		storage.setItem(key, journal);
		const { commands, nativeRecords } = setupWorkspaceBoot(storage, '{}');
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
		assert.deepEqual(commands, ['read_app_state_records']);
		assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], '{}');
		assert.equal(storage.getItem(key), journal);
	});

	test('browser startup also preserves malformed workspace lists instead of opening an editable empty state', async () => {
		const storage = new MemoryStorage();
		storage.setItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, '{broken');
		setWorkduckAppStateBrowserStorageForTest(storage);
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
		assert.equal(storage.getItem(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY), '{broken');
	});

	test('registered workspace validation blocks malformed live edits before they enter the journal', async () => {
		const storage = new MemoryStorage();
		const { commands, nativeRecords } = setupWorkspaceBoot(storage, savedRegistry);
		assert.deepEqual(await initializePersistentAppState(), { ok: true });
		commands.length = 0;
		assert.equal(writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
			WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, '{}').ok, false);
		await Promise.resolve();
		assert.deepEqual(commands, []);
		assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], savedRegistry);
	});

	test('damaged live workspace journals cannot flush or be replaced by a new edit', async () => {
		const storage = new MemoryStorage();
		const { commands, nativeRecords } = setupWorkspaceBoot(storage, savedRegistry);
		assert.deepEqual(await initializePersistentAppState(), { ok: true });
		commands.length = 0;
		const key = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY}`;
		const raw = JSON.stringify({ valueJson: '{}', updatedAt: '2026-10-10T00:00:00.000Z' });
		storage.setItem(key, raw);
		assert.equal(writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
			WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, savedRegistry).ok, false);
		const { flushWorkduckAppStateWrites } = await import('./app-state-storage');
		assert.equal(await flushWorkduckAppStateWrites(), false);
		assert.deepEqual(commands, []);
		assert.equal(storage.getItem(key), raw);
		assert.equal(nativeRecords[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY], savedRegistry);
	});

	test('shares an in-flight read and retains a successful initialization', async () => {
		let reads = 0;
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => { release = resolve; });
		setWorkduckAppStateBrowserStorageForTest(new MemoryStorage());
		setTauriInvokeForTest((async (command) => {
			assert.equal(command, 'read_app_state_records');
			reads += 1;
			await barrier;
			return { ok: true, records };
		}) as TauriInvoke);
		const first = initializePersistentAppState();
		const second = initializePersistentAppState();
		assert.equal(first, second);
		assert.equal(reads, 1);
		release();
		assert.deepEqual(await first, { ok: true });
		assert.equal(initializePersistentAppState(), first);
		assert.equal(reads, 1);
		assert.equal(readWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY, 'legacy').valueJson, savedRegistry);
	});

	test('retries failed reads without accepting writes to fallback defaults', async () => {
		const storage = new MemoryStorage();
		let reads = 0;
		setWorkduckAppStateBrowserStorageForTest(storage);
		setTauriInvokeForTest((async (command) => {
			assert.equal(command, 'read_app_state_records');
			reads += 1;
			return reads === 1 ? { ok: false } : { ok: true, records };
		}) as TauriInvoke);
		const failed = initializePersistentAppState();
		assert.deepEqual(await failed, { ok: false, error: 'app-state-read-failed' });
		assert.equal(writeWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY, 'legacy', '{}').ok, false);
		assert.equal(storage.values.size, 0);
		const retry = initializePersistentAppState();
		assert.notEqual(retry, failed);
		assert.deepEqual(await retry, { ok: true });
		assert.equal(reads, 2);
		assert.equal(readWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY, 'legacy').valueJson, savedRegistry);
	});

	test('preserves the original journal and legacy values across read and replay failures', async () => {
		const storage = new MemoryStorage();
		const journalKey = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY}`;
		const journal = JSON.stringify({ valueJson: savedRegistry, updatedAt: '2026-10-10T00:00:00.000Z' });
		storage.setItem(journalKey, journal);
		storage.setItem(WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY, '{}');
		setWorkduckAppStateBrowserStorageForTest(storage);
		let reads = 0;
		let writes = 0;
		setTauriInvokeForTest((async (command, args) => {
			if (command === 'read_app_state_records') {
				reads += 1;
				return reads === 1 ? { ok: false } : { ok: true, records };
			}
			assert.equal(command, 'write_app_state_records');
			assert.deepEqual(args?.records, { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: JSON.parse(journal) });
			writes += 1;
			if (writes === 1) throw new Error('native write unavailable');
			return { ok: true };
		}) as TauriInvoke);
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-read-failed' });
		assert.equal(storage.getItem(journalKey), journal);
		assert.deepEqual(await initializePersistentAppState(), { ok: false, error: 'app-state-write-failed' });
		assert.equal(storage.getItem(journalKey), journal);
		assert.equal(storage.getItem(WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY), '{}');
		assert.deepEqual(await initializePersistentAppState(), { ok: true });
		assert.equal(storage.getItem(journalKey), null);
		assert.equal(storage.getItem(WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY), null);
		assert.equal(readWorkduckAppStateValue(WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY, 'legacy').valueJson, savedRegistry);
		assert.equal(reads, 3);
		assert.equal(writes, 2);
	});
});
