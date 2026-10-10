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

const savedRegistry = JSON.stringify({ activeWorkspaceId: 'original', workspaces: [{ id: 'original', name: 'Original workspace' }] });
const records = Object.fromEntries(WORKDUCK_APP_STATE_KEYS.map((key) =>
	[key, key === WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY ? savedRegistry : '{}']));

class MemoryStorage {
	readonly values = new Map<string, string>();
	getItem(key: string) { return this.values.get(key) ?? null; }
	setItem(key: string, value: string) { this.values.set(key, value); }
	removeItem(key: string) { this.values.delete(key); }
}

describe('persistent app state retry', () => {
	afterEach(() => {
		setTauriInvokeForTest(undefined);
		resetPersistentAppStateInitializationForTest();
		resetWorkduckAppStateStorageForTest();
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
