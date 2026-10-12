import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	flushWorkduckAppStateWrites,
	commitWorkduckAppStateValue,
	initializeWorkduckAppState,
	readWorkduckAppStateValue,
	resetWorkduckAppStateStorageForTest,
	setWorkduckAppStateBrowserStorageForTest,
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
		finishWrites[0]?.({ ok: true });
		await waitFor(() => finishWrites.length === 2);
		finishWrites[1]?.({ ok: true });

		assert.equal(await flushPromise, true);
		assert.equal(writes.length, 2);
		assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
		assert.equal(
			readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson,
			SYSTEM_LATEST_VALUE
		);
	});

	test('atomic commit drains an older journal, rejects overlapping edits, and only then updates the cache', async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		let releaseFlush!: () => void;
		let releaseCommit!: () => void;
		let flushing = false, committing = false;
		setTauriInvokeForTest(async <T>(command: string) => {
			if (command === 'read_app_state_records') return { ok: true, records: {
				[WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE,
				[WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE
			} } as T;
			assert.equal(command, 'write_app_state_records'); flushing = true;
			await new Promise<void>(resolve => { releaseFlush = resolve; }); return { ok: true } as T;
		});
		await initializeWorkduckAppState(seeds);
		writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_PENDING_VALUE);
		await waitFor(() => flushing);
		const restoring = commitWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LATEST_VALUE, async expected => {
			assert.equal(expected, SYSTEM_PENDING_VALUE); committing = true;
			assert.equal(storage.getItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY)), null);
			await new Promise<void>(resolve => { releaseCommit = resolve; }); return { ok: true } as const;
		});
		assert.equal(writeWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY, SYSTEM_DEFAULT_VALUE).ok, false);
		releaseFlush(); await waitFor(() => committing);
		assert.equal(readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson, SYSTEM_PENDING_VALUE);
		releaseCommit(); assert.deepEqual(await restoring, { ok: true });
		assert.equal(readWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LEGACY_KEY).valueJson, SYSTEM_LATEST_VALUE);
		assert.equal(storage.values.size, 0);
	});

	test('atomic commit refuses native writes when the older journal cannot be removed', async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		setTauriInvokeForTest(async <T>(command: string) => response<T>(command === 'read_app_state_records'
			? { ok: true, records: { [WORKDUCK_SYSTEM_APP_STATE_KEY]: SYSTEM_DEFAULT_VALUE, [WORKDUCK_APPEARANCE_APP_STATE_KEY]: APPEARANCE_SQLITE_VALUE } }
			: { ok: true }));
		await initializeWorkduckAppState(seeds);
		storage.removeItem = () => { throw Error('synthetic storage failure'); };
		storage.setItem(pendingStorageKey(WORKDUCK_SYSTEM_APP_STATE_KEY), JSON.stringify({ valueJson: SYSTEM_DEFAULT_VALUE, updatedAt: new Date().toISOString() }));
		let commits = 0;
		// Exercise one successful flush without looping forever on an undeletable journal.
		const result = await commitWorkduckAppStateValue(WORKDUCK_SYSTEM_APP_STATE_KEY, SYSTEM_LATEST_VALUE,
			async () => { commits++; return { ok: true } as const; });
		assert.equal(result.ok, false); assert.equal(commits, 0);
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
