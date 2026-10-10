import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	flushWorkduckAppStateWrites,
	initializeWorkduckAppState,
	readWorkduckAppStateValue,
	resetWorkduckAppStateStorageForTest,
	setWorkduckAppStateBrowserStorageForTest,
	subscribeWorkduckAppStateValue,
	WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX,
	WORKDUCK_APPEARANCE_APP_STATE_KEY,
	WORKDUCK_SYSTEM_APP_STATE_KEY,
	writeWorkduckAppStateValue,
	type WorkduckAppStateSeed
} from './app-state-storage';

const APPEARANCE_LEGACY_KEY = 'legacy.appearance';
const SYSTEM_LEGACY_KEY = 'legacy.system';
const APPEARANCE_LEGACY_VALUE = '{"languageId":"ko","fontSizePx":17}';
const APPEARANCE_SQLITE_VALUE = '{"languageId":"en","fontSizePx":18}';
const SYSTEM_DEFAULT_VALUE =
	'{"showTrayIcon":true,"minimizeToTray":false,"workspaceIdleLockMinutes":15}';
const SYSTEM_PENDING_VALUE =
	'{"showTrayIcon":true,"minimizeToTray":true,"workspaceIdleLockMinutes":30}';
const SYSTEM_LATEST_VALUE =
	'{"showTrayIcon":false,"minimizeToTray":false,"workspaceIdleLockMinutes":60}';

const seeds: readonly WorkduckAppStateSeed[] = [
	{
		key: WORKDUCK_APPEARANCE_APP_STATE_KEY,
		legacyStorageKey: APPEARANCE_LEGACY_KEY,
		valueJson: APPEARANCE_LEGACY_VALUE
	},
	{
		key: WORKDUCK_SYSTEM_APP_STATE_KEY,
		legacyStorageKey: SYSTEM_LEGACY_KEY,
		valueJson: SYSTEM_DEFAULT_VALUE
	}
];

class MemoryStorage {
	readonly values = new Map<string, string>();

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}

	removeItem(key: string) {
		this.values.delete(key);
	}
}

describe('persistent app state storage', () => {
	afterEach(() => {
		setTauriInvokeForTest(undefined);
		resetWorkduckAppStateStorageForTest();
	});

	test('promotes canonical legacy values and a crash journal in one SQLite write', async () => {
		const storage = new MemoryStorage();
		const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
		storage.setItem(APPEARANCE_LEGACY_KEY, APPEARANCE_LEGACY_VALUE);
		setWorkduckAppStateBrowserStorageForTest(storage);
		storage.setItem(
			pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY),
			JSON.stringify({
				valueJson: SYSTEM_PENDING_VALUE,
				updatedAt: '2026-08-20T00:00:00.000Z'
			})
		);
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			calls.push({ command, args });

			return response<T>(command === 'read_app_state_records' ? { ok: true, records: {} } : { ok: true });
		});

		const result = await initializeWorkduckAppState(seeds);

		assert.deepEqual(result, { ok: true });
		assert.deepEqual(
			calls.map((call) => call.command),
			['read_app_state_records', 'write_app_state_records']
		);
		assert.deepEqual(calls[1]?.args, {
			records: {
				[WORKDUCK_APPEARANCE_APP_STATE_KEY]: {
					valueJson: APPEARANCE_LEGACY_VALUE,
					updatedAt: assertIsoDate(calls[1]?.args, WORKDUCK_APPEARANCE_APP_STATE_KEY)
				},
				[WORKDUCK_SYSTEM_APP_STATE_KEY]: {
					valueJson: SYSTEM_PENDING_VALUE,
					updatedAt: '2026-08-20T00:00:00.000Z'
				}
			}
		});
		assert.equal(storage.getItem(APPEARANCE_LEGACY_KEY), null);
		assert.equal(storage.getItem(SYSTEM_LEGACY_KEY), null);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
		assert.equal(
			readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson,
			SYSTEM_PENDING_VALUE
		);
	});

	test('keeps SQLite authoritative when a stale legacy mirror still exists', async () => {
		const storage = new MemoryStorage();
		const commands: string[] = [];
		storage.setItem(APPEARANCE_LEGACY_KEY, APPEARANCE_LEGACY_VALUE);
		setWorkduckAppStateBrowserStorageForTest(storage);
		setTauriInvokeForTest(async <T>(command: string) => {
			commands.push(command);

			return response<T>({
				ok: true,
				records: {
					[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE,
					[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE
				}
			});
		});

		const result = await initializeWorkduckAppState(seeds);

		assert.deepEqual(result, { ok: true });
		assert.deepEqual(commands, ['read_app_state_records']);
		assert.equal(
			readWorkduckAppStateValue(
				WORKDUCK_APPEARANCE_APP_STATE_KEY,
				APPEARANCE_LEGACY_KEY
			).valueJson,
			APPEARANCE_SQLITE_VALUE
		);
		assert.equal(storage.getItem(APPEARANCE_LEGACY_KEY), null);
	});

	test('journals a synchronous UI write until the native commit succeeds', async () => {
		const storage = new MemoryStorage();
		const writes: Record<string, unknown>[] = [];
		let finishWrite: ((value: unknown) => void) | undefined;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_app_state_records') {
				return response<T>({
					ok: true,
					records: {
						[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE,
						[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE
					}
				});
			}

			writes.push(args ?? {});
			return new Promise<T>((resolve) => {
				finishWrite = (value) => resolve(response<T>(value));
			});
		});
		setWorkduckAppStateBrowserStorageForTest(storage);
		await initializeWorkduckAppState(seeds);

		const writeResult = writeWorkduckAppStateValue(
			WORKDUCK_SYSTEM_APP_STATE_KEY,
			SYSTEM_LEGACY_KEY,
			SYSTEM_PENDING_VALUE
		);
		const flushPromise = flushWorkduckAppStateWrites();

		assert.equal(writeResult.ok, true);
		assert.match(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)) ?? '', /minimizeToTray/);
		await waitFor(() => finishWrite !== undefined);
		finishWrite?.({ ok: true });
		assert.equal(await flushPromise, true);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
		assert.equal(writes.length, 1);
		assert.deepEqual(Object.keys(readRecordsArgument(writes[0])), [WORKDUCK_SYSTEM_APP_STATE_KEY]);
	});

	test('drains a newer write that arrives while an older native write is in flight', async () => {
		const storage = new MemoryStorage();
		const writes: Record<string, unknown>[] = [];
		const finishWrites: ((value: unknown) => void)[] = [];
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_app_state_records') {
				return response<T>({
					ok: true,
					records: {
						[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE,
						[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE
					}
				});
			}

			writes.push(args ?? {});
			return new Promise<T>((resolve) => {
				finishWrites.push((value) => resolve(response<T>(value)));
			});
		});
		setWorkduckAppStateBrowserStorageForTest(storage);
		await initializeWorkduckAppState(seeds);

		writeWorkduckAppStateValue(
			WORKDUCK_SYSTEM_APP_STATE_KEY,
			SYSTEM_LEGACY_KEY,
			SYSTEM_PENDING_VALUE
		);
		const flushPromise = flushWorkduckAppStateWrites();
		await waitFor(() => finishWrites.length === 1);

		writeWorkduckAppStateValue(
			WORKDUCK_SYSTEM_APP_STATE_KEY,
			SYSTEM_LEGACY_KEY,
			SYSTEM_LATEST_VALUE
		);
		finishWrites[0]?.({ ok: true, supersededRecords: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE } });
		await waitFor(() => finishWrites.length === 2);
		assert.equal(readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson, SYSTEM_LATEST_VALUE);
		finishWrites[1]?.({ ok: true });

		assert.equal(await flushPromise, true);
		assert.equal(writes.length, 2);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
		assert.equal(
			readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson,
			SYSTEM_LATEST_VALUE
		);
	});

	test('retains the crash journal when SQLite rejects a write', async () => {
		const storage = new MemoryStorage();
		setTauriInvokeForTest(async <T>(command: string) =>
			response<T>(
				command === 'read_app_state_records'
					? {
							ok: true,
							records: {
								[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE,
								[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE
							}
						}
					: { ok: false, error: 'app-state-write-failed' }
			)
		);
		setWorkduckAppStateBrowserStorageForTest(storage);
		await initializeWorkduckAppState(seeds);

		writeWorkduckAppStateValue(
			WORKDUCK_SYSTEM_APP_STATE_KEY,
			SYSTEM_LEGACY_KEY,
			SYSTEM_PENDING_VALUE
		);

		assert.equal(await flushWorkduckAppStateWrites(), false);
		assert.match(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)) ?? '', /minimizeToTray/);
		assert.equal(
			readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson,
			SYSTEM_PENDING_VALUE
		);
	});

	for (const phase of ['initialization', 'flush'] as const) {
		test(`uses the durable SQLite value when an older journal is superseded during ${phase}`, async () => {
			const storage = new MemoryStorage();
			setWorkduckAppStateBrowserStorageForTest(storage);
			setTauriInvokeForTest(async <T>(command: string) => response<T>(
				command === 'read_app_state_records'
					? { ok: true, records: {
						[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE,
						[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_LATEST_VALUE
					} }
					: { ok: true, supersededRecords: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_LATEST_VALUE } }
			));
			if (phase === 'initialization') {
				storage.setItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY), JSON.stringify({
					valueJson: SYSTEM_PENDING_VALUE, updatedAt: '2026-08-19T00:00:00.000Z'
				}));
				assert.equal((await initializeWorkduckAppState(seeds)).ok, true);
			} else {
				await initializeWorkduckAppState(seeds);
				assert.equal(writeWorkduckAppStateValue(
					WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_PENDING_VALUE
				).ok, true);
				assert.equal(await flushWorkduckAppStateWrites(), true);
			}
			assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
			assert.equal(readWorkduckAppStateValue(
				WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY
			).valueJson, SYSTEM_LATEST_VALUE);
		});
	}

	test('notifies every active subscriber when a flush or foreign journal changes the cached value', async () => {
		const storage = new MemoryStorage();
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
		const fakeWindow = Object.assign(new EventTarget(), { localStorage: storage });
		Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
		const seen: string[][] = [[], []];
		const unsubscribes = seen.map((values) => subscribeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, (value) => values.push(value)));
		try {
			setWorkduckAppStateBrowserStorageForTest(storage);
			setTauriInvokeForTest(async <T>(command: string) => response<T>(command === 'read_app_state_records'
				? { ok: true, records: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE } }
				: { ok: true, supersededRecords: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_LATEST_VALUE } }));
			await initializeWorkduckAppState(seeds.filter((seed) => seed.key === WORKDUCK_SYSTEM_APP_STATE_KEY));
			writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_PENDING_VALUE);
			assert.equal(await flushWorkduckAppStateWrites(), true);
			assert.deepEqual(seen, [[SYSTEM_LATEST_VALUE], [SYSTEM_LATEST_VALUE]]);
			function foreignJournal(valueJson: string) {
				fakeWindow.dispatchEvent(Object.assign(new Event('storage'), {
					storageArea: storage, key: pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY),
					newValue: JSON.stringify({ valueJson, updatedAt: '2026-10-10T00:00:00.000Z' })
				}));
			}
			foreignJournal(SYSTEM_PENDING_VALUE);
			assert.deepEqual(seen, [[SYSTEM_LATEST_VALUE, SYSTEM_PENDING_VALUE], [SYSTEM_LATEST_VALUE, SYSTEM_PENDING_VALUE]]);
			unsubscribes[0]?.();
			foreignJournal(SYSTEM_DEFAULT_VALUE);
			assert.deepEqual(seen[0], [SYSTEM_LATEST_VALUE, SYSTEM_PENDING_VALUE]);
			assert.deepEqual(seen[1], [SYSTEM_LATEST_VALUE, SYSTEM_PENDING_VALUE, SYSTEM_DEFAULT_VALUE]);
		} finally {
			for (const unsubscribe of unsubscribes) unsubscribe();
			if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
			else Reflect.deleteProperty(globalThis, 'window');
		}
	});

	test('retains the journal and cached edit when superseded response data is invalid', async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		let invalid: unknown;
		setTauriInvokeForTest(async <T>(command: string) => response<T>(command === 'read_app_state_records'
			? { ok: true, records: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE } }
			: { ok: true, supersededRecords: invalid }));
		await initializeWorkduckAppState(seeds.filter((seed) => seed.key === WORKDUCK_SYSTEM_APP_STATE_KEY));
		for (const value of [
			null, { [WORKDUCK_SYSTEM_APP_STATE_KEY]: '[]' }, { unknown: SYSTEM_LATEST_VALUE },
			{ [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_LATEST_VALUE, [WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE }
		]) {
			invalid = value;
			writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_PENDING_VALUE);
			assert.equal(await flushWorkduckAppStateWrites(), false);
			assert.notEqual(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
			assert.equal(readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson, SYSTEM_PENDING_VALUE);
		}
	});

	test('stops after one native commit when journal deletion fails and retries cleanup later', async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		let canRemove = false;
		let writes = 0;
		const removeItem = storage.removeItem.bind(storage);
		storage.removeItem = (key) => {
			if (key === pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY) && !canRemove) throw new Error('storage denied');
			removeItem(key);
		};
		setTauriInvokeForTest(async <T>(command: string) => response<T>(command === 'read_app_state_records'
			? { ok: true, records: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE } }
			// The second rejection bounds the unfixed loop so this regression cannot hang.
			: { ok: ++writes === 1 || canRemove }));
		assert.equal((await initializeWorkduckAppState(seeds.filter((seed) => seed.key === WORKDUCK_SYSTEM_APP_STATE_KEY))).ok, true);
		writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_PENDING_VALUE);
		const journal = storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY));
		assert.equal(await flushWorkduckAppStateWrites(), false);
		assert.equal(writes, 1);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), journal);
		canRemove = true;
		assert.equal(await flushWorkduckAppStateWrites(), true);
		assert.equal(writes, 2);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
	});

	test('keeps initialization closed when replay commits but journal cleanup fails', async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		const key = pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY);
		const journal = JSON.stringify({ valueJson: SYSTEM_PENDING_VALUE, updatedAt: '2026-10-10T00:00:00.000Z' });
		storage.setItem(key, journal);
		let canRemove = false;
		const removeItem = storage.removeItem.bind(storage);
		storage.removeItem = (storageKey) => {
			if (storageKey === key && !canRemove) throw new Error('storage denied');
			removeItem(storageKey);
		};
		setTauriInvokeForTest(async <T>(command: string) => response<T>(command === 'read_app_state_records'
			? { ok: true, records: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE } }
			: { ok: true }));
		const systemSeeds = seeds.filter((seed) => seed.key === WORKDUCK_SYSTEM_APP_STATE_KEY);
		assert.deepEqual(await initializeWorkduckAppState(systemSeeds), { ok: false, error: 'app-state-write-failed' });
		assert.equal(writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_LATEST_VALUE).ok, false);
		assert.equal(storage.getItem(key), journal);
		canRemove = true;
		assert.equal((await initializeWorkduckAppState(systemSeeds)).ok, true);
		assert.equal(storage.getItem(key), null);
		assert.equal(readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson, SYSTEM_PENDING_VALUE);
	});

	for (const phase of ['initialization', 'flush'] as const) {
		test(`preserves unreadable journals and reports failure during ${phase}`, async () => {
			const storage = new MemoryStorage();
			setWorkduckAppStateBrowserStorageForTest(storage);
			const journal = JSON.stringify({ valueJson: SYSTEM_PENDING_VALUE, updatedAt: '2026-10-10T00:00:00.000Z' });
			storage.setItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY), journal);
			let canRead = phase === 'flush';
			const getItem = storage.getItem.bind(storage);
			storage.getItem = (key) => {
				if (key === pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY) && !canRead) throw new Error('storage denied');
				return getItem(key);
			};
			const commands: string[] = [];
			setTauriInvokeForTest(async <T>(command: string) => {
				commands.push(command);
				return response<T>(command === 'read_app_state_records'
					? { ok: true, records: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE } }
					: { ok: true });
			});
			const systemSeeds = seeds.filter((seed) => seed.key === WORKDUCK_SYSTEM_APP_STATE_KEY);
			if (phase === 'initialization') {
				assert.deepEqual(await initializeWorkduckAppState(systemSeeds), { ok: false, error: 'app-state-read-failed' });
			} else {
				await initializeWorkduckAppState(systemSeeds);
				writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_LATEST_VALUE);
				canRead = false;
				commands.length = 0;
				assert.equal(await flushWorkduckAppStateWrites(), false);
			}
			assert.deepEqual(commands, []);
			assert.notEqual(storage.values.get(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), undefined);
			canRead = true;
			if (phase === 'initialization') assert.equal((await initializeWorkduckAppState(systemSeeds)).ok, true);
			else assert.equal(await flushWorkduckAppStateWrites(), true);
			assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
		});
	}

	test('blocks fallback writes after a failed native read until initialization succeeds', async () => {
		const storage = new MemoryStorage();
		const commands: string[] = [];
		let readFails = true;
		setWorkduckAppStateBrowserStorageForTest(storage);
		setTauriInvokeForTest(async <T>(command: string) => {
			commands.push(command);
			return response<T>(command === 'read_app_state_records'
				? readFails
					? { ok: false, error: 'app-state-read-failed' }
					: {
						ok: true,
						records: {
							[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE,
							[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE
						}
					}
				: { ok: true });
		});

		assert.equal((await initializeWorkduckAppState(seeds)).ok, false);
		assert.equal(writeWorkduckAppStateValue(
			WORKDUCK_SYSTEM_APP_STATE_KEY,
			SYSTEM_LEGACY_KEY,
			SYSTEM_PENDING_VALUE
		).ok, false);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
		assert.equal(await flushWorkduckAppStateWrites(), false);
		assert.deepEqual(commands, ['read_app_state_records']);

		readFails = false;
		assert.equal((await initializeWorkduckAppState(seeds)).ok, true);
		assert.equal(
			readWorkduckAppStateValue(WORKDUCK_APPEARANCE_APP_STATE_KEY, APPEARANCE_LEGACY_KEY).valueJson,
			APPEARANCE_SQLITE_VALUE
		);
		assert.equal(writeWorkduckAppStateValue(
			WORKDUCK_SYSTEM_APP_STATE_KEY,
			SYSTEM_LEGACY_KEY,
			SYSTEM_PENDING_VALUE
		).ok, true);
		assert.equal(await flushWorkduckAppStateWrites(), true);
		assert.deepEqual(commands, [
			'read_app_state_records', 'read_app_state_records', 'write_app_state_records'
		]);
	});
});

function pendingStorageKey(key: string) {
	return `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${key}`;
}

function response<T>(value: unknown): T {
	return value as T;
}

function assertIsoDate(
	args: Record<string, unknown> | undefined,
	key: string
): string {
	const records = readRecordsArgument(args);
	const record = records[key];
	assert.equal(typeof record, 'object');
	assert.notEqual(record, null);
	const updatedAt = (record as { updatedAt?: unknown }).updatedAt;

	if (typeof updatedAt !== 'string') {
		assert.fail('updatedAt must be a string');
	}

	assert.equal(Number.isNaN(Date.parse(updatedAt)), false);
	return updatedAt;
}

function readRecordsArgument(value: Record<string, unknown> | undefined) {
	const records = value?.records;
	assert.equal(typeof records, 'object');
	assert.notEqual(records, null);
	return records as Record<string, unknown>;
}

async function waitFor(predicate: () => boolean) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) {
			return;
		}

		await Promise.resolve();
	}

	assert.fail('condition did not become true');
}
