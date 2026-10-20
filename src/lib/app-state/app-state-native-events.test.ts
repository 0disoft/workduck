import { afterEach, expect, test } from 'bun:test';
import type { EventCallback } from '@tauri-apps/api/event';
import { setTauriInvokeForTest, setTauriListenForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	commitWorkduckAppStateValueWithNativeTransaction, flushWorkduckAppStateWrites,
	initializeWorkduckAppState, readWorkduckAppStateValue, resetWorkduckAppStateStorageForTest,
	setWorkduckAppStateBrowserStorageForTest, subscribeWorkduckAppStateValue,
	writeWorkduckAppStateValue, WORKDUCK_APP_STATE_COMMITTED_EVENT,
	type WorkduckAppStateKey
} from './app-state-storage';

const key = 'system-settings' as const;
const otherKey = 'workspace-registry' as const;
const original = '{"value":1}';
const external = '{"value":2}';
const edited = '{"value":3}';
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }
function cached(key: WorkduckAppStateKey) { return readWorkduckAppStateValue(key, key).valueJson; }
let disposeFixture: (() => Promise<void>) | undefined;
afterEach(async () => {
	await disposeFixture?.();
	disposeFixture = undefined;
	setTauriInvokeForTest(undefined);
	setTauriListenForTest(undefined);
	resetWorkduckAppStateStorageForTest();
});

async function fixture(options: { holdRegistration?: boolean; holdInitialRead?: boolean; skipInitialization?: boolean } = {}) {
	const values = new Map<string, string>();
	const storage = {
		getItem(key: string) { return values.get(key) ?? null; },
		setItem(key: string, value: string) { values.set(key, value); },
		removeItem(key: string) { values.delete(key); }
	};
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const fakeWindow = Object.assign(new EventTarget(), { localStorage: storage });
	Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
	setWorkduckAppStateBrowserStorageForTest(storage);
	const records: Record<string, string> = { [key]: original, [otherKey]: original };
	const reads: string[][] = [];
	const registration = deferred();
	const firstRead = deferred();
	const writeAck = deferred();
	if (!options.holdRegistration) registration.resolve();
	if (!options.holdInitialRead) firstRead.resolve();
	let holdWrites = false;
	let listenCalls = 0;
	let unlistenCalls = 0;
	const listeners = new Set<(payload: unknown) => void>();
	setTauriListenForTest(async <T>(event: string, callback: EventCallback<T>) => {
		expect(event).toBe(WORKDUCK_APP_STATE_COMMITTED_EVENT);
		listenCalls += 1;
		const listener = (payload: unknown) => callback({ event, id: listenCalls, payload: payload as T });
		await registration.promise;
		listeners.add(listener);
		return () => { unlistenCalls += 1; listeners.delete(listener); };
	});
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') {
			const keys = args?.keys as string[];
			reads.push(keys);
			const snapshot = Object.fromEntries(keys.map((key) => [key, records[key]]));
			if (reads.length === 1) await firstRead.promise;
			return { ok: true, records: snapshot } as T;
		}
		expect(command).toBe('write_app_state_records');
		for (const [key, record] of Object.entries(args?.records as Record<string, { valueJson: string }>)) records[key] = record.valueJson;
		if (holdWrites) await writeAck.promise;
		return { ok: true } as T;
	});
	const unsubs: (() => void)[] = [];
	const initialize = () => initializeWorkduckAppState([key, otherKey].map((key) => ({ key, legacyStorageKey: key, valueJson: original })));
	disposeFixture = async () => {
		unsubs.forEach((unsubscribe) => unsubscribe());
		registration.resolve(); firstRead.resolve(); writeAck.resolve();
		await settle();
		if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
		else Reflect.deleteProperty(globalThis, 'window');
	};
	if (!options.skipInitialization) expect((await initialize()).ok).toBe(true);
	return {
		records, reads, registration, firstRead, writeAck, fakeWindow, initialize,
		get listenCalls() { return listenCalls; }, get unlistenCalls() { return unlistenCalls; },
		holdWrites() { holdWrites = true; },
		emit(payload: unknown) { listeners.forEach((listener) => listener(payload)); },
		subscribe(key: WorkduckAppStateKey, seen: string[]) {
			const unsubscribe = subscribeWorkduckAppStateValue(key, (value) => seen.push(value));
			unsubs.push(unsubscribe);
			return unsubscribe;
		}
	};
}

test('shares one native listener and batches committed keys across all active subscribers', async () => {
	const state = await fixture();
	const seen: string[][] = [[], [], []];
	const unsubs = [key, key, otherKey].map((key, index) => state.subscribe(key, seen[index]!));
	await settle();
	expect(state.listenCalls).toBe(1);
	state.reads.length = 0;
	for (const payload of [null, {}, ['unknown'], [key, null]]) state.emit(payload);
	await settle();
	expect(state.reads).toEqual([]);
	state.records[key] = external;
	state.records[otherKey] = edited;
	state.emit([key, otherKey]);
	await settle();
	expect(state.reads).toEqual([[key, otherKey]]);
	expect(seen).toEqual([[external], [external], [edited]]);
	unsubs[0]!();
	expect(state.unlistenCalls).toBe(0);
	unsubs.forEach((unsubscribe) => unsubscribe());
	expect(state.unlistenCalls).toBe(1);
	state.emit([key]);
	await settle();
	expect(state.reads).toHaveLength(1);
});

test('catches changes committed before native listener registration finishes', async () => {
	const state = await fixture({ holdRegistration: true });
	const seen: string[] = [];
	state.subscribe(key, seen);
	state.records[key] = external;
	state.emit([key]);
	state.registration.resolve();
	await settle();
	expect(seen).toEqual([external]);
});

test('late registration from a disposed subscription cannot replace the replacement scope', async () => {
	const state = await fixture({ holdRegistration: true });
	const oldValues: string[] = [];
	state.subscribe(key, oldValues)();
	const newValues: string[] = [];
	state.subscribe(key, newValues);
	state.records[key] = external;
	state.registration.resolve();
	await settle();
	expect(state.listenCalls).toBe(2);
	expect(state.unlistenCalls).toBe(1);
	expect(oldValues).toEqual([]);
	expect(newValues).toEqual([external]);
});

test('a native change during initial recovery is reread when initialization succeeds', async () => {
	const state = await fixture({ holdInitialRead: true, skipInitialization: true });
	const seen: string[] = [];
	state.subscribe(key, seen);
	const initializing = state.initialize();
	await settle();
	state.records[key] = external;
	state.emit([key]);
	await settle();
	expect(seen).toEqual([]);
	state.firstRead.resolve();
	expect((await initializing).ok).toBe(true);
	await settle();
	expect(cached(key)).toBe(external);
	expect(seen).toEqual([external]);
});

test('a commit notification blocked by a native transaction is retried after the lease ends', async () => {
	const state = await fixture();
	const seen: string[] = [];
	state.subscribe(key, seen);
	await settle();
	state.reads.length = 0;
	const finished = deferred();
	const committing = commitWorkduckAppStateValueWithNativeTransaction(key, key, edited, async () => {
		await finished.promise;
		return true;
	});
	try {
		state.records[key] = external;
		state.emit([key]);
		await settle();
		expect(state.reads).toEqual([]);
		expect(cached(key)).toBe(original);
		finished.resolve();
		expect((await committing).ok).toBe(true);
		await settle();
		expect(cached(key)).toBe(external);
		expect(seen).toEqual([external]);
	} finally { finished.resolve(); await committing; }
});

test('a peer commit received before a local write acknowledgment is reread after journal cleanup', async () => {
	const state = await fixture();
	const seen: string[] = [];
	state.subscribe(key, seen);
	await settle();
	state.reads.length = 0;
	state.holdWrites();
	expect(writeWorkduckAppStateValue(key, key, edited).ok).toBe(true);
	const flushing = flushWorkduckAppStateWrites();
	try {
		state.records[key] = external;
		state.emit([key]);
		await settle();
		expect(state.reads).toEqual([]);
		expect(cached(key)).toBe(edited);
		state.writeAck.resolve();
		expect(await flushing).toBe(true);
		await settle();
		expect(cached(key)).toBe(external);
		expect(seen).toEqual([external]);
	} finally { state.writeAck.resolve(); await flushing; }
});

test('focus refresh stays available when native registration fails and retries registration', async () => {
	const state = await fixture();
	let attempts = 0;
	setTauriListenForTest(async () => { attempts += 1; throw new Error('event transport unavailable'); });
	const seen: string[] = [];
	state.subscribe(key, seen);
	await settle();
	expect(attempts).toBe(1);
	state.reads.length = 0;
	state.records[key] = external;
	state.fakeWindow.dispatchEvent(new Event('focus'));
	await settle();
	expect(attempts).toBe(2);
	expect(state.reads).toEqual([[key]]);
	expect(seen).toEqual([external]);
});
