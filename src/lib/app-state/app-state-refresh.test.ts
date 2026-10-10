import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	commitWorkduckAppStateValueWithNativeTransaction, flushWorkduckAppStateWrites,
	initializeWorkduckAppState, readWorkduckAppStateValue, refreshWorkduckAppStateValues,
	resetWorkduckAppStateStorageForTest, setWorkduckAppStateBrowserStorageForTest,
	subscribeWorkduckAppStateValue, writeWorkduckAppStateValue,
	WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX,
	type WorkduckAppStateKey, type WorkduckAppStateSeed
} from './app-state-storage';

const key = 'system-settings' as const;
const otherKey = 'workspace-registry' as const;
const original = '{"value":1}';
const external = '{"value":2}';
const edited = '{"value":3}';
const seeds: WorkduckAppStateSeed[] = [key, otherKey].map((key) => ({ key, legacyStorageKey: key, valueJson: original }));
const journalKey = `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${key}`;
class MemoryStorage {
	values = new Map<string, string>();
	getItem(key: string) { return this.values.get(key) ?? null; }
	setItem(key: string, value: string) { this.values.set(key, value); }
	removeItem(key: string) { this.values.delete(key); }
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => { resolve = next; });
	return { promise, resolve };
}
function cached(key: WorkduckAppStateKey) { return readWorkduckAppStateValue(key, key).valueJson; }
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }
afterEach(() => { setTauriInvokeForTest(undefined); resetWorkduckAppStateStorageForTest(); });

test('one focus event batches all subscriptions and publishes every changed value without native writes', async () => {
	const storage = new MemoryStorage();
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const fakeWindow = Object.assign(new EventTarget(), { localStorage: storage });
	Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
	setWorkduckAppStateBrowserStorageForTest(storage);
	let records: Record<string, string> = { [key]: original, [otherKey]: original };
	const calls: unknown[] = [];
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		expect(command).toBe('read_app_state_records');
		calls.push(args?.keys);
		return { ok: true, records } as T;
	});
	const seen: string[][] = [[], [], []];
	const unsubs = [key, key, otherKey].map((key, index) => subscribeWorkduckAppStateValue(key, (value) => seen[index]!.push(value)));
	try {
		await initializeWorkduckAppState(seeds);
		calls.length = 0;
		records = { [key]: external, [otherKey]: edited };
		fakeWindow.dispatchEvent(new Event('focus'));
		await settle();
		expect(calls).toEqual([[key, otherKey]]);
		expect(seen).toEqual([[external], [external], [edited]]);
		expect(cached(key)).toBe(external);
		expect(cached(otherKey)).toBe(edited);
		fakeWindow.dispatchEvent(new Event('focus'));
		unsubs.forEach((unsub) => unsub());
		await settle();
		expect(calls).toHaveLength(1);
		fakeWindow.dispatchEvent(new Event('focus'));
		await settle();
		expect(calls).toHaveLength(1);
	} finally {
		unsubs.forEach((unsub) => unsub());
		if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
		else Reflect.deleteProperty(globalThis, 'window');
	}
});

test('older refresh responses cannot replace a newer accepted snapshot', async () => {
	setWorkduckAppStateBrowserStorageForTest(new MemoryStorage());
	setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
	await initializeWorkduckAppState(seeds);
	const first = deferred<unknown>();
	const second = deferred<unknown>();
	let reads = 0;
	setTauriInvokeForTest(async <T>() => await (++reads === 1 ? first.promise : second.promise) as T);
	const oldRefresh = refreshWorkduckAppStateValues([key]);
	const newRefresh = refreshWorkduckAppStateValues([key]);
	second.resolve({ ok: true, records: { [key]: edited } });
	expect(await newRefresh).toBe(true);
	first.resolve({ ok: true, records: { [key]: external } });
	expect(await oldRefresh).toBe(true);
	expect(cached(key)).toBe(edited);
});

test('a completed edit back to the original value still invalidates an earlier refresh', async () => {
	setWorkduckAppStateBrowserStorageForTest(new MemoryStorage());
	setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
	await initializeWorkduckAppState(seeds);
	const pending = deferred<unknown>();
	setTauriInvokeForTest(async <T>(command: string) => command === 'read_app_state_records'
		? await pending.promise as T : { ok: true } as T);
	const refreshing = refreshWorkduckAppStateValues([key]);
	expect(writeWorkduckAppStateValue(key, key, edited).ok).toBe(true);
	expect(writeWorkduckAppStateValue(key, key, original).ok).toBe(true);
	expect(await flushWorkduckAppStateWrites()).toBe(true);
	pending.resolve({ ok: true, records: { [key]: external } });
	expect(await refreshing).toBe(true);
	expect(cached(key)).toBe(original);
});

for (const journal of ['{"valueJson":"{\\"value\\":3}","updatedAt":"2026-10-10T00:00:00.000Z"}', '{broken']) {
	test(`preserves a pending journal during refresh: ${journal}`, async () => {
		const storage = new MemoryStorage();
		setWorkduckAppStateBrowserStorageForTest(storage);
		setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
		await initializeWorkduckAppState(seeds);
		storage.setItem(journalKey, journal);
		setTauriInvokeForTest(async () => { throw new Error('pending key must not be read from SQLite'); });
		expect(await refreshWorkduckAppStateValues([key])).toBe(true);
		expect(storage.getItem(journalKey)).toBe(journal);
		expect(cached(key)).toBe(original);
	});
}

for (const response of [
	{ ok: false }, { ok: true, records: { [key]: external } },
	{ ok: true, records: { [key]: external, [otherKey]: '[]' } }
]) {
	test(`invalid or incomplete refresh leaves the whole cache unchanged: ${JSON.stringify(response)}`, async () => {
		setWorkduckAppStateBrowserStorageForTest(new MemoryStorage());
		setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
		await initializeWorkduckAppState(seeds);
		setTauriInvokeForTest(async <T>() => response as T);
		expect(await refreshWorkduckAppStateValues([key, otherKey])).toBe(false);
		expect(cached(key)).toBe(original);
		expect(cached(otherKey)).toBe(original);
	});
}

test('a refresh cannot update a key while its native transaction is in progress', async () => {
	setWorkduckAppStateBrowserStorageForTest(new MemoryStorage());
	setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
	await initializeWorkduckAppState(seeds);
	const pendingRead = deferred<unknown>();
	setTauriInvokeForTest(async <T>() => await pendingRead.promise as T);
	const refreshing = refreshWorkduckAppStateValues([key]);
	const pendingCommit = deferred<boolean>();
	const committing = commitWorkduckAppStateValueWithNativeTransaction(key, key, edited, async () => await pendingCommit.promise);
	try {
		expect(await refreshWorkduckAppStateValues([key])).toBe(true);
		pendingRead.resolve({ ok: true, records: { [key]: external } });
		expect(await refreshing).toBe(true);
		expect(cached(key)).toBe(original);
		pendingCommit.resolve(true);
		expect((await committing).ok).toBe(true);
		expect(cached(key)).toBe(edited);
	} finally { pendingRead.resolve({ ok: false }); pendingCommit.resolve(false); await refreshing; await committing; }
});

test('a journal I/O failure during refresh preserves every cached value', async () => {
	const storage = new MemoryStorage();
	setWorkduckAppStateBrowserStorageForTest(storage);
	setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
	await initializeWorkduckAppState(seeds);
	const pending = deferred<unknown>();
	setTauriInvokeForTest(async <T>() => await pending.promise as T);
	const refreshing = refreshWorkduckAppStateValues([key, otherKey]);
	storage.getItem = () => { throw new Error('storage denied'); };
	pending.resolve({ ok: true, records: { [key]: external, [otherKey]: edited } });
	expect(await refreshing).toBe(false);
	expect(cached(key)).toBe(original);
	expect(cached(otherKey)).toBe(original);
});

test('a response from an earlier storage lifetime cannot update a reinitialized cache', async () => {
	const storage = new MemoryStorage();
	setWorkduckAppStateBrowserStorageForTest(storage);
	setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: original, [otherKey]: original } }) as T);
	await initializeWorkduckAppState(seeds);
	const pending = deferred<unknown>();
	setTauriInvokeForTest(async <T>() => await pending.promise as T);
	const refreshing = refreshWorkduckAppStateValues([key]);
	resetWorkduckAppStateStorageForTest();
	setWorkduckAppStateBrowserStorageForTest(storage);
	setTauriInvokeForTest(async <T>() => ({ ok: true, records: { [key]: edited, [otherKey]: edited } }) as T);
	await initializeWorkduckAppState(seeds);
	pending.resolve({ ok: true, records: { [key]: external } });
	expect(await refreshing).toBe(false);
	expect(cached(key)).toBe(edited);
});

test('refresh never reads or writes SQLite until native initialization has succeeded', async () => {
	setWorkduckAppStateBrowserStorageForTest(new MemoryStorage());
	let calls = 0;
	setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: false } as T; });
	expect(await refreshWorkduckAppStateValues()).toBe(false);
	expect(calls).toBe(0);
	expect((await initializeWorkduckAppState(seeds)).ok).toBe(false);
	expect(calls).toBe(1);
	expect(await refreshWorkduckAppStateValues()).toBe(false);
	expect(calls).toBe(1);
});
